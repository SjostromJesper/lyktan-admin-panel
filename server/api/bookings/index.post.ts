export default defineEventHandler(async (event) => {
  const user = await requireAccess(event, 'bookings', 'edit')

  const body = await readBody<{ tableId?: string, date?: string, startTime?: string }>(event)

  const tableId = String(body?.tableId || '').trim()
  const date = String(body?.date || '').trim()
  const startTime = String(body?.startTime || '').trim()

  if (!tableId) {
    throw createError({ statusCode: 400, statusMessage: 'Välj ett bord' })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datum' })
  }

  if (isPastIsoDate(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Datumet har redan passerat' })
  }

  const validSlots = getSlotsForDate(date)

  if (!validSlots.includes(startTime)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig tid' })
  }

  const supabase = useSupabaseAdmin()

  const { data: table, error: tableError } = await supabase
    .from('tables')
    .select('id, name, public_name, kind, active')
    .eq('id', tableId)
    .maybeSingle()

  if (tableError) {
    throw createError({ statusCode: 500, statusMessage: tableError.message })
  }

  if (!table || !(table as any).active) {
    throw createError({ statusCode: 400, statusMessage: 'Bordet finns inte längre' })
  }

  const tableName = (table as any).public_name || (table as any).name

  // Same fallback rule as the storefront — the room is only bookable at a
  // time once every regular table is booked at that same time.
  if ((table as any).kind === 'rum') {
    const { data: regularTables, error: regularTablesError } = await supabase
      .from('tables')
      .select('id')
      .eq('kind', 'bord')
      .eq('active', true)

    if (regularTablesError) {
      throw createError({ statusCode: 500, statusMessage: regularTablesError.message })
    }

    const regularIds = ((regularTables ?? []) as any[]).map((t) => t.id as string)

    if (regularIds.length) {
      const { data: regularBookings, error: regularBookingsError } = await supabase
        .from('bookings')
        .select('table_id, start_time, end_time, status, created_at')
        .eq('booking_date', date)
        .in('table_id', regularIds)
        .in('status', ['confirmed', 'pending'])

      if (regularBookingsError) {
        throw createError({ statusCode: 500, statusMessage: regularBookingsError.message })
      }

      const regularPendingCutoff = Date.now() - PENDING_BOOKING_HOLD_MINUTES * 60_000
      const occupiedKeys = new Set(
        ((regularBookings ?? []) as any[])
          .filter((b) => b.status === 'confirmed' || new Date(b.created_at).getTime() > regularPendingCutoff)
          .flatMap((b) => {
            const start = String(b.start_time).slice(0, 5)
            const end = String(b.end_time).slice(0, 5)
            return validSlots.filter((time) => time >= start && time < end).map((time) => `${b.table_id}|${time}`)
          })
      )

      const { data: regularEvents, error: regularEventsError } = await supabase
        .from('recurring_events')
        .select('start_time, end_time, table_ids')
        .eq('active', true)
        .eq('weekday', toRecurringWeekday(date))

      if (regularEventsError) {
        throw createError({ statusCode: 500, statusMessage: regularEventsError.message })
      }

      const { data: regularOneOffEvents, error: regularOneOffError } = await supabase
        .from('one_off_events')
        .select('start_time, end_time, table_ids')
        .eq('active', true)
        .eq('event_date', date)

      if (regularOneOffError) {
        throw createError({ statusCode: 500, statusMessage: regularOneOffError.message })
      }

      for (const blockingEvent of [...((regularEvents ?? []) as any[]), ...((regularOneOffEvents ?? []) as any[])]) {
        const start = String(blockingEvent.start_time).slice(0, 5)
        const end = String(blockingEvent.end_time).slice(0, 5)
        const coveredSlots = validSlots.filter((time) => time >= start && time < end)

        for (const eventTableId of blockingEvent.table_ids as string[]) {
          for (const time of coveredSlots) {
            occupiedKeys.add(`${eventTableId}|${time}`)
          }
        }
      }

      const slotFullyBooked = regularIds.every((id) => occupiedKeys.has(`${id}|${startTime}`))

      if (!slotFullyBooked) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Rummet går bara att boka när alla andra bord är fullbokade den tiden.'
        })
      }
    }
  }

  const { data: recurringEvents, error: recurringError } = await supabase
    .from('recurring_events')
    .select('name, start_time, end_time, table_ids')
    .eq('active', true)
    .eq('weekday', toRecurringWeekday(date))

  if (recurringError) {
    throw createError({ statusCode: 500, statusMessage: recurringError.message })
  }

  const { data: oneOffEvents, error: oneOffError } = await supabase
    .from('one_off_events')
    .select('name, start_time, end_time, table_ids')
    .eq('active', true)
    .eq('event_date', date)

  if (oneOffError) {
    throw createError({ statusCode: 500, statusMessage: oneOffError.message })
  }

  const tableEvents = [...((recurringEvents ?? []) as any[]), ...((oneOffEvents ?? []) as any[])]
    .filter((tableEvent) => (tableEvent.table_ids as string[]).includes(tableId))
    .map((tableEvent) => ({
      name: tableEvent.name as string,
      start: String(tableEvent.start_time).slice(0, 5),
      end: String(tableEvent.end_time).slice(0, 5)
    }))

  const blockingEvent = tableEvents.find((e) => startTime >= e.start && startTime < e.end)

  if (blockingEvent) {
    throw createError({
      statusCode: 409,
      statusMessage: `Bordet är upptaget av ${blockingEvent.name} den tiden. Välj en annan tid eller ett annat bord.`
    })
  }

  const { data: sameTableBookings, error: sameTableError } = await supabase
    .from('bookings')
    .select('start_time, end_time, status, created_at')
    .eq('table_id', tableId)
    .eq('booking_date', date)
    .in('status', ['confirmed', 'pending'])

  if (sameTableError) {
    throw createError({ statusCode: 500, statusMessage: sameTableError.message })
  }

  const pendingCutoff = Date.now() - PENDING_BOOKING_HOLD_MINUTES * 60_000
  const liveBookings = ((sameTableBookings ?? []) as any[])
    .filter((b) => b.status === 'confirmed' || new Date(b.created_at).getTime() > pendingCutoff)
    .map((b) => ({ start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5) }))

  const overlapsExisting = liveBookings.some((b) => startTime < b.end && b.start <= startTime)

  if (overlapsExisting) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Bordet är redan bokat för den tiden. Välj en annan tid eller ett annat bord.'
    })
  }

  // Hold the table for up to 4h, capped by closing time and by whatever
  // (booking or event) comes next on this table — same rule as the
  // storefront's own booking flow.
  const closingTime = getClosingTimeForDate(date)
  const nextStarts = [
    ...tableEvents.map((e) => e.start),
    ...liveBookings.map((b) => b.start),
    ...(closingTime ? [closingTime] : [])
  ].filter((time) => time > startTime)

  const maxEnd = addHours(startTime, BOOKING_MAX_DURATION_HOURS)
  const endTime = nextStarts.length ? [maxEnd, ...nextStarts].sort()[0] : maxEnd

  const { data: staffRow } = await supabase.from('staff').select('name').eq('email', user.email).maybeSingle()
  const staffName = (staffRow as any)?.name || user.email

  const { data: inserted, error: insertError } = await supabase
    .from('bookings')
    .insert({
      table_id: tableId,
      booking_date: date,
      start_time: startTime,
      end_time: endTime,
      party_size: 2,
      for_miniatures: false,
      customer_name: staffName,
      customer_phone: null,
      customer_email: user.email,
      notes: 'Personalbokning',
      member_id: null,
      status: 'confirmed'
    })
    .select('id, table_id, booking_date, start_time, end_time, party_size, for_miniatures, customer_name, customer_phone, customer_email, notes, status, created_at, member_id, tables ( name, kind ), members ( first_name, last_name, tier )')
    .single()

  if (insertError) {
    // 23505 = unique_violation — this exact table/date/time was just taken
    // concurrently (e.g. by another staff member's own quick-booking).
    if ((insertError as any).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Bordet blev precis bokat för den tiden.' })
    }

    throw createError({ statusCode: 500, statusMessage: insertError.message })
  }

  setResponseStatus(event, 201)

  return { booking: inserted, tableName, endTime }
})
