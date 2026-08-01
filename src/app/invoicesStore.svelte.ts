// State machine for the Invoices page: pull invoice metadata from KSeF into
// the local DB, then let the user accept / ignore / re-file each one, keeping
// the DB and the Drive tree in step.

import { queryAllInvoicesMetadata, type InvoiceMetadata, type InvoiceQueryDateType } from '../ksef/invoiceApi'
import { categoriesStore } from './categoriesStore.svelte'
import { kindForRole, resolveCategory, type Category } from './categories'
import { confirmAction } from './confirm.svelte'
import { isoDate, isoMonthsAgo, maxToDate, monthOptionsForDate } from './dates'
import { counterpartyName, formatAmount } from './invoiceDisplay'
import {
  fileInvoice,
  invoiceMonthKey,
  invoiceRole,
  refileInvoice,
  unfileInvoice,
  type FilingTarget,
  type InvoiceRole,
} from './invoiceFiling'
import { unfiledEntry, type InvoiceDbEntry, type InvoicesDb } from './invoicesDb'
import { invoicesDb } from './invoicesDbStore.svelte'
import { session } from './session.svelte'
import { TaskState } from './task.svelte'

export type StatusFilter = 'pending' | 'added' | 'ignored' | 'all'

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'added', label: 'Added' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'all', label: 'All' },
]

