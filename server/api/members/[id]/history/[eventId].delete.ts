export default defineEventHandler(async (event) => {
  await requireAccess(event, 'members', 'edit')

  const id = getRouterParam(event, 'id')
  const eventId = getRouterParam(event, 'eventId')

  if (!id || !eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: latest, error: latestError } = await supabase
    .from('membership_renewals')
    .select('id, previous_expiry_date')
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    throw createError({ statusCode: 500, statusMessage: latestError.message })
  }

  if (!latest || (latest as any).id !== eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Endast den senaste förnyelsen kan ångras' })
  }

  const { error: deleteError } = await supabase.from('membership_renewals').delete().eq('id', eventId)

  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: deleteError.message })
  }

  const { data: previousEvent, error: prevError } = await supabase
    .from('membership_renewals')
    .select('created_at')
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (prevError) {
    throw createError({ statusCode: 500, statusMessage: prevError.message })
  }

  const newRenewedAt = previousEvent ? String((previousEvent as any).created_at).slice(0, 10) : null

  const { data, error } = await supabase
    .from('members')
    .update({
      expiry_date: (latest as any).previous_expiry_date,
      renewed_at: newRenewedAt
    })
    .eq('id', id)
    .select('id, first_name, last_name, phone, email, age, tier, expiry_date, renewed_at, qr_token, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { member: data }
})
