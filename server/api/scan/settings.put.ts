const CONDITIONS = ['NM', 'EX', 'GD', 'LP', 'PL', 'PO']

const number = (value: unknown, label: string, min: number, max: number) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw createError({ statusCode: 400, statusMessage: `${label} måste vara mellan ${min} och ${max}` })
  return n
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const body = (await readBody(event)) ?? {}
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('eur_sek' in body) patch.eur_sek = number(body.eur_sek, 'Växelkursen', 1, 50)
  if ('eur_sek_auto' in body) patch.eur_sek_auto = Boolean(body.eur_sek_auto)
  if ('rounding' in body) {
    if (!['ceil', 'x9', 'ceil5'].includes(body.rounding)) throw createError({ statusCode: 400, statusMessage: 'Ogiltig avrundning' })
    patch.rounding = body.rounding
  }
  if ('min_price_sek' in body) patch.min_price_sek = Math.round(number(body.min_price_sek, 'Minimipriset', 0, 10000))
  if ('flag_high_price_sek' in body) patch.flag_high_price_sek = Math.round(number(body.flag_high_price_sek, 'Gränsen för högt pris', 1, 1_000_000))
  if ('flag_trend_low_ratio' in body) patch.flag_trend_low_ratio = number(body.flag_trend_low_ratio, 'Kvoten trend/low', 1, 100)
  if ('purchase_percent' in body) patch.purchase_percent = number(body.purchase_percent, 'Inköpsprocenten', 0, 100)

  if ('condition_factors' in body) {
    const factors: Record<string, number> = {}
    for (const c of CONDITIONS) factors[c] = number(body.condition_factors?.[c], `Faktorn för ${c}`, 0, 2)
    patch.condition_factors = factors
  }

  if ('cardmarket_factors' in body) {
    const factors: Record<string, number> = {}
    for (const c of CONDITIONS) factors[c] = number(body.cardmarket_factors?.[c], `Cardmarket-faktorn för ${c}`, 0, 2)
    patch.cardmarket_factors = factors
  }

  const supabase = useSupabaseAdmin()
  const { error } = await supabase.from('scan_settings').update(patch).eq('id', 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { settings: await loadScanSettings(supabase) }
})
