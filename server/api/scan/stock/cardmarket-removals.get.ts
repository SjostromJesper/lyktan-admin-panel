// Copies that are (or were) listed on Cardmarket via PowerTools but sold or removed
// somewhere else, so the Cardmarket listing must be taken down by hand.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const { data, error } = await useSupabaseAdmin()
    .from('scan_stock_view')
    .select('id, batch_name, position, name, set_code, collector_number, condition, language, is_foil, stock_status, sold_channel, sold_at, sold_note, shopify_order_name')
    .eq('sales_channel', 'both')
    .not('exported_to_powertools_at', 'is', null)
    .is('cardmarket_removed_at', null)
    .in('stock_status', ['sold', 'shipped', 'removed'])
    .order('sold_at', { ascending: true, nullsFirst: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  // Sold on Cardmarket itself: nothing to take down there.
  return { items: ((data ?? []) as any[]).filter((i) => i.sold_channel !== 'cardmarket') }
})
