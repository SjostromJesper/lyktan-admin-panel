<script setup lang="ts">
type CatalogItem = {
  id: string
  ss_code: string
  product_code: string | null
  description: string
  system: string | null
  race: string | null
  price_retail_kr: number | null
  price_dealer_kr: number | null
}

const emit = defineEmits<{
  close: []
  select: [item: CatalogItem]
}>()

const items = ref<CatalogItem[]>([])
const loading = ref(true)
const loadError = ref('')
const searchTerm = ref('')
const selectedId = ref<string | null>(null)
const showUploadModal = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | undefined

const loadItems = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ items: CatalogItem[] }>('/api/gw-catalog', { query: { q: searchTerm.value } })
    items.value = res.items
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta katalogen'
  } finally {
    loading.value = false
  }
}

onMounted(loadItems)
watch(searchTerm, () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(loadItems, 300)
})

const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)

const confirmSelection = () => {
  if (!selectedItem.value) return
  emit('select', selectedItem.value)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-lyktan-paper shadow-xl">
      <div class="flex items-center justify-between border-b border-black/8 p-6 pb-4">
        <h1 class="text-lg font-semibold text-lyktan-ink">Sök i GW-katalogen</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <div class="flex items-center gap-3 border-b border-black/8 p-4">
        <input
          v-model="searchTerm"
          type="search"
          autofocus
          placeholder="Sök på namn eller kod…"
          class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
        >
        <button
          type="button"
          class="shrink-0 rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showUploadModal = true"
        >
          Uppdatera
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <p v-if="loading" class="p-6 text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="loadError" class="p-6 text-sm text-red-600">{{ loadError }}</p>
        <p v-else-if="!items.length" class="p-6 text-sm text-lyktan-mute">
          Inga produkter hittades. Klicka <button type="button" class="text-lyktan-accent hover:underline" @click="showUploadModal = true">Uppdatera</button> om katalogen är tom.
        </p>

        <ul v-else class="divide-y divide-black/6">
          <li v-for="item in items" :key="item.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition"
              :class="selectedId === item.id ? 'bg-lyktan-ink/[0.06]' : 'hover:bg-black/[0.02]'"
              @click="selectedId = item.id"
            >
              <span class="min-w-0">
                <span class="block truncate font-medium text-lyktan-ink">{{ item.description }}</span>
                <span class="mt-0.5 block text-[0.8rem] text-lyktan-mute">
                  {{ item.ss_code }}<span v-if="item.system"> · {{ item.system }}</span>
                </span>
              </span>
              <span class="shrink-0 text-sm text-lyktan-ink">{{ formatKr(item.price_retail_kr) }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="flex items-center gap-3 border-t border-black/8 p-6 pt-4">
        <button
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="emit('close')"
        >
          Avbryt
        </button>
        <button
          type="button"
          :disabled="!selectedItem"
          class="ml-auto inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          @click="confirmSelection"
        >
          Välj
        </button>
      </div>
    </div>

    <GwCatalogUploadModal
      v-if="showUploadModal"
      @close="showUploadModal = false"
      @imported="loadItems"
    />
  </div>
</template>
