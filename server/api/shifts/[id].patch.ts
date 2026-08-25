type ShiftPatchBody = {
  staffId?: string
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
}

const TIME_RE = /^\d{2}:\d{2}$/

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'schedule', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<ShiftPatchBody>(event)
  const update: Record<string, unknown> = {}

  if (body.staffId !== undefined) {
    if (!body.staffId) {
      throw createError({ statusCode: 400, statusMessage: 'Personal saknas' })
    }
    update.staff_id = body.staffId
  }

  if (body.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltigt datum' })
    }
    update.shift_date = body.date
  }

  if (body.startTime !== undefined) {
    if (!TIME_RE.test(body.startTime)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig starttid' })
    }
    update.start_time = body.startTime
  }

  if (body.endTime !== undefined) {
    if (!TIME_RE.test(body.endTime)) {
      throw createError({ statusCode: 400, statusMessage: 'Ogiltig sluttid' })
    }
    update.end_time = body.endTime
  }

  if (update.start_time && update.end_time && update.start_time >= update.end_time) {
    throw createError({ statusCode: 400, statusMessage: 'Sluttiden måste vara efter starttiden' })
  }

  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() || null : null

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Inget att uppdatera' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('shifts')
    .update(update)
    .eq('id', id)
    .select('id, staff_id, shift_date, start_time, end_time, notes, created_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { shift: data }
})
