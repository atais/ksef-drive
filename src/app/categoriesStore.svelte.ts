// The live category list, shared by the Settings, Invoices and Files pages.
//
// Every mutation is Drive-first: the folders are created or removed before the
// list is persisted, so a failed Drive write never leaves the saved list
// describing a folder layout that doesn't exist.

import {
  countCategoryFiles,
  createCategoryFolders,
  removeCategoryFolders,
} from './archive'
import {
  categoriesOfKind,
  defaultCategories,
  loadCategories,
  newCategory,
  saveCategories,
  validateCategoryName,
  type Category,
  type CategoryKind,
} from './categories'
import { ksefNumberFromFilename } from './invoiceFiling'
import { loadInvoicesDb, saveInvoicesDb, type InvoicesDb } from './invoicesDb'
import { session } from './session.svelte'

interface Drive {
  accessToken: string
  rootFolderId: string
  configFolderId: string
}

export interface RemovalReport {
  name: string
  folders: number
  files: number
  // Invoices whose filed XML went with the folders. They're back to pending,
  // so the user can re-file them under a category that still exists.
  unfiled: number
}

export class CategoriesStore {
  categories = $state<Category[]>(defaultCategories())
  loading = $state(true)
  saving = $state(false)
  error = $state<string | null>(null)
  // Set after a removal so the page can report what it took with it.
  lastRemoval = $state<RemovalReport | null>(null)

  readonly names = $derived(this.categories.map((category) => category.key))

  ofKind(kind: CategoryKind): Category[] {
    return categoriesOfKind(this.categories, kind)
  }

  async load(accessToken: string, configFolderId: string) {
    this.loading = true
    try {
      this.categories = await loadCategories(accessToken, configFolderId)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      this.loading = false
    }
  }

  private requireDrive(): Drive {
    const { accessToken, rootFolderId, configFolderId } = session
    if (!accessToken || !rootFolderId || !configFolderId) throw new Error('Connect Google Drive first')
    return { accessToken, rootFolderId, configFolderId }
  }

  private async mutate(next: Category[], driveWork: (drive: Drive) => Promise<void>) {
    this.saving = true
    this.error = null
    try {
      const drive = this.requireDrive()
      await driveWork(drive)
      await saveCategories(drive.accessToken, drive.configFolderId, next)
      this.categories = next
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to update categories'
    } finally {
      this.saving = false
    }
  }

  // How many files a removal would delete. The page asks before going ahead,
  // since the deletion takes the files with the folders.
  async countFiles(key: string): Promise<number> {
    const { accessToken, rootFolderId } = this.requireDrive()
    return countCategoryFiles(accessToken, rootFolderId, key)
  }

  async add(name: string, kind: CategoryKind) {
    const problem = validateCategoryName(name, this.categories)
    if (problem) {
      this.error = problem
      return
    }

    const category = newCategory(name, kind)
    this.lastRemoval = null
    await this.mutate([...this.categories, category], (drive) =>
      createCategoryFolders(drive.accessToken, drive.rootFolderId, category.key)
    )
  }

  // Display order is the persisted order: Files page lists sections in the
  // same order categories come back in, so moving a category here moves its
  // section there too.
  async move(key: string, direction: 'up' | 'down') {
    const index = this.categories.findIndex((category) => category.key === key)
    if (index === -1) return
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= this.categories.length) return

    const next = [...this.categories]
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]

    this.lastRemoval = null
    await this.mutate(next, async () => {})
  }

  async remove(key: string) {
    this.lastRemoval = null
    const next = this.categories.filter((category) => category.key !== key)

    await this.mutate(next, async (drive) => {
      const removal = await removeCategoryFolders(drive.accessToken, drive.rootFolderId, key)
      const unfiled = await this.unfileDeleted(drive, removal.files)
      this.lastRemoval = { name: key, folders: removal.folders, files: removal.files.length, unfiled }
    })
  }

  // Clears the filing state of invoices whose XML was just deleted: they go
  // back to pending with no category, so the Invoices page offers them for
  // filing again instead of pointing at a folder that's gone.
  private async unfileDeleted(drive: Drive, filenames: string[]): Promise<number> {
    if (filenames.length === 0) return 0

    const db = await loadInvoicesDb(
      drive.accessToken,
      drive.configFolderId,
      session.ksefCredentials?.nip ?? ''
    )
    const next: InvoicesDb = { ...db }
    let unfiled = 0

    for (const filename of filenames) {
      const entry = next[ksefNumberFromFilename(filename)]
      if (!entry) continue
      next[entry.metadata.ksefNumber] = { ...entry, accepted: false, category: null }
      unfiled += 1
    }

    if (unfiled > 0) await saveInvoicesDb(drive.accessToken, drive.configFolderId, next)
    return unfiled
  }
}

export const categoriesStore = new CategoriesStore()
