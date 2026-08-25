type VerifyBody = {
  token?: string
}

export default defineEventHandler(async (event) => {
  const admin = await requireAccess(event, 'members', 'view')

  const body = await readBody<VerifyBody>(event)
  const token = String(body?.token || '').trim()

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Ingen QR-kod angiven' })
  }

  const supabase = useSupabaseAdmin()

  const { data: member, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, tier, expiry_date')
    .eq('qr_token', token)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const m = member as any

  let approved: boolean
  let reason: string | null = null
  let memberName: string | null = null

  if (!m) {
    approved = false
    reason = 'not_found'
  } else {
    memberName = `${m.first_name} ${m.last_name}`

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const expiryDate = m.expiry_date ? new Date(`${m.expiry_date}T00:00:00Z`) : null

    approved = Boolean(expiryDate && expiryDate >= today)
    reason = approved ? null : (expiryDate ? 'expired' : 'never_activated')
  }

  const { error: logError } = await supabase.from('member_scans').insert({
    member_id: m?.id || null,
    member_name: memberName,
    approved,
    reason,
    scanned_by: admin.email
  })

  if (logError) {
    throw createError({ statusCode: 500, statusMessage: logError.message })
  }

  if (!m) {
    return { approved: false, reason: 'not_found' }
  }

  return {
    approved,
    reason,
    member: {
      name: memberName,
      tier: m.tier,
      expiryDate: m.expiry_date
    }
  }
})
