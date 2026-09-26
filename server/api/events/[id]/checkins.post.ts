type Body = { orderIds?: string[] }

export default defineEventHandler(async (event) => {
  const admin = await requireAccess(event, 'events', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<Body>(event)
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.map(String) : []

  const supabase = useSupabaseAdmin()

  const { data: existing, error: existingError } = await supabase
    .from('event_checkins')
    .select('shopify_order_id')
    .eq('shopify_product_id', id)

  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: existingError.message })
  }

  const existingIds = new Set((existing ?? []).map((row: any) => row.shopify_order_id))
  const wantedIds = new Set(orderIds)

  const toAdd = orderIds.filter((orderId) => !existingIds.has(orderId))
  const toRemove = [...existingIds].filter((orderId) => !wantedIds.has(orderId))

  if (toAdd.length) {
    const { error } = await supabase
      .from('event_checkins')
      .insert(toAdd.map((orderId) => ({ shopify_product_id: id, shopify_order_id: orderId, checked_in_by: admin.email })))

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  if (toRemove.length) {
    const { error } = await supabase
      .from('event_checkins')
      .delete()
      .eq('shopify_product_id', id)
      .in('shopify_order_id', toRemove)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  return { ok: true }
})
