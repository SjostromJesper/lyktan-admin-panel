// "Bekräfta bunt": allowed once every card is confirmed, skipped or marked unidentified.
export default defineEventHandler(async (event) => {
  await requireAccess(event, 'scan', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: items, error } = await supabase.from('scan_items').select('status').eq('batch_id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const open = (items ?? []).filter((i) => !['confirmed', 'skipped', 'unidentified'].includes(i.status)).length

  if (open > 0) {
    throw createError({ statusCode: 409, statusMessage: `${open} kort är inte klara än` })
  }

  const confirmed = (items ?? []).filter((i) => i.status === 'confirmed').length

  const { error: updateError } = await supabase.from('scan_batches').update({ status: 'confirmed' }).eq('id', id)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  return { ok: true, confirmed }
})
