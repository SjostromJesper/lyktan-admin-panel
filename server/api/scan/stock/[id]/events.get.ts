export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const id = getRouterParam(event, 'id')

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const { data, error } = await useSupabaseAdmin()
    .from('stock_event')
    .select('id, from_status, to_status, channel, note, shopify_delta, created_by, created_at')
    .eq('scan_item_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { events: data ?? [] }
})
