<script setup lang="ts">
type Attendee = {
  orderId: string
  orderName: string
  createdAt: string
  customerName: string | null
  email: string | null
  phone: string | null
  variantId: string | null
  variantTitle: string | null
  quantity: number
  fulfillmentStatus: string
  checkedIn: boolean
}

type Occasion = { id: string, title: string, inventory: number | null }

type EventDetail = {
  id: string
  title: string
  handle: string
  status: string
  description: string | null
  imageUrl: string | null
  dateAndTime: string | null
}

const route = useRoute()
const id = route.params.id as string
const { canEditEvents } = usePermissions()

const eventDetail = ref<EventDetail | null>(null)
const attendees = ref<Attendee[]>([])
const occasions = ref<Occasion[]>([])
// Which tab is open: one occasion (variant id) or 'all'. Events without occasions have no tabs.
const activeTab = ref<string>('all')
const loading = ref(true)
const loadError = ref('')

const checkedOrderIds = ref<Set<string>>(new Set())
const tabTouched = ref(false)

const load = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ event: EventDetail, occasions: Occasion[], attendees: Attendee[] }>(`/api/events/${id}`)
    eventDetail.value = res.event
    occasions.value = res.occasions
    attendees.value = res.attendees
    // Land on the first occasion; keep the open tab when reloading after an action.
    if (!occasions.value.some((o) => o.id === activeTab.value) && activeTab.value !== 'all') activeTab.value = 'all'
    if (activeTab.value === 'all' && occasions.value.length && !tabTouched.value) activeTab.value = occasions.value[0]!.id
    checkedOrderIds.value = new Set(res.attendees.filter((a) => a.checkedIn).map((a) => a.orderId))
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta eventet'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : 'Inget datum satt'

const hasOccasions = computed(() => occasions.value.length > 1)
const visibleAttendees = computed(() =>
  activeTab.value === 'all' ? attendees.value : attendees.value.filter((a) => a.variantId === activeTab.value)
)
const activeOccasion = computed(() => occasions.value.find((o) => o.id === activeTab.value) ?? null)

const ticketsFor = (list: Attendee[]) => list.reduce((sum, a) => sum + a.quantity, 0)
const countsFor = (variantId: string | 'all') => {
  const list = variantId === 'all' ? attendees.value : attendees.value.filter((a) => a.variantId === variantId)
  return { tickets: ticketsFor(list), onSite: new Set(list.filter((a) => checkedOrderIds.value.has(a.orderId)).map((a) => a.orderId)).size }
}

const selectTab = (tab: string) => {
  tabTouched.value = true
  activeTab.value = tab
}

// People checked in on the open tab (an order counts once even if it holds tickets for two times).
const checkedInCount = computed(() => new Set(visibleAttendees.value.filter((a) => checkedOrderIds.value.has(a.orderId)).map((a) => a.orderId)).size)

const toggleChecked = (orderId: string) => {
  const next = new Set(checkedOrderIds.value)
  if (next.has(orderId)) next.delete(orderId)
  else next.add(orderId)
  checkedOrderIds.value = next
}

const savingCheckins = ref(false)
const checkinsError = ref('')
const checkinsSaved = ref(false)

const saveCheckins = async () => {
  savingCheckins.value = true
  checkinsError.value = ''
  checkinsSaved.value = false

  try {
    await $fetch(`/api/events/${id}/checkins`, {
      method: 'POST',
      body: { orderIds: [...checkedOrderIds.value] }
    })
    attendees.value = attendees.value.map((a) => ({ ...a, checkedIn: checkedOrderIds.value.has(a.orderId) }))
    checkinsSaved.value = true
  } catch (err: any) {
    checkinsError.value = err?.data?.statusMessage || 'Kunde inte spara incheckningen'
  } finally {
    savingCheckins.value = false
  }
}

const delivering = ref(false)
const deliverError = ref('')
const deliverResult = ref<{ total: number, delivered: number, failed: { orderId: string, message: string }[] } | null>(null)

const deliverToCheckedIn = async () => {
  if (!checkedInCount.value) return
  if (!confirm(`Markera ${checkedInCount.value} incheckade${activeOccasion.value ? ` (${activeOccasion.value.title})` : ''} som levererade i Shopify? Går inte att ångra härifrån.`)) return

  delivering.value = true
  deliverError.value = ''
  deliverResult.value = null

  try {
    deliverResult.value = await $fetch(`/api/events/${id}/deliver`, {
      method: 'POST',
      body: activeOccasion.value ? { variantId: activeOccasion.value.id } : {}
    })
    await load()
  } catch (err: any) {
    deliverError.value = err?.data?.statusMessage || 'Kunde inte markera som levererade'
  } finally {
    delivering.value = false
  }
}
</script>

