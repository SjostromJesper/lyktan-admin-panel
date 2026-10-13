// TCG PowerTools import file (Listing & Appraisal -> Import a file). The format is
// copied from PowerTools' own example (docs/powertools-example.csv): same columns in
// the same order, comma separated, UTF-8 with BOM, LF line endings, and the product
// id right-aligned in a 10 character field exactly as in the example.

export const POWERTOOLS_COLUMNS = ['idProduct', 'quantity', 'name', 'set', 'condition', 'language', 'isFoil', 'price', 'comment', 'buyPrice'] as const

// Cardmarket's language names.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', sv: 'Swedish', de: 'German', fr: 'French', it: 'Italian', es: 'Spanish',
  pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', ru: 'Russian', zhs: 'S-Chinese', zht: 'T-Chinese'
}

// Condition codes already match Cardmarket's scale (MT/NM/EX/GD/LP/PL/PO).
export const cardmarketLanguage = (code: string) => LANGUAGE_NAMES[code] ?? 'English'

const csvField = (value: string | number | null | undefined) => {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export type PowertoolsRow = {
  idProduct: number
  quantity: number
  name: string
  set: string
  condition: string
  language: string
  isFoil: boolean
  price: number | null
}

export const buildPowertoolsCsv = (rows: PowertoolsRow[]) => {
  const lines = [POWERTOOLS_COLUMNS.join(',')]

  for (const row of rows) {
    lines.push([
      String(row.idProduct).padStart(10, ' '),
      row.quantity,
      csvField(row.name),
      csvField(row.set),
      row.condition,
      cardmarketLanguage(row.language),
      row.isFoil ? 'true' : '',
      row.price != null ? row.price : '',
      '',
      ''
    ].join(','))
  }

  return `﻿${lines.join('\n')}\n`
}

// Cardmarket's lowest allowed price.
export const CARDMARKET_MIN_EUR = 0.02

export const cardmarketPrice = (trend: number | null | undefined, condition: string, factors: Record<string, number>) => {
  if (trend == null || Number(trend) <= 0) return null
  return Math.max(CARDMARKET_MIN_EUR, Math.round(Number(trend) * (factors[condition] ?? 1) * 100) / 100)
}
