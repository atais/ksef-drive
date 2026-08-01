// Shared state for the invoice preview modal. The XML comes from a different
// place depending on the page — Drive for filed invoices, KSeF for pending
// ones — so the source is injected as a loader, and the two loaders live here
// rather than in the pages, which shouldn't be reaching for session tokens.

import { downloadFileText } from '../gdrive/driveApi'
import { downloadInvoiceXml } from '../ksef/invoiceApi'
import { errorMessage } from './errors'
import { session } from './session.svelte'

export class InvoicePreview {
  xml = $state<string | null>(null)
  loading = $state(false)
  error = $state<string | null>(null)
  private openId = $state<string | null>(null)

  readonly isOpen = $derived(this.openId !== null)

  private load: (id: string) => Promise<string>

  constructor(load: (id: string) => Promise<string>) {
    this.load = load
  }

  async open(id: string) {
    this.openId = id
    this.xml = null
    this.error = null
    this.loading = true
    try {
      const xml = await this.load(id)
      // Ignore a slow load whose modal has already been closed or replaced.
      if (this.openId === id) this.xml = xml
    } catch (error) {
      if (this.openId === id) this.error = errorMessage(error, 'Failed to load invoice')
    } finally {
      if (this.openId === id) this.loading = false
    }
  }

  close() {
    this.openId = null
    this.xml = null
    this.error = null
  }
}

// Previews a not-yet-filed invoice, straight from KSeF, by ksefNumber.
export function ksefPreview(): InvoicePreview {
  return new InvoicePreview((ksefNumber) => downloadInvoiceXml(session.requireKsefSession(), ksefNumber))
}

// Previews a file already in the archive, by Drive file id.
export function drivePreview(): InvoicePreview {
  return new InvoicePreview((fileId) => downloadFileText(session.requireDrive().accessToken, fileId))
}
