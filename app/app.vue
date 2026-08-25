<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()
const route = useRoute()
const { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings } = usePermissions()
const { canInstall, install } = useInstallPrompt()

const navLinks = computed(() => {
  const links = []
  if (canViewMembers.value) links.push({ to: '/medlemmar', label: 'Medlemmar' })
  if (canViewStaff.value) links.push({ to: '/personal', label: 'Personal' })
  if (canViewSchedule.value) links.push({ to: '/schema', label: 'Schema' })
  if (canViewOrders.value) links.push({ to: '/bestallningar', label: 'Beställningar' })
  if (canViewOrders.value) links.push({ to: '/webshop-ordrar', label: 'Webshop-ordrar' })
  if (canViewBookings.value) links.push({ to: '/bordsbokning', label: 'Bordsbokning' })
  return links
})

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-lyktan-surface">
    <header
      v-if="loggedIn && route.path !== '/login'"
      class="border-b border-black/8 bg-lyktan-paper"
    >
      <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div class="flex items-center gap-6">
          <NuxtLink to="/" class="font-semibold text-lyktan-ink">Butik Lyktan · Admin</NuxtLink>
          <nav class="flex items-center gap-4 text-sm">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="text-lyktan-mute hover:text-lyktan-ink"
              active-class="font-medium text-lyktan-ink"
            >
              {{ link.label }}
            </NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-4 text-sm text-lyktan-mute">
          <button
            v-if="canInstall"
            type="button"
            class="rounded-full border border-black/15 px-4 py-1.5 font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
            @click="install"
          >
            Ladda hem appen
          </button>
          <span>{{ user?.email }}</span>
          <button
            type="button"
            class="rounded-full border border-black/15 px-4 py-1.5 font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
            @click="logout"
          >
            Logga ut
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <NuxtPage />
    </main>
  </div>
</template>
