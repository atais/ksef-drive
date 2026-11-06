<script lang="ts">
  import { archiveSettings } from './app/archiveSettings.svelte'
  import { i18n } from './app/i18n.svelte'
  import ErrorBanner from './ErrorBanner.svelte'

  let name = $state(archiveSettings.completionName)
</script>

<h2 class="section-title">{i18n.t('settings.completionTitle')}</h2>
<p class="text-sm text-gray-600 mb-4">{i18n.t('settings.completionHint')}</p>
<div class="mb-3"><ErrorBanner message={archiveSettings.error} /></div>

<form
  class="flex gap-3"
  onsubmit={(event) => {
    event.preventDefault()
    void archiveSettings.setCompletionName(name)
  }}
>
  <input type="text" bind:value={name} class="field flex-1" aria-label={i18n.t('settings.completionTitle')} />
  <button
    type="submit"
    class="btn btn-primary"
    disabled={archiveSettings.saving || name.trim() === archiveSettings.completionName}
  >
    {i18n.t('settings.completionSave')}
  </button>
</form>
