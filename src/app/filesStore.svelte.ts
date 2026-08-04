// State machine for the Files page: what's actually sitting in the selected
// month's folders on Drive, joined against the invoice DB so filed invoices
// can be shown with their metadata rather than as bare filenames.

import { deleteFile, type DriveFile } from '../gdrive/driveApi'
import { listMonthCategories, type CategorySection } from './archive'
import { categoriesStore } from './categoriesStore.svelte'
import { errorMessage } from './errors'
import { i18n } from './i18n.svelte'
import { counterpartyName, formatAmount } from './invoiceDisplay'
import { invoiceRole, isInvoiceXml, ksefNumberFromFilename } from './invoiceFiling'
import { invoicesDb } from './invoicesDbStore.svelte'
import { session } from './session.svelte'
import { TaskState } from './task.svelte'
import type { Category } from './categories'

// A file as the table shows it. Metadata is absent for anything that isn't a
// filed invoice (or whose DB entry is gone), hence the dashes.
export interface FileRow {
  file: DriveFile
  issueDate: string
  counterparty: string
  gross: string
  vat: string
  previewable: boolean
  removing: boolean
}

export interface FileSection {
  category: Category
  // Invoice categories get the metadata table; "other" ones are a plain grid
  // of filenames, since nothing there came from KSeF.
  tabular: boolean
  // Sales categories name the buyer, cost categories name the seller.
  counterpartyHeader: string
  rows: FileRow[]
}

const NONE = '-'

export class FilesStore {
  loading = $state(false)
  private folders = $state<CategorySection[]>([])
  private task = new TaskState()

  readonly error = $derived(this.task.error)

  readonly sections: FileSection[] = $derived(
    this.folders.map((section) => ({
      category: section.category,
      tabular: section.category.kind !== 'other',
      counterpartyHeader: section.category.kind === 'sold' ? i18n.t('files.to') : i18n.t('files.from'),
      rows: section.files.map((file) => this.toRow(file)),
    }))
  )

  private toRow(file: DriveFile): FileRow {
    const entry = invoicesDb.entryForFilename(file.name)
    const invoice = entry?.metadata
    const role = invoice ? invoiceRole(invoice, session.ksefCredentials?.nip ?? '') : null
    return {
      file,
      issueDate: invoice?.issueDate ?? NONE,
      // Without metadata the filename is the only thing we can name it by.
      counterparty: (invoice && role ? counterpartyName(invoice, role) : undefined) ?? file.name,
      gross: invoice ? formatAmount(invoice.grossAmount, invoice.currency) : NONE,
      vat: invoice ? formatAmount(invoice.vatAmount, invoice.currency) : NONE,
      previewable: isInvoiceXml(file.name),
      removing: this.task.isBusy(file.id),
    }
  }

  // Loads a folder's contents alongside the invoice DB. Returns a cancel
  // function so a caller reacting to folder changes can drop a stale load.
  load(folderId: string): () => void {
    const { accessToken } = session
    if (!accessToken) return () => {}

    this.loading = true
    this.task.clearError()
    this.folders = []

    let cancelled = false
    Promise.all([
      listMonthCategories(accessToken, folderId, categoriesStore.categories),
      invoicesDb.ensureLoaded(),
    ])
      .then(([sections]) => {
        if (!cancelled) this.folders = sections
      })
      .catch((error) => {
        if (!cancelled) this.task.error = errorMessage(error, i18n.t('files.failedLoadFiles'))
      })
      .finally(() => {
        if (!cancelled) this.loading = false
      })

    return () => (cancelled = true)
  }

  // Removes a filed invoice: deletes it from Drive and clears its filing state
  // in the DB, so it shows back up as pending on the Invoices page.
  async remove(file: DriveFile) {
    await this.task.run(
      i18n.t('files.failedRemoveFile'),
      async () => {
        const { accessToken } = session.requireDrive()
        await deleteFile(accessToken, file.id)
        this.folders = this.folders.map((section) => ({
          ...section,
          files: section.files.filter((candidate) => candidate.id !== file.id),
        }))
        await invoicesDb.unfile([ksefNumberFromFilename(file.name)])
      },
      file.id
    )
  }
}

export const filesStore = new FilesStore()
