// Where the user is in the app. There's no router, so this is the whole of
// it: which page is showing, whether the mobile sidebar is open, and which
// month folder the sidebar has selected.

export type View = 'settings' | 'invoices' | 'files'

export class Navigation {
  view = $state<View>('invoices')
  sidebarOpen = $state(false)
  selectedFolderId = $state<string | null>(null)

  // The sidebar highlight only applies on the Files page — the selection is
  // remembered elsewhere, just not shown.
  readonly highlightedFolderId = $derived(this.view === 'files' ? this.selectedFolderId : null)

  go(view: View) {
    this.view = view
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen
  }

  closeSidebar() {
    this.sidebarOpen = false
  }

  selectFolder(folderId: string) {
    this.selectedFolderId = folderId
    this.view = 'files'
    this.sidebarOpen = false
  }
}

export const navigation = new Navigation()
