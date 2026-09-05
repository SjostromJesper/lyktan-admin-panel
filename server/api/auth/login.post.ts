type LoginBody = {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)

  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'E-post och lösenord krävs' })
  }

  const supabase = useSupabaseAdmin()

  const isSuperAdmin = email === SUPER_ADMIN_EMAIL
  let permissions = { members: 'none', staff: 'none', schedule: 'none', orders: 'none', bookings: 'none', company: 'none', products: 'none' } as const as {
    members: 'none' | 'view' | 'edit'
    staff: 'none' | 'view' | 'edit'
    schedule: 'none' | 'view' | 'edit'
    orders: 'none' | 'view' | 'edit'
    bookings: 'none' | 'view' | 'edit'
    company: 'none' | 'view' | 'edit'
    products: 'none' | 'view' | 'edit'
  }

  if (!isSuperAdmin) {
    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('active, members_access, staff_access, schedule_access, orders_access, bookings_access, company_access, products_access')
      .eq('email', email)
      .maybeSingle()

    if (staffError) {
      throw createError({ statusCode: 500, statusMessage: staffError.message })
    }

    if (!staffRow || !(staffRow as any).active) {
      throw createError({ statusCode: 401, statusMessage: 'Fel e-post eller lösenord' })
    }

    permissions = {
      members: (staffRow as any).members_access,
      staff: (staffRow as any).staff_access,
      schedule: (staffRow as any).schedule_access,
      orders: (staffRow as any).orders_access,
      bookings: (staffRow as any).bookings_access,
      company: (staffRow as any).company_access,
      products: (staffRow as any).products_access
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Fel e-post eller lösenord' })
  }

  await setUserSession(event, {
    user: { email, isSuperAdmin, permissions }
  })

  return { email, isSuperAdmin, permissions }
})
