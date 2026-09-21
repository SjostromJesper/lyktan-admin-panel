import type { Condition, PaymentMethod } from '../../utils/kortinkop'

const OFFER_COLUMNS = 'id, number, status, evaluated_at, valid_days, evaluator_id, evaluator_name, customer_name, customer_phone, customer_email, customer_address, customer_submitted_at, customer_note, id_checked, is_minor, guardian_name, marketing_consent, fee_kr, fee_paid_at_submission, payment_method, payment_to, credit_bonus_pct, offer_total_kr, credit_bonus_kr, fee_effect_kr, grand_total_kr, created_at, updated_at'
const LINE_COLUMNS = 'id, offer_id, sell, name, card_number, card_set, condition, grade, qty, market_value_kr, pct, note, is_bulk, line_offer_kr, sort_order'

type LineBody = {
  id?: string
  sell?: boolean
  name?: string
  cardNumber?: string
  cardSet?: string
  condition?: Condition
  grade?: string
  qty?: number
  marketValueKr?: number
  pct?: number
  note?: string
  isBulk?: boolean
}

type PatchBody = {
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  customerAddress?: string
  customerSubmittedAt?: string
  customerNote?: string
  idChecked?: boolean
  isMinor?: boolean
  guardianName?: string
  marketingConsent?: boolean
  evaluatedAt?: string
  validDays?: number
  feeKr?: number
  feePaidAtSubmission?: boolean
  paymentMethod?: PaymentMethod
  paymentTo?: string
  creditBonusPct?: number
  lines?: LineBody[]
}

const EDITABLE_STATUSES = ['draft', 'offered', 'accepted']

export default defineEventHandler(async (event) => {
  await requireAccess(event, 'kortinkop', 'edit')

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Id saknas' })
  }

  const body = await readBody<PatchBody>(event)
  const supabase = useSupabaseAdmin()

  const { data: existing, error: existingError } = await supabase
    .from('buy_offers')
    .select('id, status')
    .eq('id', id)
    .single()

  if (existingError) {
    throw createError({ statusCode: 404, statusMessage: 'Erbjudandet hittades inte' })
  }

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Erbjudandet kan inte längre redigeras' })
  }

  const feeKr = Number.isFinite(Number(body.feeKr)) ? Number(body.feeKr) : 0
  const feePaidAtSubmission = Boolean(body.feePaidAtSubmission)
  const paymentMethod: PaymentMethod = PAYMENT_METHODS.includes(body.paymentMethod as PaymentMethod) ? (body.paymentMethod as PaymentMethod) : 'swish'
  const creditBonusPct = Number.isFinite(Number(body.creditBonusPct)) ? Number(body.creditBonusPct) : 0

  const { error: offerUpdateError } = await supabase
    .from('buy_offers')
    .update({
      customer_name: String(body.customerName || '').trim(),
      customer_phone: body.customerPhone ? String(body.customerPhone).trim() : null,
      customer_email: body.customerEmail ? String(body.customerEmail).trim() : null,
      customer_address: body.customerAddress ? String(body.customerAddress).trim() : null,
      customer_submitted_at: body.customerSubmittedAt || null,
      customer_note: body.customerNote ? String(body.customerNote).trim() : null,
      id_checked: Boolean(body.idChecked),
      is_minor: Boolean(body.isMinor),
      guardian_name: body.guardianName ? String(body.guardianName).trim() : null,
      marketing_consent: Boolean(body.marketingConsent),
      evaluated_at: body.evaluatedAt || undefined,
      valid_days: Number.isFinite(Number(body.validDays)) ? Number(body.validDays) : undefined,
      fee_kr: feeKr,
      fee_paid_at_submission: feePaidAtSubmission,
      payment_method: paymentMethod,
      payment_to: body.paymentTo ? String(body.paymentTo).trim() : null,
      credit_bonus_pct: creditBonusPct,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (offerUpdateError) {
    throw createError({ statusCode: 500, statusMessage: offerUpdateError.message })
  }

  // Replace the line set: upsert everything the client sent (by id when
  // present), then delete any existing line not present in the new set.
  const incomingLines = Array.isArray(body.lines) ? body.lines : []

  const { data: currentLines, error: currentLinesError } = await supabase
    .from('buy_offer_lines')
    .select('id')
    .eq('offer_id', id)

  if (currentLinesError) {
    throw createError({ statusCode: 500, statusMessage: currentLinesError.message })
  }

  const keepIds = new Set(incomingLines.filter((l) => l.id).map((l) => l.id))
  const toDelete = (currentLines ?? []).map((l) => l.id).filter((existingId) => !keepIds.has(existingId))

  if (toDelete.length) {
    const { error: deleteError } = await supabase.from('buy_offer_lines').delete().in('id', toDelete)
    if (deleteError) {
      throw createError({ statusCode: 500, statusMessage: deleteError.message })
    }
  }

  for (const [index, line] of incomingLines.entries()) {
    const qty = Number.isFinite(Number(line.qty)) && Number(line.qty) > 0 ? Number(line.qty) : 1
    const marketValueKr = Number.isFinite(Number(line.marketValueKr)) && Number(line.marketValueKr) >= 0 ? Number(line.marketValueKr) : 0
    const pct = Number.isFinite(Number(line.pct)) ? Math.min(100, Math.max(0, Number(line.pct))) : 0
    const condition: Condition = CONDITIONS.includes(line.condition as Condition) ? (line.condition as Condition) : 'NM'

    const row = {
      offer_id: id,
      sell: line.sell !== false,
      name: String(line.name || '').trim(),
      card_number: line.cardNumber ? String(line.cardNumber).trim() : null,
      card_set: line.cardSet ? String(line.cardSet).trim() : null,
      condition,
      grade: line.grade ? String(line.grade).trim() : null,
      qty,
      market_value_kr: marketValueKr,
      pct,
      note: line.note ? String(line.note).trim() : null,
      is_bulk: Boolean(line.isBulk),
      line_offer_kr: offerOf({ sell: line.sell !== false, marketValueKr, qty, pct }),
      sort_order: index
    }

    if (line.id) {
      const { error: updateError } = await supabase.from('buy_offer_lines').update(row).eq('id', line.id)
      if (updateError) {
        throw createError({ statusCode: 500, statusMessage: updateError.message })
      }
    } else {
      const { error: insertError } = await supabase.from('buy_offer_lines').insert(row)
      if (insertError) {
        throw createError({ statusCode: 500, statusMessage: insertError.message })
      }
    }
  }

  const { data: savedLines, error: savedLinesError } = await supabase
    .from('buy_offer_lines')
    .select(LINE_COLUMNS)
    .eq('offer_id', id)
    .order('sort_order', { ascending: true })

  if (savedLinesError) {
    throw createError({ statusCode: 500, statusMessage: savedLinesError.message })
  }

  const totals = calcOfferTotals(
    { feeKr, feePaidAtSubmission, paymentMethod, creditBonusPct },
    (savedLines ?? []).map((l) => ({ sell: l.sell, marketValueKr: l.market_value_kr, qty: l.qty, pct: l.pct }))
  )

  const { data: offer, error: totalsError } = await supabase
    .from('buy_offers')
    .update({
      offer_total_kr: totals.offerTotalKr,
      credit_bonus_kr: totals.creditBonusKr,
      fee_effect_kr: totals.feeEffectKr,
      grand_total_kr: totals.grandTotalKr
    })
    .eq('id', id)
    .select(OFFER_COLUMNS)
    .single()

  if (totalsError) {
    throw createError({ statusCode: 500, statusMessage: totalsError.message })
  }

  return { offer, lines: savedLines ?? [] }
})
