const OFFER_COLUMNS = 'id, number, status, evaluated_at, valid_days, evaluator_id, evaluator_name, customer_name, customer_phone, customer_email, customer_address, customer_submitted_at, customer_note, id_checked, is_minor, guardian_name, marketing_consent, fee_kr, fee_paid_at_submission, payment_method, payment_to, credit_bonus_pct, offer_total_kr, credit_bonus_kr, fee_effect_kr, grand_total_kr, created_at, updated_at'
const LINE_COLUMNS = 'id, offer_id, sell, name, card_number, card_set, condition, grade, qty, market_value_kr, pct, note, is_bulk, line_offer_kr, sort_order'

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'view')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const supabase = useSupabaseAdmin()

  const { data: offer, error: offerError } = await supabase
    .from('buy_offers')
    .select(OFFER_COLUMNS)
    .eq('id', id)
    .single()

  if (offerError) {
    throw createError({ statusCode: 404, statusMessage: 'Erbjudandet hittades inte' })
  }

  const { data: lines, error: linesError } = await supabase
    .from('buy_offer_lines')
    .select(LINE_COLUMNS)
    .eq('offer_id', id)
    .order('sort_order', { ascending: true })

  if (linesError) {
    throw createError({ statusCode: 500, statusMessage: linesError.message })
  }

  return { offer, lines: lines ?? [] }
})
