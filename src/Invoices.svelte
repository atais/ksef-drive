<script lang="ts">
  import {
    queryInvoicesMetadata,
    downloadInvoiceXml,
    type InvoiceMetadata,
    type InvoiceQuerySubjectType,
    type InvoiceQueryDateType,
  } from './ksef/ksefService'
  import {
    saveTextFileToFolder,
    ensureMonthCategoryFolder,
    type InvoiceCategoryFolder,
  } from './gdrive/googleDriveService'

  interface Props {
    sessionToken: string
    accessToken: string | null
    ksefFolderId: string | null
    userNip: string
  }

  let { sessionToken, accessToken, ksefFolderId, userNip }: Props = $props()

  function isoMonthsAgo(months: number): string {
    const date = new Date()
    date.setMonth(date.getMonth() - months)
    date.setDate(date.getDate() + 1)
    return date.toISOString()
  }

  const ALL_SUBJECT_TYPES: InvoiceQuerySubjectType[] = ['Subject1', 'Subject2', 'Subject3', 'SubjectAuthorized']
  const MONTH_KEY_PATTERN = /^(\d{2})\.(\d{4})$/

  function normalizeNip(nip: string | undefined): string {
    return (nip ?? '').replace(/[\s-]/g, '')
  }

  // Am I the seller or the buyer on this invoice? Seller invoices are sales
  // (_Sprzedaz), everything else is treated as a cost (_Koszty).
  function invoiceRole(invoice: InvoiceMetadata, nip: string): 'seller' | 'buyer' {
    const me = normalizeNip(nip)
    return me && normalizeNip(invoice.seller?.nip) === me ? 'seller' : 'buyer'
  }

  function categoryForRole(role: 'seller' | 'buyer'): InvoiceCategoryFolder {
    return role === 'seller' ? '_Sprzedaz' : '_Koszty'
  }

  // Default month bucket for an invoice, as MM.YYYY, from its issue date.
  function invoiceMonthKey(invoice: InvoiceMetadata): string {
    const date = new Date(invoice.issueDate)
    if (Number.isNaN(date.getTime())) {
      const now = new Date()
      return `${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
    }
    return `${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
  }

  function monthOptionsForKey(monthKey: string): string[] {
    const match = MONTH_KEY_PATTERN.exec(monthKey)
    const year = match ? match[2] : String(new Date().getFullYear())
    return Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}.${year}`)
  }

  let subjectType = $state<InvoiceQuerySubjectType | 'All'>('Subject2')
  let dateType = $state<InvoiceQueryDateType>('Invoicing')
  let from = $state(isoMonthsAgo(3).slice(0, 10))
  let to = $state('')
  let invoices = $state<InvoiceMetadata[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let hasMore = $state(false)
  let savingKsefNumber = $state<string | null>(null)
  let monthOverrides = $state<Record<string, string>>({})
  let acceptedKsefNumbers = $state<Set<string>>(new Set())

  async function fetchInvoices() {
    loading = true
    error = null
    try {
      const dateRange = {
        dateType,
        from: new Date(from).toISOString(),
        to: to ? new Date(to).toISOString() : undefined,
      }

      if (subjectType === 'All') {
        const results = await Promise.all(
          ALL_SUBJECT_TYPES.map((type) => queryInvoicesMetadata(sessionToken, { subjectType: type, dateRange }))
        )
        const merged = new Map<string, InvoiceMetadata>()
        for (const result of results) {
          for (const invoice of result.invoices) {
            merged.set(invoice.ksefNumber, invoice)
          }
        }
        invoices = Array.from(merged.values())
        hasMore = results.some((result) => result.hasMore)
      } else {
        const result = await queryInvoicesMetadata(sessionToken, { subjectType, dateRange })
        invoices = result.invoices
        hasMore = result.hasMore
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to list invoices'
    } finally {
      loading = false
    }
  }

  // Accepts an invoice: downloads its XML and files it under
  // <year>/<MM.year>/_Sprzedaz (if I'm the seller) or _Koszty (if buyer).
  async function acceptInvoice(invoice: InvoiceMetadata) {
    if (!accessToken || !ksefFolderId) {
      error = 'Connect Google Drive first'
      return
    }
    const monthKey = monthOverrides[invoice.ksefNumber] ?? invoiceMonthKey(invoice)
    const match = MONTH_KEY_PATTERN.exec(monthKey)
    if (!match) {
      error = `Invalid month: ${monthKey}`
      return
    }
    const [, month, year] = match
    const category = categoryForRole(invoiceRole(invoice, userNip))

    savingKsefNumber = invoice.ksefNumber
    error = null
    try {
      const folderId = await ensureMonthCategoryFolder(accessToken, ksefFolderId, year, month, category)
      const xml = await downloadInvoiceXml(sessionToken, invoice.ksefNumber)
      await saveTextFileToFolder(accessToken, folderId, `${invoice.ksefNumber}.xml`, xml, 'application/xml')
      acceptedKsefNumbers = new Set(acceptedKsefNumbers).add(invoice.ksefNumber)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to accept invoice'
    } finally {
      savingKsefNumber = null
    }
  }

  function setMonthOverride(ksefNumber: string, value: string) {
    monthOverrides = { ...monthOverrides, [ksefNumber]: value }
  }
</script>

<div class="bg-white rounded-xl border border-gray-200 p-8">
  <div class="flex items-center justify-between mb-6">
    <h3 class="text-2xl font-bold text-gray-900">KSEF Invoices</h3>
  </div>

  <div class="flex flex-wrap gap-4 mb-6 items-end">
    <div>
      <label for="subjectType" class="block text-xs font-semibold text-gray-600 mb-1">Role</label>
      <select
        id="subjectType"
        value={subjectType}
        onchange={(e) => (subjectType = (e.target as HTMLSelectElement).value as InvoiceQuerySubjectType | 'All')}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      >
        <option value="All">All roles</option>
        <option value="Subject1">Issued (as seller)</option>
        <option value="Subject2">Received (as buyer)</option>
        <option value="Subject3">Subject3</option>
        <option value="SubjectAuthorized">Authorized</option>
      </select>
    </div>
    <div>
      <label for="dateType" class="block text-xs font-semibold text-gray-600 mb-1">Date type</label>
      <select
        id="dateType"
        value={dateType}
        onchange={(e) => (dateType = (e.target as HTMLSelectElement).value as InvoiceQueryDateType)}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      >
        <option value="Issue">Issue date</option>
        <option value="Invoicing">Invoicing date</option>
        <option value="PermanentStorage">Permanent storage date</option>
      </select>
    </div>
    <div>
      <label for="from" class="block text-xs font-semibold text-gray-600 mb-1">From</label>
      <input
        id="from"
        type="date"
        value={from}
        oninput={(e) => (from = (e.target as HTMLInputElement).value)}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      />
    </div>
    <div>
      <label for="to" class="block text-xs font-semibold text-gray-600 mb-1">To (optional)</label>
      <input
        id="to"
        type="date"
        value={to}
        oninput={(e) => (to = (e.target as HTMLInputElement).value)}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      />
    </div>
    <button
      type="button"
      onclick={fetchInvoices}
      disabled={loading}
      class="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all"
    >
      {loading ? 'Loading...' : 'List Invoices'}
    </button>
  </div>

  {#if error}
    <div class="mb-4 px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg">{error}</div>
  {/if}

  {#if invoices.length === 0 && !loading}
    <div class="text-center py-12">
      <p class="text-gray-600 font-medium">No invoices loaded</p>
      <p class="text-gray-500 text-sm">Pick a date range and click "List Invoices"</p>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-gray-200">
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Issue Date</th>
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Invoice Number</th>
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Seller</th>
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Buyer</th>
            <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Gross</th>
            <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Accept</th>
          </tr>
        </thead>
        <tbody>
          {#each invoices as invoice (invoice.ksefNumber)}
            {@const role = invoiceRole(invoice, userNip)}
            {@const category = categoryForRole(role)}
            {@const monthKey = monthOverrides[invoice.ksefNumber] ?? invoiceMonthKey(invoice)}
            {@const isSaving = savingKsefNumber === invoice.ksefNumber}
            {@const isAccepted = acceptedKsefNumbers.has(invoice.ksefNumber)}
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="py-4 px-4 text-sm text-gray-600">{invoice.issueDate}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{invoice.invoiceNumber}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{invoice.seller?.name || invoice.seller?.nip}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{invoice.buyer?.name || invoice.buyer?.identifier?.value}</td>
              <td class="py-4 px-4 text-sm text-right text-gray-900">
                {invoice.grossAmount.toFixed(2)} {invoice.currency}
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-end gap-2">
                  <span
                    class="px-2 py-0.5 text-xs font-semibold rounded-full {role === 'seller' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}"
                    title={`Filed to ${category}`}
                  >
                    {category}
                  </span>
                  <select
                    value={monthKey}
                    onchange={(e) => setMonthOverride(invoice.ksefNumber, (e.target as HTMLSelectElement).value)}
                    class="px-2 py-1 text-xs rounded-lg border border-gray-300 bg-white text-gray-900"
                  >
                    {#each monthOptionsForKey(monthKey) as option (option)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    onclick={() => acceptInvoice(invoice)}
                    disabled={isSaving}
                    class="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 {isAccepted ? 'text-green-700 hover:bg-green-50' : 'text-white bg-blue-600 hover:bg-blue-700'}"
                  >
                    {isSaving ? 'Accepting...' : isAccepted ? 'Accepted ✓' : 'Accept'}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if hasMore}
        <p class="text-sm text-gray-500 mt-4">More results available - narrow the date range to see them.</p>
      {/if}
    </div>
  {/if}
</div>
