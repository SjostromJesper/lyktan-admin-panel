<script setup lang="ts">
type Table = {
  id: string
  name: string
  public_name: string | null
  kind: 'bord' | 'rum'
  capacity: number
  price_kr: number | null
  active: boolean
  created_at: string
}

type Booking = {
  id: string
  table_id: string
  booking_date: string
  start_time: string
  end_time: string
  party_size: number
  for_miniatures: boolean
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  notes: string | null
  status: 'pending' | 'confirmed' | 'cancelled'
  created_at: string
  member_id: string | null
  tables: { name: string; kind: string } | null
  members: { first_name: string; last_name: string; tier: string } | null
}

type RecurringEvent = {
  id: string
  name: string
  weekday: number
  start_time: string
  end_time: string
  table_ids: string[]
  active: boolean
  created_at: string
}

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

const { canEditBookings } = usePermissions()

// --- Tables ---
const tables = ref<Table[]>([])
const tablesLoading = ref(true)
const tablesError = ref('')

const loadTables = async () => {
  tablesLoading.value = true
  tablesError.value = ''

  try {
    const res = await $fetch<{ tables: Table[] }>('/api/tables')
    tables.value = res.tables
  } catch (err: any) {
    tablesError.value = err?.data?.statusMessage || 'Kunde inte hämta bord'
  } finally {
    tablesLoading.value = false
  }
}

const showAddTableForm = ref(false)
const addTableSaving = ref(false)
const addTableError = ref('')
const newTable = ref({ name: '', publicName: '', kind: 'bord' as Table['kind'], capacity: 2, priceKr: null as number | null })

const submitAddTable = async () => {
  addTableSaving.value = true
  addTableError.value = ''

  try {
    const { table } = await $fetch<{ table: Table }>('/api/tables', { method: 'POST', body: newTable.value })
    tables.value.push(table)
    newTable.value = { name: '', publicName: '', kind: 'bord', capacity: 2, priceKr: null }
    showAddTableForm.value = false
  } catch (err: any) {
    addTableError.value = err?.data?.statusMessage || 'Kunde inte spara bordet'
  } finally {
    addTableSaving.value = false
  }
}

const selectedTable = ref<Table | null>(null)

const onTableUpdated = (updated: Table) => {
  const idx = tables.value.findIndex((t) => t.id === updated.id)
  if (idx !== -1) tables.value[idx] = updated
  selectedTable.value = null
}

const onTableDeleted = (id: string) => {
  tables.value = tables.value.filter((t) => t.id !== id)
  selectedTable.value = null
}

// --- Recurring events ---
const recurringEvents = ref<RecurringEvent[]>([])
const recurringLoading = ref(true)
const recurringError = ref('')

const loadRecurringEvents = async () => {
  recurringLoading.value = true
  recurringError.value = ''

  try {
    const res = await $fetch<{ recurringEvents: RecurringEvent[] }>('/api/recurring-events')
    recurringEvents.value = res.recurringEvents
  } catch (err: any) {
    recurringError.value = err?.data?.statusMessage || 'Kunde inte hämta stående event'
  } finally {
    recurringLoading.value = false
  }
}

const showAddRecurringForm = ref(false)
const addRecurringSaving = ref(false)
const addRecurringError = ref('')
const newRecurring = ref({ name: '', weekday: 3, startTime: '10:00', endTime: '17:00', tableIds: [] as string[] })

const toggleNewRecurringTable = (id: string) => {
  const idx = newRecurring.value.tableIds.indexOf(id)
  if (idx === -1) newRecurring.value.tableIds.push(id)
  else newRecurring.value.tableIds.splice(idx, 1)
}

const submitAddRecurring = async () => {
  addRecurringSaving.value = true
  addRecurringError.value = ''

  try {
    const { recurringEvent } = await $fetch<{ recurringEvent: RecurringEvent }>('/api/recurring-events', {
      method: 'POST',
      body: newRecurring.value
    })
    recurringEvents.value.push(recurringEvent)
    newRecurring.value = { name: '', weekday: 3, startTime: '10:00', endTime: '17:00', tableIds: [] }
    showAddRecurringForm.value = false
  } catch (err: any) {
    addRecurringError.value = err?.data?.statusMessage || 'Kunde inte spara eventet'
  } finally {
    addRecurringSaving.value = false
  }
}

