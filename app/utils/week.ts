export const WEEKDAY_LABELS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']
export const WEEKDAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

export const startOfWeek = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d
}

export const addDays = (date: Date, days: number): Date => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const toIsoDate = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const formatDayShort = (date: Date): string => `${date.getDate()}/${date.getMonth() + 1}`

export const isSameDate = (a: Date, b: Date): boolean => toIsoDate(a) === toIsoDate(b)

// 0=Måndag .. 6=Söndag, matching WEEKDAY_LABELS/WEEKDAY_SHORT and the
// database's `recurring_events.weekday` column.
export const weekdayIndex = (date: Date): number => (date.getDay() === 0 ? 6 : date.getDay() - 1)
