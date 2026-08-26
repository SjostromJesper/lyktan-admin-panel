<script setup lang="ts">
type Order = {
  id: string
  name: string
  createdAt: string
  fulfillmentStatus: string
  customerName: string | null
  email: string | null
  phone: string | null
  totalKr: number
  items: { title: string; quantity: number }[]
  isEvent: boolean
  checked: boolean
  checkedAt: string | null
  checkedBy: string | null
}

const { canEditOrders } = usePermissions()

const category = ref<'other' | 'event'>('other')
const view = ref<'active' | 'klar'>('active')
const orders = ref<Order[]>([])
const loading = ref(true)
const loadError = ref('')

const visibleOrders = computed(() => orders.value.filter((o) => o.isEvent === (category.value === 'event')))

const loadOrders = async () => {
  loading.value = true
  loadError.value = ''

  try {
    const res = await $fetch<{ orders: Order[] }>('/api/webshop-orders', { query: { status: view.value } })
    orders.value = res.orders
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte hämta beställningar'
  } finally {
    loading.value = false
  }
}

onMounted(loadOrders)
watch(view, loadOrders)

const savingId = ref<string | null>(null)

const setChecked = async (order: Order, checked: boolean) => {
  savingId.value = order.id

  try {
    await $fetch(`/api/webshop-orders/${order.id}`, { method: 'PATCH', body: { checked } })
    orders.value = orders.value.filter((o) => o.id !== order.id)
  } catch (err: any) {
    loadError.value = err?.data?.statusMessage || 'Kunde inte uppdatera beställningen'
  } finally {
    savingId.value = null
  }
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const itemsSummary = (items: Order['items']) =>
  items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.title}` : i.title)).join(', ')
</script>

<template>
  <div>
    <h1 class="mb-1 text-xl font-semibold text-lyktan-ink">Webshop-ordrar</h1>
    <p class="mb-6 text-sm text-lyktan-mute">
      Beställningar från webshoppen, hämtade direkt från Shopify. Markera som levererad när kunden hämtat.
    </p>

    <div class="mb-3 flex gap-2 text-sm">
      <button
        type="button"
        class="rounded-full border px-4 py-1.5 font-medium transition"
        :class="category === 'other' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
        @click="category = 'other'"
      >
        Produkter
      </button>
      <button
        type="button"
        class="rounded-full border px-4 py-1.5 font-medium transition"
        :class="category === 'event' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
        @click="category = 'event'"
      >
        Event
      </button>
    </div>

    <div class="mb-4 flex gap-2 text-sm">
      <button
        type="button"
        class="rounded-full border px-4 py-1.5 font-medium transition"
        :class="view === 'active' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
        @click="view = 'active'"
      >
        Att hämta ut
      </button>
      <button
        type="button"
        class="rounded-full border px-4 py-1.5 font-medium transition"
        :class="view === 'klar' ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
        @click="view = 'klar'"
      >
        Avbockade
      </button>
    </div>

    <p v-if="loading" class="text-sm text-lyktan-mute">Laddar…</p>
    <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <p v-else-if="!visibleOrders.length" class="text-sm text-lyktan-mute">
      {{ view === 'active' ? 'Inga beställningar att hämta ut.' : 'Inga avbockade beställningar ännu.' }}
    </p>

    <div v-else class="overflow-x-auto rounded-2xl border border-black/8 bg-lyktan-paper">
      <table class="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr class="border-b border-black/8 text-[0.72rem] font-medium text-lyktan-mute">
            <th v-if="canEditOrders" class="px-4 py-3" />
            <th class="px-4 py-3">Order</th>
            <th class="px-4 py-3">Kund</th>
            <th class="px-4 py-3">Produkter</th>
            <th class="px-4 py-3">Summa</th>
            <th class="px-4 py-3">{{ view === 'active' ? 'Beställd' : 'Avbockad' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in visibleOrders" :key="order.id" class="border-b border-black/6 last:border-0">
            <td v-if="canEditOrders" class="px-4 py-3">
              <button
                type="button"
                :disabled="savingId === order.id"
                class="rounded-full border border-black/15 px-3 py-1.5 text-[0.8rem] font-medium text-lyktan-ink transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                @click="setChecked(order, view === 'active')"
              >
                {{ view === 'active' ? 'Levererad' : 'Ångra' }}
              </button>
            </td>
            <td class="px-4 py-3 font-medium text-lyktan-ink">{{ order.name }}</td>
            <td class="px-4 py-3 text-lyktan-mute">
              {{ order.customerName || '—' }}
              <div class="text-[0.72rem]">
                {{ order.email }}<span v-if="order.phone"> · {{ order.phone }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-lyktan-mute">{{ itemsSummary(order.items) }}</td>
            <td class="px-4 py-3">{{ order.totalKr }} kr</td>
            <td class="px-4 py-3 text-lyktan-mute">{{ formatDate(view === 'active' ? order.createdAt : (order.checkedAt || order.createdAt)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
