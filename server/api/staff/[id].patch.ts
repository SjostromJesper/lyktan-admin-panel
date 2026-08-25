type StaffPatchBody = {
  name?: string
  role?: string
  active?: boolean
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'staff', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<StaffPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
    }
    update.name = name
  }

  if (body.role !== undefined) update.role = body.role ? String(body.role).trim() || null : null
  if (body.active !== undefined) update.active = Boolean(body.active)

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('staff')
    .update(update)
    .eq('id', id)
    .select('id, name, role, active, email, members_access, staff_access, schedule_access, orders_access, bookings_access, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { staff: data }
})
