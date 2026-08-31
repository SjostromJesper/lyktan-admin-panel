type TablePatchBody = {
  name?: string
  publicName?: string | null
  kind?: string
  capacity?: number
  priceKr?: number | null
  active?: boolean
}

const VALID_KINDS = ['bord', 'rum']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<TablePatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
    update.name = name
  }

  if (body.publicName !== undefined) {
    update.public_name = body.publicName ? String(body.publicName).trim() || null : null
  }

  if (body.kind !== undefined) {
    if (!VALID_KINDS.includes(body.kind)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig typ' })
    }
    update.kind = body.kind
  }

  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity)
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig kapacitet' })
    }
    update.capacity = capacity
  }

  if (body.priceKr !== undefined) {
    const priceKr = body.priceKr === null || String(body.priceKr) === '' ? null : Number(body.priceKr)
    if (priceKr !== null && (!Number.isFinite(priceKr) || priceKr < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltigt pris' })
    }
    update.price_kr = priceKr
  }

  if (body.active !== undefined) update.active = Boolean(body.active)

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('tables')
    .update(update)
    .eq('id', id)
    .select('id, name, public_name, kind, capacity, price_kr, active, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { table: data }
})
