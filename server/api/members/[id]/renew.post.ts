type RenewBody = {
  months?: number
}

const VALID_MONTHS = [1, 6, 12]

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)

export default defineEventHandler(async (event) => {
  const admin = await requireAccess(event, 'members', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<RenewBody>(event)
  const months = Number(body?.months)

  if (!VALID_MONTHS.includes(months)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt antal månader' })
  }

  const supabase = useSupabaseAdmin()

  const { data: existing, error: fetchError } = await supabase
    .from('members')
    .select('expiry_date')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message })
  }

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Medlem hittades inte' })
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Still active → extend from the current expiry. Expired (or never
  // activated) → start fresh from today, per how renewals work in-store.
  let base = today
  const currentExpiry = (existing as any).expiry_date as string | null

  if (currentExpiry) {
    const currentExpiryDate = new Date(`${currentExpiry}T00:00:00Z`)
    if (currentExpiryDate >= today) {
      base = currentExpiryDate
    }
  }

  const newExpiry = new Date(base)
  newExpiry.setUTCMonth(newExpiry.getUTCMonth() + months)

  const { data, error } = await supabase
    .from('members')
    .update({
      expiry_date: toIsoDate(newExpiry),
      renewed_at: toIsoDate(today),
      // A fresh QR code each renewal — an old, photographed code stops
      // working the moment the membership is renewed again.
      qr_token: crypto.randomUUID()
    })
    .eq('id', id)
    .select('id, first_name, last_name, phone, email, age, tier, expiry_date, renewed_at, qr_token, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const { error: historyError } = await supabase.from('membership_renewals').insert({
    member_id: id,
    months,
    previous_expiry_date: currentExpiry,
    new_expiry_date: toIsoDate(newExpiry),
    source: 'admin',
    actor: admin.email
  })

  if (historyError) {
    throw createError({ statusCode: 500, statusMessage: historyError.message })
  }

  return { member: data }
})
