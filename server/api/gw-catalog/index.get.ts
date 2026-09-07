export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'view')

  const query = getQuery(event)
  const search = String(query.q || '').trim()
  const system = String(query.system || '').trim()
  const race = String(query.race || '').trim()
  const after = query.after ? Number(query.after) : 0
  const pageSize = 30

  const supabase = useSupabaseAdmin()

  let builder = supabase
    .from('gw_catalog')
    .select('id, ss_code, product_code, description, system, race, release_date, price_retail_kr, price_dealer_kr', { count: 'exact' })
    .order('description', { ascending: true })
    .range(after, after + pageSize - 1)

  if (search) {
    const safe = search.replace(/[%_]/g, '')
    builder = builder.or(`description.ilike.%${safe}%,ss_code.ilike.%${safe}%,product_code.ilike.%${safe}%`)
  }

  if (system) {
    builder = builder.eq('system', system)
  }

  if (race) {
    builder = builder.eq('race', race)
  }

  const { data, error, count } = await builder

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const total = count ?? 0

  return {
    items: data ?? [],
    hasMore: after + pageSize < total,
    nextAfter: after + pageSize,
    total
  }
})
