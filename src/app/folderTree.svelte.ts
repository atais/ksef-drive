// The year/month folder tree the sidebar navigates, plus which years are
// expanded.

import { listYearMonthTree, type YearFolder } from './archive'
import { session } from './session.svelte'

export class FolderTree {
  years = $state<YearFolder[]>([])
  loading = $state(true)
  private expanded = $state<Set<string>>(new Set())

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
