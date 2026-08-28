export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'view')

  const query = getQuery(event)
  const view = String(query.status || '').trim()
  const from = String(query.from || '').trim()
  const to = String(query.to || '').trim()

  const supabase = useSupabaseAdmin()

  const today = new Date().toISOString().slice(0, 10)

  let request = supabase
    .from('bookings')
    .select('id, table_id, booking_date, start_time, end_time, party_size, for_miniatures, customer_name, customer_phone, customer_email, notes, status, created_at, member_id, tables ( name, kind ), members ( first_name, last_name, tier )')

  if (from && to) {
    // Calendar view — a fixed date range, optionally narrowed by status.
    request = request.gte('booking_date', from).lte('booking_date', to)
    if (view === 'confirmed' || view === 'cancelled') {
      request = request.eq('status', view)
    }
  } else if (view === 'active') {
    request = request.in('status', ['confirmed', 'pending']).gte('booking_date', today)
  } else if (view === 'history') {
    request = request.or(`status.eq.cancelled,booking_date.lt.${today}`)
  }

  const { data, error } = await request
    .order('booking_date', { ascending: view !== 'history' })
    .order('start_time', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { bookings: data ?? [] }
})
