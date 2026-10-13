// Called by the browser once every image is uploaded: flips the batch from
// 'uploading' to 'uploaded' after checking the files really are in Storage.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: items, error } = await supabase
    .from('scan_items')
    .select('image_path')
    .eq('batch_id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const { data: files, error: listError } = await supabase.storage.from('scan-images').list(id, { limit: 1000 })

  if (listError) {
    throw createError({ statusCode: 500, statusMessage: listError.message })
  }

  const present = new Set((files ?? []).map((f) => `${id}/${f.name}`))
  const missing = (items ?? []).filter((i) => !present.has(i.image_path)).length

  if (missing > 0) {
    throw createError({ statusCode: 409, statusMessage: `${missing} bilder saknas i lagringen` })
  }

  const { error: updateError } = await supabase.from('scan_batches').update({ status: 'uploaded' }).eq('id', id)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  return { ok: true }
})
