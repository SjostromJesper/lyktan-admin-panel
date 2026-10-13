<script setup lang="ts">
import { SCAN_CONDITIONS, SCAN_LANGUAGES } from '~/types/scan'

type StockItem = {
  id: string
  batch_id: string
  batch_name: string
  position: number
  game: 'mtg' | 'pokemon' | null
  name: string
  set_code: string | null
  set_name: string | null
  collector_number: string | null
  condition: string
  language: string
  is_foil: boolean
  price_sek: number | null
  stock_status: 'listed' | 'sold' | 'shipped' | 'removed' | null
  shopify_sku: string | null
  shopify_product_id: string | null
  published_at: string | null
  image_url: string | null
  sold_at: string | null
  sold_channel: string | null
  sold_note: string | null
  shopify_order_name: string | null
  sales_channel: 'shopify' | 'cardmarket' | 'both'
  exported_to_powertools_at: string | null
}
type StockEvent = { id: string, from_status: string | null, to_status: string, channel: string | null, note: string | null, shopify_delta: number, created_by: string | null, created_at: string }
type Action = 'sold' | 'unsell' | 'shipped' | 'remove'

const { canEditScan } = usePermissions()
const { run: runPowertools } = usePowertoolsExport()

const STATUS_LABELS: Record<string, string> = { listed: 'Till salu', sold: 'Såld', shipped: 'Skickad', removed: 'Borttagen' }
const STATUS_COLORS: Record<string, string> = { listed: 'var(--ok)', sold: 'var(--warn)', shipped: 'var(--muted)', removed: 'var(--bad)' }
const CHANNELS: Record<string, string> = { butik: 'Butik', cardmarket: 'Cardmarket', webbshop: 'Webbshop', annat: 'Annat' }
const ACTION_LABELS: Record<Action, string> = { sold: 'Markera som såld', unsell: 'Ångra försäljning', shipped: 'Markera som skickad', remove: 'Ta bort från lager' }

// --- Filters + list ---
const filters = reactive({ q: '', game: '', set: '', condition: '', status: 'listed', batch: '', sort: 'date', dir: 'desc' })
const items = ref<StockItem[]>([])
const total = ref(0)
const totalValue = ref(0)
const batches = ref<{ id: string, name: string }[]>([])
const sets = ref<{ code: string, name: string }[]>([])
const shopAdminBase = ref('')
const loading = ref(true)
const loadError = ref('')
const PAGE = 100

const fetchPage = async (offset: number) => {
  const res = await $fetch<{ items: StockItem[], total: number, totalValue: number, batches: any[], sets: any[], shopAdminBase: string }>('/api/scan/stock', {
    query: { ...filters, limit: PAGE, offset }
  })
  total.value = res.total
  totalValue.value = res.totalValue
  batches.value = res.batches
  sets.value = res.sets
  shopAdminBase.value = res.shopAdminBase
  return res.items
}

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    items.value = await fetchPage(0)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta lagret'
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  try {
    items.value = [...items.value, ...(await fetchPage(items.value.length))]
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta fler'
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(() => filters.q, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
})
watch(() => [filters.game, filters.set, filters.condition, filters.status, filters.batch, filters.sort, filters.dir], load)
onMounted(load)
onBeforeUnmount(() => clearTimeout(searchTimer))

const resetFilters = () => Object.assign(filters, { q: '', game: '', set: '', condition: '', status: 'listed', batch: '', sort: 'date', dir: 'desc' })

// --- Helpers ---
const place = (item: StockItem) => `${item.batch_name}, nr ${item.position}`
const sek = (value: number | null) => (value == null ? '–' : `${value.toLocaleString('sv-SE')} kr`)
const shopUrl = (item: StockItem) =>
  item.shopify_product_id && shopAdminBase.value ? `https://admin.shopify.com/store/${shopAdminBase.value}/products/${item.shopify_product_id.split('/').pop()}` : null
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '')

const allowedActions = (item: StockItem): Action[] => {
  if (item.stock_status === 'listed') return ['sold', 'remove']
  if (item.stock_status === 'sold') return ['shipped', 'unsell']
  return []
}

