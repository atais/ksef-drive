// How an invoice reads on screen. Both the Invoices and the Files page show
// the same three things about an invoice — who the other party is, and the
// gross and VAT amounts — so the formatting lives here rather than in two
// sets of markup that can drift apart.

import type { InvoiceMetadata } from '../ksef/invoiceApi'
import type { InvoiceRole } from './invoiceFiling'

// The party that isn't us: the buyer on an invoice we issued, the seller on
// one we received. Falls back to the tax identifier when there's no name.
export function counterpartyName(invoice: InvoiceMetadata, role: InvoiceRole): string | undefined {
  return role === 'seller'
    ? invoice.buyer?.name ?? invoice.buyer?.identifier?.value
    : invoice.seller?.name ?? invoice.seller?.nip
}

// Intl handles the separators and currency placement per locale; an unknown
// currency code would throw, so it falls back to the plain "amount CODE" form.
export function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}
