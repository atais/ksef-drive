<script lang="ts">
  import {
    queryAllInvoicesMetadata,
    downloadInvoiceXml,
    type InvoiceMetadata,
    type InvoiceQueryDateType,
  } from './ksef/ksefService'
  import {
    saveTextFileToFolder,
    deleteFileFromFolder,
    moveFileBetweenFolders,
    ensureMonthCategoryFolder,
    type InvoiceCategoryFolder,
  } from './gdrive/googleDriveService'
  import { loadInvoicesDb, saveInvoicesDb, type InvoicesDb, type InvoiceDbEntry } from './gdrive/invoicesDb'
  import { Icon, Trash, ArrowPath, Check, Eye, EyeSlash } from 'svelte-hero-icons'

  interface Props {
    sessionToken: string
    accessToken: string | null
    ksefFolderId: string | null
    configFolderId: string | null
    userNip: string
  }

  let { sessionToken, accessToken, ksefFolderId, configFolderId, userNip }: Props = $props()

  function isoMonthsAgo(months: number): string {
    const date = new Date()
    date.setMonth(date.getMonth() - months)
    date.setDate(date.getDate() + 1)
    return date.toISOString()
  }

  // KSEF caps a single query's date range at 3 months. Given a "from" date,
  // returns the latest "to" date (as yyyy-mm-dd) that still fits that window.
  function maxToDate(fromValue: string): string {
    const date = new Date(fromValue)
    date.setMonth(date.getMonth() + 3)
    date.setDate(date.getDate() - 1)
    return date.toISOString().slice(0, 10)
  }

  function handleFromChange(value: string) {
    from = value
    const cap = maxToDate(value)
    const now = new Date().toISOString().slice(0, 10)
    // If today is beyond the 3-month window from the new "from" date, cap
    // "to" so the range stays within what KSEF allows.
    if (now > cap) {
      to = cap
    }
  }

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

  type StatusFilter = 'pending' | 'added' | 'ignored' | 'all'

  let dateType = $state<InvoiceQueryDateType>('Invoicing')
  let from = $state(isoMonthsAgo(3).slice(0, 10))
  let to = $state('')
  let db = $state<InvoicesDb>({})
  let loadingDb = $state(true)
  let syncing = $state(false)
  let error = $state<string | null>(null)
  let savingKsefNumber = $state<string | null>(null)
  let statusFilter = $state<StatusFilter>('pending')

  const invoices = $derived(
    Object.values(db)
      .filter((entry) => {
        if (statusFilter === 'pending') return !entry.accepted && !entry.ignored
        if (statusFilter === 'added') return entry.accepted
        if (statusFilter === 'ignored') return entry.ignored
        return true
      })
      .map((entry) => entry.metadata)
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
  )

  async function persistDb(next: InvoicesDb) {
    db = next
    if (accessToken && configFolderId) {
      await saveInvoicesDb(accessToken, configFolderId, next)
    }
  }

  async function loadDb() {
    if (!accessToken || !configFolderId) return
    loadingDb = true
    try {
      db = await loadInvoicesDb(accessToken, configFolderId)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load invoices DB'
    } finally {
      loadingDb = false
    }
  }

  loadDb()

  // Extends the local Drive DB with invoices from KSEF for the selected date
  // range, across every subject role (buyer + seller by default). Never
  // removes DB entries - the displayed list always reflects DB state.
  async function syncInvoices() {
    syncing = true
    error = null
    try {
      const dateRange = {
        dateType,
        from: new Date(from).toISOString(),
        to: to ? new Date(to).toISOString() : undefined,
      }
      const fetched = await queryAllInvoicesMetadata(sessionToken, dateRange)

      const next: InvoicesDb = { ...db }
      for (const invoice of fetched) {
        const existing = db[invoice.ksefNumber]
        next[invoice.ksefNumber] = existing
          ? { ...existing, metadata: invoice }
          : {
              metadata: invoice,
              role: invoiceRole(invoice, userNip),
              accepted: false,
              ignored: false,
              monthKey: invoiceMonthKey(invoice),
            }
      }

      await persistDb(next)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to sync invoices'
    } finally {
      syncing = false
    }
  }

  // Accepts an invoice: downloads its XML and files it under
  // <year>/<MM.year>/_Sprzedaz (if I'm the seller) or _Koszty (if buyer).
  async function acceptInvoice(entry: InvoiceDbEntry) {
    if (!accessToken || !ksefFolderId) {
      error = 'Connect Google Drive first'
      return
    }
    const match = MONTH_KEY_PATTERN.exec(entry.monthKey)
    if (!match) {
      error = `Invalid month: ${entry.monthKey}`
      return
    }
    const [, month, year] = match
    const category = categoryForRole(entry.role)

    savingKsefNumber = entry.metadata.ksefNumber
    error = null
    try {
      const folderId = await ensureMonthCategoryFolder(accessToken, ksefFolderId, year, month, category)
      const xml = await downloadInvoiceXml(sessionToken, entry.metadata.ksefNumber)
      await saveTextFileToFolder(accessToken, folderId, `${entry.metadata.ksefNumber}.xml`, xml, 'application/xml')
      await persistDb({ ...db, [entry.metadata.ksefNumber]: { ...entry, accepted: true } })
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to accept invoice'
    } finally {
      savingKsefNumber = null
    }
  }

  // Deletes an invoice's filed XML from its category folder, if it was ever
  // filed there.
  async function deleteFiledXml(entry: InvoiceDbEntry): Promise<void> {
    if (!accessToken || !ksefFolderId) {
      error = 'Connect Google Drive first'
      throw new Error('Not connected to Google Drive')
    }
    const match = MONTH_KEY_PATTERN.exec(entry.monthKey)
    if (!match) {
      error = `Invalid month: ${entry.monthKey}`
      throw new Error(error)
    }
    const [, month, year] = match
    const category = categoryForRole(entry.role)
    const folderId = await ensureMonthCategoryFolder(accessToken, ksefFolderId, year, month, category)
    await deleteFileFromFolder(accessToken, folderId, `${entry.metadata.ksefNumber}.xml`)
  }

  // Un-accepts an invoice: deletes its filed XML from the category folder and
  // clears the accepted flag.
  async function removeInvoice(entry: InvoiceDbEntry) {
    savingKsefNumber = entry.metadata.ksefNumber
    error = null
    try {
      await deleteFiledXml(entry)
      await persistDb({ ...db, [entry.metadata.ksefNumber]: { ...entry, accepted: false } })
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to remove invoice'
    } finally {
      savingKsefNumber = null
    }
  }

  // Ignoring an accepted invoice also removes its filed XML from Drive, so
  // ignored invoices never stay on disk.
  async function ignoreInvoice(ksefNumber: string) {
    const entry = db[ksefNumber]
    if (!entry) return

    savingKsefNumber = ksefNumber
    error = null
    try {
      if (entry.accepted) {
        await deleteFiledXml(entry)
      }
      await persistDb({ ...db, [ksefNumber]: { ...entry, accepted: false, ignored: true } })
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to ignore invoice'
    } finally {
      savingKsefNumber = null
    }
  }

  async function restoreInvoice(ksefNumber: string) {
    const entry = db[ksefNumber]
    if (!entry) return
    await persistDb({ ...db, [ksefNumber]: { ...entry, ignored: false } })
  }

  // Changing the filing month for an already-accepted invoice must move its
  // XML on Drive too, or the old copy is orphaned in the previous month.
  async function setMonthOverride(ksefNumber: string, value: string) {
    const entry = db[ksefNumber]
    if (!entry || value === entry.monthKey) return

    if (entry.accepted && accessToken && ksefFolderId) {
      const oldMatch = MONTH_KEY_PATTERN.exec(entry.monthKey)
      const newMatch = MONTH_KEY_PATTERN.exec(value)
      if (oldMatch && newMatch) {
        const category = categoryForRole(entry.role)
        error = null
        try {
          const [, oldMonth, oldYear] = oldMatch
          const [, newMonth, newYear] = newMatch
          const oldFolderId = await ensureMonthCategoryFolder(accessToken, ksefFolderId, oldYear, oldMonth, category)
          const newFolderId = await ensureMonthCategoryFolder(accessToken, ksefFolderId, newYear, newMonth, category)
          await moveFileBetweenFolders(accessToken, oldFolderId, newFolderId, `${ksefNumber}.xml`)
        } catch (err) {
          error = err instanceof Error ? err.message : 'Failed to move filed invoice'
          return
        }
      }
    }

    await persistDb({ ...db, [ksefNumber]: { ...entry, monthKey: value } })
  }
