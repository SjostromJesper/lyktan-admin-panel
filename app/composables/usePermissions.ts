type Section = 'members' | 'staff' | 'schedule' | 'orders' | 'bookings' | 'company'
type AccessLevel = 'none' | 'view' | 'edit'

const levelFor = (user: any, section: Section): AccessLevel => {
  if (user?.isSuperAdmin) return 'edit'
  return user?.permissions?.[section] ?? 'none'
}

export const usePermissions = () => {
  const { user } = useUserSession()

  const membersAccess = computed(() => levelFor(user.value, 'members'))
  const staffAccess = computed(() => levelFor(user.value, 'staff'))
  const scheduleAccess = computed(() => levelFor(user.value, 'schedule'))
  const ordersAccess = computed(() => levelFor(user.value, 'orders'))
  const bookingsAccess = computed(() => levelFor(user.value, 'bookings'))
  const companyAccess = computed(() => levelFor(user.value, 'company'))

  return {
    isSuperAdmin: computed(() => Boolean((user.value as any)?.isSuperAdmin)),
    membersAccess,
    staffAccess,
    scheduleAccess,
    ordersAccess,
    bookingsAccess,
    companyAccess,
    canViewMembers: computed(() => membersAccess.value !== 'none'),
    canEditMembers: computed(() => membersAccess.value === 'edit'),
    canViewStaff: computed(() => staffAccess.value !== 'none'),
    canEditStaff: computed(() => staffAccess.value === 'edit'),
    canViewSchedule: computed(() => scheduleAccess.value !== 'none'),
    canEditSchedule: computed(() => scheduleAccess.value === 'edit'),
    canViewOrders: computed(() => ordersAccess.value !== 'none'),
    canEditOrders: computed(() => ordersAccess.value === 'edit'),
    canViewBookings: computed(() => bookingsAccess.value !== 'none'),
    canEditBookings: computed(() => bookingsAccess.value === 'edit'),
    canViewCompany: computed(() => companyAccess.value !== 'none'),
    canEditCompany: computed(() => companyAccess.value === 'edit')
  }
}
