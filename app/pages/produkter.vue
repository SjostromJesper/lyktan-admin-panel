<script setup lang="ts">
type Product = {
  id: string
  title: string
  handle: string
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  totalInventory: number
  featuredImage: { url: string, altText: string | null } | null
  priceRangeV2: { minVariantPrice: { amount: string, currencyCode: string } }
  collections: { nodes: { title: string }[] }
}
type Collection = { id: string, title: string }

const { canEditProducts } = usePermissions()

const STATUS_LABELS: Record<Product['status'], string> = { ACTIVE: 'Aktiv', DRAFT: 'Utkast', ARCHIVED: 'Arkiverad' }

const products = ref<Product[]>([])
const pageInfo = ref<{ hasNextPage: boolean, endCursor: string | null }>({ hasNextPage: false, endCursor: null })
const loading = ref(true)
const loadingMore = ref(false)
const loadError = ref('')

const loadProducts = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ products: Product[], pageInfo: typeof pageInfo.value }>('/api/products')
    products.value = res.products
    pageInfo.value = res.pageInfo
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta produkter'
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  if (!pageInfo.value.hasNextPage || loadingMore.value) return

  loadingMore.value = true

  try {
    const res = await $fetch<{ products: Product[], pageInfo: typeof pageInfo.value }>('/api/products', {
      query: { after: pageInfo.value.endCursor }
    })
    products.value = [...products.value, ...res.products]
    pageInfo.value = res.pageInfo
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta fler produkter'
  } finally {
    loadingMore.value = false
  }
}

onMounted(loadProducts)

// --- Collections (for the checkbox picker) ---
const collections = ref<Collection[]>([])

const loadCollections = async () => {
  try {
    const res = await $fetch<{ collections: Collection[] }>('/api/products/collections')
    collections.value = res.collections
  } catch {
    // Non-fatal — the form still works without collection assignment.
  }
}

onMounted(loadCollections)

// --- Add product form ---
const showAddForm = ref(false)
const addSaving = ref(false)
const addError = ref('')
const addWarnings = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const newProduct = ref({
  title: '',
  description: '',
  priceKr: null as number | null,
  compareAtPriceKr: null as number | null,
  inventoryQuantity: 0,
  collectionIds: [] as string[],
  tags: '',
  status: 'ACTIVE' as 'ACTIVE' | 'DRAFT',
  images: [] as File[]
})

const onFilesSelected = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  newProduct.value.images = files ? Array.from(files) : []
}

const resetAddForm = () => {
  newProduct.value = {
    title: '',
    description: '',
    priceKr: null,
    compareAtPriceKr: null,
    inventoryQuantity: 0,
    collectionIds: [],
    tags: '',
    status: 'ACTIVE',
    images: []
  }
  if (fileInput.value) fileInput.value.value = ''
  addError.value = ''
}

