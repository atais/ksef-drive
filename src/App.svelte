<script lang="ts">
  import axios from 'axios'
  import Header from './Header.svelte'
  import Sidebar from './Sidebar.svelte'
  import KsefCredentialsForm from './KsefCredentialsForm.svelte'
  import Invoices from './Invoices.svelte'
  import { requestGoogleAccessToken } from './lib/googleAuth'
  import {
    ensureKsefFolder,
    ensureConfigFolder,
    saveJsonToConfig,
    fetchJsonFromConfig,
    deleteJsonFromConfig,
    ensureYearFolders,
    listMonthCategories,
    type CategorySection,
  } from './gdrive/googleDriveService'
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
    } catch (error) {
      console.error('Failed to refresh files:', error)
    } finally {
      loading = false
    }
  }

  $effect(() => {
    if (currentView !== 'files' || !selectedFolderId || !accessToken) return

    let cancelled = false
    listMonthCategories(accessToken, selectedFolderId)
      .then((sections) => {
        if (!cancelled) categorySections = sections
      })
      .catch((error) => console.error('Failed to refresh files:', error))
      .finally(() => {
        if (!cancelled) loading = false
      })

    return () => {
      cancelled = true
    }
  })

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
              <svg class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
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
                    <svg class="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Loading...
                  {:else}
                    <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Refresh Files
                  {/if}
                </button>
              </div>

              {#if !selectedFolderId}
                <div class="text-center py-12">
                  <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <p class="text-gray-600 font-medium">Pick a month</p>
                  <p class="text-gray-500 text-sm">Select a month in the sidebar to see its files</p>
                </div>
              {:else}
                <div class="space-y-6">
                  {#each categorySections as section (section.key)}
                    <div class="bg-white rounded-xl border border-gray-200 p-8">
                      <h3 class="text-2xl font-bold text-gray-900 mb-6">{section.title}</h3>
                      {#if section.files.length > 0}
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {#each section.files as file (file.id)}
                            <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 transition-all hover:shadow-md">
                              <svg class="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                              </div>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <p class="text-sm text-gray-400">No files</p>
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
                <Invoices sessionToken={ksefSessionToken} {accessToken} {ksefFolderId} userNip={ksefCredentials.nip} />
              {:else}
                <p class="text-gray-600">Connecting to KSEF...</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </main>
  </div>
</div>
