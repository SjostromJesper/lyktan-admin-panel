export default defineEventHandler(async (event) => {
  await requireAccess(event, 'events', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()
  const { data: checkins, error } = await supabase
    .from('event_checkins')
    .select('shopify_order_id')
    .eq('shopify_product_id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const orderIds = (checkins ?? []).map((row: any) => row.shopify_order_id)

  let delivered = 0
  const failed: { orderId: string, message: string }[] = []

  for (const orderId of orderIds) {
    try {
      await fulfillOrder(`gid://shopify/Order/${orderId}`)
      delivered += 1
    } catch (err: any) {
      failed.push({ orderId, message: err?.statusMessage || err?.message || 'Okänt fel' })
    }
  }

  return { total: orderIds.length, delivered, failed }
})
