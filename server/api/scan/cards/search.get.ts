// Reference-card search for the review view: either "SET NUMBER" quick entry
// (e.g. "MH3 123", "SVI 045") or a free-text name search.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const query = getQuery(event)
  const q = String(query.q ?? '').trim().slice(0, 80)
  const game = ['mtg', 'pokemon'].includes(String(query.game)) ? String(query.game) : null

  if (q.length < 2) {
    return { cards: [] }
  }

  const supabase = useSupabaseAdmin()
  const base = () => {
    let request = supabase.from('tcg_cards').select(CARD_FIELDS)
    if (game) request = request.eq('game', game)
    return request
  }

  const quick = q.match(/^([a-z0-9]{2,5})\s+0*(\d+[a-z★]?)$/i)

  if (quick) {
    const [, setCode, number] = quick
    const { data, error } = await base()
      .eq('set_code', setCode!.toUpperCase())
      .in('collector_number', [number!, number!.padStart(3, '0')])
      .limit(12)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    if (data?.length) {
      return { cards: data }
    }
  }

  // Name search; "name set" is also tried as a convenience ("island tmt").
  const safe = q.replace(/[%,()*]/g, ' ').trim()
  const { data, error } = await base()
    .ilike('name', `%${safe}%`)
    .order('released_at', { ascending: false, nullsFirst: false })
    .limit(15)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { cards: data ?? [] }
})
