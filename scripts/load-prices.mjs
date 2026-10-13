#!/usr/bin/env node
// Hämtar Cardmarkets publika prisguide (JSON, uppdateras ca 01:00 svensk tid) och
// sparar priserna för de kort vi har i tcg_cards. Hämtar också dagens EUR->SEK-kurs
// (ECB via frankfurter.dev) om inställningen eur_sek_auto är på.
//
// Inga beroenden — bara Node 20+ och fetch, så det kan köras från en GitHub Action.
//
//   node --env-file=.env scripts/load-prices.mjs            # Magic
//   node --env-file=.env scripts/load-prices.mjs --game all # Magic + Pokémon (när Pokémon är laddat)
//   node --env-file=.env scripts/load-prices.mjs --no-fx    # hoppa över växelkursen
//
// Miljö: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const GAME = option('game') ?? 'mtg'
const SKIP_FX = args.includes('--no-fx')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY saknas')
  process.exit(1)
}

const UA = 'ButikLyktan-admin/1.0 (hej@butiklyktan.se)'
// Cardmarkets kategori-id i filnamnet: 1 = Magic, 6 = Pokémon.
const GUIDES = { mtg: 1, pokemon: 6 }

const rest = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers
    }
  })

  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Cardmarket-id -> spel, för alla kort vi känner till. Keyset-paginering på id.
const knownProducts = async (game) => {
  const ids = new Set()
  let last = '00000000-0000-0000-0000-000000000000'

  for (;;) {
    const rows = await rest(`tcg_cards?select=id,cardmarket_id&game=eq.${game}&cardmarket_id=not.is.null&id=gt.${last}&order=id&limit=1000`)
    if (!rows.length) break
    for (const row of rows) ids.add(row.cardmarket_id)
    last = rows.at(-1).id
  }

  return ids
}

const loadGuide = async (game) => {
  const known = await knownProducts(game)
  console.log(`${game}: ${known.size} kort med Cardmarket-id`)

  const url = `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${GUIDES[game]}.json`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Prisguiden ${game}: ${res.status}`)

  const guide = await res.json()
  const rows = []

  for (const p of guide.priceGuides ?? []) {
    if (!known.has(p.idProduct)) continue
    rows.push({
      cardmarket_id: p.idProduct,
      game,
      trend: p.trend ?? null,
      low: p.low ?? null,
      avg1: p.avg1 ?? null,
      avg7: p.avg7 ?? null,
      avg30: p.avg30 ?? null,
      trend_foil: p['trend-foil'] ?? null,
      low_foil: p['low-foil'] ?? null,
      avg30_foil: p['avg30-foil'] ?? null,
      updated_at: new Date().toISOString()
    })
  }

  console.log(`${game}: ${rows.length} priser i guiden (skapad ${guide.createdAt}), sparar…`)

  for (let i = 0; i < rows.length; i += 1000) {
    await rest('tcg_prices?on_conflict=cardmarket_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 1000))
    })
  }

  const unmatched = known.size - rows.length
  if (unmatched > 0) console.log(`${game}: ${unmatched} av våra kort saknas i prisguiden`)
}

const updateFx = async () => {
  const [settings] = await rest('scan_settings?select=eur_sek_auto&id=eq.1')

  if (!settings?.eur_sek_auto) {
    console.log('Växelkurs: manuell, hoppar över')
    return
  }

  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=SEK', { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Växelkurs: ${res.status}`)

  const rate = (await res.json()).rates?.SEK
  if (!(rate > 5 && rate < 20)) throw new Error(`Orimlig växelkurs: ${rate}`)

  await rest('scan_settings?id=eq.1', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ eur_sek: rate, eur_sek_updated_at: new Date().toISOString() })
  })
  console.log(`Växelkurs: 1 EUR = ${rate} SEK`)
}

const games = GAME === 'all' ? Object.keys(GUIDES) : [GAME]

for (const game of games) {
  if (!GUIDES[game]) {
    console.error(`Okänt spel: ${game}`)
    process.exit(1)
  }
  await loadGuide(game)
}

await rest('scan_settings?id=eq.1', {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ prices_updated_at: new Date().toISOString() })
})

if (!SKIP_FX) {
  await updateFx().catch((err) => console.error(`Växelkursen kunde inte uppdateras: ${err.message}`))
}

console.log('Klart')
