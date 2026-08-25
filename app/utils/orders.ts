export const SUPPLIER_LABELS: Record<string, string> = {
  games_workshop: 'Games Workshop',
  asmodee: 'Asmodee'
}

export const PRODUCT_LINES: Record<string, { value: string; label: string }[]> = {
  games_workshop: [
    { value: 'warhammer_40k', label: 'Warhammer 40,000' },
    { value: 'age_of_sigmar', label: 'Age of Sigmar' },
    { value: 'middle_earth', label: 'Middle-earth' },
    { value: 'horus_heresy', label: 'Horus Heresy' },
    { value: 'kill_team', label: 'Kill Team' },
    { value: 'other', label: 'Annat' }
  ],
  asmodee: [
    { value: 'braedspel', label: 'Brädspel' },
    { value: 'kortspel', label: 'Kortspel' },
    { value: 'tillbehor', label: 'Tillbehör' }
  ]
}

export const productLineLabel = (supplier: string, value: string | null) => {
  if (!value) return ''
  return PRODUCT_LINES[supplier]?.find((l) => l.value === value)?.label || value
}

export const formatKr = (value: number | null) => (value === null || value === undefined ? '—' : `${value} kr`)

export type ParsedGwRow = {
  productLine: string
  productCode: string
  productName: string
  priceKr: number | null
}

/**
 * Games Workshop's trade-order export is one tab-separated row per SKU.
 * Column positions are fixed: 3=product line, 5=kortkod, 8=product name,
 * 18=the "vi köper in för" cost (not RRP, not the other price columns
 * around it).
 */
export const parseGamesWorkshopRow = (raw: string): ParsedGwRow | null => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0) || ''
  const cols = line.split('\t')

  if (cols.length < 18) return null

  const priceRaw = (cols[17] || '').trim().replace(/\s/g, '').replace(',', '.')
  const priceKr = priceRaw ? Number(priceRaw) : null

  return {
    productLine: (cols[2] || '').trim(),
    productCode: (cols[4] || '').trim(),
    productName: (cols[7] || '').trim(),
    priceKr: priceKr !== null && Number.isFinite(priceKr) ? priceKr : null
  }
}

export const ORDER_STATUSES: { value: string; label: string; badgeClass: string }[] = [
  { value: 'bokad', label: 'Bokad', badgeClass: 'bg-slate-100 text-slate-700' },
  { value: 'bestalld', label: 'Beställd', badgeClass: 'bg-amber-100 text-amber-800' },
  { value: 'slut_pa_lager', label: 'Slut på lager', badgeClass: 'bg-red-100 text-red-700' },
  { value: 'klar', label: 'Klar', badgeClass: 'bg-emerald-100 text-emerald-700' }
]

export const orderStatusLabel = (status: string) => ORDER_STATUSES.find((s) => s.value === status)?.label || status
export const orderStatusBadgeClass = (status: string) => ORDER_STATUSES.find((s) => s.value === status)?.badgeClass || 'bg-black/8 text-lyktan-mute'
