<script setup lang="ts">
type CatalogItem = {
  id: string
  ss_code: string
  product_code: string | null
  description: string
  system: string | null
  race: string | null
  release_date: string | null
  price_retail_kr: number | null
  price_dealer_kr: number | null
}

const { canEditOrders } = usePermissions()

// --- Import ---
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importError = ref('')
const importResult = ref<{ imported: number } | null>(null)

const onFileSelected = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  importing.value = true
  importError.value = ''
  importResult.value = null

  try {
    const formData = new FormData()
    formData.append('file', file)

    importResult.value = await $fetch<{ imported: number }>('/api/gw-catalog/import', {
      method: 'POST',
      body: formData
    })

    await loadFilters()
    await loadItems()
  } catch (err: any) {
    importError.value = err?.data?.statusMessage || 'Kunde inte importera filen'
  } finally {
    importing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// --- Filters ---
const systems = ref<string[]>([])
const races = ref<string[]>([])
const selectedSystem = ref('')
const selectedRace = ref('')
const searchTerm = ref('')

const loadFilters = async () => {
  try {
    const res = await $fetch<{ systems: string[], races: string[] }>('/api/gw-catalog/filters', {
      query: selectedSystem.value ? { system: selectedSystem.value } : {}
    })
    systems.value = res.systems
    races.value = res.races
  } catch {
    // Non-fatal — search still works without filter dropdowns populated.
  }
}

watch(selectedSystem, () => {
  selectedRace.value = ''
  loadFilters()
})

onMounted(loadFilters)

// --- List ---
const items = ref<CatalogItem[]>([])
const total = ref(0)
const hasMore = ref(false)
const nextAfter = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const loadError = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | undefined

const loadItems = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ items: CatalogItem[], hasMore: boolean, nextAfter: number, total: number }>('/api/gw-catalog', {
      query: { q: searchTerm.value, system: selectedSystem.value, race: selectedRace.value }
    })
    items.value = res.items
    hasMore.value = res.hasMore
    nextAfter.value = res.nextAfter
    total.value = res.total
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta katalogen'
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  if (!hasMore.value || loadingMore.value) return

  loadingMore.value = true

  try {
    const res = await $fetch<{ items: CatalogItem[], hasMore: boolean, nextAfter: number, total: number }>('/api/gw-catalog', {
      query: { q: searchTerm.value, system: selectedSystem.value, race: selectedRace.value, after: nextAfter.value }
    })
    items.value = [...items.value, ...res.items]
    hasMore.value = res.hasMore
    nextAfter.value = res.nextAfter
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta fler rader'
  } finally {
    loadingMore.value = false
  }
}

onMounted(loadItems)
watch([selectedSystem, selectedRace], loadItems)
watch(searchTerm, () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(loadItems, 300)
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">GW-katalog</h1>

    <div v-if="canEditOrders" class="mb-8 rounded-2xl border border-black/8 bg-lyktan-paper p-6">
      <h2 class="mb-2 text-sm font-semibold text-lyktan-ink">Importera veckans lista</h2>
      <p class="mb-4 text-sm text-lyktan-mute">
        Ladda upp Excel-filen från länken i mailet från Games Workshop. Befintliga produkter (samma SS-kod) uppdateras, nya läggs till.
      </p>

      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.xls"
        class="text-sm"
        :disabled="importing"
        @change="onFileSelected"
      >

      <p v-if="importing" class="mt-3 text-sm text-lyktan-mute">Importerar…</p>
      <p v-else-if="importError" class="mt-3 text-sm text-red-600">{{ importError }}</p>
      <p v-else-if="importResult" class="mt-3 text-sm font-medium text-emerald-600">
        {{ importResult.imported }} produkter importerade.
      </p>
    </div>

    <div class="mb-4 grid gap-3 sm:grid-cols-3">
      <input
        v-model="searchTerm"
        type="search"
        placeholder="Sök på namn eller kod…"
        class="min-h-10 rounded-lg border border-black/15 px-3 text-sm sm:col-span-1"
      >
      <select v-model="selectedSystem" class="min-h-10 rounded-lg border border-black/15 px-3 text-sm">
        <option value="">Alla system</option>
        <option v-for="system in systems" :key="system" :value="system">{{ system }}</option>
      </select>
      <select v-model="selectedRace" class="min-h-10 rounded-lg border border-black/15 px-3 text-sm">
        <option value="">Alla kategorier</option>
        <option v-for="race in races" :key="race" :value="race">{{ race }}</option>
      </select>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!items.length" class="text-sm text-lyktan-mute">Inga produkter hittades. Importera listan ovan för att komma igång.</p>

    <template v-else>
      <p class="mb-2 text-[0.72rem] text-lyktan-mute">{{ total }} produkter</p>

      <div class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
        <table class="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
              <th class="px-4 py-3">Produkt</th>
              <th class="px-4 py-3">SS-kod</th>
              <th class="px-4 py-3">Pris (SKR)</th>
              <th class="px-4 py-3">Inköp (SKD)</th>
              <th class="px-4 py-3">Släpps</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" class="border-b border-black/6 last:border-0">
              <td class="px-4 py-3">
                <span class="font-medium text-lyktan-ink">{{ item.description }}</span>
                <div class="text-[0.72rem] text-lyktan-mute">{{ item.system }}<span v-if="item.race"> · {{ item.race }}</span></div>
              </td>
              <td class="px-4 py-3 text-lyktan-mute">{{ item.ss_code }}</td>
              <td class="px-4 py-3">{{ formatKr(item.price_retail_kr) }}</td>
              <td class="px-4 py-3">{{ formatKr(item.price_dealer_kr) }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ item.release_date || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="hasMore" class="mt-4 flex justify-center">
        <button
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? 'Hämtar…' : 'Visa fler' }}
        </button>
      </div>
    </template>
  </div>
</template>
