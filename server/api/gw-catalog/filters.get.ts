export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'view')

  const query = getQuery(event)
  const system = String(query.system || '').trim()

  const supabase = useSupabaseAdmin()

  const { data: systemRows, error: systemError } = await supabase
    .from('gw_catalog')
    .select('system')
    .not('system', 'is', null)

  if (systemError) {
    throw createError({ statusCode: 500, statusMessage: systemError.message })
  }

  let raceQuery = supabase.from('gw_catalog').select('race').not('race', 'is', null)

  if (system) {
    raceQuery = raceQuery.eq('system', system)
  }

  const { data: raceRows, error: raceError } = await raceQuery

  if (raceError) {
    throw createError({ statusCode: 500, statusMessage: raceError.message })
  }

  const systems = [...new Set((systemRows ?? []).map((row: any) => row.system as string))].sort((a, b) => a.localeCompare(b, 'sv-SE'))
  const races = [...new Set((raceRows ?? []).map((row: any) => row.race as string))].sort((a, b) => a.localeCompare(b, 'sv-SE'))

  return { systems, races }
})
