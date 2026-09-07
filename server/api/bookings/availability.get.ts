export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'view')

  const query = getQuery(event)
  const date = String(query.date || '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datum' })
  }

  const slotTimes = getSlotsForDate(date)
  const supabase = useSupabaseAdmin()

  const { data: tables, error: tablesError } = await supabase
    .from('tables')
    .select('id, name, public_name, kind, capacity, price_kr')
    .eq('active', true)
    .order('kind', { ascending: true })
    .order('capacity', { ascending: true })

  if (tablesError) {
    throw createError({ statusCode: 500, statusMessage: tablesError.message })
  }

  const tableList = ((tables ?? []) as any[]).map((table) => ({
    id: table.id as string,
    name: (table.public_name as string | null) || (table.name as string),
    kind: table.kind as 'bord' | 'rum',
    capacity: table.capacity as number,
    priceKr: table.price_kr as number | null
  }))

  if (!slotTimes.length || !tableList.length) {
    return { date, slotTimes, tables: tableList, occupiedSlots: [] }
  }

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, table_id, start_time, end_time, status, created_at')
    .eq('booking_date', date)
    .in('status', ['confirmed', 'pending'])

  if (bookingsError) {
    throw createError({ statusCode: 500, statusMessage: bookingsError.message })
  }

  // A pending booking holds the table while the customer is on their way to
  // pay the deposit — but not forever, so an abandoned checkout doesn't
  // permanently block the table.
  const pendingCutoff = Date.now() - PENDING_BOOKING_HOLD_MINUTES * 60_000
  const liveBookings = ((bookings ?? []) as any[]).filter(
    (booking) => booking.status === 'confirmed' || new Date(booking.created_at).getTime() > pendingCutoff
  )

  const bookingSlots = liveBookings.flatMap((booking) => {
    const start = String(booking.start_time).slice(0, 5)
    const end = String(booking.end_time).slice(0, 5)

    return slotTimes
      .filter((time) => time >= start && time < end)
      .map((time) => ({ tableId: booking.table_id as string, time, type: 'booking' as const, label: 'Bokat', groupId: `booking:${booking.id}` }))
  })

  const { data: recurringEvents, error: recurringError } = await supabase
    .from('recurring_events')
    .select('id, name, start_time, end_time, table_ids')
    .eq('active', true)
    .eq('weekday', toRecurringWeekday(date))

  if (recurringError) {
    throw createError({ statusCode: 500, statusMessage: recurringError.message })
  }

  const eventSlots = ((recurringEvents ?? []) as any[]).flatMap((recurringEvent) => {
    const start = String(recurringEvent.start_time).slice(0, 5)
    const end = String(recurringEvent.end_time).slice(0, 5)
    const coveredSlots = slotTimes.filter((time) => time >= start && time < end)

    return (recurringEvent.table_ids as string[]).flatMap((tableId) =>
      coveredSlots.map((time) => ({ tableId, time, type: 'event' as const, label: recurringEvent.name as string, groupId: `event:${recurringEvent.id}` }))
    )
  })

  const { data: oneOffEvents, error: oneOffError } = await supabase
    .from('one_off_events')
    .select('id, name, start_time, end_time, table_ids')
    .eq('active', true)
    .eq('event_date', date)

  if (oneOffError) {
    throw createError({ statusCode: 500, statusMessage: oneOffError.message })
  }

  const oneOffSlots = ((oneOffEvents ?? []) as any[]).flatMap((oneOffEvent) => {
    const start = String(oneOffEvent.start_time).slice(0, 5)
    const end = String(oneOffEvent.end_time).slice(0, 5)
    const coveredSlots = slotTimes.filter((time) => time >= start && time < end)

    return (oneOffEvent.table_ids as string[]).flatMap((tableId) =>
      coveredSlots.map((time) => ({ tableId, time, type: 'event' as const, label: oneOffEvent.name as string, groupId: `one-off:${oneOffEvent.id}` }))
    )
  })

  // The room is a fallback — only bookable at a given time once every
  // regular table is booked at that same time (not necessarily the whole
  // day). Otherwise that slot is blocked with an explanatory label.
  const combinedSlots = [...bookingSlots, ...eventSlots, ...oneOffSlots]
  const occupiedKeys = new Set(combinedSlots.map((slot) => `${slot.tableId}|${slot.time}`))
  const regularTableIds = tableList.filter((table) => table.kind === 'bord').map((table) => table.id)
  const roomTableIds = tableList.filter((table) => table.kind === 'rum').map((table) => table.id)

  const slotFullyBooked = (time: string) => regularTableIds.every((tableId) => occupiedKeys.has(`${tableId}|${time}`))

  const roomLockSlots = roomTableIds.flatMap((tableId) =>
    slotTimes
      .filter((time) => !occupiedKeys.has(`${tableId}|${time}`) && !slotFullyBooked(time))
      .map((time) => ({ tableId, time, type: 'room-locked' as const, label: 'Låst' }))
  )

  return { date, slotTimes, tables: tableList, occupiedSlots: [...combinedSlots, ...roomLockSlots] }
})
