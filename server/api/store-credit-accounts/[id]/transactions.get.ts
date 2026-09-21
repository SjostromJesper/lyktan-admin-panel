export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'view')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('store_credit_transactions')
    .select('id, amount_kr, note, created_at')
    .eq('account_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { transactions: data ?? [] }
})
