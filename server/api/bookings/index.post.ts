// recurring_events.weekday: 0=Måndag..6=Söndag, same convention as
// app/utils/week.ts's weekdayIndex — kept separate since app/utils isn't
// reachable from server routes.
const toRecurringWeekday = (isoDate: string): number => {
  const [year, month, day] = isoDate.split('-').map(Number)
  const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return jsWeekday === 0 ? 6 : jsWeekday - 1
}

const addHours = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = Math.min(h * 60 + m + hours * 60, 23 * 60 + 59)
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAccess(event, 'bookings', 'edit')

  const body = await readBody<{ tableId?: string, date?: string, startTime?: string, durationHours?: number, partySize?: number }>(event)

  const tableId = String(body?.tableId || '').trim()
  const date = String(body?.date || '').trim()
  const startTime = String(body?.startTime || '').trim()
  const durationHours = Number(body?.durationHours) || 2
  const partySize = Number(body?.partySize) || 2

  if (!tableId) {
    throw createError({ statusCode: 400, statusMessage: 'Välj ett bord' })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datum' })
  }

  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig tid' })
  }

  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 6) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig längd' })
  }

  if (!Number.isInteger(partySize) || partySize < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt antal personer' })
  }

  const supabase = useSupabaseAdmin()

  const { data: table, error: tableError } = await supabase
    .from('tables')
    .select('id, active')
    .eq('id', tableId)
    .maybeSingle()

  if (tableError) {
    throw createError({ statusCode: 500, statusMessage: tableError.message })
  }

  if (!table || !(table as any).active) {
    throw createError({ statusCode: 400, statusMessage: 'Bordet finns inte längre' })
  }

  const { data: staffRow } = await supabase.from('staff').select('name').eq('email', user.email).maybeSingle()
  const staffName = (staffRow as any)?.name || user.email

  const endTime = addHours(startTime, durationHours)

  const { data: existingBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('start_time, end_time, status')
    .eq('table_id', tableId)
    .eq('booking_date', date)
    .in('status', ['confirmed', 'pending'])

  if (bookingsError) {
    throw createError({ statusCode: 500, statusMessage: bookingsError.message })
  }

  const overlapsBooking = ((existingBookings ?? []) as any[]).some((b) => {
    const bStart = String(b.start_time).slice(0, 5)
    const bEnd = String(b.end_time).slice(0, 5)
    return startTime < bEnd && bStart < endTime
  })

  if (overlapsBooking) {
    throw createError({ statusCode: 409, statusMessage: 'Bordet är redan bokat den tiden.' })
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

  const blockingEvent = [...((recurringEvents ?? []) as any[]), ...((oneOffEvents ?? []) as any[])]
    .filter((entry) => (entry.table_ids as string[]).includes(tableId))
    .find((entry) => {
      const eStart = String(entry.start_time).slice(0, 5)
      const eEnd = String(entry.end_time).slice(0, 5)
      return startTime < eEnd && eStart < endTime
    })

  if (blockingEvent) {
    throw createError({ statusCode: 409, statusMessage: `Bordet är upptaget av ${blockingEvent.name} den tiden.` })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('bookings')
    .insert({
      table_id: tableId,
      booking_date: date,
      start_time: startTime,
      end_time: endTime,
      party_size: partySize,
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

  return { booking: inserted }
})
