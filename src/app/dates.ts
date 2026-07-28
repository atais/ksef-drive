// Date helpers shared across the app. Month buckets are the app's own filing
// unit ("MM.YYYY"), used for both Drive folder names and DB entries.

export const MONTH_KEY_PATTERN = /^(\d{2})\.(\d{4})$/

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function isoMonthsAgo(months: number): string {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  date.setDate(date.getDate() + 1)
  return date.toISOString()
}

// KSeF caps a single query's date range at 3 months. Given a "from" date,
// returns the latest "to" date (as yyyy-mm-dd) that still fits that window.
export function maxToDate(fromValue: string): string {
  const date = new Date(fromValue)
  date.setMonth(date.getMonth() + 3)
  date.setDate(date.getDate() - 1)
  return isoDate(date)
}

// Builds a "MM.YYYY" key. The same string names the Drive month folder and
// keys an invoice's filing month, so it has exactly one constructor.
export function monthKey(month: number | string, year: number | string): string {
  return `${String(month).padStart(2, '0')}.${year}`
}

export function monthKeyOf(date: Date): string {
  return monthKey(date.getMonth() + 1, date.getFullYear())
}

// Parses "MM.YYYY" into its parts, or null if malformed.
export function parseMonthKey(monthKey: string): { month: string; year: string } | null {
  const match = MONTH_KEY_PATTERN.exec(monthKey)
  return match ? { month: match[1], year: match[2] } : null
}

// The 12 month options for the year the given key belongs to.
export function monthOptionsForKey(key: string): string[] {
  const year = parseMonthKey(key)?.year ?? String(new Date().getFullYear())
  return Array.from({ length: 12 }, (_, i) => monthKey(i + 1, year))
}

// Month options for -1 to +3 months around an issue date.
export function monthOptionsForDate(dateStr: string): string[] {
  const date = new Date(dateStr)
  const options: string[] = []

  // Start from -1 month
  for (let i = -1; i <= 3; i++) {
    const optDate = new Date(date)
    optDate.setMonth(optDate.getMonth() + i)
    options.push(monthKeyOf(optDate))
  }

  return options
}
