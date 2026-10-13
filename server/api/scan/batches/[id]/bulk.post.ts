// Bulk edit from the review grid: set condition / language / foil, or
// confirm / skip, for a set of selected cards in one batch.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event)) ?? {}
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)) : []

  if (!id || !ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'Inga kort valda' })
  }

  // Bulk may only touch these — picking a card or manual data is per card.
  const allowed = ['condition', 'language', 'is_foil', 'status', 'sales_channel', 'image_source']
  const patch = parseItemPatch(Object.fromEntries(Object.entries(body.patch ?? {}).filter(([k]) => allowed.includes(k))))

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()
  let skippedUnmatched = 0

  // Confirming needs a card; silently leave out the ones that have none.
  let targetIds: string[] = ids
  if (patch.status === 'confirmed') {
    const { data: rows } = await supabase
      .from('scan_items')
      .select('id, matched_card_id, is_manual, manual_name')
      .eq('batch_id', id)
      .in('id', ids)
    const ok = (rows ?? []).filter((r) => r.matched_card_id || (r.is_manual && r.manual_name)).map((r) => r.id)
    skippedUnmatched = ids.length - ok.length
    targetIds = ok
  }

  // Cards already in Shopify are left alone.
  const { data: published } = await supabase.from('scan_items').select('id').eq('batch_id', id).eq('publish_status', 'published').in('id', targetIds)
  const lockedIds = new Set((published ?? []).map((r) => r.id))
  targetIds = targetIds.filter((itemId) => !lockedIds.has(itemId))

  if (targetIds.length) {
    const { error } = await supabase.from('scan_items').update(patch).eq('batch_id', id).in('id', targetIds)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  return { updated: targetIds.length, skippedUnmatched }
})
