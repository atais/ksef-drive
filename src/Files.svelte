<script lang="ts">
  import { Icon, Document, Trash, DocumentMagnifyingGlass } from 'svelte-hero-icons'
  import { categoriesStore } from './app/categoriesStore.svelte'
  import { filesStore } from './app/filesStore.svelte'
  import { drivePreview } from './app/invoicePreview.svelte'
  import { navigation } from './app/navigation.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import InvoicePreviewModal from './InvoicePreviewModal.svelte'
  import Spinner from './Spinner.svelte'

  const preview = drivePreview()

  $effect(() => {
    const folderId = navigation.selectedFolderId
    // Read the category list so editing categories in Settings re-lists the
    // month: the sections are one per category.
    void categoriesStore.categories
    if (!folderId) return
    return filesStore.load(folderId)
  })
</script>

<div class="space-y-6">
  <ErrorBanner message={filesStore.error} />

  {#if !navigation.selectedFolderId}
    <div class="text-center py-12">
      <Icon src={Document} class="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <p class="text-gray-600 font-medium">Pick a month</p>
      <p class="text-gray-500 text-sm">Select a month in the sidebar to see its files</p>
    </div>
  {:else if filesStore.loading && filesStore.sections.length === 0}
    <Spinner label="Loading files..." />
  {:else}
    <div class="space-y-6">
      {#each filesStore.sections as section (section.category.key)}
        <div class="bg-white rounded-xl">
          <h3 class="text-2xl font-bold text-gray-900 mb-6">{section.category.key}</h3>
          {#if section.rows.length === 0}
            <p class="text-sm text-gray-400">No files</p>
          {:else if section.tabular}
            <div class="overflow-x-auto">
              <table class="w-full table-fixed">
                <colgroup>
                  <col class="w-[13%]" />
                  <col class="w-[32%]" />
                  <col class="w-[14%]" />
                  <col class="w-[14%]" />
                  <col class="w-[12%]" />
                  <col class="w-[15%]" />
                </colgroup>
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="th">Issue Date</th>
                    <th class="th">{section.counterpartyHeader}</th>
                    <th class="th text-right">Gross</th>
                    <th class="th text-right">VAT</th>
                    <th class="th text-center">Preview</th>
                    <th class="th text-right">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {#each section.rows as row (row.file.id)}
                    <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td class="td text-gray-600">{row.issueDate}</td>
                      <td class="td truncate">{row.counterparty}</td>
                      <td class="td text-right">{row.gross}</td>
                      <td class="td text-right">{row.vat}</td>
                      <td class="py-4 px-4">
                        <div class="flex items-center justify-center">
                          {#if row.previewable}
                            <button
                              type="button"
                              onclick={() => preview.open(row.file.id)}
                              title="Preview invoice"
                              aria-label="Preview invoice"
                              class="btn btn-icon btn-ghost"
                            >
                              <Icon src={DocumentMagnifyingGlass} class="w-4 h-4" />
                            </button>
                          {/if}
                        </div>
                      </td>
                      <td class="py-4 px-4 text-right">
                        <button
                          type="button"
                          onclick={() => filesStore.remove(row.file)}
                          disabled={row.removing}
                          title="Remove from Drive"
                          aria-label="Remove from Drive"
                          class="btn btn-icon btn-danger"
                        >
                          <Icon src={Trash} class="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each section.rows as row (row.file.id)}
                <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 transition-all hover:shadow-md">
                  <Icon src={Document} class="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{row.file.name}</p>
                  </div>
                  {#if row.previewable}
                    <button
                      type="button"
                      onclick={() => preview.open(row.file.id)}
                      title="Preview invoice"
                      aria-label="Preview invoice"
                      class="btn btn-icon btn-ghost"
                    >
                      <Icon src={DocumentMagnifyingGlass} class="w-4 h-4" />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<InvoicePreviewModal {preview} />
