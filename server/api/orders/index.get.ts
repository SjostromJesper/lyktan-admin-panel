const OPEN_STATUSES = ['bokad', 'bestalld', 'slut_pa_lager']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'view')

  const query = getQuery(event)
  const view = String(query.status || '').trim()

  const supabase = useSupabaseAdmin()

  let request = supabase
    .from('orders')
    .select('id, customer_name, customer_phone, customer_email, supplier, product_line, product_code, product_name, price_kr, notes, status, ordered_at, completed_at, created_at')

  if (view === 'klar') {
    request = request.eq('status', 'klar')
  } else if (view === 'active') {
    request = request.in('status', OPEN_STATUSES)
  }

  const { data, error } = await request
    .order('ordered_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { orders: data ?? [] }
})
