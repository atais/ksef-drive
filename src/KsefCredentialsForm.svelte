<script lang="ts">
  import { untrack } from 'svelte'
  import { Icon, ArrowPath } from 'svelte-hero-icons'
  import { CredentialsForm } from './app/credentialsForm.svelte'
  import { navigation } from './app/navigation.svelte'
  import { session } from './app/session.svelte'
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

  async function pickCert(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) await form.loadCert(file)
  }

  async function pickKey(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) await form.loadKey(file)
  }
</script>

<div class="bg-white rounded-xl lg:max-w-2xl">
  <div class="mb-6">
    <h2 class="text-3xl font-bold text-gray-900 mb-2">
      {form.isEdit ? 'KSEF Settings' : 'KSEF Configuration'}
    </h2>
    <p class="text-gray-600">
      {form.isEdit
        ? 'Update your KSEF certificate connection details.'
        : 'Connect to Polish KSEF system using a qualified certificate.'}
    </p>
  </div>

  <form onsubmit={handleSubmit} class="space-y-6">
    <div>
      <label for="nip" class="block text-sm font-semibold text-gray-900 mb-2">NIP</label>
      <input
        id="nip"
        type="text"
        value={form.nip}
        oninput={(e) => form.setNip((e.target as HTMLInputElement).value)}
        placeholder="1234567890"
        class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
        disabled={session.savingCredentials}
      />
    </div>

    <div>
      <label for="cert" class="block text-sm font-semibold text-gray-900 mb-2">Certificate (.crt / .pem)</label>
      <input
        id="cert"
        type="file"
        accept=".crt,.pem,.cer"
        onchange={pickCert}
        class="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        disabled={session.savingCredentials}
      />
      {#if form.certPem}
        <p class="text-sm text-green-600 mt-2">{form.isEdit ? 'New certificate loaded' : 'Certificate loaded'}</p>
      {:else if form.isEdit}
        <p class="text-sm text-gray-500 mt-2">Current certificate is saved. Upload a new one to replace it.</p>
      {/if}
    </div>

    <div>
      <label for="key" class="block text-sm font-semibold text-gray-900 mb-2">Private Key (.key)</label>
      <input
        id="key"
        type="file"
        accept=".key,.pem"
        onchange={pickKey}
        class="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        disabled={session.savingCredentials}
      />
      {#if form.keyPem}
        <p class="text-sm text-green-600 mt-2">{form.isEdit ? 'New private key loaded' : 'Private key loaded'}</p>
      {:else if form.isEdit}
        <p class="text-sm text-gray-500 mt-2">Current private key is saved. Upload a new one to replace it.</p>
      {/if}
    </div>

    <div>
      <label for="keyPassword" class="block text-sm font-semibold text-gray-900 mb-2">Private Key Password</label>
      <input
        id="keyPassword"
        type="password"
        value={form.keyPassword}
        oninput={(e) => (form.keyPassword = (e.target as HTMLInputElement).value)}
        placeholder={form.isEdit ? 'Leave empty to keep current password' : 'Password protecting the private key'}
        class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
        disabled={session.savingCredentials}
      />
    </div>

    {#if form.error}
      <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-sm text-red-600">{form.error}</p>
      </div>
    {/if}

    <button
      type="submit"
      disabled={session.savingCredentials}
      class="w-full inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
    >
      {#if session.savingCredentials}
        <Icon src={ArrowPath} class="w-5 h-5 mr-2 animate-spin" />
        Saving...
      {:else if form.isEdit}
        Save Changes
      {:else}
        Save Configuration
      {/if}
    </button>
  </form>

  <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <p class="text-sm text-blue-600">
      <strong>Note:</strong> Credentials are stored in your Google Drive .config folder.
      The private key is only used client-side in your browser to sign the KSEF
      authentication request — it is never sent to any server except KSEF itself
      embedded in the signed XML. Only RSA keys are currently supported.
    </p>
  </div>

  {#if !form.isEdit}
    <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p class="text-sm text-amber-800">
        <strong>Certificate requirements:</strong> a qualified certificate (personal or
        company seal) or a KSEF certificate whose subject contains your NIP or PESEL,
        with an RSA private key. Only RSA keys are currently supported.
      </p>
    </div>
  {/if}
</div>
