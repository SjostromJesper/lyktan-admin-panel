export default defineEventHandler(async (event) => {
  await requireAdminSession(event)

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('cart_activity')
    .select('id, product_title, variant_title, quantity, price_kr, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { events: data ?? [] }
})
