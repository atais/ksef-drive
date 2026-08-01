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
import { invoicesDb } from './invoicesDbStore.svelte'
import { session, type DriveContext } from './session.svelte'
import { TaskState } from './task.svelte'

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
  // Set after a removal so the page can report what it took with it.
  lastRemoval = $state<RemovalReport | null>(null)

  private task = new TaskState()

  readonly names = $derived(this.categories.map((category) => category.key))
  readonly saving = $derived(this.task.busy)
  readonly error = $derived(this.task.error)

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

  private mutate(next: Category[], driveWork: (drive: DriveContext) => Promise<void>) {
    return this.task.run('Failed to update categories', async () => {
      const drive = session.requireDrive()
      await driveWork(drive)
      await saveCategories(drive.accessToken, drive.configFolderId, next)
      this.categories = next
    })
  }

  // How many files a removal would delete. The page asks before going ahead,
  // since the deletion takes the files with the folders. A failure here is
  // reported like any other: null means "couldn't tell", not "none".
  async countFiles(key: string): Promise<number | null> {
    const count = await this.task.run('Failed to count files', () => {
      const { accessToken, rootFolderId } = session.requireDrive()
      return countCategoryFiles(accessToken, rootFolderId, key)
    })
    return count ?? null
  }

  // The removal banner describes one action; it shouldn't survive a page
  // change and reappear as if it just happened.
  dismissRemoval() {
    this.lastRemoval = null
  }

  async add(name: string, kind: CategoryKind) {
    const problem = validateCategoryName(name, this.categories)
    if (problem) {
      this.task.error = problem
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

    await this.mutate(next, async () => {
      // Checked before the delete: failing afterwards would leave filed
      // invoices pointing at folders that no longer exist.
      session.requireNip()
      const { accessToken, rootFolderId } = session.requireDrive()
      const removal = await removeCategoryFolders(accessToken, rootFolderId, key)
      const unfiled = await invoicesDb.unfile(removal.files.map(ksefNumberFromFilename))
      this.lastRemoval = { name: key, folders: removal.folders, files: removal.files.length, unfiled }
    })
  }
}

export const categoriesStore = new CategoriesStore()
