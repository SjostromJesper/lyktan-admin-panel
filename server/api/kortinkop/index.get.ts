export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('buy_offers')
    .select('id, number, status, customer_name, evaluated_at, grand_total_kr, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { offers: data ?? [] }
})
