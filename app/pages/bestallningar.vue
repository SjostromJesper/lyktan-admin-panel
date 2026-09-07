<script setup lang="ts">
type Order = {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  supplier: 'games_workshop' | 'asmodee'
  product_line: string | null
  product_code: string | null
  product_name: string
  price_kr: number | null
  notes: string | null
  status: 'bokad' | 'bestalld' | 'slut_pa_lager' | 'klar'
  ordered_at: string
  completed_at: string | null
  created_at: string
}

const { canEditOrders, canViewMembers } = usePermissions()

const view = ref<'active' | 'klar'>('active')
const orders = ref<Order[]>([])
const loading = ref(true)
const loadError = ref('')

const loadOrders = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ orders: Order[] }>('/api/orders', { query: { status: view.value } })
    orders.value = res.orders
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta beställningar'
  } finally {
    loading.value = false
  }
}

onMounted(loadOrders)
watch(view, loadOrders)

// --- Add order form ---
const addSaving = ref(false)
const addError = ref('')
const gwPaste = ref('')

const newOrder = ref({
  supplier: '' as '' | 'games_workshop' | 'asmodee',
  productLine: '',
  productCode: '',
  productName: '',
  priceKr: null as number | null,
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  notes: ''
})

const showMemberPicker = ref(false)

const applyMember = (member: { first_name: string, last_name: string, phone: string | null, email: string | null }) => {
  newOrder.value.customerName = `${member.first_name} ${member.last_name}`.trim()
  newOrder.value.customerPhone = member.phone || ''
  newOrder.value.customerEmail = member.email || ''
  showMemberPicker.value = false
}

const showCatalogPicker = ref(false)

const applyCatalogItem = (item: { ss_code: string, description: string, price_retail_kr: number | null }) => {
  newOrder.value.productCode = item.ss_code
  newOrder.value.productName = item.description
  newOrder.value.priceKr = item.price_retail_kr
  showCatalogPicker.value = false
}

const selectSupplier = (supplier: 'games_workshop' | 'asmodee') => {
  newOrder.value.supplier = supplier
  newOrder.value.productLine = ''
  newOrder.value.productCode = ''
  newOrder.value.productName = ''
  newOrder.value.priceKr = null
  gwPaste.value = ''
}

watch(gwPaste, (raw) => {
  const parsed = parseGamesWorkshopRow(raw)
  if (!parsed) return
  newOrder.value.productLine = parsed.productLine
  newOrder.value.productCode = parsed.productCode
  newOrder.value.productName = parsed.productName
  newOrder.value.priceKr = parsed.priceKr
})

const resetAddForm = (keepSupplier: boolean) => {
  const supplier = keepSupplier ? newOrder.value.supplier : ''
  newOrder.value = {
    supplier,
    productLine: '',
    productCode: '',
    productName: '',
    priceKr: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: ''
  }
  gwPaste.value = ''
  addError.value = ''
}

const submitAdd = async () => {
  addSaving.value = true
  addError.value = ''

  try {
    const { order } = await $fetch<{ order: Order }>('/api/orders', {
      method: 'POST',
      body: newOrder.value
    })
    if (view.value === 'active') orders.value.unshift(order)
    resetAddForm(true)
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || 'Kunde inte spara beställningen'
  } finally {
    addSaving.value = false
  }
}

// --- Modal ---
const selectedOrder = ref<Order | null>(null)

const belongsToCurrentView = (order: Order) => (view.value === 'klar' ? order.status === 'klar' : order.status !== 'klar')

const onOrderUpdated = (updated: Order) => {
  if (!belongsToCurrentView(updated)) {
    orders.value = orders.value.filter((o) => o.id !== updated.id)
    selectedOrderIds.value.delete(updated.id)
  } else {
    const idx = orders.value.findIndex((o) => o.id === updated.id)
    if (idx !== -1) orders.value[idx] = updated
  }
  selectedOrder.value = null
}

const onOrderDeleted = (id: string) => {
  orders.value = orders.value.filter((o) => o.id !== id)
  selectedOrderIds.value.delete(id)
  selectedOrder.value = null
}

// --- Checkbox selection + copy-to-clipboard ---
const selectedOrderIds = ref<Set<string>>(new Set())

watch(view, () => {
  selectedOrderIds.value = new Set()
})

