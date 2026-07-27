import { fetchJsonFromConfig, saveJsonToConfig } from './googleDriveService'
import type { InvoiceMetadata } from '../ksef/ksefService'

const DB_FILENAME = 'invoices_db.json'

export interface InvoiceDbEntry {
  metadata: InvoiceMetadata
  role: 'seller' | 'buyer'
  accepted: boolean
  ignored: boolean
  monthKey: string
}

export type InvoicesDb = Record<string, InvoiceDbEntry>

export async function loadInvoicesDb(accessToken: string, configFolderId: string): Promise<InvoicesDb> {
  const db = await fetchJsonFromConfig<InvoicesDb>(accessToken, configFolderId, DB_FILENAME)
  return db ?? {}
}

export async function saveInvoicesDb(accessToken: string, configFolderId: string, db: InvoicesDb): Promise<void> {
  await saveJsonToConfig(accessToken, configFolderId, DB_FILENAME, db)
}
