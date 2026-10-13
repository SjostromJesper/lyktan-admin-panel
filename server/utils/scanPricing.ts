// Price calculation for scanned singles: Cardmarket trend (foil trend for foil)
// x condition factor x EUR->SEK, rounded and floored per the settings row.

export type ScanSettings = {
  eur_sek: number
  eur_sek_auto: boolean
  eur_sek_updated_at: string | null
  condition_factors: Record<string, number>
  cardmarket_factors: Record<string, number>
  rounding: 'ceil' | 'x9' | 'ceil5'
  min_price_sek: number
  flag_high_price_sek: number
  flag_trend_low_ratio: number
  purchase_percent: number
  prices_updated_at: string | null
}

export const SETTINGS_COLUMNS =
  'eur_sek, eur_sek_auto, eur_sek_updated_at, condition_factors, cardmarket_factors, rounding, min_price_sek, flag_high_price_sek, flag_trend_low_ratio, purchase_percent, prices_updated_at'

export type CardmarketPrice = { trend: number | null, low: number | null, avg30: number | null, trend_foil: number | null, low_foil: number | null, avg30_foil: number | null }

export const loadScanSettings = async (supabase: ReturnType<typeof useSupabaseAdmin>): Promise<ScanSettings> => {
  const { data, error } = await supabase.from('scan_settings').select(SETTINGS_COLUMNS).eq('id', 1).maybeSingle()

  if (error || !data) {
    throw createError({ statusCode: 500, statusMessage: error?.message ?? 'Prisinställningar saknas (kör migration 0039)' })
  }

  return {
    ...(data as any),
    eur_sek: Number(data.eur_sek),
    flag_trend_low_ratio: Number(data.flag_trend_low_ratio),
    purchase_percent: Number(data.purchase_percent)
  }
}

export const roundPrice = (value: number, settings: Pick<ScanSettings, 'rounding' | 'min_price_sek'>) => {
  const whole = Math.ceil(value - 1e-9)
  let rounded = whole

  if (settings.rounding === 'ceil5') rounded = Math.ceil(whole / 5) * 5
  // Ends in 9 (e.g. 19, 49, 129); below 10 kr, whole kronor are fine.
  if (settings.rounding === 'x9' && whole >= 10) rounded = Math.ceil((whole + 1) / 10) * 10 - 1

  return Math.max(settings.min_price_sek, rounded)
}

export const computePrice = (
  price: CardmarketPrice | null,
  item: { condition: string, is_foil: boolean },
  settings: ScanSettings
) => {
  const trend = item.is_foil ? price?.trend_foil : price?.trend
  const low = item.is_foil ? price?.low_foil : price?.low
  const avg30 = item.is_foil ? price?.avg30_foil : price?.avg30
  const flags: string[] = []

  const result = {
    price_trend_eur: trend ?? null,
    price_low_eur: low ?? null,
    price_avg30_eur: avg30 ?? null,
    price_sek: null as number | null,
    price_flags: flags
  }

  if (trend == null || Number(trend) <= 0) {
    flags.push('no_price')
    return result
  }

  const factor = settings.condition_factors?.[item.condition] ?? 1
  result.price_sek = roundPrice(Number(trend) * factor * settings.eur_sek, settings)

  // Trend far above the cheapest listing usually means a thin or manipulated market.
  if (Number(trend) >= 1 && (low == null || Number(low) <= 0 || Number(trend) > Number(low) * settings.flag_trend_low_ratio)) flags.push('trend_vs_low')
  if (result.price_sek > settings.flag_high_price_sek) flags.push('high_price')

  return result
}
