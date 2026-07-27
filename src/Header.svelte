<script lang="ts">
  import { Icon, Bars3, ArrowPath } from 'svelte-hero-icons'

  interface Props {
    user: { email: string; name: string } | null
    onLogout: () => void
    onToggleSidebar: () => void
    isConnected?: boolean
    driveSyncing?: boolean
    currentView?: string
    onNavigate?: (view: string) => void
  }

  let { user, onLogout, onToggleSidebar, isConnected, driveSyncing, currentView, onNavigate }: Props = $props()

  const navItems = [
    { id: 'invoices', label: 'KSEF' },
    { id: 'files', label: 'Google Drive' },
    { id: 'settings', label: 'Settings' },
  ]
</script>

<header class="w-full border-b border-gray-200 bg-white sticky top-0 z-50">
  <div class="flex h-16">
    <div class="flex items-center gap-3 px-4 sm:px-6 w-full md:w-64 flex-shrink-0 border-r border-gray-200">
      <button onclick={onToggleSidebar} class="p-2 md:hidden text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Toggle sidebar">
        <Icon src={Bars3} class="w-6 h-6" />
      </button>
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
          <span class="text-white font-bold text-sm">K</span>
        </div>
        <span class="font-bold text-lg text-gray-900 hidden sm:inline">KSEF</span>
      </div>
    </div>

    {#if user}
      <nav class="hidden md:flex items-center gap-0 flex-1">
        {#each navItems as { id, label } (id)}
          <button
            onclick={() => onNavigate?.(id)}
            class="flex items-center justify-center gap-2 px-4 h-full transition-colors text-sm font-medium {currentView === id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}"
          >
            <span>{label}</span>
          </button>
        {/each}
      </nav>
    {/if}

    {#if user}
      <div class="flex items-center gap-4 px-4 sm:px-6 flex-shrink-0">
        <div class="hidden sm:flex items-center gap-1.5 text-xs text-gray-500" title={driveSyncing ? 'Syncing with Google Drive' : 'Google Drive up to date'}>
          <Icon src={ArrowPath} class="w-3.5 h-3.5 {driveSyncing ? 'animate-spin' : ''}" />
          <span>{driveSyncing ? 'Syncing Drive...' : 'Drive synced'}</span>
        </div>
        <div class="hidden sm:flex items-center gap-3">
          <div class="flex items-center gap-1.5 text-xs text-gray-500" title={isConnected ? 'KSEF connected' : 'KSEF connection issues'}>
            <span class="w-2.5 h-2.5 rounded-full {isConnected ? 'bg-green-500' : 'bg-red-500'}"></span>
            <span>KSEF</span>
          </div>
          <div class="flex flex-col items-end">
            <p class="text-sm font-semibold text-gray-900">{user.name}</p>
            <p class="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>
        <button onclick={onLogout} class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
          Logout
        </button>
      </div>
    {/if}
  </div>
</header>
