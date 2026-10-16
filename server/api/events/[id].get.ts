type OrderNode = {
  id: string
  legacyResourceId: string
  name: string
  createdAt: string
  displayFulfillmentStatus: string
  email: string | null
  phone: string | null
  customer: { firstName: string | null, lastName: string | null } | null
  lineItems: { nodes: { title: string, quantity: number, variant: { id: string, legacyResourceId: string, title: string } | null, product: { id: string } | null }[] }
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'events', 'view')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const productGid = `gid://shopify/Product/${id}`

  const productData = await shopifyAdminGraphql(`#graphql
    query EventProduct($id: ID!) {
      product(id: $id) {
        id
        legacyResourceId
        title
        handle
        status
        description
        featuredImage { url altText }
        dateAndTime: metafield(namespace: "custom", key: "date_and_time") { value }
        variants(first: 50) { nodes { legacyResourceId title inventoryQuantity } }
      }
    }
  `, { id: productGid })

  const product = productData.product

  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Eventet hittades inte' })
  }

  // Shopify has no "orders containing product X" query, so — same
  // limitation server/api/webshop-orders already lives with — we scan paid
  // orders and filter by product id in code. Unlike that route (capped at
  // the first 100), we page through *all* of them: an older event could
  // otherwise silently lose attendees once total order volume passed 100.
  const orders: OrderNode[] = []
  let after: string | null = null

  for (let page = 0; page < 50; page++) {
    const data = await shopifyAdminGraphql(`#graphql
      query PaidOrders($after: String) {
        orders(first: 100, after: $after, sortKey: CREATED_AT, query: "financial_status:paid") {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            legacyResourceId
            name
            createdAt
            displayFulfillmentStatus
            email
            phone
            customer { firstName lastName }
            lineItems(first: 20) { nodes { title quantity variant { id legacyResourceId title } product { id } } }
          }
        }
      }
    `, { after })

    const batch: OrderNode[] = data.orders?.nodes ?? []
    orders.push(...batch)

    const pageInfo = data.orders?.pageInfo
    if (!pageInfo?.hasNextPage) break
    after = pageInfo.endCursor
  }

  const supabase = useSupabaseAdmin()
  const { data: checkins, error } = await supabase
    .from('event_checkins')
    .select('shopify_order_id')
    .eq('shopify_product_id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const checkedInOrderIds = new Set((checkins ?? []).map((c: any) => c.shopify_order_id))

  // One row per order *and* occasion: an order holding tickets for two play times shows up
  // under both, each with its own quantity.
  const attendees = orders
    .flatMap((order) => {
      const ticketLines = order.lineItems.nodes.filter((li) => li.product?.id === productGid)
      if (!ticketLines.length) return []

      const byVariant = new Map<string, typeof ticketLines>()
      for (const line of ticketLines) {
        const key = line.variant?.legacyResourceId ?? 'none'
        byVariant.set(key, [...(byVariant.get(key) ?? []), line])
      }

      return [...byVariant.entries()].map(([variantId, lines]) => {
        const title = lines[0]?.variant?.title
        return {
          orderId: order.legacyResourceId,
          orderName: order.name,
          createdAt: order.createdAt,
          customerName: [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || null,
          email: order.email,
          phone: order.phone,
          variantId: variantId === 'none' ? null : variantId,
          variantTitle: title && title !== 'Default Title' ? title : null,
          quantity: lines.reduce((sum, li) => sum + li.quantity, 0),
          fulfillmentStatus: order.displayFulfillmentStatus,
          checkedIn: checkedInOrderIds.has(order.legacyResourceId)
        }
      })
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // Occasions = the product's variants, in the order they were set up in Shopify.
  const variants: { legacyResourceId: string, title: string, inventoryQuantity: number | null }[] = product.variants?.nodes ?? []
  const occasions = variants.length > 1
    ? variants.map((v) => ({ id: v.legacyResourceId, title: v.title, inventory: v.inventoryQuantity }))
    : []

  return {
    event: {
      id: product.legacyResourceId,
      title: product.title,
      handle: product.handle,
      status: product.status,
      description: product.description,
      imageUrl: product.featuredImage?.url ?? null,
      dateAndTime: product.dateAndTime?.value ?? null
    },
    occasions,
    attendees
  }
})
