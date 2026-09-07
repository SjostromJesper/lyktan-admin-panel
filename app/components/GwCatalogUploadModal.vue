<script setup lang="ts">
const emit = defineEmits<{
  close: []
  imported: []
}>()

const uploading = ref(false)
const error = ref('')
const importedCount = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const onFileSelected = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  uploading.value = true
  error.value = ''
  importedCount.value = null

  try {
    const formData = new FormData()
    formData.append('file', file)

    const res = await $fetch<{ imported: number }>('/api/gw-catalog/import', {
      method: 'POST',
      body: formData
    })

    importedCount.value = res.imported
    emit('imported')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte importera filen'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const tryAgain = () => {
  error.value = ''
  importedCount.value = null
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div class="w-full max-w-sm rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-5 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">Uppdatera produktdata</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <template v-if="importedCount !== null">
        <p class="text-sm font-medium text-emerald-600">Produktdata uppdaterades!</p>
        <p class="mt-1 text-sm text-lyktan-mute">{{ importedCount }} produkter importerade.</p>
        <button
          type="button"
          class="mt-5 inline-flex min-h-9 w-full items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black"
          @click="emit('close')"
        >
          Klar
        </button>
      </template>

      <template v-else-if="error">
        <p class="text-sm font-medium text-red-600">Uppdateringen misslyckades</p>
        <p class="mt-1 text-sm text-lyktan-mute">{{ error }}</p>
        <div class="mt-5 flex gap-3">
          <button
            type="button"
            class="inline-flex min-h-9 flex-1 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
            @click="emit('close')"
          >
            Stäng
          </button>
          <button
            type="button"
            class="inline-flex min-h-9 flex-1 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black"
            @click="tryAgain"
          >
            Försök igen
          </button>
        </div>
      </template>

      <template v-else>
        <p class="mb-4 text-sm text-lyktan-mute">
          Ladda upp Excel-filen från länken i mailet från Games Workshop. Befintliga produkter (samma SS-kod) uppdateras, nya läggs till.
        </p>
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls"
          class="text-sm"
          :disabled="uploading"
          @change="onFileSelected"
        >
        <p v-if="uploading" class="mt-3 text-sm text-lyktan-mute">Importerar…</p>
      </template>
    </div>
  </div>
</template>
