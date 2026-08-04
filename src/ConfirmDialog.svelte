<script lang="ts">
  import { confirmDialog } from './app/confirm.svelte'
  import { i18n } from './app/i18n.svelte'

  const request = $derived(confirmDialog.request)

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) confirmDialog.answer(false)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!request) return
    if (e.key === 'Escape') confirmDialog.answer(false)
    // Enter confirms, except for a destructive question: a stray keystroke
    // shouldn't be what deletes a category and every file in it.
    if (e.key === 'Enter' && !request.danger) confirmDialog.answer(true)
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if request}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    onclick={handleBackdropClick}
    role="presentation"
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6" role="alertdialog" aria-modal="true">
      <p class="text-base font-semibold text-gray-900">{request.title}</p>

      {#each request.details ?? [] as detail (detail)}
        <p class="mt-2 text-sm text-gray-600">{detail}</p>
      {/each}

      <div class="mt-6 flex justify-end gap-3">
        <button type="button" onclick={() => confirmDialog.answer(false)} class="btn btn-sm btn-ghost">
          {i18n.t('confirm.cancel')}
        </button>
        <button
          type="button"
          onclick={() => confirmDialog.answer(true)}
          class="btn btn-sm {request.danger ? 'btn-danger' : 'btn-primary'}"
        >
          {request.confirmLabel ?? i18n.t('confirm.confirm')}
        </button>
      </div>
    </div>
  </div>
{/if}