const submitAdd = async () => {
  addSaving.value = true
  addError.value = ''
  addWarnings.value = []

  try {
    const formData = new FormData()
    formData.append('title', newProduct.value.title.trim())
    formData.append('description', newProduct.value.description.trim())
    formData.append('priceKr', String(newProduct.value.priceKr ?? ''))
    formData.append('compareAtPriceKr', newProduct.value.compareAtPriceKr != null ? String(newProduct.value.compareAtPriceKr) : '')
    formData.append('inventoryQuantity', String(newProduct.value.inventoryQuantity))
    formData.append('tags', newProduct.value.tags.trim())
    formData.append('status', newProduct.value.status)
    for (const id of newProduct.value.collectionIds) formData.append('collectionIds', id)
    for (const file of newProduct.value.images) formData.append('images', file)

    const res = await $fetch<{ product: { id: string, handle: string, adminUrl: string }, warnings: string[] }>('/api/products', {
      method: 'POST',
      body: formData
    })

    addWarnings.value = res.warnings
    resetAddForm()
    await loadProducts()
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || 'Kunde inte skapa produkten'
  } finally {
    addSaving.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Produkter</h1>

    <div v-if="canEditProducts" class="mb-8">
      <button
        v-if="!showAddForm"
        type="button"
        class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black"
        @click="showAddForm = true"
      >
        + Ny produkt
      </button>

      <form
        v-else
        class="rounded-2xl border border-black/8 bg-lyktan-paper p-6"
        @submit.prevent="submitAdd"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-lyktan-ink">Ny produkt</h2>
          <button type="button" class="text-sm text-lyktan-mute hover:text-lyktan-ink" @click="showAddForm = false">Avbryt</button>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Titel</span>
            <input v-model="newProduct.title" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Beskrivning</span>
            <textarea v-model="newProduct.description" rows="4" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt — en rad per stycke" />
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr)</span>
            <input v-model.number="newProduct.priceKr" type="number" min="0" step="0.01" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Jämförelsepris (kr)</span>
            <input v-model.number="newProduct.compareAtPriceKr" type="number" min="0" step="0.01" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt, för att visa rabatt">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Lagerantal</span>
            <input v-model.number="newProduct.inventoryQuantity" type="number" min="0" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Taggar</span>
            <input v-model="newProduct.tags" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="kommaseparerat, valfritt">
          </label>

          <div class="block sm:col-span-2">
            <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Kollektioner</span>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="collection in collections"
                :key="collection.id"
                class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition"
                :class="newProduct.collectionIds.includes(collection.id) ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
              >
                <input v-model="newProduct.collectionIds" type="checkbox" :value="collection.id" class="sr-only">
                {{ collection.title }}
              </label>
              <p v-if="!collections.length" class="text-sm text-lyktan-mute">Inga kollektioner hittades.</p>
            </div>
          </div>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Bilder</span>
            <input ref="fileInput" type="file" accept="image/*" multiple class="w-full text-sm" @change="onFilesSelected">
          </label>

          <div class="block">
            <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Status</span>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
                :class="newProduct.status === 'ACTIVE' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
                @click="newProduct.status = 'ACTIVE'"
              >
                Aktiv
              </button>
              <button
                type="button"
                class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
                :class="newProduct.status === 'DRAFT' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
                @click="newProduct.status = 'DRAFT'"
              >
                Utkast
              </button>
            </div>
          </div>
        </div>

        <p v-if="addError" class="mt-3 text-sm text-red-600">{{ addError }}</p>

        <button
          type="submit"
          :disabled="addSaving"
          class="mt-4 inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ addSaving ? 'Skapar…' : 'Skapa produkt' }}
        </button>
      </form>

      <div v-if="addWarnings.length" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p class="font-medium">Produkten skapades, men något behöver kompletteras i Shopify:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="warning in addWarnings" :key="warning">{{ warning }}</li>
        </ul>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!products.length" class="text-sm text-lyktan-mute">Inga produkter ännu.</p>

    <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
      <table class="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
            <th class="px-4 py-3">Produkt</th>
            <th class="px-4 py-3">Kollektioner</th>
            <th class="px-4 py-3">Pris</th>
            <th class="px-4 py-3">Lager</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="product in products" :key="product.id" class="border-b border-black/6 last:border-0">
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-lyktan-surface">
                  <img v-if="product.featuredImage?.url" :src="product.featuredImage.url" :alt="product.featuredImage.altText || product.title" class="h-full w-full object-contain">
                </div>
                <span class="font-medium text-lyktan-ink">{{ product.title }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-lyktan-mute">{{ product.collections.nodes.map(c => c.title).join(', ') || '—' }}</td>
            <td class="px-4 py-3">{{ formatKr(Number(product.priceRangeV2.minVariantPrice.amount)) }}</td>
            <td class="px-4 py-3">{{ product.totalInventory }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                :class="product.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-black/[0.04] text-lyktan-mute'"
              >
                {{ STATUS_LABELS[product.status] }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && pageInfo.hasNextPage" class="mt-4 flex justify-center">
      <button
        type="button"
        class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? 'Hämtar…' : 'Visa fler' }}
      </button>
    </div>
  </div>
</template>
