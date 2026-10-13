export const SCAN_ITEM_SELECT =
  'id, position, filename, image_path, game, status, match_distance, match_candidates, ocr_text, condition, language, is_foil, is_manual, manual_name, manual_set_name, manual_set_code, manual_collector_number, manual_rarity, price_trend_eur, price_low_eur, price_avg30_eur, price_sek, price_overridden, price_flags, sales_channel, image_source, shopify_sku, shopify_product_id, publish_status, publish_error, exported_to_powertools_at, stock_status, matched_card:tcg_cards!scan_items_matched_card_id_fkey(id, game, name, set_code, set_name, collector_number, rarity, image_url, finishes)'

export const CARD_FIELDS = 'id, game, name, set_code, set_name, collector_number, rarity, image_url, finishes'

export const SCAN_CONDITIONS = ['NM', 'EX', 'GD', 'LP', 'PL', 'PO']
export const SCAN_STATUSES = ['pending', 'matched', 'needs_review', 'confirmed', 'skipped', 'unidentified']
export const SCAN_GAMES = ['mtg', 'pokemon']
export const SALES_CHANNELS = ['shopify', 'cardmarket', 'both']
export const IMAGE_SOURCES = ['scan', 'reference']

const cleanText = (value: unknown, max = 120) => {
  const text = String(value ?? '').trim().slice(0, max)
  return text || null
}

// Whitelists and validates an incoming item patch (single or bulk). Returns only
// the columns that may be written; throws 400 on an invalid value.
export const parseItemPatch = (body: any): Record<string, unknown> => {
  const patch: Record<string, unknown> = {}

  if ('condition' in body) {
    if (!SCAN_CONDITIONS.includes(body.condition)) throw createError({ statusCode: 400, statusMessage: 'Ogiltigt skick' })
    patch.condition = body.condition
  }

  if ('language' in body) {
    const language = String(body.language ?? '')
    if (!/^[a-z]{2,3}$/.test(language)) throw createError({ statusCode: 400, statusMessage: 'Ogiltigt språk' })
    patch.language = language
  }

  if ('sales_channel' in body) {
    if (!SALES_CHANNELS.includes(body.sales_channel)) throw createError({ statusCode: 400, statusMessage: 'Ogiltig kanal' })
    patch.sales_channel = body.sales_channel
  }

  if ('image_source' in body) {
    if (!IMAGE_SOURCES.includes(body.image_source)) throw createError({ statusCode: 400, statusMessage: 'Ogiltig bildkälla' })
    patch.image_source = body.image_source
  }

  if ('is_foil' in body) patch.is_foil = Boolean(body.is_foil)

  if ('status' in body) {
    if (!SCAN_STATUSES.includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Ogiltig status' })
    patch.status = body.status
  }

  if ('game' in body) {
    if (body.game !== null && !SCAN_GAMES.includes(body.game)) throw createError({ statusCode: 400, statusMessage: 'Ogiltigt spel' })
    patch.game = body.game
  }

  if ('matched_card_id' in body) {
    const id = body.matched_card_id
    if (id !== null && !/^[0-9a-f-]{36}$/i.test(String(id))) throw createError({ statusCode: 400, statusMessage: 'Ogiltigt kort' })
    patch.matched_card_id = id
  }

  // Manual price in whole SEK; null clears the override (recalculated by "Hämta priser").
  if ('price_sek' in body) {
    if (body.price_sek === null) {
      patch.price_overridden = false
    } else {
      const price = Number(body.price_sek)
      if (!Number.isInteger(price) || price < 0 || price > 1_000_000) throw createError({ statusCode: 400, statusMessage: 'Ogiltigt pris' })
      patch.price_sek = price
      patch.price_overridden = true
    }
  }

  if ('is_manual' in body) patch.is_manual = Boolean(body.is_manual)

  for (const field of ['manual_name', 'manual_set_name', 'manual_set_code', 'manual_collector_number', 'manual_rarity']) {
    if (field in body) patch[field] = cleanText(body[field])
  }

  return patch
}

// Signed read URLs for the scans, plus reference-card details (image, finishes,
// rarity) for each stored candidate so the review UI can show them side by side.
export const hydrateItems = async (supabase: ReturnType<typeof useSupabaseAdmin>, rows: any[]) => {
  const paths = rows.map((r) => r.image_path).filter(Boolean)
  const urls = new Map<string, string>()

  if (paths.length) {
    const { data: signed } = await supabase.storage.from('scan-images').createSignedUrls(paths, 3600)
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
    }
  }

  const candidateIds = [...new Set(rows.flatMap((r) => ((r.match_candidates ?? []) as any[]).map((c) => c.card_id)))]
  const details = new Map<string, any>()

  for (let i = 0; i < candidateIds.length; i += 100) {
    const { data } = await supabase.from('tcg_cards').select(CARD_FIELDS).in('id', candidateIds.slice(i, i + 100))
    for (const card of data ?? []) details.set(card.id, card)
  }

  return rows.map(({ image_path, ...row }) => ({
    ...row,
    image_url: urls.get(image_path) ?? null,
    match_candidates: row.match_candidates
      ? (row.match_candidates as any[]).map((c) => ({
          ...c,
          image_url: details.get(c.card_id)?.image_url ?? null,
          finishes: details.get(c.card_id)?.finishes ?? [],
          rarity: details.get(c.card_id)?.rarity ?? null
        }))
      : null
  }))
}
