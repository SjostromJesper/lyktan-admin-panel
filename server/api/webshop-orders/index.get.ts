type ShopifyOrderNode = {
  id: string
  legacyResourceId: string
  name: string
  createdAt: string
  displayFulfillmentStatus: string
  email: string | null
  phone: string | null
  customer: { firstName: string | null; lastName: string | null } | null
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
  lineItems: { nodes: { title: string; quantity: number }[] }
  customAttributes: { key: string; value: string }[]
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'view')

  const query = getQuery(event)
  const view = query.status === 'klar' ? 'klar' : 'active'

  const data = await shopifyAdminGraphql(`#graphql
    query WebshopOrders {
      orders(first: 100, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
        nodes {
          id
          legacyResourceId
          name
          createdAt
          displayFulfillmentStatus
          email
          phone
          customer { firstName lastName }
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 20) { nodes { title quantity } }
          customAttributes { key value }
        }
      }
    }
  `)

  const orderNodes: ShopifyOrderNode[] = data.orders?.nodes ?? []

  // Membership purchases are handled automatically by the orders/paid
  // webhook on the storefront — they don't need to be picked up in-store.
  const pickupOrders = orderNodes.filter(
    (order) => !order.customAttributes.some((attr) => attr.key === 'member_purchase' && attr.value === 'true')
  )

  const supabase = useSupabaseAdmin()
  const { data: checkoffs, error } = await supabase
    .from('webshop_order_checkoffs')
    .select('shopify_order_id, checked_at, checked_by')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const checkoffMap = new Map((checkoffs ?? []).map((c: any) => [c.shopify_order_id, c]))

  const orders = pickupOrders.map((order) => {
    const checkoff = checkoffMap.get(order.legacyResourceId)

    return {
      id: order.legacyResourceId,
      name: order.name,
      createdAt: order.createdAt,
      fulfillmentStatus: order.displayFulfillmentStatus,
      customerName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || null,
      email: order.email,
      phone: order.phone,
      totalKr: Math.round(Number(order.totalPriceSet.shopMoney.amount)),
      items: order.lineItems.nodes.map((li) => ({ title: li.title, quantity: li.quantity })),
      checked: Boolean(checkoff),
      checkedAt: checkoff?.checked_at ?? null,
      checkedBy: checkoff?.checked_by ?? null
    }
  })

  const filtered = orders.filter((o) => (view === 'klar' ? o.checked : !o.checked))

  return { orders: filtered }
})
