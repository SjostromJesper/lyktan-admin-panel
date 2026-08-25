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

const props = defineProps<{ order: Order }>()
const emit = defineEmits<{
  close: []
  updated: [order: Order]
  deleted: [id: string]
}>()

const { canEditOrders } = usePermissions()

const order = ref<Order>({ ...props.order })

watch(() => props.order, (o) => {
  order.value = { ...o }
})

const editDraft = ref({
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  productCode: '',
  productName: '',
  priceKr: null as number | null,
  notes: ''
})

watch(order, (o) => {
  editDraft.value = {
    customerName: o.customer_name,
    customerPhone: o.customer_phone || '',
    customerEmail: o.customer_email || '',
    productCode: o.product_code || '',
    productName: o.product_name,
    priceKr: o.price_kr,
    notes: o.notes || ''
  }
}, { immediate: true })

const saving = ref(false)
const error = ref('')

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const res = await $fetch<{ order: Order }>(`/api/orders/${order.value.id}`, {
      method: 'PATCH',
      body: editDraft.value
    })
    order.value = res.order
    emit('updated', res.order)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte spara ändringar'
  } finally {
    saving.value = false
  }
}

const statusSaving = ref(false)

const setStatus = async (status: Order['status']) => {
  statusSaving.value = true
  error.value = ''

  try {
    const res = await $fetch<{ order: Order }>(`/api/orders/${order.value.id}`, {
      method: 'PATCH',
      body: { status }
    })
    order.value = res.order
    emit('updated', res.order)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte uppdatera status'
  } finally {
    statusSaving.value = false
  }
}

const deleting = ref(false)

const deleteOrder = async () => {
  if (!confirm(`Ta bort beställningen "${order.value.product_name}" för ${order.value.customer_name}?`)) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/orders/${order.value.id}`, { method: 'DELETE' })
    emit('deleted', order.value.id)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Kunde inte ta bort beställningen'
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
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-lyktan-paper p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold text-lyktan-ink">{{ order.product_name }}</h1>
          <p class="text-sm text-lyktan-mute">
            {{ SUPPLIER_LABELS[order.supplier] }}
            <span v-if="order.product_line"> · {{ productLineLabel(order.supplier, order.product_line) }}</span>
          </p>
        </div>
        <button type="button" aria-label="Stäng" class="text-lyktan-mute hover:text-lyktan-ink" @click="emit('close')">✕</button>
      </div>

      <span class="mb-4 inline-block rounded-full px-3 py-1 text-sm font-medium" :class="orderStatusBadgeClass(order.status)">
        {{ orderStatusLabel(order.status) }}<span v-if="order.status === 'klar' && order.completed_at"> · {{ order.completed_at }}</span>
      </span>

      <template v-if="canEditOrders">
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="s in ORDER_STATUSES"
            :key="s.value"
            type="button"
            :disabled="statusSaving"
            class="rounded-full border px-3 py-1 text-[0.8rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            :class="order.status === s.value ? 'border-lyktan-ink bg-lyktan-ink text-white' : 'border-black/15 text-lyktan-ink hover:bg-black/[0.04]'"
            @click="setStatus(s.value as Order['status'])"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="mt-4 space-y-4">
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
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Produkt</span>
            <input v-model="editDraft.productName" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label v-if="order.supplier === 'games_workshop'" class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Kortkod</span>
            <input v-model="editDraft.productCode" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Pris (kr)</span>
            <input v-model.number="editDraft.priceKr" type="number" min="0" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
          </label>

          <label class="block">
            <span class="mb-1 block text-[0.72rem] font-medium text-lyktan-mute">Anteckning</span>
            <input v-model="editDraft.notes" class="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">
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
            :disabled="deleting"
            class="ml-auto text-sm text-red-600 hover:underline disabled:opacity-40"
            @click="deleteOrder"
          >
            Radera beställning
          </button>
        </div>
      </template>

      <template v-else>
        <dl class="mt-4 space-y-3 text-sm">
          <div>
            <dt class="text-[0.72rem] font-medium text-lyktan-mute">Kund</dt>
            <dd class="text-lyktan-ink">{{ order.customer_name }}</dd>
            <dd v-if="order.customer_phone" class="text-lyktan-mute">{{ order.customer_phone }}</dd>
            <dd v-if="order.customer_email" class="text-lyktan-mute">{{ order.customer_email }}</dd>
          </div>
          <div v-if="order.product_code">
            <dt class="text-[0.72rem] font-medium text-lyktan-mute">Kortkod</dt>
            <dd class="text-lyktan-ink">{{ order.product_code }}</dd>
          </div>
          <div>
            <dt class="text-[0.72rem] font-medium text-lyktan-mute">Pris</dt>
            <dd class="text-lyktan-ink">{{ formatKr(order.price_kr) }}</dd>
          </div>
          <div v-if="order.notes">
            <dt class="text-[0.72rem] font-medium text-lyktan-mute">Anteckning</dt>
            <dd class="text-lyktan-ink">{{ order.notes }}</dd>
          </div>
        </dl>
        <p class="mt-4 text-[0.72rem] text-lyktan-mute">Du har bara läsåtkomst till Beställningar.</p>
      </template>
    </div>
  </div>
</template>
