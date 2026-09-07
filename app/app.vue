<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()
const route = useRoute()
const { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings, canViewCompany, canViewProducts, canViewAnalytics } = usePermissions()
const { canInstall, install } = useInstallPrompt()

const navLinks = computed(() => {
  const links = []
  if (canViewMembers.value) links.push({ to: '/medlemmar', label: 'Medlemmar' })
  if (canViewStaff.value) links.push({ to: '/personal', label: 'Personal' })
  if (canViewSchedule.value) links.push({ to: '/schema', label: 'Schema' })
  if (canViewOrders.value) links.push({ to: '/bestallningar', label: 'Beställningar' })
  if (canViewOrders.value) links.push({ to: '/webshop-ordrar', label: 'Webshop-ordrar' })
  if (canViewOrders.value) links.push({ to: '/gw-katalog', label: 'GW-katalog' })
  if (canViewBookings.value) links.push({ to: '/bordsbokning', label: 'Bordsbokning' })
  if (canViewCompany.value) links.push({ to: '/foretag', label: 'Företag' })
  if (canViewProducts.value) links.push({ to: '/produkter', label: 'Produkter' })
  if (canViewAnalytics.value) links.push({ to: '/analytics', label: 'Statistik' })
  return links
})

const mobileMenuOpen = ref(false)

watch(() => route.path, () => {
  mobileMenuOpen.value = false
})

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-lyktan-surface">
    <VitePwaManifest />

    <header
      v-if="loggedIn && route.path !== '/login'"
      class="border-b border-black/8 bg-lyktan-paper"
    >
      <div class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div class="flex min-w-0 items-center gap-6">
          <NuxtLink to="/" class="shrink-0 font-semibold text-lyktan-ink">Butik Lyktan · Admin</NuxtLink>
          <nav class="hidden items-center gap-4 text-sm lg:flex">
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

        <div class="hidden items-center gap-4 text-sm text-lyktan-mute lg:flex">
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

        <button
          type="button"
          aria-label="Meny"
          class="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full text-lyktan-ink transition hover:bg-black/5 lg:hidden"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <svg v-if="!mobileMenuOpen" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div v-if="mobileMenuOpen" class="border-t border-black/8 px-4 py-3 lg:hidden">
        <nav class="grid gap-1 text-sm">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="rounded-lg px-2 py-2 text-lyktan-mute hover:bg-black/[0.04] hover:text-lyktan-ink"
            active-class="font-medium text-lyktan-ink"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>

        <div class="mt-3 grid gap-2 border-t border-black/8 pt-3 text-sm text-lyktan-mute">
          <span class="px-2">{{ user?.email }}</span>
          <button
            v-if="canInstall"
            type="button"
            class="rounded-full border border-black/15 px-4 py-1.5 font-medium text-lyktan-ink transition hover:bg-black/[0.04]"
            @click="install"
          >
            Ladda hem appen
          </button>
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
