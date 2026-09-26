<script setup lang="ts">
type EventItem = {
  id: string
  title: string
  handle: string
  status: string
  imageUrl: string | null
  dateAndTime: string | null
}

const view = ref<'aktiva' | 'historik'>('aktiva')
const events = ref<EventItem[]>([])
const loading = ref(true)
const loadError = ref('')

const loadEvents = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ events: EventItem[] }>('/api/events')
    events.value = res.events
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta event'
  } finally {
    loading.value = false
  }
}

onMounted(loadEvents)

const now = new Date()

// Older events often predate the date_and_time metafield being set up —
// fall back to Shopify's own product status (archived ⇒ treat as past)
// rather than defaulting undated events into "Aktiva", where they'd be
// confusingly mixed in with real upcoming events.
const isPast = (ev: EventItem) => {
  if (ev.dateAndTime) return new Date(ev.dateAndTime) < now
  return ev.status === 'ARCHIVED'
}

const activeEvents = computed(() =>
  events.value.filter((e) => !isPast(e)).sort((a, b) => (a.dateAndTime || '').localeCompare(b.dateAndTime || ''))
)
const pastEvents = computed(() =>
  events.value.filter(isPast).sort((a, b) => (b.dateAndTime || '').localeCompare(a.dateAndTime || ''))
)

const visibleEvents = computed(() => (view.value === 'aktiva' ? activeEvents.value : pastEvents.value))

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Inget datum satt'
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-xl font-semibold text-lyktan-ink">Event</h1>
      <div class="tabs" role="tablist">
        <button role="tab" :aria-selected="view === 'aktiva'" @click="view = 'aktiva'">Aktiva ({{ activeEvents.length }})</button>
        <button role="tab" :aria-selected="view === 'historik'" @click="view = 'historik'">Historik ({{ pastEvents.length }})</button>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-[var(--bad)]">{{ loadError }}</p>
    <p v-else-if="!visibleEvents.length" class="text-sm text-lyktan-mute">Inga event här.</p>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="ev in visibleEvents"
        :key="ev.id"
        :to="`/event/${ev.id}`"
        class="overflow-hidden rounded-2xl border border-[var(--line)] bg-lyktan-paper transition hover:border-[var(--muted)]"
      >
        <div class="aspect-square w-full overflow-hidden bg-[var(--surface-2)]">
          <img v-if="ev.imageUrl" :src="ev.imageUrl" :alt="ev.title" class="h-full w-full object-cover">
        </div>
        <div class="p-4">
          <p class="mono text-[0.72rem]" style="color:var(--muted)">{{ formatDate(ev.dateAndTime) }}</p>
          <h2 class="mt-1 font-medium text-lyktan-ink">{{ ev.title }}</h2>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
