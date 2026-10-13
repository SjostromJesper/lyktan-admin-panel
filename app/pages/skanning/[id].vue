<script setup lang="ts">
import { SCAN_CONDITIONS, SCAN_CONDITION_LABELS, SCAN_LANGUAGES } from '~/types/scan'
import type { RefCard, ScanCandidate, ScanItem, ScanStatus } from '~/types/scan'

type Batch = { id: string, name: string, note: string | null, status: string, created_by: string | null, created_at: string }

const route = useRoute()
const { run: runPowertools } = usePowertoolsExport()
const { canEditScan } = usePermissions()

const batch = ref<Batch | null>(null)
const items = ref<ScanItem[]>([])
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')

const STATUS_LABELS: Record<ScanStatus, string> = {
  pending: 'Ej identifierad',
  matched: 'Träff',
  needs_review: 'Behöver granskas',
  confirmed: 'Bekräftad',
  skipped: 'Överhoppad',
  unidentified: 'Hittades inte'
}

const STATUS_ORDER: ScanStatus[] = ['needs_review', 'pending', 'matched', 'confirmed', 'skipped', 'unidentified']

const DONE: ScanStatus[] = ['confirmed', 'skipped', 'unidentified']
const isDone = (item: ScanItem) => DONE.includes(item.status)

// --- Load + ordering ---
const reviewFirst = ref(true)
const orderIds = ref<string[]>([])
const focusedId = ref<string | null>(null)
const selected = ref<Set<string>>(new Set())

const itemsById = computed(() => new Map(items.value.map((i) => [i.id, i])))
const orderedItems = computed(() => orderIds.value.map((id) => itemsById.value.get(id)).filter((i): i is ScanItem => Boolean(i)))
const focused = computed(() => (focusedId.value ? itemsById.value.get(focusedId.value) ?? null : null))

// Sorted once on load/toggle, not on every edit, so tiles don't jump around
// while you work through them.
const applyOrder = () => {
  const rank: Record<string, number> = { needs_review: 0, pending: 1, unidentified: 2, matched: 3, confirmed: 4, skipped: 5 }
  orderIds.value = [...items.value]
    .sort((a, b) => (reviewFirst.value ? (rank[a.status] ?? 9) - (rank[b.status] ?? 9) : 0) || a.position - b.position)
    .map((i) => i.id)
}

