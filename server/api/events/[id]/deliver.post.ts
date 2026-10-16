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

  let orderIds: string[] = (checkins ?? []).map((row: any) => row.shopify_order_id)

  // Delivering after one play time should only touch the people who came to that one.
  const body = (await readBody(event).catch(() => null)) ?? {}
  const variantId = body.variantId ? String(body.variantId) : null

  if (variantId) {
    const productGid = `gid://shopify/Product/${id}`
    const matching: string[] = []

    for (const orderId of orderIds) {
      const data = await shopifyAdminGraphql(`#graphql
        query OrderTickets($id: ID!) {
          order(id: $id) {
            lineItems(first: 20) { nodes { variant { legacyResourceId } product { id } } }
          }
        }
      `, { id: `gid://shopify/Order/${orderId}` })

      const hasTicket = (data.order?.lineItems?.nodes ?? []).some(
        (li: any) => li.product?.id === productGid && li.variant?.legacyResourceId === variantId
      )
      if (hasTicket) matching.push(orderId)
    }

    orderIds = matching
  }

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
