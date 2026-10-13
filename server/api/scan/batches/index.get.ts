export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'view')

  const supabase = useSupabaseAdmin()

  const { data: batches, error } = await supabase
    .from('scan_batches')
    .select('id, name, note, status, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const ids = (batches ?? []).map((b) => b.id)
  const counts = new Map<string, number>()

  if (ids.length) {
    const { data: items, error: itemsError } = await supabase
      .from('scan_items')
      .select('batch_id')
      .in('batch_id', ids)

    if (itemsError) {
      throw createError({ statusCode: 500, statusMessage: itemsError.message })
    }

    for (const item of items ?? []) {
      counts.set(item.batch_id, (counts.get(item.batch_id) ?? 0) + 1)
    }
  }

  return { batches: (batches ?? []).map((b) => ({ ...b, item_count: counts.get(b.id) ?? 0 })) }
})
