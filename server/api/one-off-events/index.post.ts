type OneOffEventBody = {
  name?: string
  eventDate?: string
  startTime?: string
  endTime?: string
  tableIds?: string[]
}

const TIME_RE = /^\d{2}:\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'edit')

  const body = await readBody<OneOffEventBody>(event)

  const name = String(body?.name || '').trim()
  const eventDate = String(body?.eventDate || '').trim()
  const startTime = String(body?.startTime || '').trim()
  const endTime = String(body?.endTime || '').trim()
  const tableIds = Array.isArray(body?.tableIds) ? body.tableIds.filter((id) => typeof id === 'string' && id) : []

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
  }

  if (!DATE_RE.test(eventDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datum' })
  }

  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig tid' })
  }

  if (startTime >= endTime) {
    throw createError({ statusCode: 400, statusMessage: 'Sluttiden måste vara efter starttiden' })
  }

  if (!tableIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Välj minst ett bord' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('one_off_events')
    .insert({ name, event_date: eventDate, start_time: startTime, end_time: endTime, table_ids: tableIds })
    .select('id, name, event_date, start_time, end_time, table_ids, active, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { oneOffEvent: data }
})
