type AccessLevel = 'none' | 'view' | 'edit'

type AccessBody = {
  email?: string
  password?: string
  membersAccess?: AccessLevel
  staffAccess?: AccessLevel
  scheduleAccess?: AccessLevel
  ordersAccess?: AccessLevel
  bookingsAccess?: AccessLevel
  companyAccess?: AccessLevel
}

const VALID_LEVELS: AccessLevel[] = ['none', 'view', 'edit']
const normalizeLevel = (value: unknown): AccessLevel => (VALID_LEVELS.includes(value as AccessLevel) ? (value as AccessLevel) : 'none')

const SELECT_COLUMNS = 'id, name, role, active, email, members_access, staff_access, schedule_access, orders_access, bookings_access, company_access, created_at'

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'staff', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<AccessBody>(event)
  const email = body?.email ? String(body.email).trim().toLowerCase() : ''
  const password = body?.password ? String(body.password) : ''

  const supabase = useSupabaseAdmin()

  if (!email) {
    // No email = revoke: the person can no longer log in, but the staff
    // record (and their shifts) stay untouched. Their Supabase Auth
    // account, if any, is left alone rather than deleted.
    const { data, error } = await supabase
      .from('staff')
      .update({ email: null, members_access: 'none', staff_access: 'none', schedule_access: 'none', orders_access: 'none', bookings_access: 'none', company_access: 'none' })
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    return { staff: data }
  }

  if (email === SUPER_ADMIN_EMAIL) {
    throw createError({ statusCode: 400, statusMessage: 'Den e-postadressen är redan huvudadmin' })
  }

  const membersAccess = normalizeLevel(body?.membersAccess)
  const staffAccess = normalizeLevel(body?.staffAccess)
  const scheduleAccess = normalizeLevel(body?.scheduleAccess)
  const ordersAccess = normalizeLevel(body?.ordersAccess)
  const bookingsAccess = normalizeLevel(body?.bookingsAccess)
  const companyAccess = normalizeLevel(body?.companyAccess)

  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password: password || undefined,
    email_confirm: true
  })

  if (createError) {
    const alreadyExists = /already|exists|registered/i.test(createError.message)

    if (!alreadyExists) {
      throw createError({ statusCode: 500, statusMessage: createError.message })
    }

    if (password) {
      const { data: list, error: listError } = await supabase.auth.admin.listUsers()

      if (listError) {
        throw createError({ statusCode: 500, statusMessage: listError.message })
      }

      const existingUser = list.users.find((u) => u.email?.toLowerCase() === email)

      if (existingUser) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, { password })

        if (updateError) {
          throw createError({ statusCode: 500, statusMessage: updateError.message })
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('staff')
    .update({
      email,
      members_access: membersAccess,
      staff_access: staffAccess,
      schedule_access: scheduleAccess,
      orders_access: ordersAccess,
      bookings_access: bookingsAccess,
      company_access: companyAccess
    })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'En annan person använder redan den e-postadressen' })
    }

    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { staff: data }
})