const selectedRecurring = ref<RecurringEvent | null>(null)

const onRecurringUpdated = (updated: RecurringEvent) => {
  const idx = recurringEvents.value.findIndex((e) => e.id === updated.id)
  if (idx !== -1) recurringEvents.value[idx] = updated
  selectedRecurring.value = null
}

const onRecurringDeleted = (id: string) => {
  recurringEvents.value = recurringEvents.value.filter((e) => e.id !== id)
  selectedRecurring.value = null
}

const tableNames = (ids: string[]) => tables.value.filter((t) => ids.includes(t.id)).map((t) => t.name).join(', ')

// --- One-off events ---
const oneOffEvents = ref<OneOffEvent[]>([])
const oneOffLoading = ref(true)
const oneOffError = ref('')

const loadOneOffEvents = async () => {
  oneOffLoading.value = true
  oneOffError.value = ''

  try {
    const res = await $fetch<{ oneOffEvents: OneOffEvent[] }>('/api/one-off-events')
    oneOffEvents.value = res.oneOffEvents
  } catch (err: any) {
    oneOffError.value = err?.data?.statusMessage || 'Kunde inte hämta engångsevent'
  } finally {
    oneOffLoading.value = false
  }
}

const showAddOneOffForm = ref(false)
const addOneOffSaving = ref(false)
const addOneOffError = ref('')
const newOneOff = ref({ name: '', eventDate: toIsoDate(new Date()), startTime: '10:00', endTime: '17:00', tableIds: [] as string[] })

const toggleNewOneOffTable = (id: string) => {
  const idx = newOneOff.value.tableIds.indexOf(id)
  if (idx === -1) newOneOff.value.tableIds.push(id)
  else newOneOff.value.tableIds.splice(idx, 1)
}

const submitAddOneOff = async () => {
  addOneOffSaving.value = true
  addOneOffError.value = ''

  try {
    const { oneOffEvent } = await $fetch<{ oneOffEvent: OneOffEvent }>('/api/one-off-events', {
      method: 'POST',
      body: newOneOff.value
    })
    oneOffEvents.value.push(oneOffEvent)
    newOneOff.value = { name: '', eventDate: toIsoDate(new Date()), startTime: '10:00', endTime: '17:00', tableIds: [] }
    showAddOneOffForm.value = false
  } catch (err: any) {
    addOneOffError.value = err?.data?.statusMessage || 'Kunde inte spara eventet'
  } finally {
    addOneOffSaving.value = false
  }
}

const selectedOneOff = ref<OneOffEvent | null>(null)

const onOneOffUpdated = (updated: OneOffEvent) => {
  const idx = oneOffEvents.value.findIndex((e) => e.id === updated.id)
  if (idx !== -1) oneOffEvents.value[idx] = updated
  selectedOneOff.value = null
}

const onOneOffDeleted = (id: string) => {
  oneOffEvents.value = oneOffEvents.value.filter((e) => e.id !== id)
  selectedOneOff.value = null
}

// --- Bookings (list) ---
const bookingDisplay = ref<'lista' | 'kalender' | 'boka'>('lista')
const view = ref<'active' | 'history'>('active')
const bookings = ref<Booking[]>([])
const bookingsLoading = ref(true)
const bookingsError = ref('')

const loadBookings = async () => {
  bookingsLoading.value = true
  bookingsError.value = ''

  try {
    const res = await $fetch<{ bookings: Booking[] }>('/api/bookings', { query: { status: view.value } })
    bookings.value = res.bookings
  } catch (err: any) {
    bookingsError.value = err?.data?.statusMessage || 'Kunde inte hämta bokningar'
  } finally {
    bookingsLoading.value = false
  }
}

watch(view, loadBookings)

// --- Bookings (calendar) ---
const weekStart = ref(startOfWeek(new Date()))
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))
const today = new Date()

const weekRangeLabel = computed(() => {
  const first = weekDays.value[0]
  const last = weekDays.value[6]
  return `${formatDayShort(first)} – ${formatDayShort(last)} ${last.getFullYear()}`
})

const calendarBookings = ref<Booking[]>([])
const calendarLoading = ref(true)
const calendarError = ref('')

