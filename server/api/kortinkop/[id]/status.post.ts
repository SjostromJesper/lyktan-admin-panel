import type { OfferStatus } from '../../../utils/kortinkop'

const OFFER_COLUMNS = 'id, number, status, evaluated_at, valid_days, evaluator_id, evaluator_name, customer_name, customer_phone, customer_email, customer_address, customer_submitted_at, customer_note, id_checked, is_minor, guardian_name, marketing_consent, fee_kr, fee_paid_at_submission, payment_method, payment_to, credit_bonus_pct, offer_total_kr, credit_bonus_kr, fee_effect_kr, grand_total_kr, created_at, updated_at'
const LINE_COLUMNS = 'sell, market_value_kr, qty, pct'

type StatusBody = { status?: OfferStatus }

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<StatusBody>(event)
  const nextStatus = body?.status

  const supabase = useSupabaseAdmin()

  const { data: offer, error: offerError } = await supabase
    .from('buy_offers')
    .select('id, status, fee_kr, fee_paid_at_submission, payment_method, credit_bonus_pct')
    .eq('id', id)
    .single()

  if (offerError) {
    throw createError({ statusCode: 404, statusMessage: 'Erbjudandet hittades inte' })
  }

  if (!nextStatus || !isValidTransition(offer.status as OfferStatus, nextStatus)) {
    throw createError({ statusCode: 400, statusMessage: `Kan inte ändra status från ${offer.status} till ${nextStatus}` })
  }

  // Re-lock the persisted totals at the moment of transition, so later
  // phases (e.g. inventory creation on "paid") can trust offer_total_kr
  // even if settings or lines are edited after this point.
  const { data: lines, error: linesError } = await supabase
    .from('buy_offer_lines')
    .select(LINE_COLUMNS)
    .eq('offer_id', id)

  if (linesError) {
    throw createError({ statusCode: 500, statusMessage: linesError.message })
  }

  const totals = calcOfferTotals(
    {
      feeKr: offer.fee_kr,
      feePaidAtSubmission: offer.fee_paid_at_submission,
      paymentMethod: offer.payment_method,
      creditBonusPct: offer.credit_bonus_pct
    },
    (lines ?? []).map((l) => ({ sell: l.sell, marketValueKr: l.market_value_kr, qty: l.qty, pct: l.pct }))
  )

  const { data: updated, error: updateError } = await supabase
    .from('buy_offers')
    .update({
      status: nextStatus,
      offer_total_kr: totals.offerTotalKr,
      credit_bonus_kr: totals.creditBonusKr,
      fee_effect_kr: totals.feeEffectKr,
      grand_total_kr: totals.grandTotalKr,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select(OFFER_COLUMNS)
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  return { offer: updated }
})
