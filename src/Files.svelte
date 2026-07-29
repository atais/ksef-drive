<script lang="ts">
  import { Icon, ArrowPath, Document, Trash, DocumentMagnifyingGlass } from 'svelte-hero-icons'
  import { downloadFileText } from './gdrive/driveApi'
  import { categoriesStore } from './app/categoriesStore.svelte'
  import { filesStore } from './app/filesStore.svelte'
  import { InvoicePreview } from './app/invoicePreview.svelte'
  import { navigation } from './app/navigation.svelte'
  import { session } from './app/session.svelte'
  import InvoicePreviewModal from './InvoicePreviewModal.svelte'

  const preview = new InvoicePreview((fileId) => downloadFileText(session.accessToken!, fileId))

  $effect(() => {
    const folderId = navigation.selectedFolderId
    // Read the category list so editing categories in Settings re-lists the
    // month: the sections are one per category.
    categoriesStore.categories
    if (!folderId) return
    return filesStore.load(folderId)
  })
</script>

<div class="space-y-6">
  {#if !navigation.selectedFolderId}
    <div class="text-center py-12">
      <Icon src={Document} class="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <p class="text-gray-600 font-medium">Pick a month</p>
      <p class="text-gray-500 text-sm">Select a month in the sidebar to see its files</p>
    </div>
  {:else if filesStore.loading && filesStore.sections.length === 0}
    <div class="flex items-center justify-center py-20">
      <div class="text-center">
        <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <p class="text-gray-600">Loading files...</p>
      </div>
    </div>
  {:else}
    <div class="space-y-6">
      {#each filesStore.sections as section (section.category.key)}
        <div class="bg-white rounded-xl">
          <h3 class="text-2xl font-bold text-gray-900 mb-6">{section.category.key}</h3>
          {#if section.files.length === 0}
            <p class="text-sm text-gray-400">No files</p>
          {:else if section.category.kind !== 'other'}
            {@const isSales = section.category.kind === 'sold'}
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
                    <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Issue Date</th>
                    <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">{isSales ? 'To' : 'From'}</th>
                    <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Gross</th>
                    <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">VAT</th>
                    <th class="text-center py-3 px-4 text-sm font-semibold text-gray-600">Preview</th>
                    <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {#each section.files as file (file.id)}
                    {@const entry = filesStore.entryFor(file.name)}
                    {@const counterparty = isSales
                      ? entry?.metadata.buyer?.name ?? entry?.metadata.buyer?.identifier?.value
                      : entry?.metadata.seller?.name ?? entry?.metadata.seller?.nip}
                    <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td class="py-4 px-4 text-sm text-gray-600">{entry?.metadata.issueDate ?? '-'}</td>
                      <td class="py-4 px-4 text-sm text-gray-900 truncate">{counterparty ?? file.name}</td>
                      <td class="py-4 px-4 text-sm text-right text-gray-900">
                        {entry ? `${entry.metadata.grossAmount.toFixed(2)} ${entry.metadata.currency}` : '-'}
                      </td>
                      <td class="py-4 px-4 text-sm text-right text-gray-900">
                        {entry ? `${entry.metadata.vatAmount.toFixed(2)} ${entry.metadata.currency}` : '-'}
                      </td>
                      <td class="py-4 px-4">
                        <div class="flex items-center justify-center">
                          <button
                            type="button"
                            onclick={() => preview.open(file.id)}
                            title="Preview invoice"
                            aria-label="Preview invoice"
                            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 transition-all"
                          >
                            <Icon src={DocumentMagnifyingGlass} class="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td class="py-4 px-4 text-right">
                        <button
                          type="button"
                          onclick={() => filesStore.remove(file.id, file.name)}
                          disabled={filesStore.removingFileId === file.id}
                          title="Remove from Drive"
                          aria-label="Remove from Drive"
                          class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all"
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
              {#each section.files as file (file.id)}
                <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 transition-all hover:shadow-md">
                  <Icon src={Document} class="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  </div>
                  {#if file.name.toLowerCase().endsWith('.xml')}
                    <button
                      type="button"
                      onclick={() => preview.open(file.id)}
                      title="Preview invoice"
                      aria-label="Preview invoice"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-200 transition-all flex-shrink-0"
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

{#if preview.isOpen}
  <InvoicePreviewModal
    xml={preview.xml}
    loading={preview.loading}
    error={preview.error}
    onClose={() => preview.close()}
  />
{/if}
