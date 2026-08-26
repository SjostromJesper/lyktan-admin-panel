export const TIER_LABELS: Record<'litet' | 'stort', string> = {
  litet: 'Litet',
  stort: 'Stort'
}

export const daysLeft = (expiryDate: string | null): number | null => {
  if (!expiryDate) return null

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const expiry = new Date(`${expiryDate}T00:00:00Z`)

  return Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export const membershipStatusLabel = (expiryDate: string | null): string => {
  const left = daysLeft(expiryDate)

  if (left === null) return 'Inte aktiverat'
  if (left < 0) return 'Utgånget'
  if (left === 0) return 'Går ut idag'

  return `${left} dagar kvar`
}

// green = active member, yellow = expiring within two weeks, red = expired
// (or never activated).
const EXPIRING_SOON_DAYS = 14

export const membershipDotColor = (expiryDate: string | null): 'green' | 'yellow' | 'red' => {
  const left = daysLeft(expiryDate)

  if (left === null || left < 0) return 'red'
  if (left <= EXPIRING_SOON_DAYS) return 'yellow'

  return 'green'
}
