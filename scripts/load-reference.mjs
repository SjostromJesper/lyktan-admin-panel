#!/usr/bin/env node
// Laddar referensdata (kort + bildhash) för TCG-identifiering i Supabase.
//
// Körs lokalt, inkrementellt: bara set som saknas eller vars kortantal ändrats
// sedan senaste körning hämtas. Följer Scryfalls riktlinjer: User-Agent och
// Accept-header, minst 100 ms mellan API-anrop, vänta vid 429.
//
//   node --env-file=.env scripts/load-reference.mjs                 # allt nytt
//   node --env-file=.env scripts/load-reference.mjs --game mtg --set mh3 --set ltr
//   node --env-file=.env scripts/load-reference.mjs --dry-run       # visa bara vilka set som skulle hämtas
//   node --env-file=.env scripts/load-reference.mjs --force         # hämta om även oförändrade set
//   node --env-file=.env scripts/load-reference.mjs --backfill-vectors   # räkna ut färgvektor för redan laddade kort som saknar den
//
// Flaggor: --game mtg|pokemon|all  --set CODE (flera)  --max-sets N  --concurrency N  --dry-run  --force  --backfill-vectors
// Miljö:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POKEMONTCG_API_KEY (valfri, ger högre gräns)

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const multi = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []))

const GAME = option('game') ?? 'all'
const ONLY_SETS = multi('set').map((s) => s.toLowerCase())
const MAX_SETS = Number(option('max-sets') ?? Infinity)
const CONCURRENCY = Number(option('concurrency') ?? 6)
const DRY_RUN = flag('dry-run')
const FORCE = flag('force')
const BACKFILL = flag('backfill-vectors')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POKEMONTCG_API_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas (kör med --env-file=.env)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const UA = 'ButikLyktan-admin/1.0 (hej@butiklyktan.se)'

// --- Hash: samma algoritm som app/utils/dhash.ts (36x32 -> 9x8 gråskala -> 64 bitar) ---
const dhashFromBuffer = async (buffer) => {
  const raw = await sharp(buffer).removeAlpha().resize(36, 32, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer()
  const grey = new Float64Array(72)

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      let sum = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const i = ((y * 4 + dy) * 36 + (x * 4 + dx)) * 3
          sum += 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2]
        }
      }
      grey[y * 9 + x] = sum / 16
    }
  }

  let hash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (grey[y * 9 + x] > grey[y * 9 + x + 1] ? 1n : 0n)
    }
  }

  return BigInt.asIntN(64, hash).toString()
}

// --- Färgvektor: samma algoritm som app/utils/artvec.ts (inset 2,5 %, illustrationsytan
// x 5-95 % / y 10-58 %, ner till 64x48, boxmedelvärde till 16x12 RGB, z-normaliserad per bild) ---
const artVectorFromBuffer = async (buffer) => {
  const meta = await sharp(buffer).metadata()
  const ix = Math.round(meta.width * 0.025)
  const iy = Math.round(meta.height * 0.025)
  const w = meta.width - 2 * ix
  const h = meta.height - 2 * iy
  const raw = await sharp(buffer)
    .removeAlpha()
    .extract({ left: ix + Math.round(w * 0.05), top: iy + Math.round(h * 0.1), width: Math.round(w * 0.9), height: Math.round(h * 0.48) })
    .resize(64, 48, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer()

  const values = new Float64Array(16 * 12 * 3)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 16; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) sum += raw[((y * 4 + dy) * 64 + (x * 4 + dx)) * 3 + c]
        values[(y * 16 + x) * 3 + c] = sum / 16
      }
    }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
  return `[${Array.from(values, (v) => ((v - mean) / std).toFixed(3)).join(',')}]`
}

const downloadBuffer = async (url) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if (res.status === 429) await sleep(5000 * (attempt + 1))
    else if (res.status >= 500) await sleep(1000 * (attempt + 1))
    else throw new Error(`${res.status} ${url}`)
  }
  throw new Error(`Gav upp: ${url}`)
}

const runPool = async (items, worker) => {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await worker(queue.shift())
    })
  )
}

// --- Generic JSON fetch with pacing + 429 handling ---
const apiFetch = async (url, { headers = {}, delayMs }) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(delayMs)
    const res = await fetch(url, { headers })
    if (res.status === 404) return null
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 30) * 1000
      console.warn(`  429, väntar ${wait / 1000}s…`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return res.json()
  }
  throw new Error(`Gav upp: ${url}`)
}

