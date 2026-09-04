export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('one_off_events')
    .select('id, name, event_date, start_time, end_time, table_ids, active, created_at')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { oneOffEvents: data ?? [] }
})
