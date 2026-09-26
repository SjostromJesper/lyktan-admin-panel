const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'analytics', 'view')

  const query = getQuery(event)
  const rangeDays = RANGE_DAYS[String(query.range || '30d')] ?? 30

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - rangeDays)

  const supabase = useSupabaseAdmin()

  // Supabase's PostgREST API caps any single response at 1000 rows
  // (db-max-rows) regardless of .range() — with 90-day traffic well past
  // that, a single fetch silently truncated to an arbitrary (unordered)
  // 1000-row slice, which is why switching the date range used to show
  // near-identical numbers. Page through in batches of 1000, ordered so
  // pagination is stable, until a batch comes back short.
  const PAGE_SIZE = 1000
  type Row = { path: string, referrer: string | null, visitor_hash: string, device_type: string, created_at: string }
  const rows: Row[] = []

  for (let page = 0; page < 100; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('analytics_pageviews')
      .select('path, referrer, visitor_hash, device_type, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    const batch = (data ?? []) as Row[]
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break
  }

  const totalPageviews = rows.length
  const uniqueVisitors = new Set(rows.map((row) => row.visitor_hash)).size

  const dailyMap = new Map<string, { pageviews: number, visitors: Set<string> }>()

  for (const row of rows) {
    const date = row.created_at.slice(0, 10)

    if (!dailyMap.has(date)) {
      dailyMap.set(date, { pageviews: 0, visitors: new Set() })
    }

    const entry = dailyMap.get(date)!
    entry.pageviews += 1
    entry.visitors.add(row.visitor_hash)
  }

  const dailySeries = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({ date, pageviews: entry.pageviews, visitors: entry.visitors.size }))

  const countBy = (values: string[], limit: number) => {
    const counts = new Map<string, number>()

    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }))
  }

  const topPages = countBy(rows.map((row) => row.path), 10)
  const topReferrers = countBy(rows.map((row) => row.referrer || 'Direkt'), 10)

  const deviceCounts = { mobile: 0, tablet: 0, desktop: 0 } as Record<string, number>

  for (const row of rows) {
    deviceCounts[row.device_type] = (deviceCounts[row.device_type] ?? 0) + 1
  }

  return {
    rangeDays,
    totalPageviews,
    uniqueVisitors,
    dailySeries,
    topPages,
    topReferrers,
    deviceCounts
  }
})
