<script setup lang="ts">
type Collection = { id: string, title: string }
type ExistingImage = { id: string, url: string, altText: string | null }

const props = defineProps<{
  productId: string
  collections: Collection[]
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const warnings = ref<string[]>([])

const form = ref({
  title: '',
  description: '',
  priceKr: null as number | null,
  compareAtPriceKr: null as number | null,
  inventoryQuantity: 0,
  collectionIds: [] as string[],
  tags: '',
  status: 'ACTIVE' as 'ACTIVE' | 'DRAFT',
  releaseDate: ''
})

const existingImages = ref<ExistingImage[]>([])
const imagesToDelete = ref<Set<string>>(new Set())
const newImageFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const loadProduct = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ product: typeof form.value & { images: ExistingImage[] } }>(`/api/products/${props.productId}`)
    form.value = {
      title: res.product.title,
      description: res.product.description,
      priceKr: res.product.priceKr,
      compareAtPriceKr: res.product.compareAtPriceKr,
      inventoryQuantity: res.product.inventoryQuantity,
      collectionIds: res.product.collectionIds,
      tags: res.product.tags,
      status: res.product.status,
      releaseDate: res.product.releaseDate
    }
    existingImages.value = res.product.images
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta produkten'
  } finally {
    loading.value = false
  }
}

onMounted(loadProduct)

const toggleDeleteImage = (id: string) => {
  if (imagesToDelete.value.has(id)) {
    imagesToDelete.value.delete(id)
  } else {
    imagesToDelete.value.add(id)
  }
}

const onFilesSelected = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  newImageFiles.value = files ? Array.from(files) : []
}

const submit = async () => {
  saving.value = true
  saveError.value = ''
  warnings.value = []

  try {
    const formData = new FormData()
    formData.append('title', form.value.title.trim())
    formData.append('description', form.value.description.trim())
    formData.append('priceKr', String(form.value.priceKr ?? ''))
    formData.append('compareAtPriceKr', form.value.compareAtPriceKr != null ? String(form.value.compareAtPriceKr) : '')
    formData.append('inventoryQuantity', String(form.value.inventoryQuantity))
    formData.append('tags', form.value.tags.trim())
    formData.append('status', form.value.status)
    formData.append('releaseDate', form.value.releaseDate)
    for (const id of form.value.collectionIds) formData.append('collectionIds', id)
    for (const id of imagesToDelete.value) formData.append('deleteImageIds', id)
    for (const file of newImageFiles.value) formData.append('images', file)

    const res = await $fetch<{ warnings: string[] }>(`/api/products/${props.productId}`, {
      method: 'PATCH',
      body: formData
    })

    emit('updated')

    if (res.warnings.length) {
      warnings.value = res.warnings
    } else {
      emit('close')
    }
  } catch (err: any) {
    saveError.value = err?.data?.statusMessage || 'Kunde inte spara ändringarna'
  } finally {
    saving.value = false
  }
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
        <h1 class="text-lg font-semibold text-lyktan-ink">Redigera produkt</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 pt-4">
        <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>

        <form v-else id="edit-product-form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="submit">
          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Titel</span>
            <input v-model="form.title" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Beskrivning</span>
            <textarea v-model="form.description" rows="4" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt — en rad per stycke" />
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr)</span>
            <input v-model.number="form.priceKr" type="number" min="0" step="0.01" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Jämförelsepris (kr)</span>
            <input v-model.number="form.compareAtPriceKr" type="number" min="0" step="0.01" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt, för att visa rabatt">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Lagerantal</span>
            <input v-model.number="form.inventoryQuantity" type="number" min="0" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Taggar</span>
            <input v-model="form.tags" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="kommaseparerat, valfritt">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Releasedatum</span>
            <input v-model="form.releaseDate" type="date" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <div class="block sm:col-span-2">
            <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Kollektioner</span>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="collection in collections"
                :key="collection.id"
                class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition"
                :class="form.collectionIds.includes(collection.id) ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
              >
                <input v-model="form.collectionIds" type="checkbox" :value="collection.id" class="sr-only">
                {{ collection.title }}
              </label>
              <p v-if="!collections.length" class="text-sm text-lyktan-mute">Inga kollektioner hittades.</p>
            </div>
          </div>

          <div v-if="existingImages.length" class="block sm:col-span-2">
            <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Nuvarande bilder</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="image in existingImages"
                :key="image.id"
                type="button"
                class="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition"
                :class="imagesToDelete.has(image.id) ? 'border-red-300 opacity-40' : 'border-black/15'"
                :title="imagesToDelete.has(image.id) ? 'Ångra borttagning' : 'Ta bort bild'"
                @click="toggleDeleteImage(image.id)"
              >
                <img :src="image.url" :alt="image.altText || ''" class="h-full w-full object-cover">
                <span class="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition hover:opacity-100">
                  {{ imagesToDelete.has(image.id) ? '↺' : '✕' }}
                </span>
              </button>
            </div>
          </div>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Lägg till bilder</span>
            <input ref="fileInput" type="file" accept="image/*" multiple class="w-full text-sm" @change="onFilesSelected">
          </label>

          <div class="block">
            <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Status</span>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
                :class="form.status === 'ACTIVE' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
                @click="form.status = 'ACTIVE'"
              >
                Aktiv
              </button>
              <button
                type="button"
                class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
                :class="form.status === 'DRAFT' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
                @click="form.status = 'DRAFT'"
              >
                Utkast
              </button>
            </div>
          </div>
        </form>

        <p v-if="saveError" class="mt-3 text-sm text-red-600">{{ saveError }}</p>

        <div v-if="warnings.length" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p class="font-medium">Ändringarna sparades, men något behöver kompletteras i Shopify:</p>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
          </ul>
        </div>
      </div>

      <div class="flex items-center gap-3 border-t border-black/8 p-6 pt-4">
        <button
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="emit('close')"
        >
          {{ warnings.length ? 'Stäng' : 'Avbryt' }}
        </button>
        <button
          v-if="!loading && !loadError"
          type="submit"
          form="edit-product-form"
          :disabled="saving"
          class="ml-auto inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ saving ? 'Sparar…' : 'Spara' }}
        </button>
      </div>
    </div>
  </div>
</template>
