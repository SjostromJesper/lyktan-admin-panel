const ROUTE_PERMISSIONS: Record<string, 'canViewMembers' | 'canViewStaff' | 'canViewSchedule' | 'canViewOrders' | 'canViewBookings' | 'canViewCompany' | 'canViewProducts' | 'canViewAnalytics' | 'canViewStoreCredit' | 'canViewKortinkop' | 'canViewEvents' | 'canViewScan'> = {
  '/medlemmar': 'canViewMembers',
  '/personal': 'canViewStaff',
  '/schema': 'canViewSchedule',
  '/bestallningar': 'canViewOrders',
  '/webshop-ordrar': 'canViewOrders',
  '/bordsbokning': 'canViewBookings',
  '/foretag': 'canViewCompany',
  '/produkter': 'canViewProducts',
  '/analytics': 'canViewAnalytics',
  '/store-credit': 'canViewStoreCredit',
  '/kortinkop': 'canViewKortinkop',
  '/event': 'canViewEvents',
  '/skanning': 'canViewScan',
  '/singlar': 'canViewScan'
}

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (to.path === '/login') {
    return
  }

  if (!loggedIn.value) {
    return navigateTo('/login')
  }

  const requiredPermission = ROUTE_PERMISSIONS[to.path]

  if (requiredPermission) {
    const { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings, canViewCompany, canViewProducts, canViewAnalytics, canViewStoreCredit, canViewKortinkop, canViewEvents, canViewScan } = usePermissions()
    const has = { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings, canViewCompany, canViewProducts, canViewAnalytics, canViewStoreCredit, canViewKortinkop, canViewEvents, canViewScan }[requiredPermission]

    if (!has.value) {
      return navigateTo('/')
    }
  }
})
