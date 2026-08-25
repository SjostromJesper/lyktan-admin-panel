export default defineEventHandler(async (event) => {
  const user = await requireAnyAccess(event, [{ section: 'staff' }, { section: 'schedule' }])

  const supabase = useSupabaseAdmin()

  const canSeeAccess = user.isSuperAdmin || user.permissions?.staff === 'edit' || user.permissions?.staff === 'view'
  const columns = canSeeAccess
    ? 'id, name, role, active, email, members_access, staff_access, schedule_access, orders_access, bookings_access, created_at'
    : 'id, name, role, active, created_at'

  const { data, error } = await supabase
    .from('staff')
    .select(columns)
    .order('name', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { staff: data ?? [] }
})
