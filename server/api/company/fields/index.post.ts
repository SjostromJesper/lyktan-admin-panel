type FieldBody = {
  label?: string
  value?: string
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'company', 'edit')

  const body = await readBody<FieldBody>(event)

  const label = String(body?.label || '').trim()
  const value = String(body?.value || '').trim()

  if (!label) {
    throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
  }

  if (!value) {
    throw createError({ statusCode: 400, statusMessage: 'Värde saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('company_info_fields')
    .insert({ label, value })
    .select('id, label, value, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { field: data }
})
