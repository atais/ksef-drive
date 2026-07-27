<script lang="ts">
  import { listYearMonthTree, type YearFolder } from './gdrive/googleDriveService'
  import { Icon, ChevronDown, ChevronRight, ArchiveBox } from 'svelte-hero-icons'

  interface Props {
    isOpen: boolean
    onClose: () => void
    accessToken: string | null
    ksefFolderId: string | null
    selectedFolderId: string | null
    onSelectFolder: (folderId: string) => void
  }

  let { isOpen, onClose, accessToken, ksefFolderId, selectedFolderId, onSelectFolder }: Props = $props()

  let years = $state<YearFolder[]>([])
  let expandedYears = $state<Set<string>>(new Set())
  let loading = $state(true)

  $effect(() => {
    if (!accessToken || !ksefFolderId) return

    let cancelled = false
    listYearMonthTree(accessToken, ksefFolderId)
      .then((tree) => {
        if (cancelled) return
        years = tree
        expandedYears = expandedYears.size > 0 ? expandedYears : new Set(tree.length > 0 ? [tree[0].id] : [])
      })
      .catch((error) => console.error('Failed to load folder tree:', error))
      .finally(() => {
        if (!cancelled) loading = false
      })

    return () => {
      cancelled = true
    }
  })

  function toggleYear(yearId: string) {
    const next = new Set(expandedYears)
    if (next.has(yearId)) {
      next.delete(yearId)
    } else {
      next.add(yearId)
    }
    expandedYears = next
  }

  function handleSelectMonth(monthId: string) {
    onSelectFolder(monthId)
    onClose()
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black/50 z-30 lg:hidden" onclick={onClose} role="presentation"></div>
{/if}
<aside
  class="fixed lg:static left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 overflow-y-auto {isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
>
  <nav>
    {#if loading && years.length === 0}
      <p class="text-sm text-gray-400 px-4 py-3">Loading folders...</p>
    {:else if years.length === 0}
      <p class="text-sm text-gray-400 px-4 py-3">No folders yet</p>
    {:else}
      <ul>
        {#each years as year (year.id)}
          {@const expanded = expandedYears.has(year.id)}
          <li>
            <button
              type="button"
              onclick={() => toggleYear(year.id)}
              class="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
            >
              {#if expanded}
                <Icon src={ChevronDown} class="w-4 h-4 flex-shrink-0" />
              {:else}
                <Icon src={ChevronRight} class="w-4 h-4 flex-shrink-0" />
              {/if}
              <Icon src={ArchiveBox} class="w-4 h-4 flex-shrink-0 text-blue-600" />
              <span>{year.name}</span>
            </button>
            {#if expanded}
              <ul>
                {#each year.months as month (month.id)}
                  <li>
                    <button
                      type="button"
                      onclick={() => handleSelectMonth(month.id)}
                      class="w-full text-left pl-10 pr-4 py-2 text-sm transition-colors {selectedFolderId === month.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}"
                    >
                      {month.name}
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
