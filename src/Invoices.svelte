<script lang="ts">
  import { Icon, Trash, ArrowPath, Check, Eye, EyeSlash, DocumentMagnifyingGlass } from 'svelte-hero-icons'
  import { ksefPreview } from './app/invoicePreview.svelte'
  import { InvoicesStore, statusFilters, type StatusFilter } from './app/invoicesStore.svelte'
  import { i18n } from './app/i18n.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import InvoicePreviewModal from './InvoicePreviewModal.svelte'
  import Spinner from './Spinner.svelte'

  const store = new InvoicesStore()
  const preview = ksefPreview()
  const STATUS_FILTERS = $derived(statusFilters())

  void store.load()
</script>

<div class="bg-white rounded-xl">
  <div class="flex flex-wrap gap-4 mb-6 items-end">
    <div>
      <label for="from" class="block text-xs font-semibold text-gray-600 mb-1">{i18n.t('invoices.from')}</label>
      <input
        id="from"
        type="date"
        value={store.from}
        oninput={(e) => store.setFrom((e.target as HTMLInputElement).value)}
        class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
      />
    </div>
    <div>
      <label for="to" class="block text-xs font-semibold text-gray-600 mb-1">{i18n.t('invoices.to')}</label>
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
      class="btn btn-sm btn-primary"
    >
      {store.syncing ? i18n.t('invoices.syncing') : i18n.t('invoices.sync')}
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

  <div class="mb-4">
    <ErrorBanner message={store.error} />
  </div>

  {#if store.loadingDb}
    <Spinner label={i18n.t('invoices.loading')} />
  {:else if store.rows.length === 0}
    <div class="text-center py-12">
      <p class="text-gray-600 font-medium">{i18n.t('invoices.noInvoices')}</p>
      <p class="text-gray-500 text-sm">{i18n.t('invoices.noInvoicesHint')}</p>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-gray-200">
            <th class="th">{i18n.t('invoices.issueDate')}</th>
            <th class="th">{i18n.t('invoices.entity')}</th>
            <th class="th text-right">{i18n.t('invoices.gross')}</th>
            <th class="th text-right">{i18n.t('invoices.vat')}</th>
            <th class="th text-center">{i18n.t('invoices.preview')}</th>
            <th class="th">{i18n.t('invoices.category')}</th>
            <th class="th text-center">{store.acceptColumnLabel}</th>
            <th class="th text-center">{store.ignoreColumnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {#each store.rows as row (row.invoice.ksefNumber)}
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="td text-gray-600">{row.invoice.issueDate}</td>
              <td class="td">{row.counterparty}</td>
              <td class="td text-right">{row.gross}</td>
              <td class="td text-right">{row.vat}</td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  <button
                    type="button"
                    onclick={() => preview.open(row.invoice.ksefNumber)}
                    title={i18n.t('invoices.previewInvoice')}
                    aria-label={i18n.t('invoices.previewInvoice')}
                    class="btn btn-icon btn-ghost"
                  >
                    <Icon src={DocumentMagnifyingGlass} class="w-4 h-4" />
                  </button>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center gap-2">
                  {#if row.categoryOptions.length > 1}
                    <select
                      value={row.category}
                      onchange={(e) => store.setCategory(row.entry, (e.target as HTMLSelectElement).value)}
                      title={i18n.t('invoices.filingCategory')}
                      class="px-2 py-1 text-xs font-semibold rounded-lg border {row.role === 'seller' ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}"
                    >
                      {#each row.categoryOptions as option (option.key)}
                        <option value={option.key}>{option.key}</option>
                      {/each}
                    </select>
                  {:else}
                    <span
                      class="px-2 py-0.5 text-xs font-semibold rounded-full {row.role === 'seller' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}"
                      title={i18n.t('invoices.filedTo', { category: row.category })}
                    >
                      {row.category}
                    </span>
                  {/if}
                  <select
                    value={row.entry.monthKey}
                    onchange={(e) => store.setMonth(row.entry, (e.target as HTMLSelectElement).value)}
                    class="px-2 py-1 text-xs rounded-lg border border-gray-300 bg-white text-gray-900"
                  >
                    {#each row.monthOptions as option (option)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  {#if row.entry.ignored}
                    <span class="text-xs text-gray-400">-</span>
                  {:else if row.entry.accepted}
                    <button
                      type="button"
                      onclick={() => store.unaccept(row.entry)}
                      disabled={row.saving}
                      title={i18n.t('invoices.removeFromDrive')}
                      aria-label={i18n.t('invoices.removeFromDrive')}
                      class="btn btn-icon btn-danger"
                    >
                      <Icon src={Trash} class="w-4 h-4" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => store.accept(row)}
                      disabled={row.saving}
                      title={i18n.t('invoices.add')}
                      aria-label={i18n.t('invoices.add')}
                      class="btn btn-icon btn-success"
                    >
                      <Icon src={row.saving ? ArrowPath : Check} class="w-4 h-4 {row.saving ? 'animate-spin' : ''}" />
                    </button>
                  {/if}
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center justify-center">
                  {#if row.entry.ignored}
                    <button
                      type="button"
                      onclick={() => store.restore(row.entry)}
                      disabled={row.saving}
                      title={i18n.t('invoices.restore')}
                      aria-label={i18n.t('invoices.restore')}
                      class="btn btn-icon btn-primary"
                    >
                      <Icon src={Eye} class="w-4 h-4" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => store.ignore(row.entry)}
                      disabled={row.saving}
                      title={i18n.t('invoices.ignore')}
                      aria-label={i18n.t('invoices.ignore')}
                      class="btn btn-icon btn-neutral"
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

<InvoicePreviewModal {preview} />
