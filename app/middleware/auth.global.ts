const ROUTE_PERMISSIONS: Record<string, 'canViewMembers' | 'canViewStaff' | 'canViewSchedule' | 'canViewOrders' | 'canViewBookings'> = {
  '/medlemmar': 'canViewMembers',
  '/personal': 'canViewStaff',
  '/schema': 'canViewSchedule',
  '/bestallningar': 'canViewOrders',
  '/webshop-ordrar': 'canViewOrders',
  '/bordsbokning': 'canViewBookings'
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
    const { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings } = usePermissions()
    const has = { canViewMembers, canViewStaff, canViewSchedule, canViewOrders, canViewBookings }[requiredPermission]

    if (!has.value) {
      return navigateTo('/')
    }
  }
})
