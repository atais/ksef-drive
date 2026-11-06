<script lang="ts">
  import { Icon, ChevronDown, ChevronRight, ArchiveBox, CheckCircle } from 'svelte-hero-icons'
  import { archiveSettings } from './app/archiveSettings.svelte'
  import { folderTree } from './app/folderTree.svelte'
  import { navigation } from './app/navigation.svelte'
  import { session } from './app/session.svelte'
  import { i18n } from './app/i18n.svelte'

  $effect(() => {
    // Re-read the tree whenever the Drive connection changes.
    void session.accessToken
    void session.rootFolderId
    void archiveSettings.completionName
    return folderTree.load()
  })
</script>

{#if navigation.sidebarOpen}
  <div class="fixed inset-0 bg-black/50 z-30 lg:hidden" onclick={() => navigation.closeSidebar()} role="presentation"></div>
{/if}
<aside
  class="fixed lg:static left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 overflow-y-auto {navigation.sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
>
  <nav>
    {#if folderTree.loading && folderTree.years.length === 0}
      <p class="text-sm text-gray-400 px-4 py-3">{i18n.t('sidebar.loadingFolders')}</p>
    {:else if folderTree.years.length === 0}
      <p class="text-sm text-gray-400 px-4 py-3">{i18n.t('sidebar.noFolders')}</p>
    {:else}
      <ul>
        {#each folderTree.years as year (year.id)}
          {@const expanded = folderTree.isExpanded(year.id)}
          <li>
            <button
              type="button"
              onclick={() => folderTree.toggle(year.id)}
              class="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <Icon src={expanded ? ChevronDown : ChevronRight} class="w-4 h-4 flex-shrink-0" />
              <Icon src={ArchiveBox} class="w-4 h-4 flex-shrink-0 text-blue-600" />
              <span>{year.name}</span>
            </button>
            {#if expanded}
              <ul>
                {#each year.months as month (month.id)}
                  <li>
                    <button
                      type="button"
                      onclick={() => navigation.selectFolder(month.id)}
                      class="w-full flex items-center justify-between text-left pl-10 pr-4 py-2 text-sm transition-colors {navigation.highlightedFolderId === month.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}"
                    >
                      <span>{month.name}</span>
                      {#if folderTree.isComplete(month.id)}
                        <Icon src={CheckCircle} class="w-4 h-4 flex-shrink-0 text-green-600" title={archiveSettings.completionName} />
                      {/if}
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </nav>
</aside>
