<script setup lang="ts">
const { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings, canViewCompany, canViewProducts, canViewAnalytics } = usePermissions()

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
  return items
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-xl font-semibold text-lyktan-ink">Butik Lyktan · Admin</h1>

    <div v-if="tools.length" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NuxtLink
        v-for="tool in tools"
        :key="tool.to"
        :to="tool.to"
        class="rounded-2xl border border-black/8 bg-lyktan-paper p-5 transition hover:border-black/20"
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
