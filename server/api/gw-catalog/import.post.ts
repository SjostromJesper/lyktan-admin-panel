import ExcelJS from 'exceljs'

// Fixed column layout of the weekly Games Workshop trade catalog export.
// 1-indexed to match ExcelJS's row.values (index 0 is always empty there).
const COL = {
  releaseDate: 1,
  module: 2,
  system: 3,
  race: 4,
  ssCode: 5,
  productCode: 6,
  description: 8,
  barcode: 11,
  priceRetailKr: 18,
  priceDealerKr: 19
}

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'text' in (value as any)) return String((value as any).text ?? '').trim()
  return String(value).trim()
}

const cellNumber = (value: unknown): number | null => {
  const text = cellText(value).replace(',', '.')
  const num = Number(text)
  return text && Number.isFinite(num) ? num : null
}

// The sheet stores this as "DD/MM/YYYY", but ExcelJS may also hand back a
// real Date if the cell is formatted as a date — handle both.
const cellDate = (value: unknown): string | null => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const text = cellText(value)
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (!match) return null

  const [, day, month, year] = match
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'orders', 'edit')

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)

  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'Ingen fil bifogad' })
  }

  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(file.data as any)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Kunde inte läsa filen — är det en giltig Excel-fil?' })
  }

  const sheet = workbook.worksheets[0]

  if (!sheet) {
    throw createError({ statusCode: 400, statusMessage: 'Hittade inget kalkylblad i filen' })
  }

  const rows: Record<string, unknown>[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // header row

    const values = row.values as unknown[]
    const ssCode = cellText(values[COL.ssCode])
    const description = cellText(values[COL.description])

    if (!ssCode || !description) return // skip blank/malformed rows

    rows.push({
      ss_code: ssCode,
      product_code: cellText(values[COL.productCode]) || null,
      description,
      system: cellText(values[COL.system]) || null,
      race: cellText(values[COL.race]) || null,
      module: cellText(values[COL.module]) || null,
      release_date: cellDate(values[COL.releaseDate]),
      barcode: cellText(values[COL.barcode]) || null,
      price_retail_kr: cellNumber(values[COL.priceRetailKr]),
      price_dealer_kr: cellNumber(values[COL.priceDealerKr]),
      updated_at: new Date().toISOString()
    })
  })

  if (!rows.length) {
    throw createError({ statusCode: 400, statusMessage: 'Hittade inga produktrader i filen' })
  }

  // The sheet can list the same SS-kod more than once (reprints, regional
  // variants, etc.) — a single upsert statement can't apply ON CONFLICT to
  // the same key twice, so keep only the last occurrence of each.
  const dedupedRows = [...new Map(rows.map((row) => [row.ss_code as string, row])).values()]

  const supabase = useSupabaseAdmin()
  const BATCH_SIZE = 500
  let imported = 0

  for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
    const batch = dedupedRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('gw_catalog').upsert(batch, { onConflict: 'ss_code' })

    if (error) {
      throw createError({ statusCode: 500, statusMessage: `Fel vid rad ${i}: ${error.message}` })
    }

    imported += batch.length
  }

  return { imported, total: rows.length }
})
