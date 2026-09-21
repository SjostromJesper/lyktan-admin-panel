export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('store_credit_accounts')
    .select('id, customer_name, balance_kr, created_at, updated_at')
    .order('customer_name', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { accounts: data ?? [] }
})
