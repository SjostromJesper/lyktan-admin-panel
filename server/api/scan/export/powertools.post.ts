// Builds the PowerTools import file for a bunt (confirmed copies) or for a set of
// copies picked in the stock list. Only copies meant for Cardmarket ("cardmarket" or
// "both") are exported, identical copies are grouped into one row with a quantity, and
// the price is the Cardmarket trend (EUR) times the per-condition factor from the
// settings, not converted from the SEK shop price.
//
// Exporting twice risks double listings on Cardmarket, so copies exported before are
// reported first and only included again when the caller sends `force: true`.
type ItemRow = {
  id: string
  condition: string
  language: string
  is_foil: boolean
  sales_channel: string
  stock_status: string | null
  exported_to_powertools_at: string | null
  manual_name: string | null
  matched_card: { name: string, set_name: string, cardmarket_id: number | null } | null
}

const slugify = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export default defineEventHandler(async (event) => {
  const user = await requireAccess(event, 'scan', 'edit')

  const body = (await readBody(event)) ?? {}
  const batchId = /^[0-9a-f-]{36}$/i.test(String(body.batchId ?? '')) ? String(body.batchId) : null
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)) : []
  const force = body.force === true
  // Whole-bunt export from the scanning view: copies still set to Shopify only are switched
  // to this channel first ("both" keeps them on Shopify too). Copies already in Shopify's
  // stock always become "both", so they don't linger there while listed on Cardmarket only.
  const setChannel = ['cardmarket', 'both'].includes(body.setChannel) ? (body.setChannel as 'cardmarket' | 'both') : null

  if (!batchId && !ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'Välj en bunt eller några exemplar att exportera' })
  }

  const supabase = useSupabaseAdmin()

  if (setChannel && batchId) {
    const { data: shopifyOnly } = await supabase
      .from('scan_items')
      .select('id, publish_status, stock_status')
      .eq('batch_id', batchId)
      .eq('status', 'confirmed')
      .eq('sales_channel', 'shopify')

    const forSale = (shopifyOnly ?? []).filter((i) => !i.stock_status || i.stock_status === 'listed')
    const inShopify = forSale.filter((i) => i.publish_status === 'published').map((i) => i.id)
    const rest = forSale.filter((i) => i.publish_status !== 'published').map((i) => i.id)

    if (inShopify.length) await supabase.from('scan_items').update({ sales_channel: 'both' }).in('id', inShopify)
    if (rest.length) await supabase.from('scan_items').update({ sales_channel: setChannel }).in('id', rest)
  }

  let query = supabase
    .from('scan_items')
    .select('id, condition, language, is_foil, sales_channel, stock_status, exported_to_powertools_at, manual_name, matched_card:tcg_cards!scan_items_matched_card_id_fkey(name, set_name, cardmarket_id)')
    .in('sales_channel', ['cardmarket', 'both'])

  if (ids.length) query = query.in('id', ids)
  else query = query.eq('batch_id', batchId!).eq('status', 'confirmed')

  const { data, error } = await query

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  // Sold or removed copies must never be listed again.
  const items = ((data ?? []) as unknown as ItemRow[]).filter((i) => !i.stock_status || i.stock_status === 'listed')

  if (!items.length) {
    throw createError({ statusCode: 404, statusMessage: 'Inga exemplar för Cardmarket att exportera (kanalen måste vara Cardmarket eller Båda)' })
  }

  const already = items.filter((i) => i.exported_to_powertools_at)

  if (already.length && !force) {
    return {
      needsConfirm: true,
      alreadyExported: already.map((i) => ({ name: i.matched_card?.name ?? i.manual_name ?? '—', exportedAt: i.exported_to_powertools_at }))
    }
  }

  const skipped: { name: string, reason: string }[] = []
  const exportable = items.filter((i) => {
    if (i.matched_card?.cardmarket_id) return true
    skipped.push({ name: i.matched_card?.name ?? i.manual_name ?? '—', reason: i.matched_card ? 'saknar Cardmarket-ID' : 'manuellt kort utan koppling till ett kort' })
    return false
  })

  const productIds = [...new Set(exportable.map((i) => i.matched_card!.cardmarket_id!))]
  const prices = new Map<number, { trend: number | null, trend_foil: number | null }>()

  for (let i = 0; i < productIds.length; i += 200) {
    const { data: rows } = await supabase.from('tcg_prices').select('cardmarket_id, trend, trend_foil').in('cardmarket_id', productIds.slice(i, i + 200))
    for (const row of rows ?? []) prices.set(row.cardmarket_id, row as any)
  }

  const settings = await loadScanSettings(supabase)
  const groups = new Map<string, PowertoolsRow>()
  let withoutPrice = 0

  for (const item of exportable) {
    const card = item.matched_card!
    const key = [card.cardmarket_id, item.condition, item.language, item.is_foil].join('|')
    const existing = groups.get(key)

    if (existing) {
      existing.quantity += 1
      continue
    }

    const guide = prices.get(card.cardmarket_id!)
    const price = cardmarketPrice(item.is_foil ? guide?.trend_foil : guide?.trend, item.condition, settings.cardmarket_factors)
    if (price == null) withoutPrice += 1

    groups.set(key, { idProduct: card.cardmarket_id!, quantity: 1, name: card.name, set: card.set_name, condition: item.condition, language: item.language, isFoil: item.is_foil, price })
  }

  const rows = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  const csv = buildPowertoolsCsv(rows)

  // Mark as exported. Copies that only sell on Cardmarket get their stock status now,
  // so they show up in the stock list and can be marked as sold there.
  const now = new Date().toISOString()
  const exportedIds = exportable.map((i) => i.id)

  await supabase.from('scan_items').update({ exported_to_powertools_at: now }).in('id', exportedIds)

  const needsStatus = exportable.filter((i) => !i.stock_status)

  if (needsStatus.length) {
    await supabase.from('scan_items').update({ stock_status: 'listed' }).in('id', needsStatus.map((i) => i.id)).is('stock_status', null)
    await supabase.from('stock_event').insert(needsStatus.map((i) => ({
      scan_item_id: i.id, from_status: null, to_status: 'listed', channel: 'cardmarket', note: 'Exporterad till PowerTools', shopify_delta: 0, created_by: user.email
    })))
  }

  let name = new Date().toISOString().slice(0, 10)

  if (batchId) {
    const { data: batch } = await supabase.from('scan_batches').select('name').eq('id', batchId).maybeSingle()
    if (batch?.name) name = slugify(batch.name) || name
  }

  return {
    filename: `powertools_${name}.csv`,
    csv,
    rows: rows.length,
    copies: rows.reduce((sum, r) => sum + r.quantity, 0),
    skipped,
    withoutPrice,
    reexported: already.length
  }
})
