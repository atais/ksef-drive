// State machine for the Invoices page: pull invoice metadata from KSeF into
// the local DB, then let the user accept / ignore / re-file each one, keeping
// the DB and the Drive tree in step.

import { queryAllInvoicesMetadata, type InvoiceQueryDateType } from '../ksef/invoiceApi'
import { categoriesStore } from './categoriesStore.svelte'
import { kindForRole, resolveCategory, type Category } from './categories'
import { isoDate, isoMonthsAgo, maxToDate } from './dates'
import {
  fileInvoice,
  invoiceMonthKey,
  invoiceRole,
  refileInvoice,
  unfileInvoice,
  type FilingTarget,
  type InvoiceRole,
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
  // Category a pending invoice will file into once accepted. Kept in memory
  // only: an entry's own `category` stays empty until its XML is on Drive, so
  // the DB never names a folder nothing was filed into.
  private drafts = $state<Record<string, string>>({})

  readonly invoices = $derived(
    Object.values(this.db)
      .filter((entry) => matchesFilter(entry, this.statusFilter))
      .map((entry) => entry.metadata)
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
  )

  // Which side of the invoice we're on. Derived on every read rather than
  // stored: it's a comparison against our own NIP, and that NIP can be fixed
  // or changed long after the invoice was synced.
  roleOf(entry: InvoiceDbEntry): InvoiceRole {
    return invoiceRole(entry.metadata, session.ksefCredentials?.nip ?? '')
  }

  // The categories the user may file this invoice into: sold categories for
  // invoices we issued, bought ones for invoices we received. "Other"
  // categories are archive-only and never offered here.
  categoryOptions(entry: InvoiceDbEntry): Category[] {
    return categoriesStore.ofKind(kindForRole(this.roleOf(entry)))
  }

  // The category to display and to file into: the folder an accepted invoice
  // sits in, or a pending one's pick. Either can name a category the user has
  // since deleted, hence the fallback to the first of the right kind.
  categoryFor(entry: InvoiceDbEntry): string {
    const preferred = entry.category ?? this.drafts[entry.metadata.ksefNumber]
    return resolveCategory(categoriesStore.categories, kindForRole(this.roleOf(entry)), preferred) ?? preferred ?? ''
  }

  private draftCategory(ksefNumber: string, category: string | null) {
    if (!category) return
    this.drafts = { ...this.drafts, [ksefNumber]: category }
  }

  // Narrowing the session once per action keeps every call site free of
  // null-checks on tokens that are always present while this page is mounted.
  private requireDrive(): { accessToken: string; rootFolderId: string } {
    if (!session.accessToken || !session.rootFolderId) throw new Error('Connect Google Drive first')
    return { accessToken: session.accessToken, rootFolderId: session.rootFolderId }
  }

  // Every Drive write needs a folder name, and only a filed invoice carries
  // one, so an unfiled entry has to be given the category explicitly.
  private filingTarget(
    entry: InvoiceDbEntry,
    rootFolderId: string,
    { monthKey = entry.monthKey, category }: { monthKey?: string; category?: string } = {}
  ): FilingTarget {
    const folder = category ?? entry.category
    if (!folder) throw new Error('Invoice is not filed under any category')
    return { rootFolderId, monthKey, category: folder }
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
      this.db = await loadInvoicesDb(
        session.accessToken,
        session.configFolderId,
        session.ksefCredentials?.nip ?? ''
      )
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
        if (existing) {
          next[invoice.ksefNumber] = { ...existing, metadata: invoice }
          continue
        }

        next[invoice.ksefNumber] = {
          metadata: invoice,
          accepted: false,
          ignored: false,
          monthKey: invoiceMonthKey(invoice),
          // Nothing is filed yet, so no category is claimed. Accepting picks it.
          category: null,
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
      // Resolve now: this is where the pending pick (or the default for the
      // role) becomes the category the entry records.
      const category = this.categoryFor(entry)
      if (!category) throw new Error('No category to file this invoice into')
      await fileInvoice(
        accessToken,
        session.ksefSessionToken,
        ksefNumber,
        this.filingTarget(entry, rootFolderId, { category })
      )
      await this.persist({ ...this.db, [ksefNumber]: { ...entry, category, accepted: true } })
    })
  }

  async unaccept(entry: InvoiceDbEntry) {
    const ksefNumber = entry.metadata.ksefNumber
    await this.withEntry(ksefNumber, async () => {
      const { accessToken, rootFolderId } = this.requireDrive()
      await unfileInvoice(accessToken, ksefNumber, this.filingTarget(entry, rootFolderId))
      // The folder it came out of becomes the pending pick, so the picker
      // doesn't jump elsewhere the moment the XML is gone.
      this.draftCategory(ksefNumber, entry.category)
      await this.persist({ ...this.db, [ksefNumber]: { ...entry, accepted: false, category: null } })
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
        this.draftCategory(ksefNumber, entry.category)
      }
      await this.persist({
        ...this.db,
        [ksefNumber]: { ...entry, accepted: false, ignored: true, category: null },
      })
    })
  }

  async restore(ksefNumber: string) {
    const entry = this.db[ksefNumber]
    if (!entry) return
    await this.persist({ ...this.db, [ksefNumber]: { ...entry, ignored: false } })
  }

  // Changing where an accepted invoice is filed moves its XML on Drive too,
  // or the old copy is orphaned in the folder it came from.
  private async refile(ksefNumber: string, change: { monthKey?: string; category?: string }) {
    const entry = this.db[ksefNumber]
    if (!entry) return

    const monthKey = change.monthKey ?? entry.monthKey
    const category = change.category ?? entry.category
    if (monthKey === entry.monthKey && category === entry.category) return

    if (entry.accepted) {
      try {
        const { accessToken, rootFolderId } = this.requireDrive()
        this.error = null
        await refileInvoice(
          accessToken,
          ksefNumber,
          this.filingTarget(entry, rootFolderId),
          this.filingTarget(entry, rootFolderId, { monthKey, category: change.category })
        )
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to move filed invoice'
        return
      }
    }

    await this.persist({ ...this.db, [ksefNumber]: { ...entry, monthKey, category } })
  }

  setMonth(ksefNumber: string, monthKey: string) {
    return this.refile(ksefNumber, { monthKey })
  }

  // A pending invoice records no category, so its pick is only remembered —
  // accepting is what writes it. An accepted one moves on Drive instead.
  async setCategory(ksefNumber: string, category: string) {
    const entry = this.db[ksefNumber]
    if (!entry) return
    if (!entry.accepted) {
      this.draftCategory(ksefNumber, category)
      return
    }
    await this.refile(ksefNumber, { category })
  }
}
