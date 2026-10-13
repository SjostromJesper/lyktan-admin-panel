export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: items } = await supabase.from('scan_items').select('image_path').eq('batch_id', id)
  const paths = (items ?? []).map((i) => i.image_path)

  if (paths.length) {
    await supabase.storage.from('scan-images').remove(paths)
  }

  const { error } = await supabase.from('scan_batches').delete().eq('id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
