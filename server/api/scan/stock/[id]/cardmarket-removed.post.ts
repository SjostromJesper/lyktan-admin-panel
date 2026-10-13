export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')
  const body = (await readBody(event)) ?? {}

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const { error } = await useSupabaseAdmin()
    .from('scan_items')
    .update({ cardmarket_removed_at: body.undo ? null : new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
