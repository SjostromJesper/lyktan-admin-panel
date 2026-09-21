export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO' | 'GR'
export type PaymentMethod = 'swish' | 'bank' | 'cash' | 'store_credit'
export type OfferStatus = 'draft' | 'offered' | 'accepted' | 'paid' | 'declined' | 'expired'

export const CONDITIONS: { code: Condition; label: string; color: string }[] = [
  { code: 'MT', label: 'Mint', color: 'var(--cond-mt)' },
  { code: 'NM', label: 'Near Mint', color: 'var(--cond-nm)' },
  { code: 'EX', label: 'Excellent', color: 'var(--cond-ex)' },
  { code: 'GD', label: 'Good', color: 'var(--cond-gd)' },
  { code: 'LP', label: 'Light Played', color: 'var(--cond-lp)' },
  { code: 'PL', label: 'Played', color: 'var(--cond-pl)' },
  { code: 'PO', label: 'Poor', color: 'var(--cond-po)' },
  { code: 'GR', label: 'Graderat', color: 'var(--cond-gr)' }
]

export const conditionMeta = (code: string) => CONDITIONS.find((c) => c.code === code) ?? CONDITIONS[1]

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  swish: 'Swish',
  bank: 'Banköverföring',
  cash: 'Kontant',
  store_credit: 'Butikskredit'
}

export const STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Utkast',
  offered: 'Erbjudet',
  accepted: 'Accepterat',
  paid: 'Betalt',
  declined: 'Avböjt',
  expired: 'Utgånget'
}

export const kr = (value: number | null | undefined) => `${Math.round(Number(value) || 0).toLocaleString('sv-SE')} kr`

// Client-side mirror of the server's offerOf() (server/utils/kortinkop.ts),
// used only for instant per-row feedback while typing — the authoritative
// value always comes back from the next PATCH response. Field names match
// the snake_case shape rows have both from the API and in local line state.
export const offerOf = (line: { sell: boolean; market_value_kr: number; qty: number; pct: number }) =>
  line.sell ? Math.floor((Number(line.market_value_kr) || 0) * (Number(line.qty) || 0) * (Number(line.pct) || 0) / 100) : 0

// Client-side mirror of the server's calcOfferTotals() — same fee-effect
// table from docs/KORTINKOP-SPEC.md §3. Used by the document view, which
// has no separate PATCH round-trip to get authoritative totals from.
export const calcTotals = (
  offer: { fee_kr: number; fee_paid_at_submission: boolean; payment_method: PaymentMethod; credit_bonus_pct: number },
  lines: { sell: boolean; market_value_kr: number; qty: number; pct: number }[]
) => {
  const sold = lines.filter((l) => l.sell)
  const offerTotalKr = sold.reduce((a, l) => a + offerOf(l), 0)
  const anySold = sold.length > 0 && offerTotalKr > 0

  let feeEffectKr = 0
  const feeKr = Number(offer.fee_kr) || 0
  if (feeKr > 0) {
    if (offer.fee_paid_at_submission && anySold) feeEffectKr = feeKr
    else if (offer.fee_paid_at_submission && !anySold) feeEffectKr = 0
    else if (!offer.fee_paid_at_submission && anySold) feeEffectKr = 0
    else feeEffectKr = -feeKr
  }

  const isCredit = offer.payment_method === 'store_credit'
  const creditBonusKr = isCredit ? Math.floor(offerTotalKr * ((Number(offer.credit_bonus_pct) || 0) / 100)) : 0

  return { offerTotalKr, creditBonusKr, feeEffectKr, grandTotalKr: offerTotalKr + creditBonusKr + feeEffectKr }
}

// Noon anchor avoids DST date-shift bugs, matching the prototype.
export const validUntil = (evaluatedAt: string, validDays: number) => {
  const d = new Date(`${evaluatedAt}T12:00:00`)
  d.setDate(d.getDate() + (Number(validDays) || 0))
  return d.toISOString().slice(0, 10)
}
