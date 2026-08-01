// The one in-memory copy of the invoice DB.
//
// Both pages act on the same entries — Invoices files and unfiles them, Files
// deletes their XML off Drive, and removing a category unfiles a batch — so
// they share this store rather than each loading and writing the JSON behind
// the others' backs.

import { loadInvoicesDb, saveInvoicesDb, unfileEntries, unfiledEntry, type InvoiceDbEntry, type InvoicesDb } from './invoicesDb'
import { ksefNumberFromFilename } from './invoiceFiling'
import { session } from './session.svelte'

export class InvoicesDbStore {
  entries = $state<InvoicesDb>({})
  loading = $state(false)
  private loaded = false

  get(ksefNumber: string): InvoiceDbEntry | undefined {
    return this.entries[ksefNumber]
  }

  // Filed invoices are saved as "<ksefNumber>.xml", so a Drive filename is
  // enough to find the entry it came from.
  entryForFilename(filename: string): InvoiceDbEntry | undefined {
    return this.get(ksefNumberFromFilename(filename))
  }

  // Throws rather than swallowing: callers already report their own errors,
  // and a silently empty DB reads as "no invoices yet".
  async load(): Promise<void> {
    const { accessToken, configFolderId } = session.requireDrive()
    this.loading = true
    try {
      this.entries = await loadInvoicesDb(accessToken, configFolderId, session.ksefCredentials?.nip ?? '')
      this.loaded = true
    } finally {
      this.loading = false
    }
  }

  // For callers that need the DB but didn't put it on screen — removing a
  // category has to unfile invoices whether or not the Invoices page has ever
  // been opened this session.
  ensureLoaded(): Promise<void> {
    return this.loaded ? Promise.resolve() : this.load()
  }

  private async persist(next: InvoicesDb): Promise<void> {
    const { accessToken, configFolderId } = session.requireDrive()
    this.entries = next
    await saveInvoicesDb(accessToken, configFolderId, next)
  }

  save(entry: InvoiceDbEntry): Promise<void> {
    return this.persist({ ...this.entries, [entry.metadata.ksefNumber]: entry })
  }

  // Wholesale replacement, for a sync that has merged fresh KSeF metadata
  // into every entry at once.
  replaceAll(next: InvoicesDb): Promise<void> {
    return this.persist(next)
  }

  // Clears the filing state of invoices whose XML is no longer on Drive, so
  // the Invoices page offers them for filing again instead of pointing at a
  // folder that's gone. Returns how many entries that touched.
  async unfile(ksefNumbers: string[]): Promise<number> {
    if (ksefNumbers.length === 0) return 0
    await this.ensureLoaded()
    const { db, unfiled } = unfileEntries(this.entries, ksefNumbers)
    if (unfiled > 0) await this.persist(db)
    return unfiled
  }

  unfileOne(entry: InvoiceDbEntry): Promise<void> {
    return this.save(unfiledEntry(entry))
  }
}

export const invoicesDb = new InvoicesDbStore()
