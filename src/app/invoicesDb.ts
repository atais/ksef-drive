// The local invoice database: KSeF invoice metadata plus our own filing
// decisions, persisted as a single JSON file in the archive's .config folder.
// Lives in app/ rather than gdrive/ because it joins both domains.

import { readJsonFile, writeJsonFile } from '../gdrive/driveApi'
import type { InvoiceMetadata } from '../ksef/invoiceApi'
import type { InvoiceRole } from './invoiceFiling'

const DB_FILENAME = 'invoices_db.json'

export interface InvoiceDbEntry {
  metadata: InvoiceMetadata
  role: InvoiceRole
  accepted: boolean
  ignored: boolean
  monthKey: string
}

export type InvoicesDb = Record<string, InvoiceDbEntry>

export async function loadInvoicesDb(accessToken: string, configFolderId: string): Promise<InvoicesDb> {
  const db = await readJsonFile<InvoicesDb>(accessToken, configFolderId, DB_FILENAME)
  return db ?? {}
}

export function saveInvoicesDb(accessToken: string, configFolderId: string, db: InvoicesDb): Promise<void> {
  return writeJsonFile(accessToken, configFolderId, DB_FILENAME, db)
}
