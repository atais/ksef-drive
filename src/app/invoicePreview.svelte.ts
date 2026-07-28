// Shared state for the invoice preview modal. The XML comes from a different
// place depending on the page — Drive for filed invoices, KSeF for pending
// ones — so the source is injected as a loader.

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
      if (this.openId === id) this.error = error instanceof Error ? error.message : 'Failed to load invoice'
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
