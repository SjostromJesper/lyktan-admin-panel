type LinkBody = {
  title?: string
  url?: string
}

const normalizeUrl = (raw: string): string => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'company', 'edit')

  const body = await readBody<LinkBody>(event)

  const title = String(body?.title || '').trim()
  const url = String(body?.url || '').trim()

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Titel saknas' })
  }

  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'Länk saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('company_links')
    .insert({ title, url: normalizeUrl(url) })
    .select('id, title, url, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { link: data }
})
