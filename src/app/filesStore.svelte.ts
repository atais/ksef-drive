// State machine for the Files page: what's actually sitting in the selected
// month's folders on Drive, joined against the invoice DB so filed invoices
// can be shown with their metadata rather than as bare filenames.

import { deleteFile, ensureFolder, uploadFile, type DriveFile } from '../gdrive/driveApi'
import { listMonthCategories, type CategorySection } from './archive'
import { archiveSettings } from './archiveSettings.svelte'
import { categoriesStore } from './categoriesStore.svelte'
import { errorMessage } from './errors'
import { folderTree } from './folderTree.svelte'
import { i18n } from './i18n.svelte'
import { counterpartyName, formatAmount } from './invoiceDisplay'
import { invoiceRole, isInvoiceXml } from './invoiceFiling'
import { invoicesDb } from './invoicesDbStore.svelte'
import { session } from './session.svelte'
import { TaskState } from './task.svelte'
import type { Category, CategoryKind } from './categories'

// A file as the table shows it. Metadata is absent for anything that isn't a
// filed invoice (or whose DB entry is gone), hence the dashes.
export interface FileRow {
  file: DriveFile
  // Folder the file sits in, i.e. its category's key.
  category: string
  kind: CategoryKind
  issueDate: string
  counterparty: string
  gross: string
  vat: string
  previewable: boolean
  // Drive's own viewer, for anything the XML preview can't render (PDFs...).
  openUrl: string
  removing: boolean
  // Added by hand, not filed from KSeF: no DB entry, so removable here.
  external: boolean
}

const NONE = '-'
const UPLOADING = 'upload:'
const MARKING = 'mark-complete'

export class FilesStore {
  loading = $state(false)
  private folders = $state<CategorySection[]>([])
  private monthFolderId: string | null = null
  private task = new TaskState()

  readonly error = $derived(this.task.error)

  // Every category with a folder in the month, empty ones included: they're
  // still valid upload targets.
  readonly categories: Category[] = $derived(this.folders.map((section) => section.category))

  // One flat list in category order, newest first within a category (rows with
  // no issue date, i.e. not from KSeF, sort last).
  readonly rows: FileRow[] = $derived(
    this.folders.flatMap((section) =>
      section.files
        .map((file) => this.toRow(file, section.category))
        .sort((a, b) => Number(a.issueDate === NONE) - Number(b.issueDate === NONE) || b.issueDate.localeCompare(a.issueDate) || a.file.name.localeCompare(b.file.name))
    )
  )

  private toRow(file: DriveFile, category: Category): FileRow {
    const entry = invoicesDb.entryForFilename(file.name)
    const invoice = entry?.metadata
    const role = invoice ? invoiceRole(invoice, session.ksefCredentials?.nip ?? '') : null
    return {
      file,
      category: category.key,
      kind: category.kind,
      issueDate: invoice?.issueDate ?? NONE,
      // Without metadata the filename is the only thing we can name it by.
      counterparty: (invoice && role ? counterpartyName(invoice, role) : undefined) ?? file.name,
      gross: invoice ? formatAmount(invoice.grossAmount, invoice.currency) : NONE,
      vat: invoice ? formatAmount(invoice.vatAmount, invoice.currency) : NONE,
      previewable: isInvoiceXml(file.name),
      openUrl: `https://drive.google.com/file/d/${file.id}/view`,
      removing: this.task.isBusy(file.id),
      external: !entry,
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
    this.monthFolderId = folderId

    let cancelled = false
    Promise.all([
      listMonthCategories(accessToken, folderId, categoriesStore.categories),
      invoicesDb.ensureLoaded(),
      folderTree.refreshMonth(folderId),
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

  // Removes a file the user added by hand. KSeF invoices aren't offered here:
  // they're managed from the Invoices page, which keeps the DB in step.
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
      },
      file.id
    )
  }

  // Uploads files into one category folder of the loaded month, creating the
  // folder if it's missing.
  async upload(category: Category, files: File[]) {
    const monthFolderId = this.monthFolderId
    if (!monthFolderId || files.length === 0) return
    await this.task.run(
      i18n.t('files.failedUpload'),
      async () => {
        const { accessToken } = session.requireDrive()
        const folder = await ensureFolder(accessToken, category.key, monthFolderId)
        const uploaded: DriveFile[] = []
        try {
          for (const file of files) uploaded.push(await uploadFile(accessToken, folder.id, file))
        } finally {
          // Show what made it up even if a later file failed.
          this.folders = this.folders.map((section) =>
            section.category.key === category.key ? { ...section, files: [...section.files, ...uploaded] } : section
          )
        }
      },
      UPLOADING + category.key
    )
  }

  // Drops the marker file ("komplet") into the month folder, telling the
  // accountant everything for the month is there.
  async markComplete() {
    const monthFolderId = this.monthFolderId
    if (!monthFolderId) return
    await this.task.run(
      i18n.t('files.failedMarkComplete'),
      async () => {
        const { accessToken } = session.requireDrive()
        const marker = new File([], archiveSettings.completionName, { type: 'text/plain' })
        await uploadFile(accessToken, monthFolderId, marker)
        folderTree.mark(monthFolderId, true)
      },
      MARKING
    )
  }

  readonly marking = $derived(this.task.isBusy(MARKING))

  isUploading(category: Category): boolean {
    return this.task.isBusy(UPLOADING + category.key)
  }
}

export const filesStore = new FilesStore()
