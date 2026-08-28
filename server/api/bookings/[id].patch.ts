type BookingPatchBody = {
  status?: 'pending' | 'confirmed' | 'cancelled'
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  partySize?: number
}

const VALID_STATUSES = ['pending', 'confirmed', 'cancelled']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<BookingPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig status' })
    }
    update.status = body.status
  }

  if (body.customerName !== undefined) {
    const name = String(body.customerName).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Kundnamn saknas' })
    update.customer_name = name
  }

  if (body.customerPhone !== undefined) update.customer_phone = body.customerPhone ? String(body.customerPhone).trim() || null : null
  if (body.customerEmail !== undefined) update.customer_email = body.customerEmail ? String(body.customerEmail).trim().toLowerCase() || null : null

  if (body.partySize !== undefined) {
    const partySize = Number(body.partySize)
    if (!Number.isInteger(partySize) || partySize < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltigt antal personer' })
    }
    update.party_size = partySize
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', id)
    .select('id, table_id, booking_date, start_time, end_time, party_size, for_miniatures, customer_name, customer_phone, customer_email, notes, status, created_at, member_id, tables ( name, kind ), members ( first_name, last_name, tier )')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { booking: data }
})
