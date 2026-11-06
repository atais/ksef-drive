<script lang="ts">
  import { pickFolder } from './gdrive/folderPicker'
  import { errorMessage } from './app/errors'
  import { i18n } from './app/i18n.svelte'
  import { session } from './app/session.svelte'
  import ErrorBanner from './ErrorBanner.svelte'

  let error = $state<string | null>(null)

  async function choose() {
    error = null
    try {
      const folder = await pickFolder(session.requireDrive().accessToken)
      if (folder) session.setArchiveFolder(folder)
    } catch (e) {
      error = errorMessage(e, i18n.t('settings.archiveFailedLoad'))
    }
  }
</script>

<h2 class="text-2xl font-bold text-gray-900 mb-2">{i18n.t('settings.archiveTitle')}</h2>
<p class="text-sm text-gray-600 mb-4">{i18n.t('settings.archiveHint')}</p>
<ErrorBanner message={error} />

<div class="flex items-center gap-3">
  <span class="flex-1 text-sm font-medium text-gray-900 truncate">
    {session.archiveFolder?.name ?? i18n.t('settings.archiveDefault')}
  </span>
  {#if session.archiveFolder}
    <button type="button" class="btn btn-ghost" onclick={() => session.setArchiveFolder(null)}>
      {i18n.t('settings.archiveUseDefault')}
    </button>
  {/if}
  <button type="button" class="btn btn-primary" onclick={choose}>{i18n.t('settings.archiveChoose')}</button>
</div>
