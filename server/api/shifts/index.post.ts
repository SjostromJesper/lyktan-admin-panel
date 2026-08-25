type ShiftBody = {
  staffId?: string
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
}

const TIME_RE = /^\d{2}:\d{2}$/

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'schedule', 'edit')

  const body = await readBody<ShiftBody>(event)

  const staffId = String(body?.staffId || '').trim()
  const date = String(body?.date || '').trim()
  const startTime = String(body?.startTime || '').trim()
  const endTime = String(body?.endTime || '').trim()
  const notes = body?.notes ? String(body.notes).trim() : ''

  if (!staffId) {
    throw createError({ statusCode: 400, statusMessage: 'Personal saknas' })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datum' })
  }

  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    throw createError({ statusCode: 400, statusMessage: 'Ogiltig tid' })
  }

  if (startTime >= endTime) {
    throw createError({ statusCode: 400, statusMessage: 'Sluttiden måste vara efter starttiden' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('shifts')
    .insert({
      staff_id: staffId,
      shift_date: date,
      start_time: startTime,
      end_time: endTime,
      notes: notes || null
    })
    .select('id, staff_id, shift_date, start_time, end_time, notes, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { shift: data }
})