// --- Selection ---
const selected = ref<Set<string>>(new Set())
const toggle = (id: string) => {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const allSelected = computed(() => items.value.length > 0 && items.value.every((i) => selected.value.has(i.id)))
const toggleAll = () => {
  selected.value = allSelected.value ? new Set() : new Set(items.value.map((i) => i.id))
}
watch(items, (list) => {
  const ids = new Set(list.map((i) => i.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
})

// --- Confirm dialog (single or bulk) ---
const dialog = ref<{ action: Action, targets: StockItem[] } | null>(null)
const channel = ref('butik')
const note = ref('')
const working = ref(false)
const progress = ref({ done: 0, total: 0 })
const dialogErrors = ref<string[]>([])
const message = ref('')

const openDialog = (action: Action, targets: StockItem[]) => {
  const valid = targets.filter((t) => allowedActions(t).includes(action))
  if (!valid.length) {
    message.value = `Inget av de valda exemplaren kan ${ACTION_LABELS[action].toLowerCase()}.`
    return
  }
  channel.value = 'butik'
  note.value = ''
  dialogErrors.value = []
  dialog.value = { action, targets: valid }
}

const bulk = (action: Action) => openDialog(action, items.value.filter((i) => selected.value.has(i.id)))

const stockChangeText = computed(() => {
  const d = dialog.value
  if (!d) return ''
  const n = d.targets.length
  if (d.action === 'sold') return channel.value === 'webbshop' ? 'Webbshopen drar redan av saldot i Shopify, så det ändras inte.' : `Shopify-saldot minskas med ${n}.`
  if (d.action === 'unsell') return d.targets.some((t) => t.sold_channel !== 'webbshop') ? 'Shopify-saldot ökas med 1 för varje exemplar som såldes utanför webbshopen.' : 'Saldot i Shopify ändras inte.'
  if (d.action === 'remove') return `Shopify-saldot minskas med ${n}.`
  return 'Saldot i Shopify ändras inte. Därefter går det inte att ångra.'
})

const confirm = async () => {
  const d = dialog.value
  if (!d) return
  working.value = true
  dialogErrors.value = []
  progress.value = { done: 0, total: d.targets.length }
  const failed: StockItem[] = []

  for (const item of d.targets) {
    try {
      await $fetch(`/api/scan/stock/${item.id}/status`, {
        method: 'POST',
        body: { action: d.action, channel: d.action === 'sold' ? channel.value : undefined, note: note.value || undefined }
      })
    } catch (err: any) {
      failed.push(item)
      dialogErrors.value.push(`${item.name} (${place(item)}): ${err?.data?.statusMessage || 'misslyckades'}`)
    }
    progress.value.done += 1
  }

  working.value = false
  await Promise.all([load(), loadRemovals()])
  selected.value = new Set()

  if (failed.length) {
    dialog.value = { action: d.action, targets: failed }
  } else {
    message.value = `${d.targets.length} exemplar: ${ACTION_LABELS[d.action].toLowerCase()} klart.`
    dialog.value = null
  }
}

// --- Export to PowerTools ---
const exportBusy = ref(false)

const exportSelected = async () => {
  exportBusy.value = true
  loadError.value = ''
  message.value = ''

  try {
    const result = await runPowertools({ ids: [...selected.value] })
    if (!result.cancelled) message.value = result.message
    await load()
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte exportera'
  } finally {
    exportBusy.value = false
  }
}

// --- Att ta bort från Cardmarket ---
type Removal = { id: string, batch_name: string, position: number, name: string, set_code: string | null, collector_number: string | null, condition: string, is_foil: boolean, stock_status: string, sold_channel: string | null, sold_at: string | null, shopify_order_name: string | null }
const removals = ref<Removal[]>([])

const loadRemovals = async () => {
  try {
    removals.value = (await $fetch<{ items: Removal[] }>('/api/scan/stock/cardmarket-removals')).items
  } catch { /* the panel just stays hidden */ }
}
onMounted(loadRemovals)

const markRemoved = async (item: Removal) => {
  try {
    await $fetch(`/api/scan/stock/${item.id}/cardmarket-removed`, { method: 'POST', body: {} })
    removals.value = removals.value.filter((r) => r.id !== item.id)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte spara'
  }
}

// Marking a Shopify + Cardmarket copy as sold elsewhere means the Cardmarket listing must go too.
const needsCardmarketRemoval = computed(() => {
  const d = dialog.value
  if (!d || !['sold', 'remove'].includes(d.action)) return false
  if (d.action === 'sold' && channel.value === 'cardmarket') return false
  return d.targets.some((t) => t.sales_channel === 'both' && t.exported_to_powertools_at)
})

// --- Webshop-ordrar att koppla till exemplar ---
type OrderCopy = { id: string, batch_name: string, position: number, condition: string, name: string, is_foil: boolean }
type PendingOrder = { orderName: string, createdAt: string, financialStatus: string | null, sku: string, title: string, remaining: number, copies: OrderCopy[] }
type CancelledOrder = { orderName: string, createdAt: string, items: OrderCopy[] }

const orders = ref<{ pending: PendingOrder[], cancelled: CancelledOrder[] }>({ pending: [], cancelled: [] })
const ordersError = ref('')
const ordersBusy = ref(false)
const picks = ref<Record<string, string[]>>({})

const loadOrders = async () => {
  ordersError.value = ''
  try {
    orders.value = await $fetch('/api/scan/stock/orders')
  } catch (err: any) {
    ordersError.value = err?.data?.statusMessage || 'Kunde inte hämta webshop-ordrar'
  }
}
onMounted(loadOrders)

const pickKey = (o: PendingOrder) => `${o.orderName}|${o.sku}`
const pickedFor = (o: PendingOrder) => picks.value[pickKey(o)] ?? []
const togglePick = (o: PendingOrder, id: string) => {
  const current = pickedFor(o)
  const next = current.includes(id) ? current.filter((x) => x !== id) : current.length < o.remaining ? [...current, id] : current
  picks.value = { ...picks.value, [pickKey(o)]: next }
}

const linkOrder = async (o: PendingOrder) => {
  ordersBusy.value = true
  ordersError.value = ''
  try {
    const chosen = [...pickedFor(o)]
    for (const id of chosen) {
      await $fetch(`/api/scan/stock/${id}/status`, { method: 'POST', body: { action: 'sold', channel: 'webbshop', orderName: o.orderName } })
    }
    picks.value = { ...picks.value, [pickKey(o)]: [] }
    message.value = `Order ${o.orderName}: ${chosen.length} exemplar kopplade.`
  } catch (err: any) {
    ordersError.value = err?.data?.statusMessage || 'Kunde inte koppla'
  } finally {
    ordersBusy.value = false
    await Promise.all([load(), loadOrders()])
  }
}

const restoreCancelled = async (o: CancelledOrder) => {
  ordersBusy.value = true
  ordersError.value = ''
  try {
    // Shopify restores the stock on a cancelled order by itself, so no delta here.
    for (const item of o.items) await $fetch(`/api/scan/stock/${item.id}/status`, { method: 'POST', body: { action: 'unsell' } })
    message.value = `Order ${o.orderName} avbruten: ${o.items.length} exemplar åter till salu.`
  } catch (err: any) {
    ordersError.value = err?.data?.statusMessage || 'Kunde inte återställa'
  } finally {
    ordersBusy.value = false
    await Promise.all([load(), loadOrders()])
  }
}

// --- History ---
const history = ref<{ item: StockItem, events: StockEvent[] } | null>(null)
const openHistory = async (item: StockItem) => {
  history.value = { item, events: [] }
  try {
    const res = await $fetch<{ events: StockEvent[] }>(`/api/scan/stock/${item.id}/events`)
    history.value = { item, events: res.events }
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta historiken'
  }
}
const eventText = (e: StockEvent) =>
  `${e.from_status ? STATUS_LABELS[e.from_status] : 'Ny'} → ${STATUS_LABELS[e.to_status] ?? e.to_status}${e.channel ? ` (${CHANNELS[e.channel] ?? e.channel})` : ''}${e.shopify_delta ? ` · Shopify ${e.shopify_delta > 0 ? '+' : ''}${e.shopify_delta}` : ''}`
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-lyktan-ink">Singlar</h1>
        <p class="mt-1 text-sm text-lyktan-mute">Alla exemplar som publicerats i Shopify. Shopify är sanningen för saldot — här markerar du vilka exemplar som sålts.</p>
      </div>
      <NuxtLink to="/skanning" class="btn">Skanning</NuxtLink>
    </div>

    <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
      <label class="block grow basis-56">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Sök namn, set eller SKU</span>
        <input v-model="filters.q" type="search" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5" placeholder="t.ex. Sally Pride, TMT, mtg-12345">
      </label>
      <label class="block">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Status</span>
        <select v-model="filters.status" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5">
          <option value="">Alla</option>
          <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Spel</span>
        <select v-model="filters.game" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5">
          <option value="">Alla</option>
          <option value="mtg">Magic</option>
          <option value="pokemon">Pokémon</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Set</span>
        <select v-model="filters.set" class="max-w-40 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5">
          <option value="">Alla</option>
          <option v-for="s in sets" :key="s.code" :value="s.code">{{ s.code.toUpperCase() }} · {{ s.name }}</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Skick</span>
        <select v-model="filters.condition" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5">
          <option value="">Alla</option>
          <option v-for="c in SCAN_CONDITIONS" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Bunt</span>
        <select v-model="filters.batch" class="max-w-40 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5">
          <option value="">Alla</option>
          <option v-for="b in batches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Sortera</span>
        <span class="flex gap-1">
          <select v-model="filters.sort" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5">
            <option value="date">Publicerad</option>
            <option value="price">Pris</option>
            <option value="name">Namn</option>
            <option value="place">Plats</option>
          </select>
          <button type="button" class="rounded-lg border border-[var(--line)] px-2.5" :aria-label="filters.dir === 'asc' ? 'Stigande' : 'Fallande'" @click="filters.dir = filters.dir === 'asc' ? 'desc' : 'asc'">{{ filters.dir === 'asc' ? '↑' : '↓' }}</button>
        </span>
      </label>
      <button type="button" class="text-lyktan-mute hover:text-lyktan-ink hover:underline" @click="resetFilters">Rensa</button>
    </div>

    <p class="mb-3 text-sm text-lyktan-ink" aria-live="polite">
      {{ total }} exemplar · totalt värde <strong>{{ sek(totalValue) }}</strong>
      <span v-if="message" class="ml-3 text-lyktan-mute">{{ message }}</span>
    </p>
    <p v-if="loadError" class="mb-3 text-sm text-[var(--bad)]" role="alert">{{ loadError }}</p>

    <section v-if="removals.length" class="mb-4 rounded-2xl border border-[var(--bad)] p-4">
      <h2 class="text-base font-semibold text-lyktan-ink">Att ta bort från Cardmarket ({{ removals.length }})</h2>
      <p class="mt-0.5 text-[0.8rem] text-lyktan-mute">Såld eller borttagen någon annanstans, men annonsen finns kvar på Cardmarket via PowerTools. Ta bort den och bocka av.</p>
      <ul class="mt-2 divide-y divide-[var(--line)] text-sm">
        <li v-for="r in removals" :key="r.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><strong class="text-lyktan-ink">{{ r.name }}</strong> <span class="mono text-[0.7rem] text-lyktan-mute">{{ r.set_code?.toUpperCase() }} {{ r.collector_number }} · {{ r.condition }}<template v-if="r.is_foil"> · foil</template></span>
            <span class="text-lyktan-mute"> · {{ r.batch_name }}, nr {{ r.position }} · {{ r.stock_status === 'removed' ? 'borttagen' : `såld via ${CHANNELS[r.sold_channel ?? ''] ?? '–'}` }}<template v-if="r.shopify_order_name"> ({{ r.shopify_order_name }})</template></span></span>
          <button v-if="canEditScan" type="button" class="btn small" @click="markRemoved(r)">Borttagen på Cardmarket</button>
        </li>
      </ul>
    </section>

    <section v-if="orders.pending.length || orders.cancelled.length || ordersError" class="mb-4 rounded-2xl border border-[var(--warn)] p-4">
      <h2 class="text-base font-semibold text-lyktan-ink">Webshop-ordrar att koppla till exemplar</h2>
      <p class="mt-0.5 text-[0.8rem] text-lyktan-mute">Shopify har redan minskat saldot. Välj vilket exemplar du plockade, så sparas platsen. Saldot ändras inte här.</p>
      <p v-if="ordersError" class="mt-2 text-sm text-[var(--bad)]" role="alert">{{ ordersError }}</p>

      <div v-for="o in orders.pending" :key="o.orderName + o.sku" class="mt-3 rounded-xl border border-[var(--line)] p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm"><strong class="text-lyktan-ink">{{ o.orderName }}</strong> · {{ o.title }} <span class="mono text-[0.7rem] text-lyktan-mute">{{ o.sku }}</span> · <span class="text-lyktan-mute">{{ formatDate(o.createdAt) }}<template v-if="o.financialStatus"> · {{ o.financialStatus.toLowerCase() }}</template></span></p>
          <span class="rounded-md bg-[var(--surface-2)] px-2 py-1 text-[0.8rem] font-semibold">Välj {{ o.remaining }} st</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <label v-for="c in o.copies" :key="c.id" class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm" :class="pickedFor(o).includes(c.id) ? 'border-[var(--focus)]' : 'border-[var(--line)]'">
            <input type="checkbox" :checked="pickedFor(o).includes(c.id)" @change="togglePick(o, c.id)">{{ c.batch_name }}, nr {{ c.position }}
          </label>
          <p v-if="!o.copies.length" class="text-sm text-[var(--bad)]">Inga exemplar till salu med den SKU:n.</p>
        </div>
        <button v-if="canEditScan" type="button" class="btn small mt-2" :disabled="ordersBusy || pickedFor(o).length !== Math.min(o.remaining, o.copies.length) || !o.copies.length" @click="linkOrder(o)">Koppla</button>
      </div>

      <div v-for="o in orders.cancelled" :key="o.orderName" class="mt-3 rounded-xl border border-[var(--line)] p-3">
        <p class="text-sm"><strong class="text-lyktan-ink">{{ o.orderName }}</strong> är avbruten · {{ o.items.map((i) => `${i.name} (${i.batch_name}, nr ${i.position})`).join(', ') }}</p>
        <button v-if="canEditScan" type="button" class="btn small mt-2" :disabled="ordersBusy" @click="restoreCancelled(o)">Lägg tillbaka till salu</button>
      </div>
    </section>

    <div v-if="canEditScan && selected.size" class="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] p-3">
      <p class="text-sm font-medium text-lyktan-ink">{{ selected.size }} valda</p>
      <button type="button" class="btn" @click="bulk('sold')">Markera som sålda</button>
      <button type="button" class="btn" @click="bulk('shipped')">Markera som skickade</button>
      <button type="button" class="btn" @click="bulk('unsell')">Ångra försäljning</button>
      <button type="button" class="btn" :disabled="exportBusy" @click="exportSelected">{{ exportBusy ? 'Exporterar…' : 'Exportera till PowerTools' }}</button>
      <button type="button" class="btn danger" @click="bulk('remove')">Ta bort från lager</button>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="!items.length" class="text-sm text-lyktan-mute">Inga exemplar matchar filtret.</p>

    <div v-else class="overflow-x-auto rounded-2xl border border-[var(--line)]">
      <table class="w-full min-w-[980px] text-sm">
        <thead>
          <tr class="border-b border-[var(--line)] text-left text-[0.72rem] text-lyktan-mute">
            <th class="w-8 p-2"><input type="checkbox" :checked="allSelected" aria-label="Markera alla" @change="toggleAll"></th>
            <th class="p-2">Kort</th>
            <th class="p-2">Set</th>
            <th class="p-2">Skick</th>
            <th class="p-2">Språk</th>
            <th class="p-2 text-right">Pris</th>
            <th class="p-2">Plats</th>
            <th class="p-2">Status</th>
            <th class="p-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-b border-[var(--line)] align-top last:border-0">
            <td class="p-2"><input type="checkbox" :checked="selected.has(item.id)" :aria-label="`Markera ${item.name}`" @change="toggle(item.id)"></td>
            <td class="p-2">
              <div class="flex items-center gap-2.5">
                <img v-if="item.image_url" :src="item.image_url" :alt="item.name" loading="lazy" class="h-14 w-10 shrink-0 rounded object-cover">
                <div class="min-w-0">
                  <a v-if="shopUrl(item)" :href="shopUrl(item)!" target="_blank" rel="noopener" class="block truncate font-medium text-lyktan-ink hover:underline">{{ item.name }}</a>
                  <p v-else class="truncate font-medium text-lyktan-ink">{{ item.name }}</p>
                  <p class="mono truncate text-[0.66rem] text-lyktan-mute">{{ item.shopify_sku }}</p>
                  <span v-if="item.is_foil" class="mt-0.5 inline-block rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.66rem]">foil</span>
                  <span v-if="item.sales_channel !== 'shopify'" class="mt-0.5 ml-1 inline-block rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.66rem]" :title="item.exported_to_powertools_at ? `Exporterad till PowerTools ${formatDate(item.exported_to_powertools_at)}` : 'Inte exporterad till PowerTools än'">
                    {{ item.sales_channel === 'both' ? 'Shopify + Cardmarket' : 'Cardmarket' }}{{ item.exported_to_powertools_at ? ' ✓' : '' }}
                  </span>
                </div>
              </div>
            </td>
            <td class="mono p-2 text-[0.8rem]">{{ item.set_code?.toUpperCase() }} <span class="text-lyktan-mute">{{ item.collector_number }}</span></td>
            <td class="mono p-2">{{ item.condition }}</td>
            <td class="p-2">{{ SCAN_LANGUAGES[item.language] ?? item.language }}</td>
            <td class="mono p-2 text-right">{{ sek(item.price_sek) }}</td>
            <td class="p-2 font-medium text-lyktan-ink">{{ place(item) }}</td>
            <td class="p-2">
              <span class="font-medium" :style="{ color: STATUS_COLORS[item.stock_status ?? ''] }">{{ STATUS_LABELS[item.stock_status ?? ''] ?? '–' }}</span>
              <p v-if="item.sold_channel" class="text-[0.7rem] text-lyktan-mute">{{ CHANNELS[item.sold_channel] }}<template v-if="item.shopify_order_name"> · {{ item.shopify_order_name }}</template> · {{ formatDate(item.sold_at) }}</p>
              <p v-if="item.sold_note" class="text-[0.7rem] text-lyktan-mute">{{ item.sold_note }}</p>
            </td>
            <td class="p-2">
              <div class="flex flex-wrap justify-end gap-1.5">
                <template v-if="canEditScan">
                  <button v-for="action in allowedActions(item)" :key="action" type="button" class="btn small" :class="action === 'remove' ? 'danger' : ''" @click="openDialog(action, [item])">
                    {{ { sold: 'Såld', unsell: 'Ångra', shipped: 'Skickad', remove: 'Ta bort' }[action] }}
                  </button>
                </template>
                <button type="button" class="btn small" @click="openHistory(item)">Historik</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="items.length < total" class="mt-3 text-center">
      <button type="button" class="btn" @click="loadMore">Visa fler ({{ total - items.length }} kvar)</button>
    </div>

    <!-- Bekräftelse -->
    <div v-if="dialog" class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" :aria-label="ACTION_LABELS[dialog.action]" @click.self="!working && (dialog = null)">
      <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--bg,#fff)] p-5 shadow-xl">
        <h2 class="text-lg font-semibold text-lyktan-ink">{{ ACTION_LABELS[dialog.action] }}</h2>
        <p class="mt-1 text-sm text-lyktan-mute">Plocka rätt exemplar. Platsen står för varje kort:</p>

        <ul class="mt-3 max-h-56 divide-y divide-[var(--line)] overflow-auto rounded-xl border border-[var(--line)] text-sm">
          <li v-for="t in dialog.targets" :key="t.id" class="flex items-center justify-between gap-3 px-3 py-2">
            <span class="min-w-0 truncate"><strong class="text-lyktan-ink">{{ t.name }}</strong> <span class="mono text-[0.7rem] text-lyktan-mute">{{ t.set_code?.toUpperCase() }} {{ t.collector_number }} · {{ t.condition }}<template v-if="t.is_foil"> · foil</template></span></span>
            <span class="shrink-0 rounded-md bg-[var(--surface-2)] px-2 py-1 text-[0.8rem] font-semibold text-lyktan-ink">{{ place(t) }}</span>
          </li>
        </ul>

        <template v-if="dialog.action === 'sold'">
          <fieldset class="mt-4">
            <legend class="mb-1.5 text-[0.75rem] text-lyktan-mute">Såld via</legend>
            <div class="flex flex-wrap gap-2">
              <label v-for="(label, key) in CHANNELS" :key="key" class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm" :class="channel === key ? 'border-[var(--focus)]' : 'border-[var(--line)]'">
                <input v-model="channel" type="radio" name="channel" :value="key" class="sr-only">{{ label }}
              </label>
            </div>
          </fieldset>
          <label class="mt-3 block">
            <span class="mb-1 block text-[0.75rem] text-lyktan-mute">Anteckning (valfri)</span>
            <input v-model="note" type="text" maxlength="300" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm">
          </label>
        </template>

        <p class="mt-4 text-sm text-lyktan-ink">{{ stockChangeText }}</p>
        <p v-if="needsCardmarketRemoval" class="mt-2 rounded-lg border border-[var(--warn)] px-3 py-2 text-sm text-lyktan-ink">
          Glöm inte att ta bort kortet i PowerTools/Cardmarket också. Det hamnar i listan "Att ta bort från Cardmarket" tills du bockat av det.
        </p>

        <div v-if="working" class="mt-3" role="status">
          <p class="text-sm text-lyktan-mute">{{ progress.done }} av {{ progress.total }}…</p>
          <div class="mt-1 h-1.5 overflow-hidden rounded bg-[var(--surface-2)]"><div class="h-full bg-[var(--ok)] transition-all" :style="{ width: `${(progress.done / progress.total) * 100}%` }" /></div>
        </div>
        <ul v-if="dialogErrors.length" class="mt-3 space-y-1 text-[0.8rem] text-[var(--bad)]" role="alert">
          <li v-for="e in dialogErrors" :key="e">{{ e }}</li>
        </ul>

        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="btn" :disabled="working" @click="dialog = null">Avbryt</button>
          <button type="button" class="btn primary" :class="dialog.action === 'remove' ? 'danger' : ''" :disabled="working" @click="confirm">
            {{ working ? 'Sparar…' : dialogErrors.length ? 'Försök igen' : 'Bekräfta' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Historik -->
    <div v-if="history" class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Historik" @click.self="history = null">
      <div class="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--bg,#fff)] p-5 shadow-xl">
        <h2 class="text-lg font-semibold text-lyktan-ink">{{ history.item.name }}</h2>
        <p class="text-sm text-lyktan-mute">{{ place(history.item) }} · {{ history.item.condition }}</p>
        <ul class="mt-3 divide-y divide-[var(--line)] text-sm">
          <li v-for="e in history.events" :key="e.id" class="py-2">
            <p class="text-lyktan-ink">{{ eventText(e) }}</p>
            <p class="text-[0.72rem] text-lyktan-mute">{{ formatDate(e.created_at) }}<template v-if="e.created_by"> · {{ e.created_by }}</template></p>
            <p v-if="e.note" class="text-[0.75rem] text-lyktan-mute">{{ e.note }}</p>
          </li>
          <li v-if="!history.events.length" class="py-2 text-lyktan-mute">Ingen historik än.</li>
        </ul>
        <div class="mt-4 text-right"><button type="button" class="btn" @click="history = null">Stäng</button></div>
      </div>
    </div>
  </div>
</template>
