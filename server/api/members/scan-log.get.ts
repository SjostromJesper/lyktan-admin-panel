export default defineEventHandler(async (event) => {
  await requireAccess(event, 'members', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('member_scans')
    .select('id, member_id, member_name, approved, reason, scanned_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { scans: data ?? [] }
})
