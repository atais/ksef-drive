// The year/month folder tree the sidebar navigates, plus which years are
// expanded.

import { findFilesNamed } from '../gdrive/driveApi'
import { listYearMonthTree, type YearFolder } from './archive'
import { archiveSettings } from './archiveSettings.svelte'
import { session } from './session.svelte'

export class FolderTree {
  years = $state<YearFolder[]>([])
  loading = $state(true)
  private expanded = $state<Set<string>>(new Set())
  // Month folders holding the "komplet" marker file, by folder id.
  completeIds = $state<Set<string>>(new Set())

  isComplete(monthId: string): boolean {
    return this.completeIds.has(monthId)
  }

  mark(monthId: string, complete: boolean) {
    const next = new Set(this.completeIds)
    if (complete) next.add(monthId)
    else next.delete(monthId)
    this.completeIds = next
  }

  // Re-checks one month, so a marker added or removed in Drive itself shows up
  // when the month is opened. Failure leaves the last known state.
  async refreshMonth(monthId: string) {
    const { accessToken } = session
    if (!accessToken) return
    try {
      const found = await findFilesNamed(accessToken, archiveSettings.completionName, monthId)
      this.mark(monthId, found.length > 0)
    } catch (error) {
      console.error('Failed to check komplet marker:', error)
    }
  }

  isExpanded(yearId: string): boolean {
    return this.expanded.has(yearId)
  }

  toggle(yearId: string) {
    const next = new Set(this.expanded)
    if (!next.delete(yearId)) next.add(yearId)
    this.expanded = next
  }

  // Returns a cancel function so a caller reacting to session changes can
  // drop a stale load.
  load(): () => void {
    const { accessToken, rootFolderId } = session
    if (!accessToken || !rootFolderId) return () => {}

    let cancelled = false
    // One query for every marker in the Drive; the parents say which months.
    findFilesNamed(accessToken, archiveSettings.completionName)
      .then((files) => {
        if (!cancelled) this.completeIds = new Set(files.flatMap((file) => file.parents ?? []))
      })
      .catch((error) => console.error('Failed to load komplet markers:', error))

    listYearMonthTree(accessToken, rootFolderId)
      .then((tree) => {
        if (cancelled) return
        this.years = tree
        // Open the most recent year on first load, but never fight a user
        // who has already collapsed everything.
        if (this.expanded.size === 0 && tree.length > 0) this.expanded = new Set([tree[0].id])
      })
      .catch((error) => console.error('Failed to load folder tree:', error))
      .finally(() => {
        if (!cancelled) this.loading = false
      })

    return () => (cancelled = true)
  }
}

export const folderTree = new FolderTree()
