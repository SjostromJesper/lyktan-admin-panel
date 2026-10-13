<script setup lang="ts">
import { SALES_CHANNEL_LABELS, SCAN_CONDITIONS, SCAN_LANGUAGES } from '~/types/scan'
import type { ScanCondition, ScanItem } from '~/types/scan'

type Batch = { id: string, name: string, note: string | null, status: string }

const route = useRoute()
const { canEditScan } = usePermissions()

const batch = ref<Batch | null>(null)
const items = ref<ScanItem[]>([])
const shopAdminBase = ref('')
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const message = ref('')
const selected = ref<Set<string>>(new Set())
const { run: runPowertools } = usePowertoolsExport()
const exporting = ref(false)

// Shopify variant options as the webshop shows them.
const CONDITION_SHOP: Record<string, string> = { NM: 'Nyskick', EX: 'Utmärkt', GD: 'Bra', LP: 'Ok', PL: 'Dåligt', PO: 'Dåligt' }

const applyBatch = (res: { batch: Batch, items: ScanItem[], shopAdminBase: string }) => {
  batch.value = res.batch
  items.value = res.items.filter((i) => i.status === 'confirmed')
  shopAdminBase.value = res.shopAdminBase
}

const load = async () => {
  try {
    applyBatch(await $fetch(`/api/scan/batches/${route.params.id}`))
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta bunten'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const isPublished = (item: ScanItem) => item.publish_status === 'published'
const forShopify = (item: ScanItem) => item.sales_channel === 'shopify' || item.sales_channel === 'both'
const canPublish = (item: ScanItem) => forShopify(item) && !isPublished(item) && Boolean(item.price_sek && item.price_sek > 0)

const title = (item: ScanItem) => item.matched_card?.name ?? item.manual_name ?? '—'
const subtitle = (item: ScanItem) =>
  item.matched_card
    ? `${item.matched_card.set_name} · ${item.matched_card.set_code.toUpperCase()} ${item.matched_card.collector_number}`
    : [item.manual_set_name, item.manual_collector_number].filter(Boolean).join(' · ')

const imageFor = (item: ScanItem) => (item.image_source === 'reference' && item.matched_card?.image_url) || item.image_url || item.matched_card?.image_url || null

const productUrl = (item: ScanItem) =>
  item.shopify_product_id && shopAdminBase.value ? `https://admin.shopify.com/store/${shopAdminBase.value}/products/${item.shopify_product_id.split('/').pop()}` : null

const problem = (item: ScanItem) => {
  if (isPublished(item)) return ''
  if (!forShopify(item)) return 'Inte för Shopify'
  if (!item.price_sek || item.price_sek <= 0) return 'Saknar pris'
  return ''
}

const counts = computed(() => ({
  total: items.value.length,
  published: items.value.filter(isPublished).length,
  failed: items.value.filter((i) => i.publish_status === 'failed' && !isPublished(i)).length,
  ready: items.value.filter(canPublish).length,
  notShopify: items.value.filter((i) => !forShopify(i)).length,
  cardmarket: items.value.filter((i) => i.sales_channel !== 'shopify').length,
  noPrice: items.value.filter((i) => forShopify(i) && !isPublished(i) && !(i.price_sek && i.price_sek > 0)).length
}))

const sek = (value: number | null) => (value == null ? '–' : `${value.toLocaleString('sv-SE')} kr`)

// --- Edits ---
const patchItem = async (item: ScanItem, patch: Record<string, unknown>) => {
  actionError.value = ''

  try {
    await $fetch(`/api/scan/items/${item.id}`, { method: 'PATCH', body: patch })
    Object.assign(item, patch)
    if ('price_sek' in patch) item.price_overridden = patch.price_sek !== null
    return true
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte spara'
    return false
  }
}

const changePrice = async (item: ScanItem, raw: string) => {
  const price = Math.round(Number(raw.trim().replace(',', '.')))

  if (!Number.isFinite(price) || price <= 0) {
    actionError.value = 'Ange priset i hela kronor'
    return
  }

  if (price !== item.price_sek) await patchItem(item, { price_sek: price })
}

// Condition/foil change the Cardmarket price, so recalculate unless it was set by hand.
const changeCardProps = async (item: ScanItem, patch: { condition?: ScanCondition, is_foil?: boolean, language?: string }) => {
  if (!(await patchItem(item, patch))) return

  if (!item.price_overridden && ('condition' in patch || 'is_foil' in patch)) {
    try {
      await $fetch(`/api/scan/batches/${route.params.id}/price`, { method: 'POST', body: { ids: [item.id] } })
      applyBatch(await $fetch(`/api/scan/batches/${route.params.id}`))
    } catch (err: any) {
      actionError.value = err?.data?.statusMessage || 'Kunde inte räkna om priset'
    }
  }
}

const toggle = (id: string) => {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const editable = computed(() => items.value.filter((i) => !isPublished(i)))
const allSelected = computed(() => editable.value.length > 0 && editable.value.every((i) => selected.value.has(i.id)))
const toggleAll = () => {
  selected.value = allSelected.value ? new Set() : new Set(editable.value.map((i) => i.id))
}

// --- Bulk ---
const bulkChannel = ref('')
const bulkImage = ref('')
const bulkPercent = ref<number | null>(null)

const bulkPatch = async (patch: Record<string, unknown>) => {
  if (!selected.value.size) return
  actionError.value = ''

  try {
    await $fetch(`/api/scan/batches/${route.params.id}/bulk`, { method: 'POST', body: { ids: [...selected.value], patch } })
    for (const item of items.value) if (selected.value.has(item.id) && !isPublished(item)) Object.assign(item, patch)
    message.value = 'Ändringarna sparade.'
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte uppdatera'
  }
}

const applyBulk = async () => {
  const patch: Record<string, unknown> = {}
  if (bulkChannel.value) patch.sales_channel = bulkChannel.value
  if (bulkImage.value) patch.image_source = bulkImage.value
  if (Object.keys(patch).length) await bulkPatch(patch)
}

const adjustPrices = async () => {
  if (!selected.value.size || bulkPercent.value == null) return
  actionError.value = ''

  try {
    const res = await $fetch<{ updated: { id: string, price_sek: number }[] }>(`/api/scan/batches/${route.params.id}/price-adjust`, {
      method: 'POST',
      body: { ids: [...selected.value], percent: Number(bulkPercent.value) }
    })
    const byId = new Map(items.value.map((i) => [i.id, i]))
    for (const u of res.updated) Object.assign(byId.get(u.id) ?? {}, { price_sek: u.price_sek, price_overridden: true })
    message.value = `${res.updated.length} priser justerade ${bulkPercent.value > 0 ? '+' : ''}${bulkPercent.value} %.`
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte justera priserna'
  }
}

// --- Publish: one card per request, strictly in sequence ---
const publishing = ref(false)
const progress = ref({ done: 0, total: 0, failed: 0, current: '' })

const publish = async (targets: ScanItem[]) => {
  const queue = targets.filter(canPublish)

  if (!queue.length) {
    message.value = 'Inget att publicera: korten måste ha pris och vara inställda för Shopify.'
    return
  }

  if (!confirm(`Publicera ${queue.length} kort i Shopify? De blir aktiva produkter och syns direkt i webbshoppen.`)) return

  publishing.value = true
  actionError.value = ''
  message.value = ''
  progress.value = { done: 0, total: queue.length, failed: 0, current: '' }

  for (const item of queue) {
    progress.value.current = title(item)

    try {
      await $fetch(`/api/scan/batches/${route.params.id}/publish`, { method: 'POST', body: { id: item.id } })
    } catch {
      progress.value.failed += 1
    }

    progress.value.done += 1
  }

  publishing.value = false
  applyBatch(await $fetch(`/api/scan/batches/${route.params.id}`))
  selected.value = new Set()
  message.value = `${progress.value.done - progress.value.failed} av ${progress.value.total} kort publicerade${progress.value.failed ? `, ${progress.value.failed} misslyckades (se felmeddelandena i listan)` : ''}.`
}

const publishSelected = () => publish(items.value.filter((i) => selected.value.has(i.id)))
const publishAll = () => publish(items.value)
const exportToPowertools = async () => {
  exporting.value = true
  actionError.value = ''
  message.value = ''

  try {
    const result = await runPowertools({ batchId: String(route.params.id) })
    if (!result.cancelled) message.value = result.message
    applyBatch(await $fetch(`/api/scan/batches/${route.params.id}`))
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte exportera'
  } finally {
    exporting.value = false
  }
}

const retryFailed = () => publish(items.value.filter((i) => i.publish_status === 'failed'))
</script>

<template>
  <div>
    <NuxtLink :to="`/skanning/priser/${route.params.id}`" class="mb-4 inline-block text-sm text-lyktan-mute hover:text-lyktan-ink">← Tillbaka till prissättningen</NuxtLink>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-[var(--bad)]">{{ loadError }}</p>

    <template v-else-if="batch">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-lyktan-ink">Shopify-utkast: {{ batch.name }}</h1>
          <p class="mt-1 max-w-2xl text-sm text-lyktan-mute">
            Granska innan något skickas. Varje kort blir en variant (skick × foil) på en produkt med kortets namn som titel; set, sällsynthet,
            nummer och språk läggs som metadata som webbshoppen läser. Skannad bild kopplas till varianten, saldot ökas med 1 per exemplar.
          </p>
        </div>
        <div v-if="canEditScan" class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn" :disabled="publishing || !selected.size" @click="publishSelected">Publicera valda ({{ selected.size }})</button>
          <button type="button" class="btn primary" :disabled="publishing || !counts.ready" @click="publishAll">Publicera alla ({{ counts.ready }})</button>
          <button type="button" class="btn" :disabled="exporting || publishing || !counts.cardmarket" @click="exportToPowertools">{{ exporting ? 'Exporterar…' : `Exportera till PowerTools (${counts.cardmarket})` }}</button>
          <button v-if="counts.failed" type="button" class="btn" :disabled="publishing" @click="retryFailed">Kör om misslyckade ({{ counts.failed }})</button>
        </div>
      </div>

      <p v-if="actionError" class="mb-3 text-sm text-[var(--bad)]" role="alert">{{ actionError }}</p>
      <p v-if="message" class="mb-3 text-sm text-lyktan-ink" aria-live="polite">{{ message }}</p>

      <div v-if="publishing" class="mb-4 rounded-2xl border border-[var(--line)] p-3" role="status">
        <p class="text-sm text-lyktan-ink">Publicerar {{ progress.done + 1 }} av {{ progress.total }}: {{ progress.current }}…</p>
        <div class="mt-2 h-1.5 overflow-hidden rounded bg-[var(--surface-2)]">
          <div class="h-full bg-[var(--ok)] transition-all" :style="{ width: `${(progress.done / progress.total) * 100}%` }" />
        </div>
        <p v-if="progress.failed" class="mt-1 text-[0.72rem] text-[var(--bad)]">{{ progress.failed }} misslyckade hittills</p>
      </div>

      <p class="mb-3 text-sm text-lyktan-mute">
        {{ counts.total }} kort · {{ counts.published }} publicerade · {{ counts.ready }} redo
        <span v-if="counts.noPrice" class="text-[var(--warn)]"> · {{ counts.noPrice }} saknar pris</span>
        <span v-if="counts.notShopify"> · {{ counts.notShopify }} inte för Shopify</span>
        <span v-if="counts.failed" class="text-[var(--bad)]"> · {{ counts.failed }} misslyckade</span>
      </p>

      <div v-if="canEditScan && selected.size" class="mb-3 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] p-3">
        <p class="text-sm font-medium text-lyktan-ink">{{ selected.size }} valda</p>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Kanal</span>
          <select v-model="bulkChannel" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
            <option value="">—</option>
            <option v-for="(label, key) in SALES_CHANNEL_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Bild</span>
          <select v-model="bulkImage" class="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
            <option value="">—</option>
            <option value="scan">Skannad</option>
            <option value="reference">Referensbild</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="!bulkChannel && !bulkImage" @click="applyBulk">Tillämpa</button>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Justera pris (%)</span>
          <input v-model.number="bulkPercent" type="number" step="1" placeholder="t.ex. -10" class="w-24 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
        </label>
        <button type="button" class="btn" :disabled="bulkPercent == null" @click="adjustPrices">Justera</button>
      </div>

      <p v-if="!items.length" class="text-sm text-lyktan-mute">Inga bekräftade kort i bunten.</p>

      <div v-else class="overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table class="w-full min-w-[1000px] text-sm">
          <thead>
            <tr class="border-b border-[var(--line)] text-left text-[0.72rem] text-lyktan-mute">
              <th class="w-8 p-2"><input type="checkbox" :checked="allSelected" aria-label="Markera alla" @change="toggleAll"></th>
              <th class="p-2">Kort</th>
              <th class="p-2">Skick</th>
              <th class="p-2">Språk</th>
              <th class="p-2 text-right">Pris (kr)</th>
              <th class="p-2">Kanal</th>
              <th class="p-2">Bild</th>
              <th class="p-2">Shopify</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" class="border-b border-[var(--line)] align-top last:border-0" :class="isPublished(item) ? 'opacity-70' : ''">
              <td class="p-2"><input type="checkbox" :checked="selected.has(item.id)" :disabled="isPublished(item)" :aria-label="`Markera ${title(item)}`" @change="toggle(item.id)"></td>
              <td class="p-2">
                <div class="flex items-center gap-2.5">
                  <img v-if="imageFor(item)" :src="imageFor(item)!" :alt="`Kort nr ${item.position}`" loading="lazy" class="h-14 w-10 shrink-0 rounded object-cover">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-lyktan-ink">{{ title(item) }}</p>
                    <p class="mono truncate text-[0.68rem] text-lyktan-mute">#{{ item.position }} · {{ subtitle(item) }}</p>
                    <p v-if="item.price_flags?.length" class="text-[0.68rem] text-[var(--warn)]">Avvikande pris, kontrollera</p>
                  </div>
                </div>
              </td>
              <td class="p-2">
                <div class="flex items-center gap-2">
                  <select
                    :value="item.condition"
                    class="rounded border border-[var(--line)] bg-transparent px-1 py-1 text-sm"
                    :disabled="!canEditScan || isPublished(item)"
                    :aria-label="`Skick för ${title(item)}`"
                    @change="changeCardProps(item, { condition: ($event.target as HTMLSelectElement).value as ScanCondition })"
                  >
                    <option v-for="c in SCAN_CONDITIONS" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <label class="flex items-center gap-1 text-[0.72rem] text-lyktan-mute">
                    <input type="checkbox" :checked="item.is_foil" :disabled="!canEditScan || isPublished(item)" @change="changeCardProps(item, { is_foil: ($event.target as HTMLInputElement).checked })"> foil
                  </label>
                </div>
                <p class="mt-0.5 text-[0.68rem] text-lyktan-mute">Visas som {{ CONDITION_SHOP[item.condition] }}{{ item.is_foil ? ' · foil' : '' }}</p>
              </td>
              <td class="p-2">
                <select
                  :value="item.language"
                  class="rounded border border-[var(--line)] bg-transparent px-1 py-1 text-sm"
                  :disabled="!canEditScan || isPublished(item)"
                  :aria-label="`Språk för ${title(item)}`"
                  @change="changeCardProps(item, { language: ($event.target as HTMLSelectElement).value })"
                >
                  <option v-for="(label, code) in SCAN_LANGUAGES" :key="code" :value="code">{{ label }}</option>
                </select>
              </td>
              <td class="p-2 text-right">
                <input
                  type="text"
                  inputmode="numeric"
                  :value="item.price_sek ?? ''"
                  :placeholder="item.price_sek == null ? 'saknas' : ''"
                  class="mono w-20 rounded border bg-transparent px-1.5 py-1 text-right text-sm"
                  :class="item.price_overridden ? 'border-[var(--focus)]' : 'border-[var(--line)]'"
                  :disabled="!canEditScan || isPublished(item)"
                  :aria-label="`Pris för ${title(item)}`"
                  @change="changePrice(item, ($event.target as HTMLInputElement).value)"
                >
              </td>
              <td class="p-2">
                <select
                  :value="item.sales_channel"
                  class="rounded border border-[var(--line)] bg-transparent px-1 py-1 text-sm"
                  :disabled="!canEditScan || isPublished(item)"
                  :aria-label="`Kanal för ${title(item)}`"
                  @change="patchItem(item, { sales_channel: ($event.target as HTMLSelectElement).value })"
                >
                  <option v-for="(label, key) in SALES_CHANNEL_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </td>
              <td class="p-2">
                <select
                  :value="item.image_source"
                  class="rounded border border-[var(--line)] bg-transparent px-1 py-1 text-sm"
                  :disabled="!canEditScan || isPublished(item)"
                  :aria-label="`Bild för ${title(item)}`"
                  @change="patchItem(item, { image_source: ($event.target as HTMLSelectElement).value })"
                >
                  <option value="scan">Skannad</option>
                  <option value="reference" :disabled="!item.matched_card?.image_url">Referens</option>
                </select>
              </td>
              <td class="p-2 text-[0.78rem]">
                <template v-if="isPublished(item)">
                  <a v-if="productUrl(item)" :href="productUrl(item)!" target="_blank" rel="noopener" class="text-[var(--ok)] hover:underline">✓ Publicerad</a>
                  <span v-else class="text-[var(--ok)]">✓ Publicerad</span>
                  <p class="mono text-[0.66rem] text-lyktan-mute">{{ item.shopify_sku }}</p>
                  <p v-if="item.publish_error" class="text-[0.68rem] text-[var(--warn)]">{{ item.publish_error }}</p>
                </template>
                <template v-else-if="item.publish_status === 'failed'">
                  <span class="text-[var(--bad)]">Misslyckades</span>
                  <p class="text-[0.68rem] text-[var(--bad)]">{{ item.publish_error }}</p>
                </template>
                <span v-else-if="problem(item)" class="text-[var(--warn)]">{{ problem(item) }}</span>
                <p v-if="item.exported_to_powertools_at" class="text-[0.7rem] text-lyktan-mute">Exporterad till PowerTools</p>
                <span v-else class="text-lyktan-mute">Redo</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
