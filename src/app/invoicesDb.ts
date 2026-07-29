// The local invoice database: KSeF invoice metadata plus our own filing
// decisions, persisted as a single JSON file in the archive's .config folder.
// Lives in app/ rather than gdrive/ because it joins both domains.

import { readJsonFile, writeJsonFile } from '../gdrive/driveApi'
import type { InvoiceMetadata } from '../ksef/invoiceApi'
import { DEFAULT_CATEGORIES, kindForRole } from './categories'
import { invoiceRole, type InvoiceRole } from './invoiceFiling'

const DB_FILENAME = 'invoices_db.json'

export interface InvoiceDbEntry {
  metadata: InvoiceMetadata
  accepted: boolean
  ignored: boolean
  monthKey: string
  // Folder name the invoice is filed under, or null while it isn't filed.
  // Nothing is on Drive until the invoice is accepted, so there's no folder to
  // name before that — accepting fills it in, unaccepting clears it.
  category: string | null
}

export type InvoicesDb = Record<string, InvoiceDbEntry>

// Shape older files were written in: role used to be stored, back when it was
// decided once at sync time rather than derived from the metadata on every read.
type StoredEntry = InvoiceDbEntry & { role?: InvoiceRole }

// The category an entry was filed under back when the folder was implied by
// the role alone. Used to backfill `category` on load.
export function legacyCategoryForRole(role: InvoiceRole): string {
  const kind = kindForRole(role)
  return DEFAULT_CATEGORIES.find((category) => category.kind === kind)!.key
}

// Brings older files up to the shape above:
//   - `role` is dropped; it's derived from the metadata now.
//   - accepted entries that name no folder were filed under the default for
//     their role, so that name is restored. The stored role is what decided
//     where the XML actually went, so it's preferred over re-deriving it.
//   - unaccepted entries may name a category they never filed into; that field
//     only means something once filed, so it's cleared.
function migrate(db: Record<string, StoredEntry>, userNip: string): InvoicesDb {
  const entries = Object.entries(db).map(([ksefNumber, { role, ...entry }]) => [
    ksefNumber,
    {
      ...entry,
      category: entry.accepted
        ? entry.category || legacyCategoryForRole(role ?? invoiceRole(entry.metadata, userNip))
        : null,
    },
  ])
  return Object.fromEntries(entries)
}

// Takes the user's NIP because reading a legacy entry can mean working out
// which side of its invoice we were on.
export async function loadInvoicesDb(
  accessToken: string,
  configFolderId: string,
  userNip: string
): Promise<InvoicesDb> {
  const db = await readJsonFile<Record<string, StoredEntry>>(accessToken, configFolderId, DB_FILENAME)
  return db ? migrate(db, userNip) : {}
}

export function saveInvoicesDb(accessToken: string, configFolderId: string, db: InvoicesDb): Promise<void> {
  return writeJsonFile(accessToken, configFolderId, DB_FILENAME, db)
}
