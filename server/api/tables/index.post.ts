type TableBody = {
  name?: string
  kind?: string
  capacity?: number
  priceKr?: number | null
}

const VALID_KINDS = ['bord', 'rum']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'edit')

  const body = await readBody<TableBody>(event)

  const name = String(body?.name || '').trim()
  const kind = String(body?.kind || '').trim()
  const capacity = Number(body?.capacity)
  const priceKr = body?.priceKr !== undefined && body.priceKr !== null && String(body.priceKr) !== '' ? Number(body.priceKr) : null

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
  }

  if (!VALID_KINDS.includes(kind)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig typ' })
  }

  if (!Number.isInteger(capacity) || capacity < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig kapacitet' })
  }

  if (priceKr !== null && (!Number.isFinite(priceKr) || priceKr < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt pris' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('tables')
    .insert({ name, kind, capacity, price_kr: priceKr })
    .select('id, name, kind, capacity, price_kr, active, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { table: data }
})
