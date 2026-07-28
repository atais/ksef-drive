<script lang="ts">
  import { Icon, Trash, ArrowPath, Check, Eye, EyeSlash, DocumentMagnifyingGlass } from 'svelte-hero-icons'
  import { downloadInvoiceXml } from './ksef/invoiceApi'
  import { monthOptionsForDate } from './app/dates'
  import { categoryForRole } from './app/invoiceFiling'
  import { InvoicePreview } from './app/invoicePreview.svelte'
  import { InvoicesStore, STATUS_FILTERS, type StatusFilter } from './app/invoicesStore.svelte'
  import { session } from './app/session.svelte'
  import InvoicePreviewModal from './InvoicePreviewModal.svelte'

  const store = new InvoicesStore()
  const preview = new InvoicePreview((ksefNumber) => downloadInvoiceXml(session.ksefSessionToken!, ksefNumber))

  store.dateType = 'Invoicing'
  store.load()
</script>

<div class="bg-white rounded-xl">
  <div class="flex flex-wrap gap-4 mb-6 items-end">
    <div>
      <label for="from" class="block text-xs font-semibold text-gray-600 mb-1">From</label>
      <input
        id="from"
        type="date"
        value={store.from}
        oninput={(e) => store.setFrom((e.target as HTMLInputElement).value)}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      />
    </div>
    <div>
      <label for="to" class="block text-xs font-semibold text-gray-600 mb-1">To (optional)</label>
      <input
        id="to"
        type="date"
        value={store.to}
        oninput={(e) => (store.to = (e.target as HTMLInputElement).value)}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      />
    </div>
    <button
      type="button"
      onclick={() => store.sync()}
      disabled={store.syncing || store.loadingDb}
      class="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all"
    >
      {store.syncing ? 'Syncing...' : 'Sync'}
    </button>
    <div class="inline-flex rounded-lg border border-gray-300 overflow-hidden ml-auto">
      {#each STATUS_FILTERS as option (option.value)}
        <button
          type="button"
          onclick={() => (store.statusFilter = option.value as StatusFilter)}
          class="px-4 py-2 text-sm font-semibold transition-colors {store.statusFilter === option.value
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  {#if store.error}
    <div class="mb-4 px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg">{store.error}</div>
  {/if}

  {#if store.loadingDb}
    <div class="text-center py-12">
      <p class="text-gray-600 font-medium">Loading invoices...</p>
    </div>
  {:else if store.invoices.length === 0}
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
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Entity</th>
            <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Gross</th>
            <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">VAT</th>
            <th class="text-center py-3 px-4 text-sm font-semibold text-gray-600">Preview</th>
            <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Category</th>
            <th class="text-center py-3 px-4 text-sm font-semibold text-gray-600">
              {store.statusFilter === 'added' ? 'Remove' : 'Approve'}
            </th>
            <th class="text-center py-3 px-4 text-sm font-semibold text-gray-600">
              {store.statusFilter === 'ignored' ? 'Restore' : 'Ignore'}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each store.invoices as invoice (invoice.ksefNumber)}
            {@const entry = store.db[invoice.ksefNumber]}
            {@const isSaving = store.savingKsefNumber === invoice.ksefNumber}
            {@const counterparty = entry.role === 'seller'
              ? invoice.buyer?.name ?? invoice.buyer?.identifier?.value
              : invoice.seller?.name ?? invoice.seller?.nip}
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="py-4 px-4 text-sm text-gray-600">{invoice.issueDate}</td>
              <td class="py-4 px-4 text-sm text-gray-900">{counterparty}</td>
              <td class="py-4 px-4 text-sm text-right text-gray-900">
                {invoice.grossAmount.toFixed(2)} {invoice.currency}
              </td>
              <td class="py-4 px-4 text-sm text-right text-gray-900">
                {invoice.vatAmount.toFixed(2)} {invoice.currency}
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  <button
                    type="button"
                    onclick={() => preview.open(invoice.ksefNumber)}
                    title="Preview invoice"
                    aria-label="Preview invoice"
                    class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 transition-all"
                  >
                    <Icon src={DocumentMagnifyingGlass} class="w-4 h-4" />
                  </button>
                </div>
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
                    onchange={(e) => store.setMonth(invoice.ksefNumber, (e.target as HTMLSelectElement).value)}
                    class="px-2 py-1 text-xs rounded-lg border border-gray-300 bg-white text-gray-900"
                  >
                    {#each monthOptionsForDate(invoice.issueDate) as option (option)}
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
                      onclick={() => store.unaccept(entry)}
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
                      onclick={() => store.accept(entry)}
                      disabled={isSaving}
                      title="Add"
                      aria-label="Add"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-all"
                    >
                      <Icon src={isSaving ? ArrowPath : Check} class="w-4 h-4 {isSaving ? 'animate-spin' : ''}" />
                    </button>
                  {/if}
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  {#if entry.ignored}
                    <button
                      type="button"
                      onclick={() => store.restore(invoice.ksefNumber)}
                      title="Restore"
                      aria-label="Restore"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-all"
                    >
                      <Icon src={Eye} class="w-4 h-4" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => store.ignore(invoice.ksefNumber)}
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

{#if preview.isOpen}
  <InvoicePreviewModal
    xml={preview.xml}
    loading={preview.loading}
    error={preview.error}
    onClose={() => preview.close()}
  />
{/if}
