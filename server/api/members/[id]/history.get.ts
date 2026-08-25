export default defineEventHandler(async (event) => {
  await requireAccess(event, 'members', 'view')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('membership_renewals')
    .select('id, months, previous_expiry_date, new_expiry_date, source, actor, created_at')
    .eq('member_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { history: data ?? [] }
})
