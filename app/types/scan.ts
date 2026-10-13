export type ScanCondition = 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO'
export type ScanStatus = 'pending' | 'matched' | 'needs_review' | 'confirmed' | 'skipped' | 'unidentified'

export const SCAN_CONDITIONS: ScanCondition[] = ['NM', 'EX', 'GD', 'LP', 'PL', 'PO']

export const SCAN_CONDITION_LABELS: Record<ScanCondition, string> = {
  NM: 'NM – nära nyskick',
  EX: 'EX – utmärkt',
  GD: 'GD – bra',
  LP: 'LP – lätt spelad',
  PL: 'PL – spelad',
  PO: 'PO – dålig'
}

export const SCAN_LANGUAGES: Record<string, string> = {
  en: 'Engelska',
  sv: 'Svenska',
  de: 'Tyska',
  fr: 'Franska',
  it: 'Italienska',
  es: 'Spanska',
  pt: 'Portugisiska',
  ja: 'Japanska',
  ko: 'Koreanska',
  ru: 'Ryska',
  zhs: 'Kinesiska (förenklad)',
  zht: 'Kinesiska (traditionell)'
}

export type RefCard = {
  id: string
  game: 'mtg' | 'pokemon'
  name: string
  set_code: string
  set_name: string
  collector_number: string
  rarity: string | null
  image_url: string | null
  finishes: string[]
}

export type ScanCandidate = {
  card_id: string
  name: string
  set_code: string
  set_name: string
  collector_number: string
  distance: number
  ocr_hits: number
  image_url?: string | null
  finishes?: string[]
  rarity?: string | null
}

export type ScanItem = {
  id: string
  position: number
  filename: string
  image_url: string | null
  game: 'mtg' | 'pokemon' | null
  status: ScanStatus
  match_distance: number | null
  match_candidates: ScanCandidate[] | null
  ocr_text: string | null
  matched_card: RefCard | null
  condition: ScanCondition
  language: string
  is_foil: boolean
  is_manual: boolean
  manual_name: string | null
  manual_set_name: string | null
  manual_set_code: string | null
  manual_collector_number: string | null
  manual_rarity: string | null
  price_trend_eur: number | null
  price_low_eur: number | null
  price_avg30_eur: number | null
  price_sek: number | null
  price_overridden: boolean
  price_flags: string[]
  sales_channel: 'shopify' | 'cardmarket' | 'both'
  image_source: 'scan' | 'reference'
  shopify_sku: string | null
  shopify_product_id: string | null
  publish_status: 'published' | 'failed' | null
  publish_error: string | null
  exported_to_powertools_at: string | null
  stock_status: 'listed' | 'sold' | 'shipped' | 'removed' | null
}

export const SALES_CHANNEL_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  cardmarket: 'Cardmarket',
  both: 'Båda'
}

export type ScanSettings = {
  eur_sek: number
  eur_sek_auto: boolean
  eur_sek_updated_at: string | null
  condition_factors: Record<ScanCondition, number>
  cardmarket_factors: Record<ScanCondition, number>
  rounding: 'ceil' | 'x9' | 'ceil5'
  min_price_sek: number
  flag_high_price_sek: number
  flag_trend_low_ratio: number
  purchase_percent: number
  prices_updated_at: string | null
}

export const PRICE_FLAG_LABELS: Record<string, string> = {
  no_price: 'Saknar pris',
  trend_vs_low: 'Trend långt över low',
  high_price: 'Högt pris'
}
