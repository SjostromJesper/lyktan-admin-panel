export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('tables')
    .select('id, name, kind, capacity, price_kr, active, created_at')
    .order('kind', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { tables: data ?? [] }
})
