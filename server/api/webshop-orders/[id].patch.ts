type Body = { checked?: boolean }

export default defineEventHandler(async (event) => {
  const admin = await requireAccess(event, 'orders', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<Body>(event)
  const supabase = useSupabaseAdmin()

  if (body.checked) {
    const { error } = await supabase
      .from('webshop_order_checkoffs')
      .upsert({ shopify_order_id: id, checked_at: new Date().toISOString(), checked_by: admin.email })

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  } else {
    const { error } = await supabase.from('webshop_order_checkoffs').delete().eq('shopify_order_id', id)

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
