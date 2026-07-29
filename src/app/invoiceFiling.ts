// Filing rules: which slot in the archive a given KSeF invoice belongs in,
// and the Drive writes that follow from it. archive.ts owns the folder
// layout; this module owns the invoice-to-slot decision.

import { deleteFileByName, moveFileByName, putTextFile } from '../gdrive/driveApi'
import { downloadInvoiceXml, type InvoiceMetadata } from '../ksef/invoiceApi'
import { sameNip } from '../ksef/nip'
import { ensureCategoryFolder } from './archive'
import { monthKeyOf, parseMonthKey } from './dates'

export type InvoiceRole = 'seller' | 'buyer'

export interface FilingTarget {
  rootFolderId: string
  monthKey: string
  // Folder name of the category the invoice files into. Which categories are
  // offered for a given role is categories.ts's call, not this module's.
  category: string
}

// Am I the seller or the buyer on this invoice? Seller invoices are sales,
// everything else is treated as a cost.
export function invoiceRole(invoice: InvoiceMetadata, userNip: string): InvoiceRole {
  return sameNip(userNip, invoice.seller?.nip) ? 'seller' : 'buyer'
}

// Default month bucket for an invoice, from its issue date. Falls back to the
// current month when KSeF hands us an unparseable date.
export function invoiceMonthKey(invoice: InvoiceMetadata): string {
  const date = new Date(invoice.issueDate)
  return monthKeyOf(Number.isNaN(date.getTime()) ? new Date() : date)
}

export function invoiceFilename(ksefNumber: string): string {
  return `${ksefNumber}.xml`
}

// Strips the .xml extension a filed invoice was saved under to recover its
// ksefNumber, the invoicesDb key.
export function ksefNumberFromFilename(filename: string): string {
  return filename.replace(/\.xml$/i, '')
}

// Resolves (creating if needed) the folder an invoice files into.
function resolveFilingFolder(accessToken: string, target: FilingTarget): Promise<string> {
  const parsed = parseMonthKey(target.monthKey)
  if (!parsed) throw new Error(`Invalid month: ${target.monthKey}`)
  return ensureCategoryFolder(
    accessToken,
    target.rootFolderId,
    parsed.year,
    parsed.month,
    target.category
  )
}

// Downloads the invoice XML from KSeF and writes it to its filing folder.
export async function fileInvoice(
  accessToken: string,
  sessionToken: string,
  ksefNumber: string,
  target: FilingTarget
): Promise<void> {
  const folderId = await resolveFilingFolder(accessToken, target)
  const xml = await downloadInvoiceXml(sessionToken, ksefNumber)
  await putTextFile(accessToken, folderId, invoiceFilename(ksefNumber), xml, 'application/xml')
}

// Deletes an invoice's filed XML from its category folder, if it is there.
export async function unfileInvoice(accessToken: string, ksefNumber: string, target: FilingTarget): Promise<void> {
  const folderId = await resolveFilingFolder(accessToken, target)
  await deleteFileByName(accessToken, folderId, invoiceFilename(ksefNumber))
}

// Moves an already-filed invoice between slots. Without this the old copy
// would be orphaned in the previous month or category folder.
export async function refileInvoice(
  accessToken: string,
  ksefNumber: string,
  from: FilingTarget,
  to: FilingTarget
): Promise<void> {
  const [fromFolderId, toFolderId] = await Promise.all([
    resolveFilingFolder(accessToken, from),
    resolveFilingFolder(accessToken, to),
  ])
  await moveFileByName(accessToken, fromFolderId, toFolderId, invoiceFilename(ksefNumber))
}
