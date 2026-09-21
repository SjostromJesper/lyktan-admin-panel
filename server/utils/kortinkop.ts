import type { SupabaseClient } from '@supabase/supabase-js'

export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO' | 'GR'
export type PaymentMethod = 'swish' | 'bank' | 'cash' | 'store_credit'
export type OfferStatus = 'draft' | 'offered' | 'accepted' | 'paid' | 'declined' | 'expired'

export const CONDITIONS: Condition[] = ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO', 'GR']
export const PAYMENT_METHODS: PaymentMethod[] = ['swish', 'bank', 'cash', 'store_credit']

// draft -> offered -> accepted -> paid, with declined/expired reachable
// from offered or accepted. Nothing transitions out of paid/declined/expired.
const ALLOWED_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ['offered'],
  offered: ['accepted', 'declined', 'expired'],
  accepted: ['paid', 'declined', 'expired'],
  paid: [],
  declined: [],
  expired: []
}

export const isValidTransition = (from: OfferStatus, to: OfferStatus) => ALLOWED_TRANSITIONS[from]?.includes(to)

export type OfferLineInput = {
  sell: boolean
  marketValueKr: number
  qty: number
  pct: number
}

// floor(marketValue * qty * pct / 100), always rounded down to whole kronor —
// identical to the prototype's offerOf() (docs/prototyp-kortinkop.html).
export const offerOf = (line: OfferLineInput) =>
  Math.floor((Number(line.marketValueKr) || 0) * (Number(line.qty) || 0) * (Number(line.pct) || 0) / 100)

export type OfferTotals = {
  offerTotalKr: number
  creditBonusKr: number
  feeEffectKr: number
  grandTotalKr: number
}

// Direct port of the prototype's calc() — see docs/KORTINKOP-SPEC.md §3 for
// the fee-effect table this implements.
export const calcOfferTotals = (
  offer: { feeKr: number; feePaidAtSubmission: boolean; paymentMethod: PaymentMethod; creditBonusPct: number },
  lines: OfferLineInput[]
): OfferTotals => {
  const sold = lines.filter((l) => l.sell)
  const offerTotalKr = sold.reduce((sum, l) => sum + offerOf(l), 0)
  const anySold = sold.length > 0 && offerTotalKr > 0

  let feeEffectKr = 0
  const feeKr = Number(offer.feeKr) || 0
  if (feeKr > 0) {
    if (offer.feePaidAtSubmission && anySold) feeEffectKr = feeKr // "Värderingsavgift återbetalas"
    else if (offer.feePaidAtSubmission && !anySold) feeEffectKr = 0 // "Värderingsavgift (betald)"
    else if (!offer.feePaidAtSubmission && anySold) feeEffectKr = 0 // "Värderingsavgift – stryks"
    else feeEffectKr = -feeKr // "Värderingsavgift att betala"
  }

  const isCredit = offer.paymentMethod === 'store_credit'
  const creditBonusKr = isCredit ? Math.floor(offerTotalKr * (Number(offer.creditBonusPct) || 0) / 100) : 0

  return {
    offerTotalKr,
    creditBonusKr,
    feeEffectKr,
    grandTotalKr: offerTotalKr + creditBonusKr + feeEffectKr
  }
}

// Noon anchor avoids DST date-shift bugs, matching the prototype's validUntil().
export const validUntil = (evaluatedAt: string, validDays: number) => {
  const d = new Date(`${evaluatedAt}T12:00:00`)
  d.setDate(d.getDate() + (Number(validDays) || 0))
  return d.toISOString().slice(0, 10)
}

// "LYK-YYYYMMDD-NNN" — counts today's offers and retries on a unique-
// constraint conflict rather than using a DB sequence (fine at this volume).
export const generateOfferNumber = async (supabase: SupabaseClient): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  for (let attempt = 0; attempt < 20; attempt++) {
    const { count, error } = await supabase
      .from('buy_offers')
      .select('id', { count: 'exact', head: true })
      .like('number', `LYK-${datePart}-%`)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    const seq = String((count ?? 0) + 1 + attempt).padStart(3, '0')
    const candidate = `LYK-${datePart}-${seq}`

    const { data: existing, error: checkError } = await supabase
      .from('buy_offers')
      .select('id')
      .eq('number', candidate)
      .maybeSingle()

    if (checkError) {
      throw createError({ statusCode: 500, statusMessage: checkError.message })
    }

    if (!existing) return candidate
  }

  throw createError({ statusCode: 500, statusMessage: 'Kunde inte generera erbjudandenummer' })
}
