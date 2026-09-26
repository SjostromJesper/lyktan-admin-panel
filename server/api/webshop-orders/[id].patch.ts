// fulfillOrder/cancelFulfillments now live in server/utils/shopifyFulfillment.ts
// (auto-imported), shared with server/api/events/[id]/deliver.post.ts.

type Body = { checked?: boolean }

export default defineEventHandler(async (event) => {
  const admin = await requireAccess(event, 'orders', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<Body>(event)
  const supabase = useSupabaseAdmin()
  const orderGid = `gid://shopify/Order/${id}`

  if (body.checked) {
    await fulfillOrder(orderGid)

    const { error } = await supabase
      .from('webshop_order_checkoffs')
      .upsert({ shopify_order_id: id, checked_at: new Date().toISOString(), checked_by: admin.email })

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  } else {
    await cancelFulfillments(orderGid)

    const { error } = await supabase.from('webshop_order_checkoffs').delete().eq('shopify_order_id', id)

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
