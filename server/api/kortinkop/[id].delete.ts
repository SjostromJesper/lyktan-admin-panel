export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: offer, error: offerError } = await supabase
    .from('buy_offers')
    .select('id, status')
    .eq('id', id)
    .single()

  if (offerError) {
    throw createError({ statusCode: 404, statusMessage: 'Erbjudandet hittades inte' })
  }

  if (offer.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'Bara utkast kan tas bort' })
  }

  const { error } = await supabase.from('buy_offers').delete().eq('id', id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
