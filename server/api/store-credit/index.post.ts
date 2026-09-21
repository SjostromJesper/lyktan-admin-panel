type GrantBody = {
  customerName?: string
  reason?: string
  eventAccess?: { eventName?: string } | null
  custom?: { text?: string } | null
}

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'store_credit', 'edit')

  const body = await readBody<GrantBody>(event)

  const customerName = String(body?.customerName || '').trim()
  const reason = body?.reason ? String(body.reason).trim() : ''

  if (!customerName) {
    throw createError({ statusCode: 400, statusMessage: 'Namn saknas' })
  }

  const rows: Record<string, unknown>[] = []

  if (body?.eventAccess) {
    const eventName = String(body.eventAccess.eventName || '').trim()

    if (!eventName) {
      throw createError({ statusCode: 400, statusMessage: 'Ange vilket event' })
    }

    rows.push({ customer_name: customerName, type: 'event_access', event_name: eventName, reason: reason || null })
  }

  if (body?.custom) {
    const customText = String(body.custom.text || '').trim()

    if (!customText) {
      throw createError({ statusCode: 400, statusMessage: 'Skriv en beskrivning av förmånen' })
    }

    rows.push({ customer_name: customerName, type: 'custom', custom_text: customText, reason: reason || null })
  }

  if (!rows.length) {
    throw createError({ statusCode: 400, statusMessage: 'Välj minst en förmån att ge' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('store_credit_grants')
    .insert(rows)
    .select('id, customer_name, type, event_name, custom_text, reason, redeemed, redeemed_at, created_at')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)

  return { grants: data ?? [] }
})
