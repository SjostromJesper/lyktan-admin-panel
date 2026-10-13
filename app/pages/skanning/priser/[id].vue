<script setup lang="ts">
import { PRICE_FLAG_LABELS, SCAN_CONDITIONS } from '~/types/scan'
import type { ScanCondition, ScanItem, ScanSettings } from '~/types/scan'

type Batch = { id: string, name: string, note: string | null, status: string, purchase_percent: number | null }

const route = useRoute()
const { canEditScan } = usePermissions()

const batch = ref<Batch | null>(null)
const items = ref<ScanItem[]>([])
const settings = ref<ScanSettings | null>(null)
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const message = ref('')
const onlyFlagged = ref(false)
const selected = ref<Set<string>>(new Set())

const load = async () => {
  try {
    const [b, s] = await Promise.all([
      $fetch<{ batch: Batch, items: ScanItem[] }>(`/api/scan/batches/${route.params.id}`),
      $fetch<{ settings: ScanSettings }>('/api/scan/settings')
    ])
    batch.value = b.batch
    items.value = b.items.filter((i) => i.status === 'confirmed')
    settings.value = s.settings
    purchaseInput.value = b.batch.purchase_percent ?? s.settings.purchase_percent
    draft.value = draftFrom(s.settings)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta bunten'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// --- Display helpers ---
const sek = (value: number) => `${Math.round(value).toLocaleString('sv-SE')} kr`
const eur = (value: number | null) => (value == null ? '–' : `${Number(value).toFixed(2)} €`)

const title = (item: ScanItem) => item.matched_card?.name ?? item.manual_name ?? '—'
const subtitle = (item: ScanItem) =>
  item.matched_card
    ? `${item.matched_card.set_name} · ${item.matched_card.set_code} ${item.matched_card.collector_number}`
    : [item.manual_set_name, item.manual_collector_number].filter(Boolean).join(' · ')

const visible = computed(() => (onlyFlagged.value ? items.value.filter((i) => i.price_flags?.length) : items.value))

const totals = computed(() => {
  const priced = items.value.filter((i) => i.price_sek != null)
  return {
    count: items.value.length,
    priced: priced.length,
    missing: items.value.length - priced.length,
    value: priced.reduce((sum, i) => sum + (i.price_sek ?? 0), 0),
    flagged: items.value.filter((i) => i.price_flags?.length).length
  }
})

// --- Purchase offer ---
const purchaseInput = ref(50)
const offer = computed(() => Math.round(totals.value.value * (Number(purchaseInput.value) || 0) / 100))

const savePurchasePercent = async () => {
  if (!batch.value || !canEditScan.value) return
  actionError.value = ''

  try {
    await $fetch(`/api/scan/batches/${batch.value.id}`, { method: 'PATCH', body: { purchase_percent: Number(purchaseInput.value) } })
    batch.value.purchase_percent = Number(purchaseInput.value)
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte spara procenten'
  }
}

// --- Pricing actions ---
const pricing = ref(false)

const applyServerPrices = async () => {
  const res = await $fetch<{ batch: Batch, items: ScanItem[] }>(`/api/scan/batches/${route.params.id}`)
  batch.value = res.batch
  items.value = res.items.filter((i) => i.status === 'confirmed')
}

const fetchPrices = async (opts: { reset?: boolean, ids?: string[] } = {}) => {
  pricing.value = true
  actionError.value = ''
  message.value = ''

  try {
    const res = await $fetch<{ priced: number, no_price: number, skippedManualPrice: number }>(`/api/scan/batches/${route.params.id}/price`, { method: 'POST', body: opts })
    await applyServerPrices()
    message.value = `${res.priced} kort prissatta${res.no_price ? `, ${res.no_price} saknar Cardmarket-pris` : ''}${res.skippedManualPrice ? `, ${res.skippedManualPrice} har manuellt pris (orörda)` : ''}.`
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte hämta priser'
  } finally {
    pricing.value = false
  }
}

const resetAllPrices = () => {
  if (confirm('Räkna om alla priser och skriv över manuellt satta?')) fetchPrices({ reset: true })
}

// --- Per-item edits ---
const patchItem = async (item: ScanItem, patch: Record<string, unknown>) => {
  actionError.value = ''

  try {
    await $fetch(`/api/scan/items/${item.id}`, { method: 'PATCH', body: patch })
    return true
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte spara'
    return false
  }
}

const changeCardProps = async (item: ScanItem, patch: { condition?: ScanCondition, is_foil?: boolean }) => {
  if (!(await patchItem(item, patch))) return
  Object.assign(item, patch)
  if (!item.price_overridden) await fetchPrices({ ids: [item.id] })
}

const setPrice = async (item: ScanItem, raw: string) => {
  const text = raw.trim()

  if (text === '') {
    if (await patchItem(item, { price_sek: null })) {
      item.price_overridden = false
      await fetchPrices({ ids: [item.id] })
    }
    return
  }

  const price = Math.round(Number(text.replace(',', '.')))

  if (!Number.isFinite(price) || price < 0) {
    actionError.value = 'Ange priset i hela kronor'
    return
  }

  if (price === item.price_sek) return

  if (await patchItem(item, { price_sek: price })) {
    item.price_sek = price
    item.price_overridden = true
  }
}

// --- Selection + bulk adjust ---
const toggle = (id: string) => {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const allVisibleSelected = computed(() => visible.value.length > 0 && visible.value.every((i) => selected.value.has(i.id)))
const toggleAll = () => {
  selected.value = allVisibleSelected.value ? new Set() : new Set(visible.value.map((i) => i.id))
}

const adjustPercent = ref<number | null>(null)

const adjustSelected = async () => {
  if (!selected.value.size || adjustPercent.value == null) return
  actionError.value = ''

  try {
    const res = await $fetch<{ updated: { id: string, price_sek: number }[] }>(`/api/scan/batches/${route.params.id}/price-adjust`, {
      method: 'POST',
      body: { ids: [...selected.value], percent: Number(adjustPercent.value) }
    })
    const byId = new Map(items.value.map((i) => [i.id, i]))
    for (const u of res.updated) {
      const item = byId.get(u.id)
      if (item) Object.assign(item, { price_sek: u.price_sek, price_overridden: true })
    }
    message.value = `${res.updated.length} priser justerade ${adjustPercent.value > 0 ? '+' : ''}${adjustPercent.value} %.`
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte justera priserna'
  }
}

// --- Settings ---
const draftFrom = (s: ScanSettings) => ({ ...s, condition_factors: { ...s.condition_factors }, cardmarket_factors: { ...s.cardmarket_factors } })
const draft = ref<ScanSettings | null>(null)
const savingSettings = ref(false)

const saveSettings = async () => {
  if (!draft.value) return
  savingSettings.value = true
  actionError.value = ''

  try {
    const d = draft.value
    const res = await $fetch<{ settings: ScanSettings }>('/api/scan/settings', {
      method: 'PUT',
      body: {
        eur_sek: d.eur_sek,
        eur_sek_auto: d.eur_sek_auto,
        rounding: d.rounding,
        min_price_sek: d.min_price_sek,
        flag_high_price_sek: d.flag_high_price_sek,
        flag_trend_low_ratio: d.flag_trend_low_ratio,
        purchase_percent: d.purchase_percent,
        condition_factors: d.condition_factors,
        cardmarket_factors: d.cardmarket_factors
      }
    })
    settings.value = res.settings
    draft.value = draftFrom(res.settings)
    if (batch.value?.purchase_percent == null) purchaseInput.value = res.settings.purchase_percent
    message.value = 'Inställningarna sparade. Klicka "Hämta priser" för att räkna om bunten.'
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage || 'Kunde inte spara inställningarna'
  } finally {
    savingSettings.value = false
  }
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : 'aldrig')
</script>

<template>
  <div>
    <NuxtLink :to="`/skanning/${route.params.id}`" class="mb-4 inline-block text-sm text-lyktan-mute hover:text-lyktan-ink">← Tillbaka till granskningen</NuxtLink>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-[var(--bad)]">{{ loadError }}</p>

    <template v-else-if="batch && settings && draft">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-lyktan-ink">Prissättning: {{ batch.name }}</h1>
          <p class="mt-1 text-sm text-lyktan-mute">
            Cardmarkets trendpris (foil-trend för foil) × skickfaktor × {{ settings.eur_sek.toFixed(2) }} kr/€.
            Prisguiden uppdaterades {{ formatDate(settings.prices_updated_at) }}.
          </p>
        </div>
        <div v-if="canEditScan" class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn" :disabled="pricing" @click="fetchPrices()">{{ pricing ? 'Hämtar…' : 'Hämta priser' }}</button>
          <NuxtLink :to="`/skanning/utkast/${batch.id}`" class="btn primary">Vidare till Shopify-utkast</NuxtLink>
          <button type="button" class="text-sm text-lyktan-mute hover:text-lyktan-ink hover:underline" :disabled="pricing" @click="resetAllPrices">Räkna om alla (även manuella)</button>
        </div>
      </div>

      <p v-if="actionError" class="mb-3 text-sm text-[var(--bad)]" role="alert">{{ actionError }}</p>
      <p v-if="message" class="mb-3 text-sm text-lyktan-ink" aria-live="polite">{{ message }}</p>

      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl border border-[var(--line)] p-4">
          <p class="text-[0.72rem] text-lyktan-mute">Kort i bunten</p>
          <p class="mt-1 text-2xl font-semibold text-lyktan-ink">{{ totals.count }}</p>
          <p v-if="totals.missing" class="mt-1 text-[0.72rem] text-[var(--warn)]">{{ totals.missing }} utan pris</p>
        </div>
        <div class="rounded-2xl border border-[var(--line)] p-4">
          <p class="text-[0.72rem] text-lyktan-mute">Totalt försäljningsvärde</p>
          <p class="mt-1 text-2xl font-semibold text-lyktan-ink">{{ sek(totals.value) }}</p>
        </div>
        <div class="rounded-2xl border border-[var(--line)] p-4">
          <p class="text-[0.72rem] text-lyktan-mute">Förslag på inköpspris</p>
          <p class="mt-1 text-2xl font-semibold text-lyktan-ink">{{ sek(offer) }}</p>
          <label class="mt-1 flex items-center gap-1.5 text-[0.72rem] text-lyktan-mute">
            <input
              v-model.number="purchaseInput"
              type="number"
              min="0"
              max="100"
              step="1"
              class="w-16 rounded border border-[var(--line)] bg-transparent px-1.5 py-0.5 text-sm"
              :disabled="!canEditScan"
              @change="savePurchasePercent"
            >
            % av försäljningsvärdet
          </label>
        </div>
        <div class="rounded-2xl border border-[var(--line)] p-4">
          <p class="text-[0.72rem] text-lyktan-mute">Avvikelser att kolla</p>
          <p class="mt-1 text-2xl font-semibold" :class="totals.flagged ? 'text-[var(--warn)]' : 'text-lyktan-ink'">{{ totals.flagged }}</p>
          <label class="mt-1 flex items-center gap-1.5 text-[0.72rem] text-lyktan-mute"><input v-model="onlyFlagged" type="checkbox"> Visa bara dessa</label>
        </div>
      </div>

      <details class="mb-5 rounded-2xl border border-[var(--line)] p-4">
        <summary class="cursor-pointer text-sm font-medium text-lyktan-ink">Prisinställningar</summary>
        <form class="mt-4 space-y-4" @submit.prevent="saveSettings">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label class="block">
              <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Växelkurs (kr per €)</span>
              <input v-model.number="draft.eur_sek" type="number" step="0.01" min="1" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan || draft.eur_sek_auto">
              <span class="mt-1 flex items-center gap-1.5 text-[0.7rem] text-lyktan-mute">
                <input v-model="draft.eur_sek_auto" type="checkbox" :disabled="!canEditScan"> Hämta dagligen (ECB), senast {{ formatDate(settings.eur_sek_updated_at) }}
              </span>
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Avrundning</span>
              <select v-model="draft.rounding" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
                <option value="ceil">Uppåt till hela kronor</option>
                <option value="ceil5">Uppåt till närmaste 5 kr</option>
                <option value="x9">Uppåt till tal som slutar på 9</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Minimipris (kr)</span>
              <input v-model.number="draft.min_price_sek" type="number" min="0" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Standard för inköpserbjudande (%)</span>
              <input v-model.number="draft.purchase_percent" type="number" min="0" max="100" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Flagga pris över (kr)</span>
              <input v-model.number="draft.flag_high_price_sek" type="number" min="1" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Flagga när trend är mer än × low</span>
              <input v-model.number="draft.flag_trend_low_ratio" type="number" step="0.5" min="1" class="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
            </label>
          </div>

          <div>
            <p class="mb-1 text-[0.7rem] text-lyktan-mute">Faktor på trendpriset per skick (NM = 1)</p>
            <div class="flex flex-wrap gap-3">
              <label v-for="c in SCAN_CONDITIONS" :key="c" class="block">
                <span class="mono mb-1 block text-[0.7rem] text-lyktan-mute">{{ c }}</span>
                <input v-model.number="draft.condition_factors[c]" type="number" step="0.05" min="0" max="2" class="w-20 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
              </label>
            </div>
          </div>

          <div>
            <p class="mb-1 text-[0.7rem] text-lyktan-mute">PowerTools/Cardmarket: faktor på Cardmarkets trendpris per skick (priset exporteras i EUR, inte omräknat från kronpriset)</p>
            <div class="flex flex-wrap gap-3">
              <label v-for="c in SCAN_CONDITIONS" :key="c" class="block">
                <span class="mono mb-1 block text-[0.7rem] text-lyktan-mute">{{ c }}</span>
                <input v-model.number="draft.cardmarket_factors[c]" type="number" step="0.05" min="0" max="2" class="w-20 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm" :disabled="!canEditScan">
              </label>
            </div>
          </div>

          <button v-if="canEditScan" type="submit" class="btn" :disabled="savingSettings">{{ savingSettings ? 'Sparar…' : 'Spara inställningar' }}</button>
        </form>
      </details>

      <div v-if="canEditScan && selected.size" class="mb-3 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] p-3">
        <p class="text-sm font-medium text-lyktan-ink">{{ selected.size }} valda</p>
        <label class="block">
          <span class="mb-1 block text-[0.7rem] text-lyktan-mute">Justera pris med (%)</span>
          <input v-model.number="adjustPercent" type="number" step="1" placeholder="t.ex. -10" class="w-28 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm">
        </label>
        <button type="button" class="btn" :disabled="adjustPercent == null" @click="adjustSelected">Justera</button>
      </div>

      <p v-if="!items.length" class="text-sm text-lyktan-mute">Inga bekräftade kort i bunten.</p>

      <div v-else class="overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table class="w-full min-w-[860px] text-sm">
          <thead>
            <tr class="border-b border-[var(--line)] text-left text-[0.72rem] text-lyktan-mute">
              <th class="w-8 p-2"><input type="checkbox" :checked="allVisibleSelected" aria-label="Markera alla" @change="toggleAll"></th>
              <th class="p-2">Kort</th>
              <th class="p-2">Skick</th>
              <th class="p-2 text-right">Trend</th>
              <th class="p-2 text-right">Low</th>
              <th class="p-2 text-right">Snitt 30 d</th>
              <th class="p-2 text-right">Pris (kr)</th>
              <th class="p-2">Flaggor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visible" :key="item.id" class="border-b border-[var(--line)] last:border-0" :class="item.price_flags?.length ? 'bg-[var(--warn)]/5' : ''">
              <td class="p-2"><input type="checkbox" :checked="selected.has(item.id)" :aria-label="`Markera ${title(item)}`" @change="toggle(item.id)"></td>
              <td class="p-2">
                <div class="flex items-center gap-2.5">
                  <img v-if="item.image_url" :src="item.image_url" :alt="`Kort nr ${item.position}`" loading="lazy" class="h-12 w-[34px] shrink-0 rounded object-cover">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-lyktan-ink">{{ title(item) }}</p>
                    <p class="mono truncate text-[0.68rem] text-lyktan-mute">#{{ item.position }} · {{ subtitle(item) }}</p>
                  </div>
                </div>
              </td>
              <td class="p-2">
                <div class="flex items-center gap-2">
                  <select
                    :value="item.condition"
                    class="rounded border border-[var(--line)] bg-transparent px-1 py-1 text-sm"
                    :disabled="!canEditScan"
                    :aria-label="`Skick för ${title(item)}`"
                    @change="changeCardProps(item, { condition: ($event.target as HTMLSelectElement).value as ScanCondition })"
                  >
                    <option v-for="c in SCAN_CONDITIONS" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <label class="flex items-center gap-1 text-[0.72rem] text-lyktan-mute">
                    <input type="checkbox" :checked="item.is_foil" :disabled="!canEditScan" @change="changeCardProps(item, { is_foil: ($event.target as HTMLInputElement).checked })"> foil
                  </label>
                </div>
              </td>
              <td class="mono p-2 text-right">{{ eur(item.price_trend_eur) }}</td>
              <td class="mono p-2 text-right">{{ eur(item.price_low_eur) }}</td>
              <td class="mono p-2 text-right">{{ eur(item.price_avg30_eur) }}</td>
              <td class="p-2 text-right">
                <input
                  type="text"
                  inputmode="numeric"
                  :value="item.price_sek ?? ''"
                  :placeholder="item.price_sek == null ? 'sätt pris' : ''"
                  class="mono w-20 rounded border bg-transparent px-1.5 py-1 text-right text-sm"
                  :class="item.price_overridden ? 'border-[var(--focus)]' : 'border-[var(--line)]'"
                  :disabled="!canEditScan"
                  :aria-label="`Pris för ${title(item)}`"
                  :title="item.price_overridden ? 'Manuellt pris — töm fältet för att räkna om' : ''"
                  @change="setPrice(item, ($event.target as HTMLInputElement).value)"
                >
              </td>
              <td class="p-2">
                <span v-for="flag in item.price_flags" :key="flag" class="mr-1 inline-block rounded bg-[var(--warn)]/15 px-1.5 py-0.5 text-[0.68rem] text-[var(--warn)]">{{ PRICE_FLAG_LABELS[flag] ?? flag }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
