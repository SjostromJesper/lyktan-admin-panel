type Body = { checked?: boolean }

const fulfillOrder = async (orderGid: string) => {
  const data = await shopifyAdminGraphql(`#graphql
    query OpenFulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          nodes { id status }
        }
      }
    }
  `, { id: orderGid })

  const openOrders = (data.order?.fulfillmentOrders?.nodes ?? []).filter(
    (fo: { status: string }) => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS' || fo.status === 'SCHEDULED'
  )

  // Nothing left to fulfill — already fulfilled some other way. Not an error.
  if (!openOrders.length) return

  const result = await shopifyAdminGraphql(`#graphql
    mutation FulfillOrder($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment { id status }
        userErrors { field message }
      }
    }
  `, {
    fulfillment: {
      lineItemsByFulfillmentOrder: openOrders.map((fo: { id: string }) => ({ fulfillmentOrderId: fo.id })),
      notifyCustomer: false
    }
  })

  const userErrors = result.fulfillmentCreate?.userErrors ?? []
  if (userErrors.length) {
    throw createError({ statusCode: 500, statusMessage: userErrors.map((e: { message: string }) => e.message).join(', ') })
  }
}

const cancelFulfillments = async (orderGid: string) => {
  const data = await shopifyAdminGraphql(`#graphql
    query OrderFulfillments($id: ID!) {
      order(id: $id) {
        fulfillments(first: 10) { id status }
      }
    }
  `, { id: orderGid })

  const cancellable = (data.order?.fulfillments ?? []).filter((f: { status: string }) => f.status !== 'CANCELLED')

  for (const fulfillment of cancellable) {
    try {
      await shopifyAdminGraphql(`#graphql
        mutation CancelFulfillment($id: ID!) {
          fulfillmentCancel(id: $id) {
            fulfillment { id status }
            userErrors { field message }
          }
        }
      `, { id: fulfillment.id })
    } catch {
      // Undoing our own checklist shouldn't be blocked by a Shopify-side
      // quirk (e.g. already closed) — the local checkoff still gets removed.
    }
  }
}

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
