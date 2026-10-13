// Webshop sales that still need a physical copy: Shopify already lowered the stock
// when the order came in, but which copy was sold (bunt + position) is only known
// once someone picks it. Lists recent orders with single-card lines that have fewer
// linked copies than their quantity, with the copies still for sale to choose from,
// and cancelled orders whose linked copies should go back on sale.
const LOOKBACK_DAYS = 60

type OrderNode = {
  id: string
  name: string
  createdAt: string
  cancelledAt: string | null
  displayFinancialStatus: string | null
  lineItems: { nodes: { sku: string | null, title: string, quantity: number }[] }
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10)

  const data = await shopifyAdminGraphql(`#graphql
    query SinglesOrders($query: String!) {
      orders(first: 100, sortKey: CREATED_AT, reverse: true, query: $query) {
        nodes {
          id
          name
          createdAt
          cancelledAt
          displayFinancialStatus
          lineItems(first: 50) { nodes { sku title quantity } }
        }
      }
    }
  `, { query: `created_at:>=${since}` })

  const orders = ((data.orders?.nodes ?? []) as OrderNode[])
    .map((o) => ({ ...o, lines: o.lineItems.nodes.filter((l) => l.sku && /^(mtg|pokemon)-/.test(l.sku)) }))
    .filter((o) => o.lines.length)

  if (!orders.length) return { pending: [], cancelled: [] }

  const supabase = useSupabaseAdmin()
  const skus = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.sku!)))]
  const names = orders.map((o) => o.name)

  const [{ data: forSale }, { data: linked }] = await Promise.all([
    supabase.from('scan_stock_view').select('*').in('shopify_sku', skus).eq('stock_status', 'listed').order('published_at', { ascending: true }),
    supabase.from('scan_stock_view').select('*').in('shopify_order_name', names).in('stock_status', ['sold'])
  ])

  const copiesFor = (sku: string) => ((forSale ?? []) as any[]).filter((c) => c.shopify_sku === sku)
  const linkedFor = (orderName: string, sku?: string) => ((linked ?? []) as any[]).filter((c) => c.shopify_order_name === orderName && (!sku || c.shopify_sku === sku))

  const pending: any[] = []
  const cancelled: any[] = []

  for (const order of orders) {
    if (order.cancelledAt) {
      const items = linkedFor(order.name)
      if (items.length) cancelled.push({ orderName: order.name, createdAt: order.createdAt, items })
      continue
    }

    for (const line of order.lines) {
      const remaining = line.quantity - linkedFor(order.name, line.sku!).length
      if (remaining > 0) {
        pending.push({
          orderName: order.name,
          createdAt: order.createdAt,
          financialStatus: order.displayFinancialStatus,
          sku: line.sku,
          title: line.title,
          remaining,
          copies: copiesFor(line.sku!)
        })
      }
    }
  }

  return { pending, cancelled }
})
