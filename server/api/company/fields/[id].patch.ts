type FieldPatchBody = {
  label?: string
  value?: string
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'company', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<FieldPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.label !== undefined) {
    const label = String(body.label).trim()
    if (!label) throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
    update.label = label
  }

  if (body.value !== undefined) {
    const value = String(body.value).trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'Värde saknas' })
    update.value = value
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('company_info_fields')
    .update(update)
    .eq('id', id)
    .select('id, label, value, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { field: data }
})
