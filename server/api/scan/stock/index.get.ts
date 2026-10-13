// Stock list: every copy that has been published to Shopify, with filters,
// sorting and the total value of the current filter.
const SORTS: Record<string, string> = { price: 'price_sek', name: 'name', date: 'published_at', place: 'batch_name' }
const STATUSES = ['listed', 'sold', 'shipped', 'removed']

const clean = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max)

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const query = getQuery(event)
  const supabase = useSupabaseAdmin()

  const q = clean(query.q).replace(/[,()%*\\]/g, ' ').trim()
  const game = clean(query.game, 10)
  const set = clean(query.set, 20)
  const condition = clean(query.condition, 4)
  const status = clean(query.status, 10)
  const batch = clean(query.batch, 40)
  const sort = SORTS[clean(query.sort, 10)] ?? 'published_at'
  const ascending = clean(query.dir, 4) === 'asc'
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 100))
  const offset = Math.max(0, Number(query.offset) || 0)

  const apply = (builder: any) => {
    let b = builder
    if (q) b = b.or(`name.ilike.%${q}%,set_name.ilike.%${q}%,set_code.ilike.%${q}%,shopify_sku.ilike.%${q}%`)
    if (game) b = b.eq('game', game)
    if (set) b = b.eq('set_code', set)
    if (condition) b = b.eq('condition', condition)
    if (STATUSES.includes(status)) b = b.eq('stock_status', status)
    if (/^[0-9a-f-]{36}$/i.test(batch)) b = b.eq('batch_id', batch)
    return b
  }

  const [{ data: rows, count, error }, { data: prices }, { data: facetRows }, { data: batches }] = await Promise.all([
    apply(supabase.from('scan_stock_view').select('*', { count: 'exact' }))
      .order(sort, { ascending, nullsFirst: false })
      .order('position', { ascending: true })
      .range(offset, offset + limit - 1),
    apply(supabase.from('scan_stock_view').select('price_sek').limit(20000)),
    supabase.from('scan_stock_view').select('set_code, set_name').limit(20000),
    supabase.from('scan_batches').select('id, name').order('created_at', { ascending: false })
  ])

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const paths = (rows ?? []).map((r: any) => r.image_path).filter(Boolean)
  const urls = new Map<string, string>()

  if (paths.length) {
    const { data: signed } = await supabase.storage.from('scan-images').createSignedUrls(paths, 3600)
    for (const entry of signed ?? []) if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  const sets = new Map<string, string>()
  for (const row of (facetRows ?? []) as any[]) if (row.set_code) sets.set(row.set_code, row.set_name ?? row.set_code)

  const shopAdminBase = String(process.env.SHOPIFY_STORE_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.myshopify\.com$/i, '')

  return {
    items: (rows ?? []).map(({ image_path, ...row }: any) => ({
      ...row,
      image_url: (row.image_source === 'reference' && row.reference_image_url) || urls.get(image_path) || row.reference_image_url || null
    })),
    total: count ?? 0,
    totalValue: ((prices ?? []) as any[]).reduce((sum, r) => sum + (r.price_sek ?? 0), 0),
    batches: batches ?? [],
    sets: [...sets.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code)),
    shopAdminBase
  }
})
