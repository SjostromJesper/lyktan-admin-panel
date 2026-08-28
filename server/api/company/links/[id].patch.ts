type LinkPatchBody = {
  title?: string
  url?: string
}

const normalizeUrl = (raw: string): string => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'company', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<LinkPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = String(body.title).trim()
    if (!title) throw createError({ statusCode: 400, statusMessage: 'Titel saknas' })
    update.title = title
  }

  if (body.url !== undefined) {
    const url = String(body.url).trim()
    if (!url) throw createError({ statusCode: 400, statusMessage: 'Länk saknas' })
    update.url = normalizeUrl(url)
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('company_links')
    .update(update)
    .eq('id', id)
    .select('id, title, url, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { link: data }
})