// --- Persist ---
const existingHashed = async (game, setCode) => {
  const { data, error } = await supabase.from('tcg_cards').select('source_id').eq('game', game).eq('set_code', setCode).not('art_vec', 'is', null)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.source_id))
}

const hashAndStore = async (game, setMeta, cards) => {
  const done = await existingHashed(game, setMeta.code)
  const todo = cards.filter((c) => !done.has(c.source_id))
  const rows = []
  let failed = 0

  await runPool(todo, async (card) => {
    try {
      const buffer = await downloadBuffer(card.image_url)
      rows.push({ ...card, dhash: await dhashFromBuffer(buffer), art_vec: await artVectorFromBuffer(buffer) })
    } catch (err) {
      failed += 1
      console.warn(`  Hoppar över ${card.name} (${card.set_code} ${card.collector_number}): ${err.message}`)
    }
  })

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('tcg_cards').upsert(rows.slice(i, i + 200), { onConflict: 'game,source_id' })
    if (error) throw error
  }

  return { stored: rows.length, skipped: cards.length - todo.length, failed }
}

const saveSet = async (game, setMeta) => {
  const { error } = await supabase.from('tcg_sets').upsert(
    {
      game,
      code: setMeta.code,
      name: setMeta.name,
      released_at: setMeta.released_at,
      source_card_count: setMeta.source_card_count,
      loaded_card_count: setMeta.loaded,
      synced_at: new Date().toISOString()
    },
    { onConflict: 'game,code' }
  )
  if (error) throw error
}

const knownSets = async (game) => {
  const { data, error } = await supabase.from('tcg_sets').select('code, source_card_count').eq('game', game)
  if (error) throw error
  return new Map((data ?? []).map((s) => [s.code, s.source_card_count]))
}

const needsSync = (known, setMeta) => FORCE || ONLY_SETS.length > 0 || known.get(setMeta.code) !== setMeta.source_card_count

// --- Magic: Scryfall ---
const SCRYFALL_HEADERS = { 'User-Agent': UA, Accept: 'application/json;q=0.9,*/*;q=0.8' }
const SCRYFALL_DELAY = 110
const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard'])
const SKIP_SET_TYPES = new Set(['token', 'memorabilia'])

const loadMtg = async () => {
  console.log('\n== Magic (Scryfall) ==')
  const sets = await apiFetch('https://api.scryfall.com/sets', { headers: SCRYFALL_HEADERS, delayMs: 0 })
  const known = await knownSets('mtg')

  let candidates = sets.data
    .filter((s) => !s.digital && !SKIP_SET_TYPES.has(s.set_type) && s.card_count > 0)
    .map((s) => ({ code: s.code.toUpperCase(), name: s.name, released_at: s.released_at ?? null, source_card_count: s.card_count }))
    .filter((s) => (ONLY_SETS.length ? ONLY_SETS.includes(s.code.toLowerCase()) : true))
    .filter((s) => needsSync(known, s))
    .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))
    .slice(0, MAX_SETS)

  console.log(`${candidates.length} set att hämta`)
  if (DRY_RUN) return candidates.forEach((s) => console.log(`  ${s.code}  ${s.name} (${s.source_card_count} kort)`))

  for (const setMeta of candidates) {
    console.log(`\n${setMeta.code} – ${setMeta.name} (${setMeta.source_card_count} kort)`)
    const cards = []
    let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${setMeta.code.toLowerCase()} lang:en`)}&unique=prints&order=set&include_extras=true&include_variations=true`

    while (url) {
      const page = await apiFetch(url, { headers: SCRYFALL_HEADERS, delayMs: SCRYFALL_DELAY })
      if (!page) break

      for (const c of page.data) {
        const face = c.image_uris ?? c.card_faces?.[0]?.image_uris
        if (SKIP_LAYOUTS.has(c.layout) || c.digital || c.image_status === 'missing' || !face?.small) continue

        cards.push({
          game: 'mtg',
          source_id: c.id,
          name: c.name,
          set_code: c.set.toUpperCase(),
          set_name: c.set_name,
          collector_number: c.collector_number,
          rarity: c.rarity ?? null,
          lang: c.lang ?? 'en',
          image_url: face.small,
          finishes: c.finishes ?? [],
          cardmarket_id: c.cardmarket_id ?? null,
          released_at: c.released_at ?? null
        })
      }

      url = page.has_more ? page.next_page : null
    }

    const result = await hashAndStore('mtg', setMeta, cards)
    await saveSet('mtg', { ...setMeta, loaded: cards.length })
    console.log(`  ${cards.length} kort: ${result.stored} nya, ${result.skipped} fanns redan, ${result.failed} misslyckades`)
  }
}

