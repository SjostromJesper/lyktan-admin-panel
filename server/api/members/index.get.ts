export default defineEventHandler(async (event) => {
  await requireAccess(event, 'members', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, phone, email, age, tier, expiry_date, renewed_at, qr_token, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { members: data ?? [] }
})
