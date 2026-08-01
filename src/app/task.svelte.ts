// Every store runs user actions the same way: mark what's in flight, clear the
// last error, run, report a failure as a message rather than a rejection, and
// clear the flag whichever way it went. This is that, once.
//
// The key identifies *which* row is busy — a ksefNumber, a file id — so a
// table can spin one button rather than all of them. Stores with only one
// action at a time pass no key and read `busy`.

import { errorMessage } from './errors'

const SINGLE = '@single'

export class TaskState {
  error = $state<string | null>(null)
  private activeKey = $state<string | null>(null)

  readonly busy = $derived(this.activeKey !== null)

  isBusy(key: string): boolean {
    return this.activeKey === key
  }

  clearError() {
    this.error = null
  }

  // Returns undefined when the action failed; `error` holds the reason. A
  // caller that needs to know can compare against undefined, but most just
  // let the error field surface in the UI.
  async run<T>(fallback: string, action: () => Promise<T>, key = SINGLE): Promise<T | undefined> {
    this.activeKey = key
    this.error = null
    try {
      return await action()
    } catch (error) {
      this.error = errorMessage(error, fallback)
      return undefined
    } finally {
      this.activeKey = null
    }
  }
}
