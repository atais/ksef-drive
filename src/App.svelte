<script lang="ts">
  import { Icon, ArrowPath } from 'svelte-hero-icons'
  import { navigation } from './app/navigation.svelte'
  import { session } from './app/session.svelte'
  import Header from './Header.svelte'
  import Sidebar from './Sidebar.svelte'
  import Settings from './Settings.svelte'
  import Invoices from './Invoices.svelte'
  import Files from './Files.svelte'

  session.restore()
</script>

<div class="w-full min-h-screen flex flex-col bg-white">
  {#if session.user}
    <Header />
  {/if}
  <div class="flex flex-1">
    {#if session.user}
      <Sidebar />
    {/if}
    <main class="flex-1 overflow-auto bg-white">
      <div class="w-full">
        {#if session.restoring}
          <div class="min-h-[calc(100vh-64px)] flex items-center justify-center">
            <div class="text-center">
              <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p class="text-gray-600">Restoring session...</p>
            </div>
          </div>
        {:else if !session.user}
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
                onclick={() => session.login()}
                class="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
              >
                Sign in with Google
              </button>
            </div>
          </div>
        {:else}
          <div class="min-h-[calc(100vh-64px)] p-4 sm:p-8">
            {#if navigation.view === 'settings' || !session.ksefCredentials}
              <Settings />
            {:else if navigation.view === 'files'}
              <Files />
            {:else if session.ksefSessionToken}
              <Invoices />
            {:else}
              <div class="flex items-center justify-center py-20">
                <div class="text-center">
                  <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                  <p class="text-gray-600">Connecting to KSEF...</p>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </main>
  </div>
</div>
