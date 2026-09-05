export default defineEventHandler(async (event) => {
  await requireAccess(event, 'products', 'view')

  const query = getQuery(event)
  const productHandle = String(query.handle || '').trim()

  if (!productHandle) {
    throw createError({ statusCode: 400, statusMessage: 'Produkt saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('product_interest_signups')
    .select('email, created_at')
    .eq('product_handle', productHandle)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { signups: data ?? [] }
})