// Everything one table row shows or acts on, worked out here so the markup
// only has to place it.
export interface InvoiceRow {
  invoice: InvoiceMetadata
  entry: InvoiceDbEntry
  role: InvoiceRole
  counterparty: string | undefined
  gross: string
  vat: string
  // The categories this invoice may file into. One option means there's
  // nothing to pick, so the row shows a label instead of a select.
  categoryOptions: Category[]
  category: string
  monthOptions: string[]
  saving: boolean
}

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

  syncing = $state(false)
  // Category a pending invoice will file into once accepted. Kept in memory
  // only: an entry's own `category` stays empty until its XML is on Drive, so
  // the DB never names a folder nothing was filed into.
  private drafts = $state<Record<string, string>>({})
  private task = new TaskState()

  readonly loadingDb = $derived(invoicesDb.loading)
  readonly error = $derived(this.task.error)

  readonly rows = $derived(
    Object.values(invoicesDb.entries)
      .filter((entry) => matchesFilter(entry, this.statusFilter))
      .sort((a, b) => (a.metadata.issueDate < b.metadata.issueDate ? 1 : -1))
      .map((entry) => this.toRow(entry))
  )

  // The two action columns swap meaning with the filter: on the "added" list
  // the only thing to do is take an invoice back off Drive.
  readonly acceptColumnLabel = $derived(this.statusFilter === 'added' ? 'Remove' : 'Approve')
  readonly ignoreColumnLabel = $derived(this.statusFilter === 'ignored' ? 'Restore' : 'Ignore')

  private toRow(entry: InvoiceDbEntry): InvoiceRow {
    const invoice = entry.metadata
    // Which side of the invoice we're on is derived on every read rather than
    // stored: it's a comparison against our own NIP, and that NIP can be fixed
    // or changed long after the invoice was synced.
    const role = invoiceRole(invoice, session.ksefCredentials?.nip ?? '')
    return {
      invoice,
      entry,
      role,
      counterparty: counterpartyName(invoice, role),
      gross: formatAmount(invoice.grossAmount, invoice.currency),
      vat: formatAmount(invoice.vatAmount, invoice.currency),
      // Sold categories for invoices we issued, bought ones for invoices we
      // received. "Other" categories are archive-only and never offered here.
      categoryOptions: categoriesStore.ofKind(kindForRole(role)),
      category: this.categoryFor(entry, role),
      monthOptions: monthOptionsForDate(invoice.issueDate),
      saving: this.task.isBusy(invoice.ksefNumber),
    }
  }

  // The category to display and to file into: the folder an accepted invoice
  // sits in, or a pending one's pick. Either can name a category the user has
  // since deleted, hence the fallback to the first of the right kind.
  private categoryFor(entry: InvoiceDbEntry, role: InvoiceRole): string {
    const preferred = entry.category ?? this.drafts[entry.metadata.ksefNumber]
    return resolveCategory(categoriesStore.categories, kindForRole(role), preferred) ?? preferred ?? ''
  }

  private draftCategory(ksefNumber: string, category: string | null) {
    if (!category) return
    this.drafts = { ...this.drafts, [ksefNumber]: category }
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

  // If today is beyond the 3-month window KSeF allows from the new "from"
  // date, cap "to" so the range stays queryable.
  setFrom(value: string) {
    this.from = value
    const cap = maxToDate(value)
    if (isoDate(new Date()) > cap) this.to = cap
  }

  load() {
    return this.task.run('Failed to load invoices DB', () => invoicesDb.load())
  }

  // Extends the local DB with invoices from KSeF for the selected date range,
  // across every subject role. Never removes DB entries — the displayed list
  // always reflects DB state, and existing filing decisions are preserved.
  async sync() {
    this.syncing = true
    await this.task.run('Failed to sync invoices', async () => {
      const sessionToken = session.requireKsefSession()
      const fetched = await queryAllInvoicesMetadata(sessionToken, {
        dateType: this.dateType,
        from: new Date(this.from).toISOString(),
        to: this.to ? new Date(this.to).toISOString() : undefined,
      })

      const next: InvoicesDb = { ...invoicesDb.entries }
      for (const invoice of fetched) {
        const existing = next[invoice.ksefNumber]
        next[invoice.ksefNumber] = existing
          ? { ...existing, metadata: invoice }
          : {
              metadata: invoice,
              accepted: false,
              ignored: false,
              monthKey: invoiceMonthKey(invoice),
              // Nothing is filed yet, so no category is claimed. Accepting picks it.
              category: null,
            }
      }

      await invoicesDb.replaceAll(next)
    })
    this.syncing = false
  }

  // Accepting downloads the XML and files it under the invoice's month
  // bucket and category.
  async accept(row: InvoiceRow) {
    const { entry, category } = row
    const ksefNumber = entry.metadata.ksefNumber
    await this.task.run(
      'Failed to file invoice',
      async () => {
        const { accessToken, rootFolderId } = session.requireDrive()
        const sessionToken = session.requireKsefSession()
        // Resolve now: this is where the pending pick (or the default for the
        // role) becomes the category the entry records.
        if (!category) throw new Error('No category to file this invoice into')
        await fileInvoice(
          accessToken,
          sessionToken,
          ksefNumber,
          this.filingTarget(entry, rootFolderId, { category })
        )
        await invoicesDb.save({ ...entry, category, accepted: true })
      },
      ksefNumber
    )
  }

  async unaccept(entry: InvoiceDbEntry) {
    const ksefNumber = entry.metadata.ksefNumber
    const confirmed = await confirmAction({
      title: 'Remove this invoice from Google Drive?',
      details: [`Its XML in ${entry.category} will be deleted; the invoice goes back to pending.`],
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) return

    await this.task.run(
      'Failed to remove filed invoice',
      async () => {
        const { accessToken, rootFolderId } = session.requireDrive()
        await unfileInvoice(accessToken, ksefNumber, this.filingTarget(entry, rootFolderId))
        // The folder it came out of becomes the pending pick, so the picker
        // doesn't jump elsewhere the moment the XML is gone.
        this.draftCategory(ksefNumber, entry.category)
        await invoicesDb.unfileOne(entry)
      },
      ksefNumber
    )
  }

  // Ignoring an accepted invoice also removes its filed XML, so ignored
  // invoices never stay on Drive — which makes it destructive, so it asks.
  async ignore(entry: InvoiceDbEntry) {
    const ksefNumber = entry.metadata.ksefNumber
    if (entry.accepted) {
      const confirmed = await confirmAction({
        title: 'Ignore this invoice?',
        details: [`It is filed in ${entry.category}; that XML will be deleted from Google Drive.`],
        confirmLabel: 'Ignore',
        danger: true,
      })
      if (!confirmed) return
    }

    await this.task.run(
      'Failed to ignore invoice',
      async () => {
        if (entry.accepted) {
          const { accessToken, rootFolderId } = session.requireDrive()
          await unfileInvoice(accessToken, ksefNumber, this.filingTarget(entry, rootFolderId))
          this.draftCategory(ksefNumber, entry.category)
        }
        await invoicesDb.save({ ...unfiledEntry(entry), ignored: true })
      },
      ksefNumber
    )
  }

  async restore(entry: InvoiceDbEntry) {
    await this.task.run(
      'Failed to restore invoice',
      () => invoicesDb.save({ ...entry, ignored: false }),
      entry.metadata.ksefNumber
    )
  }

  // Changing where an accepted invoice is filed moves its XML on Drive too,
  // or the old copy is orphaned in the folder it came from.
  private async refile(entry: InvoiceDbEntry, change: { monthKey?: string; category?: string }) {
    const monthKey = change.monthKey ?? entry.monthKey
    const category = change.category ?? entry.category
    if (monthKey === entry.monthKey && category === entry.category) return

    await this.task.run(
      'Failed to move filed invoice',
      async () => {
        if (entry.accepted) {
          const { accessToken, rootFolderId } = session.requireDrive()
          await refileInvoice(
            accessToken,
            entry.metadata.ksefNumber,
            this.filingTarget(entry, rootFolderId),
            this.filingTarget(entry, rootFolderId, { monthKey, category: change.category })
          )
        }
        await invoicesDb.save({ ...entry, monthKey, category })
      },
      entry.metadata.ksefNumber
    )
  }

  setMonth(entry: InvoiceDbEntry, monthKey: string) {
    return this.refile(entry, { monthKey })
  }

  // A pending invoice records no category, so its pick is only remembered —
  // accepting is what writes it. An accepted one moves on Drive instead.
  async setCategory(entry: InvoiceDbEntry, category: string) {
    if (!entry.accepted) {
      this.draftCategory(entry.metadata.ksefNumber, category)
      return
    }
    await this.refile(entry, { category })
  }
}
