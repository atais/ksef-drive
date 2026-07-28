// NIP (Polish tax identifier) rules. KSeF returns NIPs in inconsistent
// formats — sometimes with spaces or dashes — so comparisons must normalize
// first. One owner for the digit rules, used by both the credentials form and
// the seller/buyer matching.

export const NIP_LENGTH = 10

// Strips separators so two spellings of the same NIP compare equal.
export function normalizeNip(nip: string | undefined | null): string {
  return (nip ?? '').replace(/[\s-]/g, '')
}

// Keeps only digits, capped at NIP length — for as-you-type input filtering.
export function toNipInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, NIP_LENGTH)
}

export function isValidNip(nip: string): boolean {
  return new RegExp(`^\\d{${NIP_LENGTH}}$`).test(normalizeNip(nip))
}

export function sameNip(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = normalizeNip(a)
  return left.length > 0 && left === normalizeNip(b)
}
