<script setup lang="ts">
type Booking = {
  id: string
  table_id: string
  booking_date: string
  start_time: string
  party_size: number
  for_miniatures: boolean
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  status: 'confirmed' | 'cancelled'
  created_at: string
  tables: { name: string; kind: string } | null
}

const props = defineProps<{ booking: Booking }>()
const emit = defineEmits<{
  close: []
  updated: [booking: Booking]
  deleted: [id: string]
}>()

const { canEditBookings } = usePermissions()

const booking = ref<Booking>({ ...props.booking })

watch(() => props.booking, (b) => {
  booking.value = { ...b }
})

const editDraft = ref({ customerName: '', customerPhone: '', customerEmail: '', partySize: 1 })

watch(booking, (b) => {
  editDraft.value = {
    customerName: b.customer_name,
    customerPhone: b.customer_phone || '',
    customerEmail: b.customer_email || '',
    partySize: b.party_size
  }
}, { immediate: true })

const saving = ref(false)
const error = ref('')

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const res = await $fetch<{ booking: Booking }>(`/api/bookings/${booking.value.id}`, {
      method: 'PATCH',
      body: editDraft.value
    })
    booking.value = res.booking
    emit('updated', res.booking)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte spara ändringar'
  } finally {
    saving.value = false
  }
}

const togglingStatus = ref(false)

const toggleStatus = async () => {
  togglingStatus.value = true
  error.value = ''

  try {
    const res = await $fetch<{ booking: Booking }>(`/api/bookings/${booking.value.id}`, {
      method: 'PATCH',
      body: { status: booking.value.status === 'confirmed' ? 'cancelled' : 'confirmed' }
    })
    booking.value = res.booking
    emit('updated', res.booking)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte uppdatera status'
  } finally {
    togglingStatus.value = false
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
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold text-lyktan-ink">{{ booking.tables?.name || 'Okänt bord' }}</h1>
          <p class="text-sm text-lyktan-mute">{{ booking.booking_date }} · {{ booking.start_time.slice(0, 5) }}</p>
        </div>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <span
        class="mb-4 inline-block rounded-full px-3 py-1 text-sm font-medium"
        :class="booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
      >
        {{ booking.status === 'confirmed' ? 'Bekräftad' : 'Avbokad' }}
      </span>
      <span v-if="booking.for_miniatures" class="mb-4 ml-2 inline-block rounded-full bg-black/8 px-3 py-1 text-sm font-medium text-lyktan-mute">
        Miniatyrmålning
      </span>

      <template v-if="canEditBookings">
        <div class="mt-2 space-y-4">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kundnamn</span>
            <input v-model="editDraft.customerName" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <div class="grid grid-cols-2 gap-4">
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Telefon</span>
              <input v-model="editDraft.customerPhone" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>
            <label class="block">
              <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
              <input v-model="editDraft.customerEmail" type="email" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Antal personer</span>
            <input v-model.number="editDraft.partySize" type="number" min="1" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>
        </div>

        <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>

        <div class="mt-5 flex flex-wrap items-center gap-3">
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
            :disabled="togglingStatus"
            class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
            @click="toggleStatus"
          >
            {{ booking.status === 'confirmed' ? 'Avboka' : 'Återställ bokning' }}
          </button>
        </div>
      </template>

      <dl v-else class="mt-2 space-y-3 text-sm">
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Kund</dt>
          <dd class="text-lyktan-ink">{{ booking.customer_name }}</dd>
          <dd v-if="booking.customer_phone" class="text-lyktan-mute">{{ booking.customer_phone }}</dd>
          <dd v-if="booking.customer_email" class="text-lyktan-mute">{{ booking.customer_email }}</dd>
        </div>
        <div>
          <dt class="text-[0.72rem] font-medium text-lyktan-mute">Antal personer</dt>
          <dd class="text-lyktan-ink">{{ booking.party_size }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
