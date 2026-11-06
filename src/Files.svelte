<script lang="ts">
  import { Icon, Document, Trash, DocumentMagnifyingGlass, ArrowUpTray, ArrowTopRightOnSquare, CheckCircle } from 'svelte-hero-icons'
  import { folderTree } from './app/folderTree.svelte'
  import { kindBadge } from './app/categoryStyle'
  import { categoriesStore } from './app/categoriesStore.svelte'
  import { filesStore } from './app/filesStore.svelte'
  import { drivePreview } from './app/invoicePreview.svelte'
  import { navigation } from './app/navigation.svelte'
  import { i18n } from './app/i18n.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import InvoicePreviewModal from './InvoicePreviewModal.svelte'
  import Spinner from './Spinner.svelte'

  const preview = drivePreview()

  // Upload goes to one chosen category; defaults to the first until picked.
  let uploadCategory = $state('')
  const uploadTarget = $derived(filesStore.categories.find((c) => c.key === uploadCategory) ?? filesStore.categories[0])
  const complete = $derived(!!navigation.selectedFolderId && folderTree.isComplete(navigation.selectedFolderId))
  const uploading = $derived(!!uploadTarget && filesStore.isUploading(uploadTarget))

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
      <p class="text-gray-600 font-medium">{i18n.t('files.pickMonth')}</p>
      <p class="text-gray-500 text-sm">{i18n.t('files.pickMonthHint')}</p>
    </div>
  {:else if filesStore.loading && filesStore.categories.length === 0}
    <Spinner label={i18n.t('files.loading')} />
  {:else}
    <div class="flex flex-wrap gap-4 items-end">
      <div>
        <label for="uploadCategory" class="block text-xs font-semibold text-gray-600 mb-1">{i18n.t('files.uploadTo')}</label>
        <select
          id="uploadCategory"
          bind:value={uploadCategory}
          class="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
        >
          {#each filesStore.categories as category (category.key)}
            <option value={category.key}>{category.key}</option>
          {/each}
        </select>
      </div>
      <label class="btn btn-sm btn-primary cursor-pointer {uploading || !uploadTarget ? 'opacity-50 pointer-events-none' : ''}">
        <Icon src={ArrowUpTray} class="w-4 h-4" />
        {uploading ? i18n.t('files.uploading') : i18n.t('files.upload')}
        <input
          type="file"
          multiple
          class="hidden"
          disabled={uploading || !uploadTarget}
          onchange={(event) => {
            const input = event.currentTarget
            if (uploadTarget) filesStore.upload(uploadTarget, [...(input.files ?? [])])
            input.value = ''
          }}
        />
      </label>
      <button
        type="button"
        class="btn btn-sm btn-success"
        disabled={complete || filesStore.marking}
        title={complete ? i18n.t('files.markedComplete') : undefined}
        onclick={() => filesStore.markComplete()}
      >
        <Icon src={CheckCircle} class="w-4 h-4" />
        {i18n.t('files.markComplete')}
      </button>
    </div>

    {#if filesStore.rows.length === 0}
      <p class="text-sm text-gray-400">{i18n.t('files.noFiles')}</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full table-fixed">
          <colgroup>
            <col class="w-[11%]" />
            <col class="w-[11%]" />
            <col class="w-[36%]" />
            <col class="w-[12%]" />
            <col class="w-[10%]" />
            <col class="w-[10%]" />
            <col class="w-[10%]" />
          </colgroup>
          <thead>
            <tr class="border-b border-gray-200">
              <th class="th">{i18n.t('files.category')}</th>
              <th class="th">{i18n.t('files.issueDate')}</th>
              <th class="th">{i18n.t('files.name')}</th>
              <th class="th text-right">{i18n.t('files.gross')}</th>
              <th class="th text-right">{i18n.t('files.vat')}</th>
              <th class="th text-center">{i18n.t('files.preview')}</th>
              <th class="th text-right">{i18n.t('files.remove')}</th>
            </tr>
          </thead>
          <tbody>
            {#each filesStore.rows as row (row.file.id)}
              <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="td"><span class="inline-block max-w-full truncate rounded-full {kindBadge(row.kind)} px-2 py-0.5 text-xs font-semibold" title={row.category}>{row.category}</span></td>
                <td class="td text-gray-600">{row.issueDate}</td>
                <td class="td truncate" title={row.counterparty}>{row.counterparty}</td>
                <td class="td text-right">{row.gross}</td>
                <td class="td text-right">{row.vat}</td>
                <td class="px-4 py-2">
                  <div class="flex items-center justify-center">
                    {#if row.previewable}
                      <button
                        type="button"
                        onclick={() => preview.open(row.file.id)}
                        title={i18n.t('files.previewInvoice')}
                        aria-label={i18n.t('files.previewInvoice')}
                        class="btn btn-icon btn-ghost"
                      >
                        <Icon src={DocumentMagnifyingGlass} class="w-4 h-4" />
                      </button>
                    {:else}
                      <a
                        href={row.openUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={i18n.t('files.openInDrive')}
                        aria-label={i18n.t('files.openInDrive')}
                        class="btn btn-icon btn-ghost"
                      >
                        <Icon src={ArrowTopRightOnSquare} class="w-4 h-4" />
                      </a>
                    {/if}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  {#if row.external}
                    <button
                      type="button"
                      onclick={() => filesStore.remove(row.file)}
                      disabled={row.removing}
                      title={i18n.t('files.removeFromDrive')}
                      aria-label={i18n.t('files.removeFromDrive')}
                      class="btn btn-icon btn-danger"
                    >
                      <Icon src={Trash} class="w-4 h-4" />
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<InvoicePreviewModal {preview} />
