<script setup lang="ts">
type Table = { id: string; name: string; kind: 'bord' | 'rum'; active: boolean }

type OneOffEvent = {
  id: string
  name: string
  event_date: string
  start_time: string
  end_time: string
  table_ids: string[]
  active: boolean
  created_at: string
}

const props = defineProps<{ event: OneOffEvent; tables: Table[] }>()
const emit = defineEmits<{
  close: []
  updated: [event: OneOffEvent]
  deleted: [id: string]
}>()

const { canEditBookings } = usePermissions()

const item = ref<OneOffEvent>({ ...props.event })

watch(() => props.event, (e) => {
  item.value = { ...e }
})

const editDraft = ref({
  name: '',
  eventDate: '',
  startTime: '10:00',
  endTime: '17:00',
  tableIds: [] as string[],
  active: true
})

watch(item, (e) => {
  editDraft.value = {
    name: e.name,
    eventDate: e.event_date,
    startTime: e.start_time.slice(0, 5),
    endTime: e.end_time.slice(0, 5),
    tableIds: [...e.table_ids],
    active: e.active
  }
}, { immediate: true })

const toggleTable = (id: string) => {
  const idx = editDraft.value.tableIds.indexOf(id)
  if (idx === -1) editDraft.value.tableIds.push(id)
  else editDraft.value.tableIds.splice(idx, 1)
}

const saving = ref(false)
const error = ref('')

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const res = await $fetch<{ oneOffEvent: OneOffEvent }>(`/api/one-off-events/${item.value.id}`, {
      method: 'PATCH',
      body: editDraft.value
    })
    item.value = res.oneOffEvent
    emit('updated', res.oneOffEvent)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte spara ändringar'
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)

const deleteEvent = async () => {
  if (!confirm(`Ta bort "${item.value.name}"?`)) return

  deleting.value = true

  try {
    await $fetch(`/api/one-off-events/${item.value.id}`, { method: 'DELETE' })
    emit('deleted', item.value.id)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte ta bort eventet'
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
    <div class="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-lyktan-ink">{{ item.name }}</h1>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <template v-if="canEditBookings">
        <div class="space-y-4">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
            <input v-model="editDraft.name" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Datum</span>
            <input v-model="editDraft.eventDate" type="date" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <div class="grid grid-cols-2 gap-4">
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Start</span>
              <input v-model="editDraft.startTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Slut</span>
              <input v-model="editDraft.endTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>
          </div>

          <div>
            <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Bord</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="t in tables"
                :key="t.id"
                type="button"
                class="rounded-full border px-3 py-1 text-sm font-medium transition"
                :class="editDraft.tableIds.includes(t.id) ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
                @click="toggleTable(t.id)"
              >
                {{ t.name }}
              </button>
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm text-lyktan-mute">
            <input v-model="editDraft.active" type="checkbox">
            Aktiv
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
            @click="deleteEvent"
          >
            Ta bort
          </button>
        </div>
      </template>

      <dl v-else class="space-y-3 text-sm">
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Datum & tid</dt>
          <dd class="text-lyktan-ink">{{ item.event_date }} {{ item.start_time.slice(0, 5) }}–{{ item.end_time.slice(0, 5) }}</dd>
        </div>
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Bord</dt>
          <dd class="text-lyktan-ink">{{ tables.filter((t) => item.table_ids.includes(t.id)).map((t) => t.name).join(', ') }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
