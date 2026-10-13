export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: batch, error } = await supabase
    .from('scan_batches')
    .select('id, name, note, status, created_by, created_at, purchase_percent')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!batch) {
    throw createError({ statusCode: 404, statusMessage: 'Bunten hittades inte' })
  }

  const { data: items, error: itemsError } = await supabase
    .from('scan_items')
    .select(SCAN_ITEM_SELECT)
    .eq('batch_id', id)
    .order('position', { ascending: true })

  if (itemsError) {
    throw createError({ statusCode: 500, statusMessage: itemsError.message })
  }

  const shopAdminBase = String(process.env.SHOPIFY_STORE_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.myshopify\.com$/i, '')

  return { batch, items: await hydrateItems(supabase, (items ?? []) as any[]), shopAdminBase }
})
