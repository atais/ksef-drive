// State machine for the Files page: what's actually sitting in the selected
// month's folders on Drive, joined against the invoice DB so filed invoices
// can be shown with their metadata rather than as bare filenames.

import { deleteFile } from '../gdrive/driveApi'
import { listMonthCategories, type CategorySection } from './archive'
import { cancellable } from './cancellable'
import { ksefNumberFromFilename } from './invoiceFiling'
import { loadInvoicesDb, saveInvoicesDb, type InvoicesDb } from './invoicesDb'
import { session } from './session.svelte'

export class FilesStore {
  sections = $state<CategorySection[]>([])
  db = $state<InvoicesDb>({})
  loading = $state(false)
  error = $state<string | null>(null)
  removingFileId = $state<string | null>(null)

  entryFor(filename: string) {
    return this.db[ksefNumberFromFilename(filename)]
  }

  // Loads a folder's contents alongside the invoice DB. Returns a cancel
  // function so a caller reacting to folder changes can drop a stale load.
  load(folderId: string): () => void {
    const { accessToken, configFolderId } = session
    if (!accessToken) return () => {}

    this.loading = true
    this.error = null
    this.sections = []

    return cancellable(
      Promise.all([
        listMonthCategories(accessToken, folderId),
        configFolderId ? loadInvoicesDb(accessToken, configFolderId) : Promise.resolve(this.db),
      ]),
      {
        onResult: ([sections, db]) => {
          this.sections = sections
          this.db = db
        },
        onError: (error) => {
          this.error = error instanceof Error ? error.message : 'Failed to load files'
        },
        onSettled: () => (this.loading = false),
      }
    )
  }

  // Removes a filed invoice: deletes it from Drive and clears its accepted
  // flag in the DB, so it shows back up as not-added on the Invoices page.
  async remove(fileId: string, filename: string) {
    const { accessToken, configFolderId } = session
    if (!accessToken) return

    this.removingFileId = fileId
    this.error = null
    try {
      await deleteFile(accessToken, fileId)
      this.sections = this.sections.map((section) => ({
        ...section,
        files: section.files.filter((file) => file.id !== fileId),
      }))

      const ksefNumber = ksefNumberFromFilename(filename)
      const entry = this.db[ksefNumber]
      if (entry && configFolderId) {
        const next = { ...this.db, [ksefNumber]: { ...entry, accepted: false } }
        await saveInvoicesDb(accessToken, configFolderId, next)
        this.db = next
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to remove file'
    } finally {
      this.removingFileId = null
    }
  }
}

export const filesStore = new FilesStore()
