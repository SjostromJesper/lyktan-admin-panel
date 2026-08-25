<script setup lang="ts">
type Table = {
  id: string
  name: string
  kind: 'bord' | 'rum'
  capacity: number
  price_kr: number | null
  active: boolean
  created_at: string
}

const props = defineProps<{ table: Table }>()
const emit = defineEmits<{
  close: []
  updated: [table: Table]
  deleted: [id: string]
}>()

const { canEditBookings } = usePermissions()

const table = ref<Table>({ ...props.table })

watch(() => props.table, (t) => {
  table.value = { ...t }
})

const editDraft = ref({ name: '', kind: 'bord' as Table['kind'], capacity: 1, priceKr: null as number | null, active: true })

watch(table, (t) => {
  editDraft.value = { name: t.name, kind: t.kind, capacity: t.capacity, priceKr: t.price_kr, active: t.active }
}, { immediate: true })

const saving = ref(false)
const error = ref('')

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const res = await $fetch<{ table: Table }>(`/api/tables/${table.value.id}`, {
      method: 'PATCH',
      body: editDraft.value
    })
    table.value = res.table
    emit('updated', res.table)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte spara ändringar'
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)

const deleteTable = async () => {
  if (!confirm(`Ta bort ${table.value.name}?`)) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/tables/${table.value.id}`, { method: 'DELETE' })
    emit('deleted', table.value.id)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte ta bort bordet'
    deleting.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div class="w-full max-w-sm rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">{{ table.name }}</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <template v-if="canEditBookings">
        <div class="space-y-4">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
            <input v-model="editDraft.name" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Typ</span>
            <select v-model="editDraft.kind" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
              <option value="bord">Bord</option>
              <option value="rum">Rum</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kapacitet (antal personer)</span>
            <input v-model.number="editDraft.capacity" type="number" min="1" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr, valfritt)</span>
            <input v-model.number="editDraft.priceKr" type="number" min="0" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="flex items-center gap-2 text-sm text-lyktan-mute">
            <input v-model="editDraft.active" type="checkbox">
            Aktiv (kan bokas)
          </label>
        </div>

        <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>

        <div class="mt-5 flex items-center gap-3">
          <button
            type="button"
            :disabled="saving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            @click="save"
          >
            {{ saving ? 'Sparar…' : 'Spara ändringar' }}
          </button>

          <button
            type="button"
            :disabled="deleting"
            class="ml-auto text-sm text-red-600 hover:underline disabled:opacity-40"
            @click="deleteTable"
          >
            Ta bort
          </button>
        </div>
      </template>

      <dl v-else class="space-y-3 text-sm">
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Typ</dt>
          <dd class="text-lyktan-ink">{{ table.kind === 'rum' ? 'Rum' : 'Bord' }}</dd>
        </div>
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Kapacitet</dt>
          <dd class="text-lyktan-ink">{{ table.capacity }} personer</dd>
        </div>
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Status</dt>
          <dd class="text-lyktan-ink">{{ table.active ? 'Aktiv' : 'Inaktiv' }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
