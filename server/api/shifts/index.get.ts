export default defineEventHandler(async (event) => {
  await requireAccess(event, 'schedule', 'view')

  const query = getQuery(event)
  const from = String(query.from || '').trim()
  const to = String(query.to || '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datumintervall' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('shifts')
    .select('id, staff_id, shift_date, start_time, end_time, notes, created_at')
    .gte('shift_date', from)
    .lte('shift_date', to)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { shifts: data ?? [] }
})
