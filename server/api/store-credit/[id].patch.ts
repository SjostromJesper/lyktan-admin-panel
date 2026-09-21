type PatchBody = {
  redeemed?: boolean
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<PatchBody>(event)
  const redeemed = Boolean(body?.redeemed)

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('store_credit_grants')
    .update({ redeemed, redeemed_at: redeemed ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id, customer_name, type, event_name, custom_text, reason, redeemed, redeemed_at, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { grant: data }
})