</script>

<div class="bg-white rounded-xl border border-gray-200 p-8">
  <div class="flex flex-wrap gap-4 mb-6 items-end">
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
        oninput={(e) => handleFromChange((e.target as HTMLInputElement).value)}
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
      onclick={syncInvoices}
      disabled={syncing || loadingDb}
      class="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all"
    >
      {syncing ? 'Syncing...' : 'Sync'}
    </button>
    <div class="inline-flex rounded-lg border border-gray-300 overflow-hidden ml-auto">
      {#each [{ value: 'pending', label: 'Pending' }, { value: 'added', label: 'Added' }, { value: 'ignored', label: 'Ignored' }, { value: 'all', label: 'All' }] as option (option.value)}
        <button
          type="button"
          onclick={() => (statusFilter = option.value as StatusFilter)}
          class="px-4 py-2 text-sm font-semibold transition-colors {statusFilter === option.value
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  {#if error}
    <div class="mb-4 px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg">{error}</div>
  {/if}

  {#if loadingDb}
    <div class="text-center py-12">
      <p class="text-gray-600 font-medium">Loading invoices...</p>
    </div>
  {:else if invoices.length === 0}
    <div class="text-center py-12">
      <p class="text-gray-600 font-medium">No invoices yet</p>
      <p class="text-gray-500 text-sm">Pick a date range and click "Sync" to pull invoices from KSEF</p>
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
            <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">VAT</th>
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Filing</th>
            <th class="text-center py-3 px-4 text-sm font-semibold text-gray-600">
              {statusFilter === 'added' ? 'Remove' : 'Approve'}
            </th>
            <th class="text-center py-3 px-4 text-sm font-semibold text-gray-600">
              {statusFilter === 'ignored' ? 'Restore' : 'Ignore'}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each invoices as invoice (invoice.ksefNumber)}
            {@const entry = db[invoice.ksefNumber]}
            {@const isSaving = savingKsefNumber === invoice.ksefNumber}
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="py-4 px-4 text-sm text-gray-600">{invoice.issueDate}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{invoice.invoiceNumber}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{invoice.seller?.name || invoice.seller?.nip}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{invoice.buyer?.name || invoice.buyer?.identifier?.value}</td>
              <td class="py-4 px-4 text-sm text-right text-gray-900">
                {invoice.grossAmount.toFixed(2)} {invoice.currency}
              </td>
              <td class="py-4 px-4 text-sm text-right text-gray-900">
                {invoice.vatAmount.toFixed(2)} {invoice.currency}
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-0.5 text-xs font-semibold rounded-full {entry.role === 'seller' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}"
                    title={`Filed to ${categoryForRole(entry.role)}`}
                  >
                    {categoryForRole(entry.role)}
                  </span>
                  <select
                    value={entry.monthKey}
                    onchange={(e) => setMonthOverride(invoice.ksefNumber, (e.target as HTMLSelectElement).value)}
                    class="px-2 py-1 text-xs rounded-lg border border-gray-300 bg-white text-gray-900"
                  >
                    {#each monthOptionsForKey(entry.monthKey) as option (option)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  {#if entry.ignored}
                    <span class="text-xs text-gray-400">-</span>
                  {:else if entry.accepted}
                    <button
                      type="button"
                      onclick={() => removeInvoice(entry)}
                      disabled={isSaving}
                      title="Remove from Drive"
                      aria-label="Remove from Drive"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all"
                    >
                      <Icon src={Trash} class="w-4 h-4" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => acceptInvoice(entry)}
                      disabled={isSaving}
                      title="Add"
                      aria-label="Add"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-all"
                    >
                      {#if isSaving}
                        <Icon src={ArrowPath} class="w-4 h-4 animate-spin" />
                      {:else}
                        <Icon src={Check} class="w-4 h-4" />
                      {/if}
                    </button>
                  {/if}
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  {#if entry.ignored}
                    <button
                      type="button"
                      onclick={() => restoreInvoice(invoice.ksefNumber)}
                      title="Restore"
                      aria-label="Restore"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-all"
                    >
                      <Icon src={Eye} class="w-4 h-4" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => ignoreInvoice(invoice.ksefNumber)}
                      disabled={isSaving}
                      title="Ignore"
                      aria-label="Ignore"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-gray-400 hover:bg-gray-500 disabled:opacity-50 transition-all"
                    >
                      <Icon src={EyeSlash} class="w-4 h-4" />
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
