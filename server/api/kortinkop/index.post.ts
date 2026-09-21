const OFFER_COLUMNS = 'id, number, status, evaluated_at, valid_days, evaluator_id, evaluator_name, customer_name, customer_phone, customer_email, customer_address, customer_submitted_at, customer_note, id_checked, is_minor, guardian_name, marketing_consent, fee_kr, fee_paid_at_submission, payment_method, payment_to, credit_bonus_pct, offer_total_kr, credit_bonus_kr, fee_effect_kr, grand_total_kr, created_at, updated_at'

export default defineEventHandler(async (event) => {
  const user = await requireAccess(event, 'kortinkop', 'edit')

  const supabase = useSupabaseAdmin()

  const { data: settings, error: settingsError } = await supabase
    .from('kortinkop_settings')
    .select('default_pct, fee_kr, credit_bonus_pct, valid_days, pickup_days')
    .single()

  if (settingsError) {
    throw createError({ statusCode: 500, statusMessage: settingsError.message })
  }

  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, name')
    .eq('email', user.email)
    .maybeSingle()

  const number = await generateOfferNumber(supabase)
  const today = new Date().toISOString().slice(0, 10)

  const { data: offer, error: offerError } = await supabase
    .from('buy_offers')
    .insert({
      number,
      status: 'draft',
      evaluated_at: today,
      valid_days: settings.valid_days,
      evaluator_id: staffRow?.id ?? null,
      evaluator_name: staffRow?.name ?? user.email,
      customer_submitted_at: today,
      fee_kr: settings.fee_kr,
      fee_paid_at_submission: true,
      credit_bonus_pct: settings.credit_bonus_pct
    })
    .select(OFFER_COLUMNS)
    .single()

  if (offerError) {
    throw createError({ statusCode: 500, statusMessage: offerError.message })
  }

  const { error: lineError } = await supabase
    .from('buy_offer_lines')
    .insert({ offer_id: offer.id, pct: settings.default_pct, sort_order: 0 })

  if (lineError) {
    throw createError({ statusCode: 500, statusMessage: lineError.message })
  }

  setResponseStatus(event, 201)

  return { offer }
})
