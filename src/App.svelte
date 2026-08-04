<script lang="ts">
  import { navigation } from './app/navigation.svelte'
  import { session } from './app/session.svelte'
  import Header from './Header.svelte'
  import Sidebar from './Sidebar.svelte'
  import Landing from './Landing.svelte'
  import Footer from './Footer.svelte'
  import Settings from './Settings.svelte'
  import Invoices from './Invoices.svelte'
  import Files from './Files.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import Spinner from './Spinner.svelte'

  session.restore()
</script>

<div class="w-full min-h-screen flex flex-col bg-white">
  <Header />
  <div class="flex flex-1">
    {#if session.user}
      <Sidebar />
    {/if}
    <main class="flex-1 overflow-auto bg-white">
      {#if session.restoring}
        <div class="min-h-[calc(100vh-64px)] flex items-center justify-center">
          <Spinner label="Restoring session..." />
        </div>
      {:else if !session.user}
        <Landing />
      {:else}
        <div class="p-4 sm:p-8">
          {#if navigation.activeView === 'settings'}
            <Settings />
          {:else if navigation.activeView === 'files'}
            <Files />
          {:else if navigation.activeView === 'invoices'}
            <Invoices />
          {:else}
            <Spinner label="Connecting to KSEF..." />
          {/if}
        </div>
      {/if}
    </main>
  </div>
  {#if session.user}
    <Footer />
  {/if}
</div>

<ConfirmDialog />
