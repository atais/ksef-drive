<script lang="ts">
  import { untrack } from 'svelte'
  import { Icon, ArrowPath } from 'svelte-hero-icons'
  import type { KsefCredentials } from './ksef/ksefService'

  interface Props {
    currentCredentials?: KsefCredentials | null
    onSave: (credentials: KsefCredentials) => Promise<void>
    saving: boolean
  }

  let { currentCredentials = null, onSave, saving }: Props = $props()

  // Seeded once from the initial prop value on mount — not meant to track
  // later prop changes, since each call site (new vs. edit) is a distinct
  // component instance.
  const isEdit = untrack(() => !!currentCredentials)

  let nip = $state(untrack(() => currentCredentials?.nip || ''))
  let certPem = $state('')
  let keyPem = $state('')
  let keyPassword = $state('')
  let error = $state('')

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = ''

    if (!nip || !/^\d{10}$/.test(nip)) {
      error = 'NIP must be 10 digits'
      return
    }

    const effectiveCert = certPem || currentCredentials?.certPem || ''
    const effectiveKey = keyPem || currentCredentials?.keyPem || ''
    const effectivePassword = keyPassword || currentCredentials?.keyPassword || ''

    if (!effectiveCert || !effectiveKey) {
      error = 'Upload both the certificate (.crt) and the private key (.key)'
      return
    }

    try {
      await onSave({ method: 'certificate', nip, certPem: effectiveCert, keyPem: effectiveKey, keyPassword: effectivePassword })
    } catch (err) {
      error = err instanceof Error ? err.message : 'Save failed'
    }
  }

  async function handleCertChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) certPem = await readFileAsText(file)
  }

  async function handleKeyChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) keyPem = await readFileAsText(file)
  }
</script>

<div class="bg-white rounded-xl border border-gray-200 p-8">
  <div class="mb-6">
    <h2 class="text-3xl font-bold text-gray-900 mb-2">
      {isEdit ? 'KSEF Settings' : 'KSEF Configuration'}
    </h2>
    <p class="text-gray-600">
      {isEdit
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
        value={nip}
        oninput={(e) => (nip = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 10))}
        placeholder="1234567890"
        class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
        disabled={saving}
      />
    </div>

    <div>
      <label for="cert" class="block text-sm font-semibold text-gray-900 mb-2">Certificate (.crt / .pem)</label>
      <input
        id="cert"
        type="file"
        accept=".crt,.pem,.cer"
        onchange={handleCertChange}
        class="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        disabled={saving}
      />
      {#if certPem}
        <p class="text-sm text-green-600 mt-2">{isEdit ? 'New certificate loaded' : 'Certificate loaded'}</p>
      {:else if isEdit && currentCredentials}
        <p class="text-sm text-gray-500 mt-2">Current certificate is saved. Upload a new one to replace it.</p>
      {/if}
    </div>

    <div>
      <label for="key" class="block text-sm font-semibold text-gray-900 mb-2">Private Key (.key)</label>
      <input
        id="key"
        type="file"
        accept=".key,.pem"
        onchange={handleKeyChange}
        class="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        disabled={saving}
      />
      {#if keyPem}
        <p class="text-sm text-green-600 mt-2">{isEdit ? 'New private key loaded' : 'Private key loaded'}</p>
      {:else if isEdit && currentCredentials}
        <p class="text-sm text-gray-500 mt-2">Current private key is saved. Upload a new one to replace it.</p>
      {/if}
    </div>

    <div>
      <label for="keyPassword" class="block text-sm font-semibold text-gray-900 mb-2">Private Key Password</label>
      <input
        id="keyPassword"
        type="password"
        value={keyPassword}
        oninput={(e) => (keyPassword = (e.target as HTMLInputElement).value)}
        placeholder={isEdit ? 'Leave empty to keep current password' : 'Password protecting the private key'}
        class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
        disabled={saving}
      />
    </div>

    {#if error}
      <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-sm text-red-600">{error}</p>
      </div>
    {/if}

    <button
      type="submit"
      disabled={saving}
      class="w-full inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
    >
      {#if saving}
        <Icon src={ArrowPath} class="w-5 h-5 mr-2 animate-spin" />
        Saving...
      {:else if isEdit}
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

  {#if !isEdit}
    <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p class="text-sm text-amber-800">
        <strong>Certificate requirements:</strong> a qualified certificate (personal or
        company seal) or a KSEF certificate whose subject contains your NIP or PESEL,
        with an RSA private key. Only RSA keys are currently supported.
      </p>
    </div>
  {/if}
</div>