const toggleOrderSelection = (id: string) => {
  const next = new Set(selectedOrderIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedOrderIds.value = next
}

const allSelected = computed(() => orders.value.length > 0 && orders.value.every((o) => selectedOrderIds.value.has(o.id)))

const toggleSelectAll = () => {
  selectedOrderIds.value = allSelected.value ? new Set() : new Set(orders.value.map((o) => o.id))
}

// Only offer statuses actually present in the current view — e.g. no point
// showing "Klar" as a quick-select while looking at Aktiva.
const availableStatuses = computed(() => {
  const present = new Set(orders.value.map((o) => o.status))
  return ORDER_STATUSES.filter((s) => present.has(s.value as Order['status']))
})

const isStatusFullySelected = (status: string) => {
  const matching = orders.value.filter((o) => o.status === status)
  return matching.length > 0 && matching.every((o) => selectedOrderIds.value.has(o.id))
}

const selectByStatus = (status: string) => {
  const matchingIds = orders.value.filter((o) => o.status === status).map((o) => o.id)

  if (isStatusFullySelected(status)) {
    const next = new Set(selectedOrderIds.value)
    for (const id of matchingIds) next.delete(id)
    selectedOrderIds.value = next
  } else {
    selectedOrderIds.value = new Set([...selectedOrderIds.value, ...matchingIds])
  }
}

const copyFeedback = ref(false)

const copySelectedList = async () => {
  const selected = orders.value.filter((o) => selectedOrderIds.value.has(o.id))

  if (!selected.length) return

  const tally = new Map<string, { code: string | null, name: string, count: number }>()

  for (const order of selected) {
    const key = `${order.product_code || ''}|${order.product_name}`

    if (!tally.has(key)) {
      tally.set(key, { code: order.product_code, name: order.product_name, count: 0 })
    }

    tally.get(key)!.count += 1
  }

  const lines = [...tally.values()]
    .sort((a, b) => (a.code || '').localeCompare(b.code || '') || a.name.localeCompare(b.name, 'sv-SE'))
    .map((item) => (item.code ? `${item.count}x  ${item.code}  ${item.name}` : `${item.count}x  ${item.name}`))

  const today = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const text = `Beställning – ${today}\n\n${lines.join('\n')}`

  try {
    await navigator.clipboard.writeText(text)
    copyFeedback.value = true
    setTimeout(() => {
      copyFeedback.value = false
    }, 1500)
  } catch {
    // Clipboard API can fail on focus/permission grounds — nothing more to do.
  }
}

// --- Quick status change (no need to open the modal) ---
const quickStatusSavingId = ref<string | null>(null)

const quickSetStatus = async (order: Order, status: Order['status']) => {
  if (status === order.status) return

  quickStatusSavingId.value = order.id

  try {
    const { order: updated } = await $fetch<{ order: Order }>(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: { status }
    })
    onOrderUpdated(updated)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte uppdatera status'
  } finally {
    quickStatusSavingId.value = null
  }
}
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Beställningar</h1>

    <form
      v-if="canEditOrders"
      class="mb-8 rounded-2xl border border-black/8 bg-lyktan-paper p-6"
      @submit.prevent="submitAdd"
    >
      <h2 class="mb-4 text-sm font-semibold text-lyktan-ink">Ny beställning</h2>

      <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Leverantör</span>
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="(label, key) in SUPPLIER_LABELS"
          :key="key"
          type="button"
          class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
          :class="newOrder.supplier === key ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
          @click="selectSupplier(key as 'games_workshop' | 'asmodee')"
        >
          {{ label }}
        </button>
      </div>

      <template v-if="newOrder.supplier === 'games_workshop'">
        <div class="mb-6">
          <button
            type="button"
            class="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
            @click="showCatalogPicker = true"
          >
            Sök i katalogen
          </button>
        </div>

        <label class="mb-6 block">
          <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Eller klistra in raden från Games Workshop</span>
          <textarea
            v-model="gwPaste"
            rows="2"
            class="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-xs"
            placeholder="9/5/26  Warhammer 40,000  40K - Xenos - Orks  50-74  99120103135  ..."
          />
        </label>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kortkod</span>
            <input v-model="newOrder.productCode" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr)</span>
            <input v-model.number="newOrder.priceKr" type="number" min="0" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Produktnamn</span>
            <input v-model="newOrder.productName" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <div v-if="canViewMembers" class="sm:col-span-2">
            <button
              type="button"
              class="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
              @click="showMemberPicker = true"
            >
              Välj befintlig medlem
            </button>
          </div>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kundnamn</span>
            <input v-model="newOrder.customerName" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Telefon</span>
            <input v-model="newOrder.customerPhone" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
            <input v-model="newOrder.customerEmail" type="email" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning</span>
            <input v-model="newOrder.notes" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt">
          </label>
        </div>

        <p v-if="addError" class="mt-3 text-sm text-red-600">{{ addError }}</p>

        <button
          type="submit"
          :disabled="addSaving"
          class="mt-4 inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ addSaving ? 'Sparar…' : 'Spara beställning' }}
        </button>
      </template>

      <template v-else-if="newOrder.supplier === 'asmodee'">
        <span class="mb-2 block text-[0.72rem] font-medium text-lyktan-mute">Kategori</span>
        <div class="mb-6 flex flex-wrap gap-2">
          <button
            v-for="line in PRODUCT_LINES.asmodee"
            :key="line.value"
            type="button"
            class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
            :class="newOrder.productLine === line.value ? 'border-lyktan-accent bg-lyktan-accent text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="newOrder.productLine = line.value"
          >
            {{ line.label }}
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Produkt</span>
            <input v-model="newOrder.productName" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr)</span>
            <input v-model.number="newOrder.priceKr" type="number" min="0" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <div v-if="canViewMembers" class="sm:col-span-2">
            <button
              type="button"
              class="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
              @click="showMemberPicker = true"
            >
              Välj befintlig medlem
            </button>
          </div>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kundnamn</span>
            <input v-model="newOrder.customerName" required class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Telefon</span>
            <input v-model="newOrder.customerPhone" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">E-post</span>
            <input v-model="newOrder.customerEmail" type="email" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning</span>
            <input v-model="newOrder.notes" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm" placeholder="Valfritt">
          </label>
        </div>

        <p v-if="addError" class="mt-3 text-sm text-red-600">{{ addError }}</p>

        <button
          type="submit"
          :disabled="addSaving"
          class="mt-4 inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ addSaving ? 'Sparar…' : 'Spara beställning' }}
        </button>
      </template>
    </form>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-2 text-sm">
        <button
          type="button"
          class="rounded-full border px-4 py-1.5 font-medium transition"
          :class="view === 'active' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
          @click="view = 'active'"
        >
          Aktiva
        </button>
        <button
          type="button"
          class="rounded-full border px-4 py-1.5 font-medium transition"
          :class="view === 'klar' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
          @click="view = 'klar'"
        >
          Historik
        </button>
      </div>

      <div v-if="selectedOrderIds.size" class="flex items-center gap-3 text-sm">
        <span class="text-lyktan-mute">{{ selectedOrderIds.size }} valda</span>
        <button
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-full bg-lyktan-ink px-4 text-sm font-medium text-white transition hover:bg-black"
          @click="copySelectedList"
        >
          {{ copyFeedback ? 'Kopierat!' : 'Kopiera lista' }}
        </button>
      </div>
    </div>

    <div v-if="availableStatuses.length" class="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-[0.72rem] font-medium text-lyktan-mute">Bocka i alla:</span>
      <button
        v-for="status in availableStatuses"
        :key="status.value"
        type="button"
        class="rounded-full border px-3 py-1 text-[0.8rem] font-medium transition"
        :class="isStatusFullySelected(status.value) ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
        @click="selectByStatus(status.value)"
      >
        {{ status.label }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!orders.length" class="text-sm text-lyktan-mute">
      {{ view === 'active' ? 'Inga aktiva beställningar.' : 'Ingen historik ännu.' }}
    </p>

    <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
      <table class="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
            <th class="w-10 px-4 py-3">
              <input type="checkbox" :checked="allSelected" @click.stop @change="toggleSelectAll">
            </th>
            <th class="px-4 py-3">Kund</th>
            <th class="px-4 py-3">Produkt</th>
            <th class="px-4 py-3">Pris</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">{{ view === 'active' ? 'Beställd' : 'Klar' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="order in orders"
            :key="order.id"
            class="cursor-pointer border-b border-black/6 last:border-0 hover:bg-black/[0.02]"
            @click="selectedOrder = order"
          >
            <td class="px-4 py-3" @click.stop>
              <input type="checkbox" :checked="selectedOrderIds.has(order.id)" @change="toggleOrderSelection(order.id)">
            </td>
            <td class="px-4 py-3 font-medium text-lyktan-ink">{{ order.customer_name }}</td>
            <td class="px-4 py-3 text-lyktan-mute">
              {{ order.product_name }}
              <div class="text-[0.72rem]">
                {{ SUPPLIER_LABELS[order.supplier] }}<span v-if="order.product_line"> · {{ productLineLabel(order.supplier, order.product_line) }}</span><span v-if="order.product_code"> · {{ order.product_code }}</span>
              </div>
            </td>
            <td class="px-4 py-3">{{ formatKr(order.price_kr) }}</td>
            <td class="px-4 py-3" @click.stop>
              <select
                v-if="canEditOrders"
                :value="order.status"
                :disabled="quickStatusSavingId === order.id"
                class="cursor-pointer rounded-full border-0 px-2.5 py-1 text-[0.72rem] font-medium disabled:cursor-not-allowed disabled:opacity-40"
                :class="orderStatusBadgeClass(order.status)"
                @change="quickSetStatus(order, ($event.target as HTMLSelectElement).value as Order['status'])"
              >
                <option v-for="s in ORDER_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
              <span v-else class="rounded-full px-2.5 py-1 text-[0.72rem] font-medium" :class="orderStatusBadgeClass(order.status)">
                {{ orderStatusLabel(order.status) }}
              </span>
            </td>
            <td class="px-4 py-3 text-lyktan-mute">{{ view === 'active' ? order.ordered_at : order.completed_at }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <OrderModal
      v-if="selectedOrder"
      :order="selectedOrder"
      @close="selectedOrder = null"
      @updated="onOrderUpdated"
      @deleted="onOrderDeleted"
    />

    <MemberPickerModal
      v-if="showMemberPicker"
      @close="showMemberPicker = false"
      @select="applyMember"
    />

    <GwCatalogPickerModal
      v-if="showCatalogPicker"
      @close="showCatalogPicker = false"
      @select="applyCatalogItem"
    />
  </div>
</template>