const loadCalendar = async () => {
  calendarLoading.value = true
  calendarError.value = ''

  try {
    const res = await $fetch<{ bookings: Booking[] }>('/api/bookings', {
      query: { from: toIsoDate(weekDays.value[0]), to: toIsoDate(weekDays.value[6]) }
    })
    // Show pending (awaiting deposit) alongside confirmed — just cancelled is hidden.
    calendarBookings.value = res.bookings.filter((b) => b.status !== 'cancelled')
  } catch (err: any) {
    calendarError.value = err?.data?.statusMessage || 'Kunde inte hämta bokningar'
  } finally {
    calendarLoading.value = false
  }
}

watch(weekStart, () => { if (bookingDisplay.value === 'kalender') loadCalendar() })
watch(bookingDisplay, (mode) => { if (mode === 'kalender' && !calendarBookings.value.length) loadCalendar() })

const activeTables = computed(() => tables.value.filter((t) => t.active))

const bookingsForCell = (tableId: string, date: Date) => {
  const iso = toIsoDate(date)
  return calendarBookings.value.filter((b) => b.table_id === tableId && b.booking_date === iso)
}

const recurringForCell = (tableId: string, date: Date) => {
  const wd = weekdayIndex(date)
  return recurringEvents.value.filter((e) => e.active && e.weekday === wd && e.table_ids.includes(tableId))
}

const oneOffForCell = (tableId: string, date: Date) => {
  const iso = toIsoDate(date)
  return oneOffEvents.value.filter((e) => e.active && e.event_date === iso && e.table_ids.includes(tableId))
}

// --- Quick self-booking (staff booking a table for themselves) ---
// Same day-overview grid as the storefront's own booking page
// (web/app/pages/bordsbokning.vue) — same availability endpoint shape,
// same occupied/free cell styling — just without the name/contact form or
// deposit payment, since it's the logged-in staff member booking directly.
type AvailTable = { id: string, name: string, kind: 'bord' | 'rum', capacity: number, priceKr: number | null }
type OccupiedSlot = { tableId: string, time: string, type: 'booking' | 'event' | 'room-locked', label: string, groupId?: string }
type OverviewCell = { time: string, colspan: number, occupied: OccupiedSlot | null }

const quickDate = ref(toIsoDate(new Date()))
const quickSlotTimes = ref<string[]>([])
const quickTables = ref<AvailTable[]>([])
const quickOccupied = ref<OccupiedSlot[]>([])
const quickLoading = ref(false)
const quickError = ref('')

const quickSelectedTableId = ref<string | null>(null)
const quickSelectedTime = ref<string | null>(null)
const quickSaving = ref(false)
const quickSaveError = ref('')
const quickBookedNotice = ref<{ tableName: string, startTime: string, endTime: string } | null>(null)

const quickOccupiedMap = computed(() => new Map(quickOccupied.value.map((slot) => [`${slot.tableId}|${slot.time}`, slot])))
const quickOccupiedAt = (tableId: string, time: string) => quickOccupiedMap.value.get(`${tableId}|${time}`) ?? null
const quickSelectedTable = computed(() => quickTables.value.find((t) => t.id === quickSelectedTableId.value) ?? null)

const loadQuickAvailability = async () => {
  quickSelectedTableId.value = null
  quickSelectedTime.value = null
  quickSaveError.value = ''
  quickBookedNotice.value = null
  quickLoading.value = true
  quickError.value = ''

  try {
    const res = await $fetch<{ slotTimes: string[], tables: AvailTable[], occupiedSlots: OccupiedSlot[] }>('/api/bookings/availability', {
      query: { date: quickDate.value },
      cache: 'no-store'
    })
    quickSlotTimes.value = res.slotTimes
    quickTables.value = res.tables
    quickOccupied.value = res.occupiedSlots
  } catch (err: any) {
    quickSlotTimes.value = []
    quickTables.value = []
    quickOccupied.value = []
    quickError.value = err?.data?.statusMessage || 'Kunde inte hämta lediga bord'
  } finally {
    quickLoading.value = false
  }
}

watch(quickDate, loadQuickAvailability)
watch(bookingDisplay, (mode) => { if (mode === 'boka' && !quickTables.value.length) loadQuickAvailability() })

