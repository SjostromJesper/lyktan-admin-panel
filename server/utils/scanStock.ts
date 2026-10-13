// Status flow per physical copy: listed -> sold -> shipped, plus removed.
// Shopify is the source of truth for the stock count; this only ever sends deltas,
// and only for changes that happen outside Shopify (shop, Cardmarket, other).
// A sale in the webshop already lowered the Shopify stock by itself, so marking
// such a copy sold (channel "webbshop") changes the status but not the stock.

export type StockAction = 'sold' | 'unsell' | 'shipped' | 'remove'
export const SOLD_CHANNELS = ['butik', 'cardmarket', 'webbshop', 'annat'] as const
export type SoldChannel = typeof SOLD_CHANNELS[number]

const FLOW: Record<StockAction, { from: string, to: string }> = {
  sold: { from: 'listed', to: 'sold' },
  unsell: { from: 'sold', to: 'listed' },
  shipped: { from: 'sold', to: 'shipped' },
  remove: { from: 'listed', to: 'removed' }
}

export const STOCK_ACTIONS = Object.keys(FLOW) as StockAction[]

export const changeStockStatus = async (
  supabase: ReturnType<typeof useSupabaseAdmin>,
  itemId: string,
  action: StockAction,
  options: { channel?: string | null, note?: string | null, orderName?: string | null, user: string }
) => {
  const flow = FLOW[action]

  const { data: item, error } = await supabase
    .from('scan_items')
    .select('id, stock_status, sold_at, sold_channel, sold_note, shopify_order_name, shopify_inventory_item_id, shopify_stocked')
    .eq('id', itemId)
    .maybeSingle()

  if (error || !item) {
    throw createError({ statusCode: error ? 500 : 404, statusMessage: error?.message ?? 'Exemplaret hittades inte' })
  }

  if (item.stock_status !== flow.from) {
    throw createError({ statusCode: 409, statusMessage: `Exemplaret har status "${item.stock_status ?? 'ingen'}" och kan inte ändras så här` })
  }

  const channel = action === 'sold'
    ? (SOLD_CHANNELS as readonly string[]).includes(options.channel ?? '') ? (options.channel as SoldChannel) : null
    : action === 'unsell' ? (item.sold_channel as SoldChannel | null) : null

  if (action === 'sold' && !channel) {
    throw createError({ statusCode: 400, statusMessage: 'Välj försäljningskanal' })
  }

  // Stock delta: webshop sales were already deducted by Shopify itself.
  let delta = 0
  if (action === 'sold') delta = channel === 'webbshop' ? 0 : -1
  if (action === 'unsell') delta = channel === 'webbshop' ? 0 : 1
  if (action === 'remove') delta = -1

  // Copies that only sell on Cardmarket were never in Shopify, so there is no stock to change.
  if (!(item.shopify_inventory_item_id && item.shopify_stocked)) delta = 0

  // Claim the transition first (conditional on the old status) so two clicks can't both apply a delta.
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { stock_status: flow.to }

  if (action === 'sold') Object.assign(patch, { sold_at: now, sold_channel: channel, sold_note: options.note ?? null, shopify_order_name: options.orderName ?? null })
  if (action === 'unsell') Object.assign(patch, { sold_at: null, sold_channel: null, sold_note: null, shopify_order_name: null })

  const { data: claimed, error: claimError } = await supabase
    .from('scan_items')
    .update(patch)
    .eq('id', itemId)
    .eq('stock_status', flow.from)
    .select('id')

  if (claimError) throw createError({ statusCode: 500, statusMessage: claimError.message })
  if (!claimed?.length) throw createError({ statusCode: 409, statusMessage: 'Exemplaret ändrades just av någon annan' })

  if (delta !== 0) {
    try {
      await adjustShopifyStock(item.shopify_inventory_item_id!, delta, action === 'remove' ? 'shrinkage' : delta > 0 ? 'restock' : 'correction', itemId)
    } catch (err) {
      // Shopify didn't change, so put the status back.
      await supabase
        .from('scan_items')
        .update({ stock_status: flow.from, sold_at: item.sold_at, sold_channel: item.sold_channel, sold_note: item.sold_note, shopify_order_name: item.shopify_order_name })
        .eq('id', itemId)
      throw err
    }
  }

  await supabase.from('stock_event').insert({
    scan_item_id: itemId,
    from_status: flow.from,
    to_status: flow.to,
    channel,
    note: options.note ?? (options.orderName ? `Order ${options.orderName}` : null),
    shopify_delta: delta,
    created_by: options.user
  })

  return { status: flow.to, delta }
}
