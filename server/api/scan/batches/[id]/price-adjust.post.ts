// Bulk price change: raise or lower the selected cards' prices by a percentage.
// The result is rounded with the same rule as calculated prices and counts as a manual price.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event)) ?? {}
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)) : []
  const percent = Number(body.percent)

  if (!id || !ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'Inga kort valda' })
  }

  if (!Number.isFinite(percent) || percent < -90 || percent > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Procenten måste vara mellan -90 och 500' })
  }

  const supabase = useSupabaseAdmin()
  const settings = await loadScanSettings(supabase)

  const { data: items, error } = await supabase
    .from('scan_items')
    .select('id, price_sek')
    .eq('batch_id', id)
    .in('id', ids)
    .not('price_sek', 'is', null)
    .or('publish_status.is.null,publish_status.neq.published')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const updated: { id: string, price_sek: number }[] = []

  for (const item of items ?? []) {
    const price_sek = roundPrice(Number(item.price_sek) * (1 + percent / 100), settings)
    await supabase.from('scan_items').update({ price_sek, price_overridden: true }).eq('id', item.id)
    updated.push({ id: item.id, price_sek })
  }

  return { updated }
})
