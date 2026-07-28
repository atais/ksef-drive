// State machine for the Invoices page: pull invoice metadata from KSeF into
// the local DB, then let the user accept / ignore / re-file each one, keeping
// the DB and the Drive tree in step.

import { queryAllInvoicesMetadata, type InvoiceQueryDateType } from '../ksef/invoiceApi'
import { isoDate, isoMonthsAgo, maxToDate } from './dates'
import {
  fileInvoice,
  invoiceMonthKey,
  invoiceRole,
  refileInvoice,
  unfileInvoice,
  type FilingTarget,
} from './invoiceFiling'
import { loadInvoicesDb, saveInvoicesDb, type InvoiceDbEntry, type InvoicesDb } from './invoicesDb'
import { session } from './session.svelte'

export type StatusFilter = 'pending' | 'added' | 'ignored' | 'all'

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'added', label: 'Added' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'all', label: 'All' },
]

function matchesFilter(entry: InvoiceDbEntry, filter: StatusFilter): boolean {
  if (filter === 'pending') return !entry.accepted && !entry.ignored
  if (filter === 'added') return entry.accepted
  if (filter === 'ignored') return entry.ignored
  return true
}

export class InvoicesStore {
  dateType = $state<InvoiceQueryDateType>('Invoicing')
  from = $state(isoMonthsAgo(3).slice(0, 10))
  to = $state('')
  statusFilter = $state<StatusFilter>('pending')

  db = $state<InvoicesDb>({})
  loadingDb = $state(true)
  syncing = $state(false)
  error = $state<string | null>(null)
  savingKsefNumber = $state<string | null>(null)

  readonly invoices = $derived(
    Object.values(this.db)
      .filter((entry) => matchesFilter(entry, this.statusFilter))
      .map((entry) => entry.metadata)
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
  )

  // Narrowing the session once per action keeps every call site free of
  // null-checks on tokens that are always present while this page is mounted.
  private requireDrive(): { accessToken: string; rootFolderId: string } {
    if (!session.accessToken || !session.rootFolderId) throw new Error('Connect Google Drive first')
    return { accessToken: session.accessToken, rootFolderId: session.rootFolderId }
  }

  private filingTarget(entry: InvoiceDbEntry, rootFolderId: string, monthKey = entry.monthKey): FilingTarget {
    return { rootFolderId, monthKey, role: entry.role }
  }

  private async persist(next: InvoicesDb) {
    this.db = next
    if (session.accessToken && session.configFolderId) {
      await saveInvoicesDb(session.accessToken, session.configFolderId, next)
    }
  }

  private async withEntry(ksefNumber: string, action: () => Promise<void>) {
    this.savingKsefNumber = ksefNumber
    this.error = null
    try {
      await action()
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Action failed'
    } finally {
      this.savingKsefNumber = null
    }
  }

  // If today is beyond the 3-month window KSeF allows from the new "from"
  // date, cap "to" so the range stays queryable.
  setFrom(value: string) {
    this.from = value
    const cap = maxToDate(value)
    if (isoDate(new Date()) > cap) this.to = cap
  }

  async load() {
    if (!session.accessToken || !session.configFolderId) return
    this.loadingDb = true
    try {
      this.db = await loadInvoicesDb(session.accessToken, session.configFolderId)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to load invoices DB'
    } finally {
      this.loadingDb = false
    }
  }

  // Extends the local DB with invoices from KSeF for the selected date range,
  // across every subject role. Never removes DB entries — the displayed list
  // always reflects DB state, and existing filing decisions are preserved.
  async sync() {
    if (!session.ksefSessionToken) return
    this.syncing = true
    this.error = null
    try {
      const fetched = await queryAllInvoicesMetadata(session.ksefSessionToken, {
        dateType: this.dateType,
        from: new Date(this.from).toISOString(),
        to: this.to ? new Date(this.to).toISOString() : undefined,
      })

      const next: InvoicesDb = { ...this.db }
      for (const invoice of fetched) {
        const existing = this.db[invoice.ksefNumber]
        next[invoice.ksefNumber] = existing
          ? { ...existing, metadata: invoice }
          : {
              metadata: invoice,
              role: invoiceRole(invoice, session.ksefCredentials?.nip ?? ''),
              accepted: false,
              ignored: false,
              monthKey: invoiceMonthKey(invoice),
            }
      }

      await this.persist(next)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to sync invoices'
    } finally {
      this.syncing = false
    }
  }

  // Accepting downloads the XML and files it under the invoice's month
  // bucket and category.
  async accept(entry: InvoiceDbEntry) {
    const ksefNumber = entry.metadata.ksefNumber
    await this.withEntry(ksefNumber, async () => {
      const { accessToken, rootFolderId } = this.requireDrive()
      if (!session.ksefSessionToken) throw new Error('Not connected to KSEF')
      await fileInvoice(accessToken, session.ksefSessionToken, ksefNumber, this.filingTarget(entry, rootFolderId))
      await this.persist({ ...this.db, [ksefNumber]: { ...entry, accepted: true } })
    })
  }

  async unaccept(entry: InvoiceDbEntry) {
    const ksefNumber = entry.metadata.ksefNumber
    await this.withEntry(ksefNumber, async () => {
      const { accessToken, rootFolderId } = this.requireDrive()
      await unfileInvoice(accessToken, ksefNumber, this.filingTarget(entry, rootFolderId))
      await this.persist({ ...this.db, [ksefNumber]: { ...entry, accepted: false } })
    })
  }

  // Ignoring an accepted invoice also removes its filed XML, so ignored
  // invoices never stay on Drive.
  async ignore(ksefNumber: string) {
    const entry = this.db[ksefNumber]
    if (!entry) return
    await this.withEntry(ksefNumber, async () => {
      if (entry.accepted) {
        const { accessToken, rootFolderId } = this.requireDrive()
        await unfileInvoice(accessToken, ksefNumber, this.filingTarget(entry, rootFolderId))
      }
      await this.persist({ ...this.db, [ksefNumber]: { ...entry, accepted: false, ignored: true } })
    })
  }

  async restore(ksefNumber: string) {
    const entry = this.db[ksefNumber]
    if (!entry) return
    await this.persist({ ...this.db, [ksefNumber]: { ...entry, ignored: false } })
  }

  // Changing the filing month of an accepted invoice moves its XML on Drive
  // too, or the old copy is orphaned in the previous month.
  async setMonth(ksefNumber: string, monthKey: string) {
    const entry = this.db[ksefNumber]
    if (!entry || monthKey === entry.monthKey) return

    if (entry.accepted) {
      try {
        const { accessToken, rootFolderId } = this.requireDrive()
        this.error = null
        await refileInvoice(
          accessToken,
          ksefNumber,
          this.filingTarget(entry, rootFolderId),
          this.filingTarget(entry, rootFolderId, monthKey)
        )
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to move filed invoice'
        return
      }
    }

    await this.persist({ ...this.db, [ksefNumber]: { ...entry, monthKey } })
  }
}
