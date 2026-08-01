// App-wide confirmation dialog.
//
// `confirmAction()` returns a promise that settles when the user answers, so a
// destructive action can await the answer inline. A single dialog is mounted
// once in App.svelte and driven from here; only one question can be open at a
// time.

export interface ConfirmRequest {
  title: string
  // Extra lines shown under the title — a warning about what a destructive
  // action takes with it, typically. Empty entries are dropped here so call
  // sites can build the list with plain conditionals.
  details?: string[]
  confirmLabel?: string
  danger?: boolean
}

class ConfirmDialog {
  request = $state<ConfirmRequest | null>(null)
  private resolve: ((answer: boolean) => void) | null = null

  ask(request: ConfirmRequest): Promise<boolean> {
    // A second question while one is open would strand the first promise, so
    // the outgoing one is answered "no" before it's replaced.
    this.answer(false)
    this.request = { ...request, details: request.details?.filter(Boolean) }
    return new Promise((resolve) => (this.resolve = resolve))
  }

  answer(confirmed: boolean) {
    const resolve = this.resolve
    this.resolve = null
    this.request = null
    resolve?.(confirmed)
  }
}

// The dialog component reads this to render and to answer; everything else
// goes through `confirmAction`.
export const confirmDialog = new ConfirmDialog()

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return confirmDialog.ask(request)
}
