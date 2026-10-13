// Updates one scanned card from the review view: pick a match, set condition /
// language / foil, change status, or enter it manually.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = (await readBody(event)) ?? {}
  const patch = parseItemPatch(body)

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  // Once a card is in Shopify its identity, condition and price live there.
  const LOCKED_AFTER_PUBLISH = ['condition', 'language', 'is_foil', 'price_sek', 'image_source', 'matched_card_id', 'is_manual', 'status', 'sales_channel']

  if (Object.keys(patch).some((key) => LOCKED_AFTER_PUBLISH.includes(key))) {
    const { data: current } = await supabase.from('scan_items').select('publish_status').eq('id', id).maybeSingle()

    if (current?.publish_status === 'published') {
      throw createError({ statusCode: 409, statusMessage: 'Kortet är redan publicerat i Shopify och kan inte ändras här' })
    }
  }

  // Picking a reference card replaces any manual entry, and vice versa.
  if (patch.matched_card_id) {
    Object.assign(patch, { is_manual: false, manual_name: null, manual_set_name: null, manual_set_code: null, manual_collector_number: null, manual_rarity: null })
  }

  if (patch.is_manual === true) {
    patch.matched_card_id = null
  }

  if (patch.status === 'confirmed') {
    const { data: current } = await supabase
      .from('scan_items')
      .select('matched_card_id, is_manual, manual_name')
      .eq('id', id)
      .maybeSingle()

    const matchedCardId = 'matched_card_id' in patch ? patch.matched_card_id : current?.matched_card_id
    const isManual = 'is_manual' in patch ? patch.is_manual : current?.is_manual
    const manualName = 'manual_name' in patch ? patch.manual_name : current?.manual_name

    if (!matchedCardId && !(isManual && manualName)) {
      throw createError({ statusCode: 400, statusMessage: 'Välj ett kort eller lägg in det manuellt innan du bekräftar' })
    }
  }

  const { data, error } = await supabase
    .from('scan_items')
    .update(patch)
    .eq('id', id)
    .select(SCAN_ITEM_SELECT)
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const { image_path, ...row } = data as any
  return { item: row }
})
