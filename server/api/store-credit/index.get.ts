export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'view')

  const query = getQuery(event)
  const redeemed = query.view === 'redeemed'

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('store_credit_grants')
    .select('id, customer_name, type, event_name, custom_text, reason, redeemed, redeemed_at, created_at')
    .eq('redeemed', redeemed)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { grants: data ?? [] }
})