// --- Pokémon: pokemontcg.io ---
const loadPokemon = async () => {
  console.log('\n== Pokémon (pokemontcg.io) ==')
  const headers = POKEMONTCG_API_KEY ? { 'X-Api-Key': POKEMONTCG_API_KEY } : {}
  const delayMs = POKEMONTCG_API_KEY ? 120 : 2500
  const sets = await apiFetch('https://api.pokemontcg.io/v2/sets?pageSize=250', { headers, delayMs: 0 })
  const known = await knownSets('pokemon')

  const candidates = sets.data
    .map((s) => ({
      apiId: s.id,
      // Koden som står tryckt på korten (t.ex. SVI) — används av OCR:en.
      code: (s.ptcgoCode || s.id).toUpperCase(),
      name: s.name,
      released_at: s.releaseDate ? s.releaseDate.replaceAll('/', '-') : null,
      source_card_count: s.total
    }))
    .filter((s) => (ONLY_SETS.length ? ONLY_SETS.includes(s.code.toLowerCase()) || ONLY_SETS.includes(s.apiId.toLowerCase()) : true))
    .filter((s) => needsSync(known, s))
    .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))
    .slice(0, MAX_SETS)

  console.log(`${candidates.length} set att hämta${POKEMONTCG_API_KEY ? '' : ' (utan API-nyckel: långsammare, sätt POKEMONTCG_API_KEY)'}`)
  if (DRY_RUN) return candidates.forEach((s) => console.log(`  ${s.code}  ${s.name} (${s.source_card_count} kort)`))

  for (const setMeta of candidates) {
    console.log(`\n${setMeta.code} – ${setMeta.name} (${setMeta.source_card_count} kort)`)
    const cards = []

    for (let page = 1; ; page++) {
      const res = await apiFetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`set.id:${setMeta.apiId}`)}&pageSize=250&page=${page}`, { headers, delayMs })
      if (!res?.data?.length) break

      for (const c of res.data) {
        if (!c.images?.small) continue
        cards.push({
          game: 'pokemon',
          source_id: c.id,
          name: c.name,
          set_code: setMeta.code,
          set_name: setMeta.name,
          collector_number: c.number,
          rarity: c.rarity ?? null,
          lang: 'en',
          image_url: c.images.small,
          finishes: [],
          cardmarket_id: null,
          released_at: setMeta.released_at
        })
      }

      if (res.data.length < 250) break
    }

    const result = await hashAndStore('pokemon', setMeta, cards)
    await saveSet('pokemon', { ...setMeta, loaded: cards.length })
    console.log(`  ${cards.length} kort: ${result.stored} nya, ${result.skipped} fanns redan, ${result.failed} misslyckades`)
  }
}

// --- Backfill: färgvektor för kort som redan är laddade men saknar den ---
const backfillVectors = async () => {
  console.log('\n== Backfill av färgvektorer ==')
  let lastId = '00000000-0000-0000-0000-000000000000'
  let done = 0
  let failed = 0
  const started = Date.now()

  for (;;) {
    const { data, error } = await supabase
      .from('tcg_cards')
      .select('id, image_url')
      .is('art_vec', null)
      .not('image_url', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(500)
    if (error) throw error
    if (!data?.length) break
    lastId = data[data.length - 1].id

    const updates = []
    await runPool(data, async (card) => {
      try {
        updates.push({ id: card.id, v: await artVectorFromBuffer(await downloadBuffer(card.image_url)) })
      } catch (err) {
        failed += 1
        console.warn(`  Hoppar över ${card.id}: ${err.message}`)
      }
    })

    for (let i = 0; i < updates.length; i += 100) {
      const { error: rpcError } = await supabase.rpc('set_card_vectors', { p: updates.slice(i, i + 100) })
      if (rpcError) throw rpcError
    }

    done += updates.length
    console.log(`  ${done} klara (${failed} misslyckade), ${Math.round((Date.now() - started) / 1000)}s`)
  }
}

if (BACKFILL) {
  await backfillVectors()
  console.log('\nKlart.')
  process.exit(0)
}

if (GAME === 'all' || GAME === 'mtg') await loadMtg()
if (GAME === 'all' || GAME === 'pokemon') await loadPokemon()
console.log('\nKlart.')