const load = async () => {
  try {
    const res = await $fetch<{ batch: Batch, items: ScanItem[] }>(`/api/scan/batches/${route.params.id}`)
    batch.value = res.batch
    items.value = res.items
    applyOrder()
    if (!focusedId.value || !itemsById.value.has(focusedId.value)) focusedId.value = orderIds.value[0] ?? null
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta bunten'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(reviewFirst, applyOrder)

const counts = computed(() => {
  const c: Record<string, number> = {}
  for (const item of items.value) c[item.status] = (c[item.status] ?? 0) + 1
  return c
})

const openCount = computed(() => items.value.filter((i) => !isDone(i)).length)
const readyToConfirm = computed(() => items.value.length > 0 && openCount.value === 0)

// --- Item edits (optimistic, reverted on failure) ---
const clone = (item: ScanItem): ScanItem => JSON.parse(JSON.stringify(item))

const mergeLocal = (item: ScanItem, patch: Record<string, unknown>, card?: RefCard | null) => {
  Object.assign(item, patch)
  if (card !== undefined) item.matched_card = card
}

const saveItem = async (item: ScanItem, patch: Record<string, unknown>, card?: RefCard | null) => {
  const before = clone(item)
  actionError.value = ''
  mergeLocal(item, patch, card)

  try {
    const res = await $fetch<{ item: Partial<ScanItem> }>(`/api/scan/items/${item.id}`, { method: 'PATCH', body: patch })
    const { match_candidates, ...fresh } = res.item
    Object.assign(item, fresh)
    return true
  } catch (err: any) {
    Object.assign(item, before)
    actionError.value = err?.data?.statusMessage || 'Kunde inte spara ändringen'
    return false
  }
}

const advance = (from: ScanItem) => {
  const list = orderedItems.value
  const start = list.findIndex((i) => i.id === from.id)
  const next = [...list.slice(start + 1), ...list.slice(0, start)].find((i) => !isDone(i))
  if (next) focusedId.value = next.id
}

const cardFromCandidate = (item: ScanItem, c: ScanCandidate): RefCard => ({
  id: c.card_id,
  game: item.game ?? 'mtg',
  name: c.name,
  set_code: c.set_code,
  set_name: c.set_name,
  collector_number: c.collector_number,
  rarity: c.rarity ?? null,
  image_url: c.image_url ?? null,
  finishes: c.finishes ?? []
})

const pickCard = async (item: ScanItem, card: RefCard) => {
  const foilOnly = card.finishes.length > 0 && !card.finishes.includes('nonfoil')
  const patch: Record<string, unknown> = {
    matched_card_id: card.id,
    game: card.game,
    is_manual: false,
    status: item.status === 'confirmed' ? 'confirmed' : 'matched'
  }
  if (foilOnly) patch.is_foil = true
  await saveItem(item, patch, card)
}

const pickCandidate = (item: ScanItem, c: ScanCandidate) => pickCard(item, cardFromCandidate(item, c))

const canConfirm = (item: ScanItem) => Boolean(item.matched_card || (item.is_manual && item.manual_name))

const confirmItem = async (item: ScanItem) => {
  if (!canConfirm(item)) return
  if (await saveItem(item, { status: 'confirmed' })) advance(item)
}

const skipItem = async (item: ScanItem) => {
  if (await saveItem(item, { status: 'skipped' })) advance(item)
}

const unidentifiedItem = async (item: ScanItem) => {
  if (await saveItem(item, { status: 'unidentified', matched_card_id: null }, null)) advance(item)
}

const reopenItem = (item: ScanItem) => saveItem(item, { status: item.matched_card ? 'matched' : 'needs_review' })

const manualItem = async (item: ScanItem, f: { name: string, game: 'mtg' | 'pokemon', set_name: string, set_code: string, collector_number: string, rarity: string }) => {
  const ok = await saveItem(
    item,
    {
      is_manual: true,
      matched_card_id: null,
      game: f.game,
      manual_name: f.name,
      manual_set_name: f.set_name,
      manual_set_code: f.set_code,
      manual_collector_number: f.collector_number,
      manual_rarity: f.rarity,
      status: 'confirmed'
    },
    null
  )
  if (ok) advance(item)
}

// --- Bulk ---
const selectedCount = computed(() => selected.value.size)
const bulkCondition = ref('')
const bulkLanguage = ref('')
const bulkFoil = ref<'' | 'yes' | 'no'>('')
const bulkBusy = ref(false)
const bulkMessage = ref('')

const toggleSelected = (id: string) => {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const selectAllVisible = () => {
  selected.value = new Set(orderedItems.value.map((i) => i.id))
}

const clearSelection = () => {
  selected.value = new Set()
}

const runBulk = async (patch: Record<string, unknown>) => {
  if (!selected.value.size) return
  bulkBusy.value = true
  bulkMessage.value = ''
  actionError.value = ''

  try {
    const res = await $fetch<{ updated: number, skippedUnmatched: number }>(`/api/scan/batches/${route.params.id}/bulk`, {
      method: 'POST',
      body: { ids: [...selected.value], patch }
    })

    for (const id of selected.value) {
      const item = itemsById.value.get(id)
      if (!item) continue
      if (patch.status === 'confirmed' && !canConfirm(item)) continue
      mergeLocal(item, patch)
    }

    bulkMessage.value = `${res.updated} kort uppdaterade${res.skippedUnmatched ? `, ${res.skippedUnmatched} hoppades över (inget kort valt)` : ''}.`
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte uppdatera de valda korten'
  } finally {
    bulkBusy.value = false
  }
}

const applyBulkSettings = async () => {
  const patch: Record<string, unknown> = {}
  if (bulkCondition.value) patch.condition = bulkCondition.value
  if (bulkLanguage.value) patch.language = bulkLanguage.value
  if (bulkFoil.value) patch.is_foil = bulkFoil.value === 'yes'
  if (!Object.keys(patch).length) return
  await runBulk(patch)
}

// --- Batch actions ---
const identifying = ref(false)
const identifyMessage = ref('')

const identifyAgain = async () => {
  identifying.value = true
  identifyMessage.value = ''

  try {
    const res = await $fetch<{ total: number, matched: number, needs_review: number, unidentified: number }>(`/api/scan/batches/${route.params.id}/identify`, { method: 'POST', body: {} })
    identifyMessage.value = `${res.matched} träffar, ${res.needs_review} att granska, ${res.unidentified} utan träff.`
    await load()
  } catch (err: any) {
    identifyMessage.value = err?.data?.statusMessage || 'Kunde inte identifiera'
  } finally {
    identifying.value = false
  }
}

const confirming = ref(false)

const confirmBatch = async () => {
  if (!readyToConfirm.value) return
  const confirmed = counts.value.confirmed ?? 0

  if (!confirm(`Bekräfta bunten med ${confirmed} kort? (${counts.value.skipped ?? 0} överhoppade, ${counts.value.unidentified ?? 0} ej identifierade)`)) return

  confirming.value = true
  actionError.value = ''

  try {
    await $fetch(`/api/scan/batches/${route.params.id}/confirm`, { method: 'POST' })
    if (batch.value) batch.value.status = 'confirmed'
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte bekräfta bunten'
  } finally {
    confirming.value = false
  }
}

// --- Export hela bunten till PowerTools ---
const EXPORTABLE = ['confirmed', 'priced', 'drafted', 'published']
const canExport = computed(() => Boolean(batch.value && EXPORTABLE.includes(batch.value.status)))
const exportOpen = ref(false)
const exportChannel = ref<'both' | 'cardmarket'>('both')
const exporting = ref(false)
const exportMessage = ref('')

const confirmedItems = computed(() => items.value.filter((i) => i.status === 'confirmed'))
const shopifyOnlyCount = computed(() => confirmedItems.value.filter((i) => i.sales_channel === 'shopify' && (!i.stock_status || i.stock_status === 'listed')).length)
const alreadyChannelCount = computed(() => confirmedItems.value.filter((i) => i.sales_channel !== 'shopify').length)

const runExport = async () => {
  if (!batch.value) return
  exporting.value = true
  exportMessage.value = ''
  actionError.value = ''

  try {
    const result = await runPowertools({ batchId: batch.value.id, setChannel: shopifyOnlyCount.value ? exportChannel.value : undefined })
    if (!result.cancelled) {
      exportMessage.value = result.message
      exportOpen.value = false
    }
    await load()
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte exportera'
  } finally {
    exporting.value = false
  }
}

watch(() => batch.value?.id, () => {
  if (route.query.export && canExport.value && canEditScan.value) exportOpen.value = true
})

const removeBatch = async () => {
  if (!batch.value || !confirm(`Ta bort bunten "${batch.value.name}" och alla dess bilder?`)) return

  try {
    await $fetch(`/api/scan/batches/${batch.value.id}`, { method: 'DELETE' })
    await navigateTo('/skanning')
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte ta bort bunten'
  }
}

// --- Keyboard ---
const gridEl = ref<HTMLElement | null>(null)

const columnCount = () => {
  const tiles = gridEl.value?.querySelectorAll<HTMLElement>('[data-id]')
  if (!tiles?.length) return 1
  const firstTop = tiles[0]!.offsetTop
  let n = 0
  for (const tile of tiles) {
    if (tile.offsetTop !== firstTop) break
    n++
  }
  return Math.max(1, n)
}

const moveFocus = (delta: number) => {
  const list = orderedItems.value
  if (!list.length) return
  const index = Math.max(0, list.findIndex((i) => i.id === focusedId.value))
  const next = Math.min(list.length - 1, Math.max(0, index + delta))
  focusedId.value = list[next]!.id
}

const onKeydown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
  if (e.metaKey || e.ctrlKey || e.altKey) return

  const item = focused.value

  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); moveFocus(1); return
    case 'ArrowLeft': e.preventDefault(); moveFocus(-1); return
    case 'ArrowDown': e.preventDefault(); moveFocus(columnCount()); return
    case 'ArrowUp': e.preventDefault(); moveFocus(-columnCount()); return
    case 'Escape': clearSelection(); return
  }

  if (!item || !canEditScan.value) return

  if (/^[1-5]$/.test(e.key)) {
    const candidate = item.match_candidates?.[Number(e.key) - 1]
    if (candidate) pickCandidate(item, candidate)
    return
  }

  switch (e.key.toLowerCase()) {
    case 'enter': e.preventDefault(); confirmItem(item); break
    case 's': skipItem(item); break
    case 'u': unidentifiedItem(item); break
    case 'f': saveItem(item, { is_foil: !item.is_foil }); break
    case ' ': e.preventDefault(); toggleSelected(item.id); break
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(focusedId, async (id) => {
  if (!id) return
  await nextTick()
  gridEl.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
})

// --- Tile helpers ---
const tileTitle = (item: ScanItem) => {
  if (item.matched_card) return item.matched_card.name
  if (item.is_manual && item.manual_name) return item.manual_name
  return item.match_candidates?.[0]?.name ?? ''
}

const tileSub = (item: ScanItem) => {
  if (item.matched_card) return `${item.matched_card.set_code} ${item.matched_card.collector_number}`
  if (item.is_manual) return [item.manual_set_code, item.manual_collector_number].filter(Boolean).join(' ')
  const c = item.match_candidates?.[0]
  return c ? `${c.set_code} ${c.collector_number}` : ''
}

const isSuggestion = (item: ScanItem) => !item.matched_card && !item.is_manual && Boolean(item.match_candidates?.length)

const tileBorder = (item: ScanItem) => {
  if (item.status === 'confirmed') return 'border-[var(--ok)]'
  if (item.status === 'needs_review' || item.status === 'pending') return 'border-[var(--warn)]'
  if (item.status === 'unidentified') return 'border-[var(--bad)]'
  return 'border-[var(--line)]'
}
</script>

<template>
  <div>
    <NuxtLink to="/skanning" class="mb-4 inline-block text-sm text-lyktan-mute hover:text-lyktan-ink">← Alla buntar</NuxtLink>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-[var(--bad)]">{{ loadError }}</p>

    <template v-else-if="batch">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-lyktan-ink">{{ batch.name }}</h1>
          <p class="mt-1 text-sm text-lyktan-mute">
            {{ items.length }} kort<span v-if="batch.status === 'confirmed'"> · Bunten är bekräftad</span><span v-if="batch.note"> · {{ batch.note }}</span>
          </p>
        </div>
        <div v-if="canEditScan" class="flex flex-wrap items-center gap-3">
          <NuxtLink v-if="['confirmed', 'priced', 'drafted', 'published'].includes(batch.status)" :to="`/skanning/priser/${batch.id}`" class="btn primary">Prissätt bunten</NuxtLink>
          <NuxtLink v-if="batch.status === 'priced' || batch.status === 'drafted' || batch.status === 'published'" :to="`/skanning/utkast/${batch.id}`" class="btn">Shopify-utkast</NuxtLink>
          <button v-if="canExport" type="button" class="btn" @click="exportOpen = !exportOpen">Exportera till PowerTools</button>
          <button type="button" class="btn" :disabled="identifying" @click="identifyAgain">{{ identifying ? 'Identifierar…' : 'Identifiera igen' }}</button>
          <button type="button" class="btn primary" :disabled="!readyToConfirm || confirming || batch.status === 'confirmed'" @click="confirmBatch">
            {{ batch.status === 'confirmed' ? 'Bunten är bekräftad' : confirming ? 'Bekräftar…' : 'Bekräfta bunt' }}
          </button>
          <button type="button" class="text-sm text-[var(--bad)] hover:underline" @click="removeBatch">Ta bort bunt</button>
        </div>
      </div>

      <div v-if="exportOpen && canExport" class="mb-4 rounded-2xl border border-[var(--line)] p-4">
        <h2 class="text-base font-semibold text-lyktan-ink">Exportera hela bunten till PowerTools</h2>
        <p class="mt-1 text-sm text-lyktan-mute">
          Alla {{ confirmedItems.length }} bekräftade kort i bunten hamnar i en CSV-fil för PowerTools. Likadana exemplar slås ihop, och priset sätts från Cardmarkets trendpris (EUR).
        </p>

        <fieldset v-if="shopifyOnlyCount" class="mt-3">
          <legend class="mb-1.5 text-sm text-lyktan-ink">
            {{ shopifyOnlyCount }} kort är inställda för bara Shopify<span v-if="alreadyChannelCount">, {{ alreadyChannelCount }} är redan Cardmarket eller Båda</span>. Hur ska de säljas?
          </legend>
          <div class="flex flex-wrap gap-2">
            <label class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm" :class="exportChannel === 'both' ? 'border-[var(--focus)]' : 'border-[var(--line)]'">
              <input v-model="exportChannel" type="radio" value="both" class="sr-only">Både Shopify och Cardmarket
            </label>
            <label class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm" :class="exportChannel === 'cardmarket' ? 'border-[var(--focus)]' : 'border-[var(--line)]'">
              <input v-model="exportChannel" type="radio" value="cardmarket" class="sr-only">Bara Cardmarket
            </label>
          </div>
          <p class="mt-1.5 text-[0.75rem] text-lyktan-mute">Kort som redan ligger i Shopify blir alltid "Båda". Försäljning på Cardmarket syns inte i adminpanelen, så markera dem som sålda i Singlar.</p>
        </fieldset>

        <div class="mt-3 flex gap-2">
          <button type="button" class="btn primary" :disabled="exporting || !confirmedItems.length" @click="runExport">{{ exporting ? 'Exporterar…' : 'Exportera och ladda ner' }}</button>
          <button type="button" class="btn" :disabled="exporting" @click="exportOpen = false">Avbryt</button>
        </div>
      </div>
      <p v-if="exportMessage" class="mb-3 text-sm text-lyktan-ink" aria-live="polite">{{ exportMessage }}</p>

      <p class="mb-3 text-sm text-lyktan-mute" aria-live="polite">
        <span v-for="status in STATUS_ORDER" v-show="counts[status]" :key="status" class="mr-3">
          {{ STATUS_LABELS[status] }}: {{ counts[status] }}
        </span>
        <span v-if="!readyToConfirm && openCount" class="text-lyktan-ink">{{ openCount }} kort kvar att bekräfta, hoppa över eller markera som ej identifierade.</span>
        <span v-else-if="readyToConfirm && batch.status !== 'confirmed'" class="text-[var(--ok)]">Alla kort är klara — du kan bekräfta bunten.</span>
        <span v-if="identifyMessage" class="ml-2 text-lyktan-ink">{{ identifyMessage }}</span>
      </p>

      <p v-if="actionError" class="mb-3 text-sm text-[var(--bad)]" role="alert">{{ actionError }}</p>

      <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label class="flex items-center gap-2"><input v-model="reviewFirst" type="checkbox"> Visa kort som behöver granskas först</label>
        <button type="button" class="text-lyktan-mute hover:text-lyktan-ink hover:underline" @click="selectAllVisible">Markera alla</button>
        <button v-if="selectedCount" type="button" class="text-lyktan-mute hover:text-lyktan-ink hover:underline" @click="clearSelection">Avmarkera ({{ selectedCount }})</button>
        <span class="text-[0.72rem] text-lyktan-mute">Pilar: bläddra · 1–5: välj förslag · Enter: bekräfta · S: hoppa över · U: ej identifierad · F: foil · Mellanslag: markera</span>
      </div>

      <div v-if="canEditScan && selectedCount" class="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] p-3">
        <p class="text-sm font-medium text-lyktan-ink">{{ selectedCount }} valda</p>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Skick</span>
          <select v-model="bulkCondition" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
            <option value="">—</option>
            <option v-for="c in SCAN_CONDITIONS" :key="c" :value="c">{{ SCAN_CONDITION_LABELS[c] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Språk</span>
          <select v-model="bulkLanguage" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
            <option value="">—</option>
            <option v-for="(label, code) in SCAN_LANGUAGES" :key="code" :value="code">{{ label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Foil</span>
          <select v-model="bulkFoil" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
            <option value="">—</option>
            <option value="yes">Ja</option>
            <option value="no">Nej</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="bulkBusy || (!bulkCondition && !bulkLanguage && !bulkFoil)" @click="applyBulkSettings">Tillämpa</button>
        <button type="button" class="btn" :disabled="bulkBusy" @click="runBulk({ status: 'confirmed' })">Bekräfta valda</button>
        <button type="button" class="btn" :disabled="bulkBusy" @click="runBulk({ status: 'skipped' })">Hoppa över valda</button>
        <span v-if="bulkMessage" class="text-sm text-lyktan-mute" aria-live="polite">{{ bulkMessage }}</span>
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <ul ref="gridEl" class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <li v-for="item in orderedItems" :key="item.id" :data-id="item.id" class="relative" :class="{ 'opacity-50': item.status === 'skipped' }">
            <button
              type="button"
              class="block w-full rounded-xl border-2 p-1.5 text-left transition"
              :class="[tileBorder(item), focusedId === item.id ? 'ring-2 ring-[var(--focus)] ring-offset-2' : '']"
              :aria-label="`Kort nr ${item.position}: ${tileTitle(item) || 'ej identifierat'}, ${STATUS_LABELS[item.status]}`"
              :aria-pressed="focusedId === item.id"
              @click="focusedId = item.id"
            >
              <div class="relative aspect-[5/7] overflow-hidden rounded-lg bg-[var(--surface-2)]">
                <img v-if="item.image_url" :src="item.image_url" :alt="`Skannat kort nr ${item.position}`" loading="lazy" class="h-full w-full object-cover">
                <span class="mono absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.68rem] text-white">{{ item.position }}</span>
                <span v-if="item.status === 'confirmed'" class="absolute bottom-1.5 right-1.5 rounded bg-[var(--ok)] px-1.5 py-0.5 text-[0.68rem] font-medium text-white">✓</span>
              </div>
              <p class="mt-1.5 truncate text-[0.82rem] font-medium text-lyktan-ink" :class="{ italic: isSuggestion(item) }">
                <span v-if="isSuggestion(item)" class="font-normal text-lyktan-mute">Förslag: </span>{{ tileTitle(item) || '—' }}
              </p>
              <p class="mono truncate text-[0.68rem] text-lyktan-mute">
                {{ tileSub(item) }}<template v-if="item.matched_card || item.is_manual"> · {{ item.condition }}<template v-if="item.is_foil"> · foil</template><template v-if="item.language !== 'en'"> · {{ item.language }}</template></template>
              </p>
            </button>
            <label v-if="canEditScan" class="absolute right-2.5 top-2.5 grid h-6 w-6 cursor-pointer place-items-center rounded bg-black/65">
              <span class="sr-only">Markera kort nr {{ item.position }}</span>
              <input type="checkbox" :checked="selected.has(item.id)" @change="toggleSelected(item.id)">
            </label>
          </li>
        </ul>

        <aside class="lg:sticky lg:top-4">
          <ScanReviewPanel
            v-if="focused"
            :item="focused"
            :can-edit="canEditScan"
            @pick-candidate="pickCandidate(focused, $event)"
            @pick-card="pickCard(focused, $event)"
            @update="saveItem(focused, $event)"
            @confirm="confirmItem(focused)"
            @skip="skipItem(focused)"
            @unidentified="unidentifiedItem(focused)"
            @reopen="reopenItem(focused)"
            @manual="manualItem(focused, $event)"
          />
        </aside>
      </div>
    </template>
  </div>
</template>
