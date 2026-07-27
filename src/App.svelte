<script lang="ts">
  import axios from 'axios'
  import Header from './Header.svelte'
  import Sidebar from './Sidebar.svelte'
  import KsefCredentialsForm from './KsefCredentialsForm.svelte'
  import Invoices from './Invoices.svelte'
  import { requestGoogleAccessToken } from './lib/googleAuth'
  import { Icon, ArrowPath, Document, Trash } from 'svelte-hero-icons'
  import {
    ensureKsefFolder,
    ensureConfigFolder,
    saveJsonToConfig,
    fetchJsonFromConfig,
    deleteJsonFromConfig,
    deleteFile,
    ensureYearFolders,
    listMonthCategories,
    type CategorySection,
  } from './gdrive/googleDriveService'
  import { loadInvoicesDb, saveInvoicesDb, type InvoicesDb } from './gdrive/invoicesDb'
  import { authenticateWithKsef, type KsefCredentials } from './ksef/ksefService'

  interface StoredSession {
    accessToken: string
    user: { email: string; name: string }
    configFolderId: string
    ksefCredentials: KsefCredentials | null
  }

  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE'

  let user = $state<{ email: string; name: string } | null>(null)
  let accessToken = $state<string | null>(null)
  let loading = $state(false)
  let sidebarOpen = $state(false)
  let configFolderId = $state<string | null>(null)
  let ksefCredentials = $state<KsefCredentials | null>(null)
  let saving = $state(false)
  let restoring = $state(true)
  let ksefSessionToken = $state<string | null>(null)
  let currentView = $state<'settings' | 'invoices' | 'files'>('invoices')
  let ksefFolderId = $state<string | null>(null)
  let selectedFolderId = $state<string | null>(null)
  let categorySections = $state<CategorySection[]>([])
  let invoicesDb = $state<InvoicesDb>({})
  let removingFileId = $state<string | null>(null)
  let driveSyncCount = $state(0)

  // Runs a Drive task in the background without blocking the caller, while
  // tracking it so the navbar can show a "syncing" indicator. Used for work
  // (like ensuring all 12 month folders exist) that shouldn't stall the rest
  // of app init/login.
  function runInBackground(task: () => Promise<unknown>) {
    driveSyncCount += 1
    task()
      .catch((error) => console.error('Background Drive sync failed:', error))
      .finally(() => (driveSyncCount -= 1))
  }

  function saveSession(
    token: string,
    userData: { email: string; name: string },
    configId: string,
    ksefCreds: KsefCredentials | null
  ) {
    const session: StoredSession = {
      accessToken: token,
      user: userData,
      configFolderId: configId,
      ksefCredentials: ksefCreds,
    }
    localStorage.setItem('gdrive_session', JSON.stringify(session))
  }

  async function restoreSession() {
    try {
      const stored = localStorage.getItem('gdrive_session')
      if (!stored) {
        restoring = false
        return
      }

      const session: StoredSession = JSON.parse(stored)

      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })

      if (response.status === 200) {
        accessToken = session.accessToken
        user = session.user
        configFolderId = session.configFolderId
        ksefCredentials = session.ksefCredentials

        // Re-resolve the ksef-gdrive folder id (idempotent lookup) so features
        // like saving invoices to Drive work after a session restore.
        const folderResult = await ensureKsefFolder(session.accessToken)
        ksefFolderId = folderResult.folderId

        if (folderResult.folderId) {
          const folderId = folderResult.folderId
          runInBackground(() => ensureYearFolders(session.accessToken, folderId))
        }
      } else {
        localStorage.removeItem('gdrive_session')
      }
    } catch (error) {
      console.error('Session restore failed:', error)
      localStorage.removeItem('gdrive_session')
    } finally {
      restoring = false
    }
  }

  restoreSession()

  async function login() {
    try {
      const token = await requestGoogleAccessToken(GOOGLE_CLIENT_ID, 'https://www.googleapis.com/auth/drive.file')
      accessToken = token

      const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const userData = {
        email: userInfo.data.email,
        name: userInfo.data.name,
      }
      user = userData

      const result = await ensureKsefFolder(token)
      ksefFolderId = result.folderId

      if (result.folderId) {
        // Ensure all 12 month folders exist, without blocking the rest of
        // init on 12 sequential Drive round-trips.
        const folderId = result.folderId
        runInBackground(() => ensureYearFolders(token, folderId))

        // Ensure .config folder exists
        const configId = await ensureConfigFolder(token, result.folderId)
        configFolderId = configId

        // Check for existing KSEF credentials
        const credentials = await fetchJsonFromConfig<KsefCredentials>(token, configId, 'ksef_credentials.json')
        ksefCredentials = credentials

        saveSession(token, userData, configId, credentials)
      }
    } catch (error) {
      console.error('Login/init failed:', error)
    }
  }

  async function refreshFiles() {
    if (!accessToken || !selectedFolderId) return
    loading = true
    try {
      categorySections = await listMonthCategories(accessToken, selectedFolderId)
      if (configFolderId) {
        invoicesDb = await loadInvoicesDb(accessToken, configFolderId)
      }
    } catch (error) {
      console.error('Failed to refresh files:', error)
    } finally {
      loading = false
    }
  }

  $effect(() => {
    if (currentView !== 'files' || !selectedFolderId || !accessToken) return

    let cancelled = false
    loading = true
    categorySections = []
    Promise.all([
      listMonthCategories(accessToken, selectedFolderId),
      configFolderId ? loadInvoicesDb(accessToken, configFolderId) : Promise.resolve(invoicesDb),
    ])
      .then(([sections, db]) => {
        if (!cancelled) {
          categorySections = sections
          invoicesDb = db
        }
      })
      .catch((error) => console.error('Failed to refresh files:', error))
      .finally(() => {
        if (!cancelled) loading = false
      })

    return () => {
      cancelled = true
    }
  })

  // Strips the .xml extension a filed invoice was saved under to recover its
  // ksefNumber, the invoicesDb key.
  function ksefNumberFromFilename(filename: string): string {
    return filename.replace(/\.xml$/i, '')
  }

  // Removes a filed invoice: deletes it from Drive and clears its accepted
  // flag in the DB, so it shows back up as not-added on the Invoices page.
  async function removeFile(fileId: string, filename: string) {
    if (!accessToken) return
    removingFileId = fileId
    try {
      await deleteFile(accessToken, fileId)
      categorySections = categorySections.map((section) => ({
        ...section,
        files: section.files.filter((f) => f.id !== fileId),
      }))

      const ksefNumber = ksefNumberFromFilename(filename)
      const entry = invoicesDb[ksefNumber]
      if (entry && configFolderId) {
        const nextDb = { ...invoicesDb, [ksefNumber]: { ...entry, accepted: false } }
        await saveInvoicesDb(accessToken, configFolderId, nextDb)
        invoicesDb = nextDb
      }
    } catch (error) {
      console.error('Failed to remove file:', error)
    } finally {
      removingFileId = null
    }
  }

  function handleLogout() {
    localStorage.removeItem('gdrive_session')
    user = null
    accessToken = null
    categorySections = []
    configFolderId = null
    ksefCredentials = null
    ksefFolderId = null
  }

  async function handleSaveKsefCredentials(credentials: KsefCredentials) {
    if (!accessToken || !configFolderId || !user) {
      throw new Error('Not connected to Google Drive')
    }

    saving = true
    try {
      await saveJsonToConfig(accessToken, configFolderId, 'ksef_credentials.json', credentials)
      ksefCredentials = credentials

      saveSession(accessToken, user, configFolderId, credentials)

      await authenticateKsefSession(credentials)

      currentView = 'invoices'
    } catch (error) {
      console.error('Save credentials failed:', error)
      throw error
    } finally {
      saving = false
    }
  }

  async function authenticateKsefSession(credentials: KsefCredentials) {
    try {
      const authResponse = await authenticateWithKsef(credentials)
      ksefSessionToken = authResponse.accessToken.token
    } catch (error) {
      console.error('KSEF auth failed:', error)

      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('403') && errorMessage.includes('missing-permissions')) {
        // Don't delete credentials - user needs to update permissions
      } else if (errorMessage.includes('401') || errorMessage.includes('KSEF auth failed')) {
        // Authentication failed - invalid credentials
        if (accessToken && configFolderId) {
          try {
            await deleteJsonFromConfig(accessToken, configFolderId, 'ksef_credentials.json')
          } catch (deleteError) {
            console.error('Failed to delete credentials:', deleteError)
          }
        }

        ksefCredentials = null
        ksefSessionToken = null

        if (user && accessToken && configFolderId) {
          saveSession(accessToken, user, configFolderId, null)
        }
      }
    }
  }

  $effect(() => {
    if (ksefCredentials && !ksefSessionToken) {
      authenticateKsefSession(ksefCredentials)
    }
  })