<template>
  <div>
    <NuxtLink to="/event" style="color:var(--muted);font-size:13px">← Event</NuxtLink>

    <p v-if="loading" class="mt-4 text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="mt-4 text-sm text-[var(--bad)]">{{ loadError }}</p>

    <template v-else-if="eventDetail">
      <div class="mt-4 flex flex-wrap items-start gap-6">
        <img v-if="eventDetail.imageUrl" :src="eventDetail.imageUrl" :alt="eventDetail.title" class="h-32 w-32 shrink-0 rounded-2xl object-cover">
        <div>
          <p class="mono text-[0.72rem]" style="color:var(--muted)">{{ hasOccasions ? `${occasions.length} tillfällen` : formatDate(eventDetail.dateAndTime) }}</p>
          <h1 class="mt-1 text-xl font-semibold text-lyktan-ink">{{ eventDetail.title }}</h1>
          <p class="mt-2 max-w-2xl text-sm text-lyktan-mute">{{ eventDetail.description }}</p>
        </div>
      </div>

      <!-- One tab per occasion (play time); "Alla" shows everyone. -->
      <div v-if="hasOccasions" class="tabs mt-6" role="tablist" aria-label="Tillfällen" style="flex-wrap:wrap">
        <button
          v-for="o in occasions"
          :key="o.id"
          role="tab"
          :aria-selected="activeTab === o.id"
          @click="selectTab(o.id)"
        >
          {{ o.title }} ({{ countsFor(o.id).tickets }})
        </button>
        <button role="tab" :aria-selected="activeTab === 'all'" @click="selectTab('all')">Alla ({{ countsFor('all').tickets }})</button>
      </div>

      <div class="panel" :class="hasOccasions ? 'mt-3' : 'mt-6'">
        <h2>
          <template v-if="activeOccasion">{{ activeOccasion.title }} · </template>Deltagare ({{ ticketsFor(visibleAttendees) }} biljetter, {{ checkedInCount }} på plats)
        </h2>
        <p v-if="activeOccasion && activeOccasion.inventory !== null" class="mb-2 text-[0.8rem]" style="color:var(--muted)">{{ activeOccasion.inventory }} platser kvar</p>

        <p v-if="!visibleAttendees.length" class="text-sm text-lyktan-mute">Inga biljetter sålda{{ activeOccasion ? ' till det här tillfället' : '' }} ännu.</p>

        <div v-else class="tbl-wrap" style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr>
                <th style="width:36px;border-bottom:1px solid var(--line)" />
                <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)">Kund</th>
                <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)">Variant</th>
                <th class="num" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)">Antal</th>
                <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)">Order</th>
                <th style="text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)">Levererad</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in visibleAttendees" :key="`${a.orderId}-${a.variantId}`" style="border-bottom:1px solid var(--line)">
                <td style="padding:8px">
                  <input
                    type="checkbox"
                    :checked="checkedOrderIds.has(a.orderId)"
                    :disabled="!canEditEvents"
                    aria-label="På plats"
                    @change="toggleChecked(a.orderId)"
                  >
                </td>
                <td style="padding:8px">
                  <div class="font-medium text-lyktan-ink">{{ a.customerName || '—' }}</div>
                  <div style="color:var(--muted);font-size:12.5px">{{ a.email }}</div>
                </td>
                <td style="padding:8px">{{ a.variantTitle || '—' }}</td>
                <td class="num" style="padding:8px">{{ a.quantity }}</td>
                <td class="mono" style="padding:8px">{{ a.orderName }}</td>
                <td style="padding:8px">
                  <span class="cond" :style="{ color: a.fulfillmentStatus === 'FULFILLED' ? 'var(--ok)' : 'var(--muted)' }">
                    {{ a.fulfillmentStatus === 'FULFILLED' ? 'Ja' : 'Nej' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="canEditEvents" class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="btn primary" :disabled="savingCheckins" @click="saveCheckins">
            {{ savingCheckins ? 'Sparar…' : 'Markera som på plats' }}
          </button>
          <span v-if="checkinsSaved" style="color:var(--ok);font-size:13px">Sparat</span>
          <span v-if="checkinsError" style="color:var(--bad);font-size:13px">{{ checkinsError }}</span>
        </div>

        <div v-if="canEditEvents" class="mt-6 border-t pt-4" style="border-color:var(--line)">
          <p class="mb-2 text-sm text-lyktan-mute">Efter {{ activeOccasion ? 'tillfället' : 'eventet' }} — markerar {{ activeOccasion ? 'de incheckades ordrar för det här tillfället' : 'alla incheckades ordrar' }} som levererade i Shopify.</p>
          <button type="button" class="btn danger" :disabled="delivering || !checkedInCount" @click="deliverToCheckedIn">
            {{ delivering ? 'Levererar…' : `Markera ${checkedInCount} på plats${activeOccasion ? ' (detta tillfälle)' : ''} som levererade` }}
          </button>
          <p v-if="deliverResult" class="mt-2 text-sm" style="color:var(--muted)">
            {{ deliverResult.delivered }} av {{ deliverResult.total }} levererade.
            <template v-if="deliverResult.failed.length"> {{ deliverResult.failed.length }} misslyckades.</template>
          </p>
          <p v-if="deliverError" class="mt-2 text-sm" style="color:var(--bad)">{{ deliverError }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
