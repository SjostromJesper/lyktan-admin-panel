// Identifies a batch's cards: nearest reference colour vectors in Postgres
// (match_card_vectors, L2 distance over the 576-value artwork descriptor) with
// the browser's OCR of the collector number / set code as tie-break between
// printings that share artwork.
//
// Calibrated on a real batch against 25 000 reference cards: the correct card
// sat at distance 7.7-11.1 with the next different card 7-16 further away.
// MATCH_MAX_DISTANCE is how close the best match must be, MATCH_MIN_GAP how much
// better than the runner-up (after the OCR bonus) it must score.

type Body = { ocr?: { position: number, text: string }[], game?: 'mtg' | 'pokemon' | null }

const CANDIDATES = 8
const SAVED_CANDIDATES = 5
const MATCH_MAX_DISTANCE = 13
const MATCH_MIN_GAP = 3.5
// Number decides between printings in the same set; set code alone does not.
const OCR_NUMBER_BONUS = 4
const OCR_SET_BONUS = 2
const CHUNK = 8

type Card = { id: string, game: string, name: string, set_code: string, set_name: string, collector_number: string, rarity: string | null, image_url: string | null, cardmarket_id: number | null }

const ocrBonus = (text: string | null, card: Card) => {
  if (!text) return { bonus: 0, hits: 0 }
  const upper = text.toUpperCase()
  let bonus = 0
  let hits = 0

  // Set codes often run into neighbouring text ("MH3EN"), so substring, not token.
  if (card.set_code.length >= 3 && upper.includes(card.set_code.toUpperCase())) {
    bonus += OCR_SET_BONUS
    hits += 1
  }

  const digits = card.collector_number.match(/^\d+/)?.[0]
  if (digits) {
    const n = String(Number(digits))
    if (new RegExp(`(?<!\\d)0*${n}(?!\\d)`).test(upper)) {
      bonus += OCR_NUMBER_BONUS
      hits += 1
    }
  }

  return { bonus, hits }
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = (await readBody<Body>(event).catch(() => null)) ?? {}
  const supabase = useSupabaseAdmin()

  // Store fresh OCR text first so a re-run without OCR reuses it.
  for (const entry of body.ocr ?? []) {
    await supabase
      .from('scan_items')
      .update({ ocr_text: String(entry.text ?? '').slice(0, 300) })
      .eq('batch_id', id)
      .eq('position', entry.position)
  }

  const { data: items, error } = await supabase
    .from('scan_items')
    .select('id, position, art_vec, ocr_text, status')
    .eq('batch_id', id)
    .in('status', ['pending', 'matched', 'needs_review', 'unidentified'])
    .order('position', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const hashed = (items ?? []).filter((i) => i.art_vec != null)

  if (!hashed.length) {
    throw createError({ statusCode: 400, statusMessage: 'Inga kort med bilddeskriptor att matcha' })
  }

  await supabase.from('scan_batches').update({ status: 'identifying' }).eq('id', id)

  // The vectors come back from PostgREST as text; run the lookups in small chunks
  // so each statement stays well inside the request timeout. The first lookup after
  // the database has been idle can be slow (cold cache), so each chunk gets a retry,
  // and a failure puts the batch back instead of leaving it stuck on "identifying".
  const allHits: { idx: number, card_id: string, distance: number }[] = []

  try {
    for (let start = 0; start < hashed.length; start += CHUNK) {
      const slice = hashed.slice(start, start + CHUNK)
      let data: any[] | null = null
      let lastError = ''

      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        const res = await supabase.rpc('match_card_vectors', {
          vecs: slice.map((i) => String(i.art_vec)),
          p_game: body.game ?? null,
          k: CANDIDATES
        })

        if (res.error) lastError = res.error.message
        else data = (res.data ?? []) as any[]
      }

      if (!data) throw createError({ statusCode: 500, statusMessage: `Matchningen misslyckades: ${lastError}` })

      for (const row of data) allHits.push({ ...row, idx: row.idx + start })
    }
  } catch (err) {
    await supabase.from('scan_batches').update({ status: 'uploaded' }).eq('id', id)
    throw err
  }

  const hits = allHits
  const hitRows = (hits ?? []) as any[]
  const cardIds = [...new Set(hitRows.map((h) => h.card_id))]
  const cards = new Map<string, Card>()

  for (let i = 0; i < cardIds.length; i += 200) {
    const { data } = await supabase
      .from('tcg_cards')
      .select('id, game, name, set_code, set_name, collector_number, rarity, image_url, cardmarket_id')
      .in('id', cardIds.slice(i, i + 200))
    for (const card of (data ?? []) as Card[]) cards.set(card.id, card)
  }

  const summary = { matched: 0, needs_review: 0, unidentified: 0 }

  for (const [index, item] of hashed.entries()) {
    const ranked = hitRows
      .filter((h) => h.idx === index + 1)
      .map((h) => {
        const card = cards.get(h.card_id)!
        const ocr = card ? ocrBonus(item.ocr_text, card) : { bonus: 0, hits: 0 }
        return { card, distance: h.distance as number, ocr_hits: ocr.hits, score: (h.distance as number) - ocr.bonus }
      })
      .filter((c) => c.card)
      .sort((a, b) => a.score - b.score || a.distance - b.distance)

    const best = ranked[0]
    const runnerUp = ranked[1]
    const gap = best ? (runnerUp ? runnerUp.score - best.score : Infinity) : 0
    const confident = Boolean(best && best.distance <= MATCH_MAX_DISTANCE && gap >= MATCH_MIN_GAP)
    const status = !best ? 'unidentified' : confident ? 'matched' : 'needs_review'

    summary[status] += 1

    await supabase
      .from('scan_items')
      .update({
        status,
        game: best?.card.game ?? null,
        matched_card_id: confident ? best!.card.id : null,
        match_distance: best ? Math.round(best.distance) : null,
        match_candidates: ranked.slice(0, SAVED_CANDIDATES).map((c) => ({
          card_id: c.card.id,
          name: c.card.name,
          set_code: c.card.set_code,
          set_name: c.card.set_name,
          collector_number: c.card.collector_number,
          distance: Math.round(c.distance * 100) / 100,
          ocr_hits: c.ocr_hits
        }))
      })
      .eq('id', item.id)
  }

  await supabase.from('scan_batches').update({ status: 'review' }).eq('id', id)

  return { total: hashed.length, ...summary }
})
