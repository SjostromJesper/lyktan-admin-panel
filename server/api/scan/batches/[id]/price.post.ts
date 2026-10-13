// "Hämta priser": looks up the Cardmarket price guide for the batch's confirmed
// cards and (re)calculates SEK prices. Prices set by hand are left alone unless
// `reset` is true. Optional `ids` limits it to specific cards.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event).catch(() => null)) ?? {}

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()
  const settings = await loadScanSettings(supabase)

  let query = supabase
    .from('scan_items')
    .select('id, condition, is_foil, is_manual, price_overridden, matched_card:tcg_cards!scan_items_matched_card_id_fkey(cardmarket_id)')
    .eq('batch_id', id)
    .eq('status', 'confirmed')

  if (Array.isArray(body.ids) && body.ids.length) {
    query = query.in('id', body.ids.map(String).filter((v: string) => /^[0-9a-f-]{36}$/i.test(v)))
  }

  const { data: items, error } = await query

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const rows = ((items ?? []) as any[]).filter((i) => body.reset || !i.price_overridden)
  const productIds = [...new Set(rows.map((i) => i.matched_card?.cardmarket_id).filter((v): v is number => v != null))]
  const prices = new Map<number, CardmarketPrice>()

  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await supabase
      .from('tcg_prices')
      .select('cardmarket_id, trend, low, avg30, trend_foil, low_foil, avg30_foil')
      .in('cardmarket_id', productIds.slice(i, i + 200))
    for (const p of data ?? []) prices.set(p.cardmarket_id, p as CardmarketPrice)
  }

  const summary = { priced: 0, no_price: 0 }

  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (item) => {
      const cardmarketId = item.matched_card?.cardmarket_id as number | null | undefined
      const result = computePrice(cardmarketId != null ? prices.get(cardmarketId) ?? null : null, item, settings)

      if (result.price_sek == null) summary.no_price += 1
      else summary.priced += 1

      await supabase
        .from('scan_items')
        .update({ ...result, price_overridden: body.reset ? false : item.price_overridden })
        .eq('id', item.id)
    }))
  }

  await supabase.from('scan_batches').update({ status: 'priced' }).eq('id', id).in('status', ['confirmed', 'priced'])

  return { ...summary, skippedManualPrice: ((items ?? []) as any[]).length - rows.length }
})
