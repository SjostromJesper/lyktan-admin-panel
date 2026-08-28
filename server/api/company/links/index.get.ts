export default defineEventHandler(async (event) => {
  await requireAccess(event, 'company', 'view')

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('company_links')
    .select('id, title, url, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { links: data ?? [] }
})