</script>

<div class="w-full min-h-screen flex flex-col bg-white">
  {#if user}
    <Header
      {user}
      onLogout={handleLogout}
      onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
      isConnected={!!(ksefCredentials && ksefSessionToken)}
      driveSyncing={driveSyncCount > 0}
      {currentView}
      onNavigate={(view) => (currentView = view as 'settings' | 'invoices' | 'files')}
    />
  {/if}
  <div class="flex flex-1">
    {#if user}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => (sidebarOpen = false)}
        {accessToken}
        {ksefFolderId}
        {selectedFolderId}
        onSelectFolder={(folderId) => {
          selectedFolderId = folderId
          currentView = 'files'
        }}
      />
    {/if}
    <main class="flex-1 overflow-auto bg-white">
      <div class="w-full">
        {#if restoring}
          <div class="min-h-[calc(100vh-64px)] flex items-center justify-center">
            <div class="text-center">
              <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p class="text-gray-600">Restoring session...</p>
            </div>
          </div>
        {:else if !user}
          <div class="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-20">
            <div class="text-center max-w-2xl">
              <div class="mb-8">
                <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center mx-auto mb-6">
                  <span class="text-white font-bold text-4xl">K</span>
                </div>
                <h1 class="text-5xl sm:text-6xl font-bold text-gray-900 mb-4 tracking-tight">KSEF</h1>
                <p class="text-xl text-gray-600 mb-2">Google Drive Integration</p>
                <p class="text-gray-500">Seamlessly manage your documents and files</p>
              </div>
              <button
                type="button"
                onclick={() => login()}
                class="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
              >
                Sign in with Google
              </button>
            </div>
          </div>
        {:else if currentView === 'settings'}
          <div class="min-h-[calc(100vh-64px)] p-4 sm:p-8">
            <div>
              <KsefCredentialsForm currentCredentials={ksefCredentials} onSave={handleSaveKsefCredentials} {saving} />
            </div>
          </div>
        {:else if !ksefCredentials}
          <div class="p-4 sm:p-8">
            <KsefCredentialsForm onSave={handleSaveKsefCredentials} {saving} />
          </div>
        {:else if currentView === 'files'}
          <div class="min-h-[calc(100vh-64px)] p-4 sm:p-8">
            <div class="space-y-6">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 class="text-3xl font-bold text-gray-900">Files</h2>
                <button
                  type="button"
                  onclick={refreshFiles}
                  disabled={loading}
                  class="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
                >
                  {#if loading}
                    <Icon src={ArrowPath} class="w-5 h-5 mr-2 animate-spin" />
                    Loading...
                  {:else}
                    <Icon src={ArrowPath} class="w-5 h-5 mr-2" />
                    Refresh Files
                  {/if}
                </button>
              </div>

              {#if !selectedFolderId}
                <div class="text-center py-12">
                  <Icon src={Document} class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p class="text-gray-600 font-medium">Pick a month</p>
                  <p class="text-gray-500 text-sm">Select a month in the sidebar to see its files</p>
                </div>
              {:else if loading && categorySections.length === 0}
                <div class="flex items-center justify-center py-20">
                  <div class="text-center">
                    <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                    <p class="text-gray-600">Loading files...</p>
                  </div>
                </div>
              {:else}
                <div class="space-y-6">
                  {#each categorySections as section (section.key)}
                    {@const isInvoiceCategory = section.key === '_Sprzedaz' || section.key === '_Koszty'}
                    <div class="bg-white rounded-xl border border-gray-200 p-8">
                      <h3 class="text-2xl font-bold text-gray-900 mb-6">{section.title}</h3>
                      {#if section.files.length === 0}
                        <p class="text-sm text-gray-400">No files</p>
                      {:else if isInvoiceCategory}
                        <div class="overflow-x-auto">
                          <table class="w-full table-fixed">
                            <colgroup>
                              <col class="w-[14%]" />
                              <col class="w-[36%]" />
                              <col class="w-[16%]" />
                              <col class="w-[16%]" />
                              <col class="w-[18%]" />
                            </colgroup>
                            <thead>
                              <tr class="border-b border-gray-200">
                                <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">Issue Date</th>
                                <th class="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                                  {section.key === '_Sprzedaz' ? 'To' : 'From'}
                                </th>
                                <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Gross</th>
                                <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">VAT</th>
                                <th class="text-right py-3 px-4 text-sm font-semibold text-gray-600">Remove</th>
                              </tr>
                            </thead>
                            <tbody>
                              {#each section.files as file (file.id)}
                                {@const entry = invoicesDb[ksefNumberFromFilename(file.name)]}
                                {@const counterpartyLabel = !entry
                                  ? file.name
                                  : section.key === '_Sprzedaz'
                                    ? entry.metadata.buyer?.name ?? entry.metadata.buyer?.identifier?.value ?? file.name
                                    : entry.metadata.seller?.name ?? entry.metadata.seller?.nip ?? file.name}
                                <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                  <td class="py-4 px-4 text-sm text-gray-600">{entry?.metadata.issueDate ?? '-'}</td>
                                  <td class="py-4 px-4 text-sm text-gray-900 truncate">{counterpartyLabel}</td>
                                  <td class="py-4 px-4 text-sm text-right text-gray-900">
                                    {entry ? `${entry.metadata.grossAmount.toFixed(2)} ${entry.metadata.currency}` : '-'}
                                  </td>
                                  <td class="py-4 px-4 text-sm text-right text-gray-900">
                                    {entry ? `${entry.metadata.vatAmount.toFixed(2)} ${entry.metadata.currency}` : '-'}
                                  </td>
                                  <td class="py-4 px-4 text-right">
                                    <button
                                      type="button"
                                      onclick={() => removeFile(file.id, file.name)}
                                      disabled={removingFileId === file.id}
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
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="min-h-[calc(100vh-64px)] p-4 sm:p-8">
            <div class="space-y-6">
              {#if ksefSessionToken}
                <Invoices sessionToken={ksefSessionToken} {accessToken} {ksefFolderId} {configFolderId} userNip={ksefCredentials.nip} />
              {:else}
                <div class="flex items-center justify-center py-20">
                  <div class="text-center">
                    <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                    <p class="text-gray-600">Connecting to KSEF...</p>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </main>
  </div>
</div>
