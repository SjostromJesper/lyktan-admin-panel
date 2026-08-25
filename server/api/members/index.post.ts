type MemberBody = {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  age?: number | null
  tier?: string
}

const VALID_TIERS = ['litet', 'stort']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'members', 'edit')

  const body = await readBody<MemberBody>(event)

  const firstName = String(body?.firstName || '').trim()
  const lastName = String(body?.lastName || '').trim()
  const phone = body?.phone ? String(body.phone).trim() : ''
  const email = body?.email ? String(body.email).trim().toLowerCase() : ''
  const age = body?.age !== undefined && body.age !== null && String(body.age) !== '' ? Number(body.age) : null
  const tier = String(body?.tier || '').trim()

  if (!firstName) {
    throw createError({ statusCode: 400, statusMessage: 'Förnamn saknas' })
  }

  if (!lastName) {
    throw createError({ statusCode: 400, statusMessage: 'Efternamn saknas' })
  }

  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 130)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig ålder' })
  }

  if (!VALID_TIERS.includes(tier)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig medlemskapstyp' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('members')
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      email: email || null,
      age,
      tier
    })
    .select('id, first_name, last_name, phone, email, age, tier, expiry_date, renewed_at, qr_token, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { member: data }
})
