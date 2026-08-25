export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { error } = await supabase.from('tables').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      throw createError({ statusCode: 409, statusMessage: 'Bordet har bokningar och kan inte tas bort — inaktivera det istället' })
    }

    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
