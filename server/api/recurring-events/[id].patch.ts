type RecurringEventPatchBody = {
  name?: string
  weekday?: number
  startTime?: string
  endTime?: string
  tableIds?: string[]
  active?: boolean
}

const TIME_RE = /^\d{2}:\d{2}$/

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'bookings', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<RecurringEventPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
    update.name = name
  }

  if (body.weekday !== undefined) {
    const weekday = Number(body.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig veckodag' })
    }
    update.weekday = weekday
  }

  if (body.startTime !== undefined) {
    if (!TIME_RE.test(body.startTime)) throw createError({ statusCode: 400, statusMessage: 'Ogiltig starttid' })
    update.start_time = body.startTime
  }

  if (body.endTime !== undefined) {
    if (!TIME_RE.test(body.endTime)) throw createError({ statusCode: 400, statusMessage: 'Ogiltig sluttid' })
    update.end_time = body.endTime
  }

  if (update.start_time && update.end_time && update.start_time >= update.end_time) {
    throw createError({ statusCode: 400, statusMessage: 'Sluttiden måste vara efter starttiden' })
  }

  if (body.tableIds !== undefined) {
    const tableIds = Array.isArray(body.tableIds) ? body.tableIds.filter((tid) => typeof tid === 'string' && tid) : []
    if (!tableIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'Välj minst ett bord' })
    }
    update.table_ids = tableIds
  }

  if (body.active !== undefined) update.active = Boolean(body.active)

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('recurring_events')
    .update(update)
    .eq('id', id)
    .select('id, name, weekday, start_time, end_time, table_ids, active, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { recurringEvent: data }
})