// Groups consecutive slots with the same status into one wide cell instead
// of repeating the label in every slot — mirrors the storefront's grouping.
const quickOverviewRows = computed<Map<string, OverviewCell[]>>(() => {
  const rows = new Map<string, OverviewCell[]>()

  for (const table of quickTables.value) {
    const cells: OverviewCell[] = []

    for (const time of quickSlotTimes.value) {
      const occ = quickOccupiedAt(table.id, time)
      const last = cells[cells.length - 1]
      const sameAsLast = Boolean(
        last?.occupied
        && occ
        && last.occupied.type === occ.type
        && (occ.type === 'room-locked' ? true : Boolean(occ.groupId) && last.occupied.groupId === occ.groupId)
      )

      if (sameAsLast) {
        last.colspan += 1
      } else {
        cells.push({ time, colspan: 1, occupied: occ })
      }
    }

    rows.set(table.id, cells)
  }

  return rows
})

const selectQuickCell = (tableId: string, time: string) => {
  if (quickOccupiedAt(tableId, time)) return

  quickSelectedTableId.value = tableId
  quickSelectedTime.value = time
  quickSaveError.value = ''
  quickBookedNotice.value = null
}

const confirmQuickBooking = async () => {
  if (!quickSelectedTableId.value || !quickSelectedTime.value) return

  quickSaving.value = true
  quickSaveError.value = ''

  try {
    const res = await $fetch<{ tableName: string, endTime: string }>('/api/bookings', {
      method: 'POST',
      body: { tableId: quickSelectedTableId.value, date: quickDate.value, startTime: quickSelectedTime.value }
    })
    const notice = { tableName: res.tableName, startTime: quickSelectedTime.value, endTime: res.endTime }
    await loadQuickAvailability()
    quickBookedNotice.value = notice
  } catch (err: any) {
    quickSaveError.value = err?.data?.statusMessage || 'Kunde inte boka bordet'
  } finally {
    quickSaving.value = false
  }
}

const quickOccupiedTitle = (table: AvailTable, time: string) => {
  const occupied = quickOccupiedAt(table.id, time)

  if (occupied?.type === 'room-locked') {
    return 'Rummet går bara att boka när alla andra bord är fullbokade den tiden.'
  }

  return occupied?.label ?? `${table.name} kl. ${time} — ledigt`
}

const quickCellClass = (tableId: string, time: string) => {
  if (quickSelectedTableId.value === tableId && quickSelectedTime.value === time) {
    return 'bg-lyktan-ink text-white'
  }

  const occupied = quickOccupiedAt(tableId, time)

  if (occupied?.type === 'event') {
    return 'cursor-not-allowed bg-amber-50 text-amber-700'
  }

  if (occupied?.type === 'room-locked') {
    return 'cursor-not-allowed bg-black/[0.03] text-lyktan-mute'
  }

  if (occupied) {
    return 'cursor-not-allowed bg-red-50 text-red-400'
  }

  return 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
}

const prevWeek = () => { weekStart.value = addDays(weekStart.value, -7) }
const nextWeek = () => { weekStart.value = addDays(weekStart.value, 7) }
const goToday = () => { weekStart.value = startOfWeek(new Date()) }

onMounted(() => {
  loadTables()
  loadBookings()
  loadRecurringEvents()
  loadOneOffEvents()
})

const selectedBooking = ref<Booking | null>(null)

const onBookingUpdated = () => {
  selectedBooking.value = null
  loadBookings()
  loadCalendar()
}

