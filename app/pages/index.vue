<script setup lang="ts">
type CartEvent = {
  id: string
  product_title: string
  variant_title: string | null
  quantity: number
  price_kr: number | null
  created_at: string
}

const { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings, canViewCompany, canViewProducts, canViewAnalytics, canViewStoreCredit } = usePermissions()

const cartEvents = ref<CartEvent[]>([])
let cartActivityTimer: ReturnType<typeof setInterval> | null = null

const loadCartActivity = async () => {
  try {
    const res = await $fetch<{ events: CartEvent[] }>('/api/cart-activity')
    cartEvents.value = res.events
  } catch {
    // Silent — this is a nice-to-have live feed, not core functionality.
  }
}

const formatEventTime = (value: string) => new Date(value).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

onMounted(() => {
  loadCartActivity()
  cartActivityTimer = setInterval(loadCartActivity, 6000)
})

onBeforeUnmount(() => {
  if (cartActivityTimer) clearInterval(cartActivityTimer)
})

const tools = computed(() => {
  const items = []
  if (canViewMembers.value) items.push({ to: '/medlemmar', title: 'Medlemmar', description: 'Hantera medlemskap, förnyelser och historik.' })
  if (canViewStaff.value) items.push({ to: '/personal', title: 'Personal', description: 'Lägg till och hantera de som jobbar i butiken.' })
  if (canViewSchedule.value) items.push({ to: '/schema', title: 'Schema', description: 'Planera arbetspass vecka för vecka.' })
  if (canViewOrders.value) items.push({ to: '/bestallningar', title: 'Beställningar', description: 'Hantera kundbeställningar och hämtningar.' })
  if (canViewOrders.value) items.push({ to: '/webshop-ordrar', title: 'Webshop-ordrar', description: 'Se och bocka av beställningar från webshoppen.' })
  if (canViewBookings.value) items.push({ to: '/bordsbokning', title: 'Bordsbokning', description: 'Hantera bord och bokningar.' })
  if (canViewCompany.value) items.push({ to: '/foretag', title: 'Företag', description: 'Företagsuppgifter och viktiga länkar.' })
  if (canViewProducts.value) items.push({ to: '/produkter', title: 'Produkter', description: 'Skapa och hantera produkter i webshoppen.' })
  if (canViewAnalytics.value) items.push({ to: '/analytics', title: 'Statistik', description: 'Besökare, sidvisningar och trafikkällor för webshoppen.' })
  if (canViewStoreCredit.value) items.push({ to: '/store-credit', title: 'Store credit', description: 'Ge kunder tillgodo och fritt tillträde till event.' })
  return items
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Butik Lyktan · Admin</h1>

    <div v-if="cartEvents.length" class="panel mb-6">
      <h2>Nyss i kundvagnen</h2>
      <ul class="grid gap-2 text-sm">
        <li v-for="ev in cartEvents" :key="ev.id" class="flex flex-wrap items-baseline gap-x-2">
          <span class="mono" style="color:var(--muted)">{{ formatEventTime(ev.created_at) }}</span>
          <span>
            <template v-if="ev.quantity > 1">{{ ev.quantity }}×</template>
            {{ ev.product_title }}<template v-if="ev.variant_title"> ({{ ev.variant_title }})</template>
            lades i en kundvagn
          </span>
        </li>
      </ul>
    </div>

    <div v-if="tools.length" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NuxtLink
        v-for="tool in tools"
        :key="tool.to"
        :to="tool.to"
        class="rounded-2xl border border-[var(--line)] bg-lyktan-paper p-5 transition hover:border-[var(--muted)]"
      >
        <h2 class="mb-1 font-medium text-lyktan-ink">{{ tool.title }}</h2>
        <p class="text-sm text-lyktan-mute">{{ tool.description }}</p>
      </NuxtLink>
    </div>

    <p v-else class="text-sm text-lyktan-mute">
      Du har inte fått åtkomst till några delar än. Kontakta jesper@butiklyktan.se.
    </p>
  </div>
</template>
