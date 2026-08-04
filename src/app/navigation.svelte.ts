// Where the user is in the app. There's no router, so this is the whole of
// it: which page is showing, whether the mobile sidebar is open, and which
// month folder the sidebar has selected.

import { session } from './session.svelte'
import { i18n } from './i18n.svelte'

export type View = 'settings' | 'invoices' | 'files'

export function navItems(): { id: View; label: string }[] {
  return [
    { id: 'invoices', label: i18n.t('nav.ksef') },
    { id: 'files', label: i18n.t('nav.drive') },
    { id: 'settings', label: i18n.t('nav.settings') },
  ]
}

// What actually renders. Differs from the picked view in two cases the
// session forces: there's nothing to show before KSeF is configured, and the
// invoices page needs a KSeF session token it may still be waiting for.
export type ActiveView = View | 'connecting'

export class Navigation {
  view = $state<View>('invoices')
  sidebarOpen = $state(false)
  selectedFolderId = $state<string | null>(null)

  readonly activeView: ActiveView = $derived.by(() => {
    if (this.view === 'settings' || !session.ksefCredentials) return 'settings'
    if (this.view === 'files') return 'files'
    return session.ksefSessionToken ? 'invoices' : 'connecting'
  })

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