const onBookingDeleted = () => {
  selectedBooking.value = null
  loadBookings()
  loadCalendar()
}
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Bordsbokning</h1>

    <div class="mb-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-lyktan-ink">Bord & rum</h2>
        <button
          v-if="canEditBookings"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showAddTableForm = !showAddTableForm"
        >
          {{ showAddTableForm ? 'Avbryt' : '+ Nytt bord' }}
        </button>
      </div>

      <form
        v-if="showAddTableForm"
        class="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
        @submit.prevent="submitAddTable"
      >
        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
          <input v-model="newTable.name" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn i webshoppen (valfritt)</span>
          <input v-model="newTable.publicName" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Typ</span>
          <select v-model="newTable.kind" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            <option value="bord">Bord</option>
            <option value="rum">Rum</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kapacitet</span>
          <input v-model.number="newTable.capacity" type="number" min="1" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr, valfritt)</span>
          <input v-model.number="newTable.priceKr" type="number" min="0" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <p v-if="addTableError" class="sm:col-span-2 text-sm text-red-600">{{ addTableError }}</p>

        <div class="sm:col-span-2">
          <button
            type="submit"
            :disabled="addTableSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ addTableSaving ? 'Sparar…' : 'Spara bord' }}
          </button>
        </div>
      </form>

      <p v-if="tablesLoading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="tablesError" class="text-sm text-red-600">{{ tablesError }}</p>

      <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
        <table class="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
              <th class="px-4 py-3">Namn</th>
              <th class="px-4 py-3">Typ</th>
              <th class="px-4 py-3">Kapacitet</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in tables"
              :key="t.id"
              class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
              @click="selectedTable = t"
            >
              <td class="px-4 py-3 font-medium text-lyktan-ink">{{ t.name }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ t.kind === 'rum' ? 'Rum' : 'Bord' }}</td>
              <td class="px-4 py-3">{{ t.capacity }}</td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                  :class="t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-black/8 text-lyktan-mute'"
                >
                  {{ t.active ? 'Aktiv' : 'Inaktiv' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mb-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-lyktan-ink">Stående event</h2>
        <button
          v-if="canEditBookings"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showAddRecurringForm = !showAddRecurringForm"
        >
          {{ showAddRecurringForm ? 'Avbryt' : '+ Nytt event' }}
        </button>
      </div>

      <form
        v-if="showAddRecurringForm"
        class="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
        @submit.prevent="submitAddRecurring"
      >
        <label class="block sm:col-span-2">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
          <input v-model="newRecurring.name" required placeholder="T.ex. Pokémon" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Veckodag</span>
          <select v-model.number="newRecurring.weekday" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
            <option v-for="(label, idx) in WEEKDAY_LABELS" :key="idx" :value="idx">{{ label }}</option>
          </select>
        </label>

        <div class="grid grid-cols-2 gap-4">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Start</span>
            <input v-model="newRecurring.startTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Slut</span>
            <input v-model="newRecurring.endTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>
        </div>

        <div class="sm:col-span-2">
          <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Bord</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="t in tables"
              :key="t.id"
              type="button"
              class="rounded-full border px-3 py-1 text-sm font-medium transition"
              :class="newRecurring.tableIds.includes(t.id) ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
              @click="toggleNewRecurringTable(t.id)"
            >
              {{ t.name }}
            </button>
          </div>
        </div>

        <p v-if="addRecurringError" class="sm:col-span-2 text-sm text-red-600">{{ addRecurringError }}</p>

        <div class="sm:col-span-2">
          <button
            type="submit"
            :disabled="addRecurringSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ addRecurringSaving ? 'Sparar…' : 'Spara event' }}
          </button>
        </div>
      </form>

      <p v-if="recurringLoading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="recurringError" class="text-sm text-red-600">{{ recurringError }}</p>
      <p v-else-if="!recurringEvents.length" class="text-sm text-lyktan-mute">Inga stående event ännu.</p>

      <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
        <table class="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
              <th class="px-4 py-3">Namn</th>
              <th class="px-4 py-3">Veckodag & tid</th>
              <th class="px-4 py-3">Bord</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in recurringEvents"
              :key="e.id"
              class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
              @click="selectedRecurring = e"
            >
              <td class="px-4 py-3 font-medium text-lyktan-ink">{{ e.name }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ WEEKDAY_LABELS[e.weekday] }} {{ e.start_time.slice(0, 5) }}–{{ e.end_time.slice(0, 5) }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ tableNames(e.table_ids) }}</td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                  :class="e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-black/8 text-lyktan-mute'"
                >
                  {{ e.active ? 'Aktiv' : 'Inaktiv' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mb-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-lyktan-ink">Engångsevent</h2>
        <button
          v-if="canEditBookings"
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
          @click="showAddOneOffForm = !showAddOneOffForm"
        >
          {{ showAddOneOffForm ? 'Avbryt' : '+ Nytt event' }}
        </button>
      </div>

      <form
        v-if="showAddOneOffForm"
        class="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-black/8 bg-lyktan-paper p-6 sm:grid-cols-2"
        @submit.prevent="submitAddOneOff"
      >
        <label class="block sm:col-span-2">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Namn</span>
          <input v-model="newOneOff.name" required placeholder="T.ex. Prerelease" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <label class="block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Datum</span>
          <input v-model="newOneOff.eventDate" type="date" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
        </label>

        <div class="grid grid-cols-2 gap-4">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Start</span>
            <input v-model="newOneOff.startTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Slut</span>
            <input v-model="newOneOff.endTime" type="time" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>
        </div>

        <div class="sm:col-span-2">
          <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Bord</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="t in tables"
              :key="t.id"
              type="button"
              class="rounded-full border px-3 py-1 text-sm font-medium transition"
              :class="newOneOff.tableIds.includes(t.id) ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
              @click="toggleNewOneOffTable(t.id)"
            >
              {{ t.name }}
            </button>
          </div>
        </div>

        <p v-if="addOneOffError" class="sm:col-span-2 text-sm text-red-600">{{ addOneOffError }}</p>

        <div class="sm:col-span-2">
          <button
            type="submit"
            :disabled="addOneOffSaving"
            class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ addOneOffSaving ? 'Sparar…' : 'Spara event' }}
          </button>
        </div>
      </form>

      <p v-if="oneOffLoading" class="text-sm text-lyktan-mute">Laddar…</p>
      <p v-else-if="oneOffError" class="text-sm text-red-600">{{ oneOffError }}</p>
      <p v-else-if="!oneOffEvents.length" class="text-sm text-lyktan-mute">Inga engångsevent ännu.</p>

      <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
        <table class="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
              <th class="px-4 py-3">Namn</th>
              <th class="px-4 py-3">Datum & tid</th>
              <th class="px-4 py-3">Bord</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in oneOffEvents"
              :key="e.id"
              class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
              @click="selectedOneOff = e"
            >
              <td class="px-4 py-3 font-medium text-lyktan-ink">{{ e.name }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ e.event_date }} {{ e.start_time.slice(0, 5) }}–{{ e.end_time.slice(0, 5) }}</td>
              <td class="px-4 py-3 text-lyktan-mute">{{ tableNames(e.table_ids) }}</td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                  :class="e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-black/8 text-lyktan-mute'"
                >
                  {{ e.active ? 'Aktiv' : 'Inaktiv' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 class="text-sm font-semibold text-lyktan-ink">Bokningar</h2>
        <div class="flex gap-2 text-sm">
          <button
            type="button"
            class="rounded-full border px-4 py-1.5 font-medium transition"
            :class="bookingDisplay === 'lista' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="bookingDisplay = 'lista'"
          >
            Lista
          </button>
          <button
            type="button"
            class="rounded-full border px-4 py-1.5 font-medium transition"
            :class="bookingDisplay === 'kalender' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="bookingDisplay = 'kalender'"
          >
            Kalender
          </button>
          <button
            v-if="canEditBookings"
            type="button"
            class="rounded-full border px-4 py-1.5 font-medium transition"
            :class="bookingDisplay === 'boka' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="bookingDisplay = 'boka'"
          >
            Boka
          </button>
        </div>
      </div>

      <template v-if="bookingDisplay === 'lista'">
        <div class="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            class="rounded-full border px-4 py-1.5 font-medium transition"
            :class="view === 'active' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="view = 'active'"
          >
            Kommande
          </button>
          <button
            type="button"
            class="rounded-full border px-4 py-1.5 font-medium transition"
            :class="view === 'history' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="view = 'history'"
          >
            Historik
          </button>
        </div>

        <p v-if="bookingsLoading" class="text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="bookingsError" class="text-sm text-red-600">{{ bookingsError }}</p>
        <p v-else-if="!bookings.length" class="text-sm text-lyktan-mute">
          {{ view === 'active' ? 'Inga kommande bokningar.' : 'Ingen historik ännu.' }}
        </p>

        <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
          <table class="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
                <th class="px-4 py-3">Datum</th>
                <th class="px-4 py-3">Tid</th>
                <th class="px-4 py-3">Bord</th>
                <th class="px-4 py-3">Kund</th>
                <th class="px-4 py-3">Personer</th>
                <th class="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="b in bookings"
                :key="b.id"
                class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
                :class="b.member_id ? 'bg-sky-50/60' : ''"
                @click="selectedBooking = b"
              >
                <td class="px-4 py-3 font-medium text-lyktan-ink">{{ b.booking_date }}</td>
                <td class="px-4 py-3 text-lyktan-mute">{{ b.start_time.slice(0, 5) }}–{{ b.end_time.slice(0, 5) }}</td>
                <td class="px-4 py-3 text-lyktan-mute">{{ b.tables?.name || '—' }}</td>
                <td class="px-4 py-3 text-lyktan-mute">
                  {{ b.customer_name }}
                  <span v-if="b.member_id" class="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[0.68rem] font-medium text-sky-700">Medlem</span>
                </td>
                <td class="px-4 py-3">{{ b.party_size }}</td>
                <td class="px-4 py-3">
                  <span
                    class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                    :class="{
                      pending: 'bg-amber-100 text-amber-700',
                      confirmed: 'bg-emerald-100 text-emerald-700',
                      cancelled: 'bg-red-100 text-red-700'
                    }[b.status]"
                  >
                    {{ { pending: 'Väntar på betalning', confirmed: 'Bekräftad', cancelled: 'Avbokad' }[b.status] }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else-if="bookingDisplay === 'kalender'">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" class="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/[0.04]" @click="prevWeek">←</button>
          <button type="button" class="shrink-0 rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/[0.04]" @click="goToday">Idag</button>
          <span class="whitespace-nowrap text-sm font-medium text-lyktan-ink">{{ weekRangeLabel }}</span>
          <button type="button" class="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/[0.04]" @click="nextWeek">→</button>
        </div>

        <p v-if="calendarLoading" class="text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="calendarError" class="text-sm text-red-600">{{ calendarError }}</p>
        <p v-else-if="!activeTables.length" class="text-sm text-lyktan-mute">Inga aktiva bord.</p>

        <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
          <table class="w-full min-w-[900px] table-fixed text-left text-sm">
            <thead>
              <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
                <th class="w-32 px-4 py-3">Bord</th>
                <th v-for="day in weekDays" :key="toIsoDate(day)" class="px-2 py-3 text-center" :class="{ 'text-lyktan-accent': isSameDate(day, today) }">
                  {{ WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1] }} {{ formatDayShort(day) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in activeTables" :key="t.id" class="border-b border-black/6 last:border-0">
                <td class="px-4 py-3 align-top font-medium text-lyktan-ink">{{ t.name }}</td>
                <td v-for="day in weekDays" :key="toIsoDate(day)" class="px-2 py-2 align-top">
                  <div class="space-y-1">
                    <button
                      v-for="e in recurringForCell(t.id, day)"
                      :key="e.id"
                      type="button"
                      class="block w-full rounded-lg bg-amber-100 px-2 py-1.5 text-left text-[0.8rem] font-medium text-amber-800 transition hover:bg-amber-200"
                      @click="selectedRecurring = e"
                    >
                      {{ e.start_time.slice(0, 5) }}–{{ e.end_time.slice(0, 5) }} {{ e.name }}
                    </button>
                    <button
                      v-for="e in oneOffForCell(t.id, day)"
                      :key="e.id"
                      type="button"
                      class="block w-full rounded-lg bg-violet-100 px-2 py-1.5 text-left text-[0.8rem] font-medium text-violet-800 transition hover:bg-violet-200"
                      @click="selectedOneOff = e"
                    >
                      {{ e.start_time.slice(0, 5) }}–{{ e.end_time.slice(0, 5) }} {{ e.name }}
                    </button>
                    <button
                      v-for="b in bookingsForCell(t.id, day)"
                      :key="b.id"
                      type="button"
                      class="block w-full rounded-lg px-2 py-1.5 text-left text-[0.8rem] font-medium transition"
                      :class="b.status === 'pending'
                        ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : b.member_id
                          ? 'bg-sky-100 text-sky-800 hover:bg-sky-200'
                          : 'bg-lyktan-ink/5 text-lyktan-ink hover:bg-lyktan-ink/10'"
                      @click="selectedBooking = b"
                    >
                      {{ b.start_time.slice(0, 5) }}–{{ b.end_time.slice(0, 5) }} {{ b.customer_name }}
                      <span v-if="b.status === 'pending'" class="opacity-70">(väntar)</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <div class="mb-4 flex flex-wrap items-center gap-4">
          <label for="quick-book-date" class="text-sm font-medium text-lyktan-ink">Datum</label>
          <input
            id="quick-book-date"
            v-model="quickDate"
            type="date"
            :min="toIsoDate(today)"
            class="min-h-10 rounded-lg border border-black/12 bg-white px-3 text-sm text-lyktan-ink"
          >
        </div>

        <p v-if="quickBookedNotice" class="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {{ quickBookedNotice.tableName }} bokat {{ quickBookedNotice.startTime }}–{{ quickBookedNotice.endTime }}!
        </p>

        <p v-if="quickLoading" class="text-sm text-lyktan-mute">Laddar…</p>
        <p v-else-if="quickError" class="text-sm text-red-600">{{ quickError }}</p>
        <p v-else-if="!quickSlotTimes.length || !quickTables.length" class="text-sm text-lyktan-mute">Inga bokningsbara bord den dagen.</p>

        <template v-else>
          <div class="overflow-x-auto rounded-xl border border-black/12">
            <table class="w-full min-w-[440px] border-collapse text-sm">
              <thead>
                <tr>
                  <th class="sticky left-0 z-10 border-b border-r border-black/12 bg-lyktan-paper px-3 py-2 text-left text-[0.72rem] font-medium text-lyktan-mute">Bord</th>
                  <th v-for="time in quickSlotTimes" :key="time" class="border-b border-black/12 px-2 py-2 text-center text-[0.72rem] font-medium text-lyktan-mute">
                    {{ time }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="table in quickTables" :key="table.id" class="border-b border-black/6 last:border-0">
                  <td class="sticky left-0 z-10 border-r border-black/12 bg-lyktan-paper px-3 py-2 text-sm font-medium text-lyktan-ink">{{ table.name }}</td>
                  <td v-for="cell in quickOverviewRows.get(table.id)" :key="cell.time" class="p-1 text-center" :colspan="cell.colspan">
                    <button
                      type="button"
                      :title="quickOccupiedTitle(table, cell.time)"
                      class="inline-flex h-9 w-full min-w-[3.2rem] items-center justify-center rounded-md px-1 text-[0.68rem] font-medium transition disabled:cursor-not-allowed"
                      :class="quickCellClass(table.id, cell.time)"
                      :disabled="Boolean(cell.occupied)"
                      @click="selectQuickCell(table.id, cell.time)"
                    >
                      <span v-if="cell.occupied" class="truncate">{{ cell.occupied.label }}</span>
                      <span v-else>·</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-3 text-[0.72rem] text-lyktan-mute">
            <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50" /> Ledigt</span>
            <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm bg-lyktan-ink" /> Valt</span>
            <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm border border-red-200 bg-red-50" /> Bokat</span>
            <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-50" /> Stående event</span>
            <span class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm border border-black/12 bg-black/[0.03]" /> Låst</span>
          </div>

          <div v-if="quickSelectedTable && quickSelectedTime" class="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/8 bg-lyktan-paper p-4">
            <p class="text-sm font-medium text-lyktan-ink">
              {{ quickSelectedTable.name }} — kl. {{ quickSelectedTime }}
            </p>
            <p v-if="quickSaveError" class="text-sm text-red-600">{{ quickSaveError }}</p>
            <div class="ml-auto flex gap-2">
              <button
                type="button"
                class="inline-flex min-h-9 items-center justify-center rounded-full border border-black/15 px-4 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
                @click="quickSelectedTableId = null; quickSelectedTime = null"
              >
                Avbryt
              </button>
              <button
                type="button"
                :disabled="quickSaving"
                class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                @click="confirmQuickBooking"
              >
                {{ quickSaving ? 'Bokar…' : 'Boka bord' }}
              </button>
            </div>
          </div>
        </template>
      </template>
    </div>

    <TableModal
      v-if="selectedTable"
      :table="selectedTable"
      @close="selectedTable = null"
      @updated="onTableUpdated"
      @deleted="onTableDeleted"
    />

    <BookingModal
      v-if="selectedBooking"
      :booking="selectedBooking"
      @close="selectedBooking = null"
      @updated="onBookingUpdated"
      @deleted="onBookingDeleted"
    />

    <RecurringEventModal
      v-if="selectedRecurring"
      :event="selectedRecurring"
      :tables="tables"
      @close="selectedRecurring = null"
      @updated="onRecurringUpdated"
      @deleted="onRecurringDeleted"
    />

    <OneOffEventModal
      v-if="selectedOneOff"
      :event="selectedOneOff"
      :tables="tables"
      @close="selectedOneOff = null"
      @updated="onOneOffUpdated"
      @deleted="onOneOffDeleted"
    />
  </div>
</template>
