type MemberPatchBody = {
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

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<MemberPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.firstName !== undefined) update.first_name = String(body.firstName).trim()
  if (body.lastName !== undefined) update.last_name = String(body.lastName).trim()
  if (body.phone !== undefined) update.phone = body.phone ? String(body.phone).trim() || null : null
  if (body.email !== undefined) update.email = body.email ? String(body.email).trim().toLowerCase() || null : null

  if (body.age !== undefined) {
    const age = body.age === null || String(body.age) === '' ? null : Number(body.age)
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 130)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig ålder' })
    }
    update.age = age
  }

  if (body.tier !== undefined) {
    if (!VALID_TIERS.includes(body.tier)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig medlemskapstyp' })
    }
    update.tier = body.tier
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('members')
    .update(update)
    .eq('id', id)
    .select('id, first_name, last_name, phone, email, age, tier, expiry_date, renewed_at, qr_token, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { member: data }
})
