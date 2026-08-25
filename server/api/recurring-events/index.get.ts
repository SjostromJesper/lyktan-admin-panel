export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('recurring_events')
    .select('id, name, weekday, start_time, end_time, table_ids, active, created_at')
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { recurringEvents: data ?? [] }
})
