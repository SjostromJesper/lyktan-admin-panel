type StaffBody = {
  name?: string
  role?: string
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'staff', 'edit')

  const body = await readBody<StaffBody>(event)

  const name = String(body?.name || '').trim()
  const role = body?.role ? String(body.role).trim() : ''

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('staff')
    .insert({ name, role: role || null })
    .select('id, name, role, active, email, members_access, staff_access, schedule_access, orders_access, bookings_access, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { staff: data }
})
