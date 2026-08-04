<script lang="ts">
  import { untrack } from 'svelte'
  import { CredentialsForm, type PemField } from './app/credentialsForm.svelte'
  import { navigation } from './app/navigation.svelte'
  import { session } from './app/session.svelte'
  import { i18n } from './app/i18n.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import Spinner from './Spinner.svelte'
  import type { KsefCredentials } from './ksef/ksefAuth'

  interface Props {
    currentCredentials?: KsefCredentials | null
  }

  let { currentCredentials = null }: Props = $props()

  // Seeded once from the initial prop value on mount — not meant to track
  // later prop changes, since each call site (new vs. edit) is a distinct
  // component instance.
  const form = untrack(() => new CredentialsForm(currentCredentials))

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    await form.submit(async (credentials) => {
      await session.saveKsefCredentials(credentials)
      navigation.go('invoices')
    })
  }

  function pickPem(field: PemField) {
    return (e: Event) => form.loadPem(field, (e.target as HTMLInputElement).files?.[0])
  }
</script>

<div class="bg-white rounded-xl">
  <div class="mb-6">
    <h2 class="text-3xl font-bold text-gray-900 mb-2">
      {i18n.t('credentials.title')}
    </h2>
    <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <p class="text-sm text-blue-600">
        {i18n.t('credentials.info')}
      </p>
    </div>
  </div>

  <form onsubmit={handleSubmit} class="space-y-6">
    <div>
      <label for="nip" class="block text-sm font-semibold text-gray-900 mb-2">{i18n.t('credentials.nip')}</label>
      <input
        id="nip"
        type="text"
        value={form.nip}
        oninput={(e) => form.setNip((e.target as HTMLInputElement).value)}
        placeholder="1234567890"
        class="field w-full"
        disabled={session.savingCredentials}
      />
    </div>

    <div>
      <label for="cert" class="block text-sm font-semibold text-gray-900 mb-2">{i18n.t('credentials.certificate')}</label>
      <input
        id="cert"
        type="file"
        accept=".crt,.pem,.cer"
        onchange={pickPem('certPem')}
        class="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        disabled={session.savingCredentials}
      />
      {#if form.certPem}
        <p class="text-sm text-green-600 mt-2">{form.isEdit ? i18n.t('credentials.newCertLoaded') : i18n.t('credentials.certLoaded')}</p>
      {:else if form.isEdit}
        <p class="text-sm text-gray-500 mt-2">{i18n.t('credentials.certSavedHint')}</p>
      {/if}
    </div>

    <div>
      <label for="key" class="block text-sm font-semibold text-gray-900 mb-2">{i18n.t('credentials.privateKey')}</label>
      <input
        id="key"
        type="file"
        accept=".key,.pem"
        onchange={pickPem('keyPem')}
        class="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        disabled={session.savingCredentials}
      />
      {#if form.keyPem}
        <p class="text-sm text-green-600 mt-2">{form.isEdit ? i18n.t('credentials.newKeyLoaded') : i18n.t('credentials.keyLoaded')}</p>
      {:else if form.isEdit}
        <p class="text-sm text-gray-500 mt-2">{i18n.t('credentials.keySavedHint')}</p>
      {/if}
    </div>

    <div>
      <label for="keyPassword" class="block text-sm font-semibold text-gray-900 mb-2">{i18n.t('credentials.keyPassword')}</label>
      <input
        id="keyPassword"
        type="password"
        value={form.keyPassword}
        oninput={(e) => (form.keyPassword = (e.target as HTMLInputElement).value)}
        placeholder={form.isEdit ? i18n.t('credentials.keyPasswordPlaceholderEdit') : i18n.t('credentials.keyPasswordPlaceholderNew')}
        class="field w-full"
        disabled={session.savingCredentials}
      />
    </div>

    <ErrorBanner message={form.error} />

    <button
      type="submit"
      disabled={session.savingCredentials}
      class="btn btn-primary w-full hover:shadow-lg hover:shadow-blue-600/30"
    >
      {#if session.savingCredentials}
        <Spinner variant="inline" />
        {i18n.t('credentials.saving')}
      {:else if form.isEdit}
        {i18n.t('credentials.saveChanges')}
      {:else}
        {i18n.t('credentials.saveConfiguration')}
      {/if}
    </button>
  </form>

  {#if !form.isEdit}
    <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p class="text-sm text-amber-800">
        <strong>{i18n.t('credentials.requirementsTitle')}</strong> {i18n.t('credentials.requirementsText')}
      </p>
    </div>
  {/if}
</div>
