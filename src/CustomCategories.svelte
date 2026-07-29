<script lang="ts">
  import { Icon, ArrowPath, ChevronDown, ChevronUp, Plus, Trash } from 'svelte-hero-icons'
  import { CATEGORY_KINDS, type CategoryKind } from './app/categories'
  import { categoriesStore } from './app/categoriesStore.svelte'

  const KIND_BADGES: Record<CategoryKind, string> = {
    sold: 'bg-green-50 text-green-700',
    bought: 'bg-amber-50 text-amber-700',
    other: 'bg-gray-100 text-gray-600',
  }

  let name = $state('')
  let kind = $state<CategoryKind>('sold')

  async function addCategory(e: SubmitEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await categoriesStore.add(trimmed, kind)
    if (!categoriesStore.error) name = ''
  }

  // Removing a category deletes its folders and everything in them, so the
  // count of what's about to go is part of the question.
  async function removeCategory(key: string) {
    const files = await categoriesStore.countFiles(key)
    const warning = files > 0 ? `\n\n${files} file(s) will be deleted from Google Drive.` : ''
    if (!confirm(`Remove "${key}" and its folder from every month?${warning}`)) return
    await categoriesStore.remove(key)
  }
</script>

<div class="bg-white rounded-xl">
  <div class="mb-6">
    <h2 class="text-3xl font-bold text-gray-900 mb-2">Custom categories</h2>
  </div>

  <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <p class="text-sm text-blue-600">
      Adding a category creates its folder in every month that already exists.
      Removing one deletes those folders and the files inside them; invoices
      filed there go back to pending so you can re-file them elsewhere.
    </p>
  </div>

  <ul class="space-y-2 mb-6">
    {#each categoriesStore.categories as category, index (category.key)}
      <li class="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div class="flex flex-col flex-shrink-0">
          <button
            type="button"
            onclick={() => categoriesStore.move(category.key, 'up')}
            disabled={categoriesStore.saving || index === 0}
            title="Move up"
            aria-label="Move up"
            class="inline-flex items-center justify-center w-6 h-4 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition-all"
          >
            <Icon src={ChevronUp} class="w-4 h-4" />
          </button>
          <button
            type="button"
            onclick={() => categoriesStore.move(category.key, 'down')}
            disabled={categoriesStore.saving || index === categoriesStore.categories.length - 1}
            title="Move down"
            aria-label="Move down"
            class="inline-flex items-center justify-center w-6 h-4 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition-all"
          >
            <Icon src={ChevronDown} class="w-4 h-4" />
          </button>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-900 truncate">{category.key}</p>
        </div>
        <span class="text-xs text-gray-500 flex-shrink-0">Category:</span>
        <span class="px-2 py-0.5 text-xs font-semibold rounded-full {KIND_BADGES[category.kind]}">
          {CATEGORY_KINDS.find((option) => option.value === category.kind)?.label}
        </span>
        <button
          type="button"
          onclick={() => removeCategory(category.key)}
          disabled={categoriesStore.saving}
          title="Remove category"
          aria-label="Remove category"
          class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all flex-shrink-0"
        >
          <Icon src={Trash} class="w-4 h-4" />
        </button>
      </li>
    {/each}
  </ul>

  <form onsubmit={addCategory} class="flex flex-wrap gap-3 items-end">
    <div class="flex-1 min-w-[12rem]">
      <label for="categoryName" class="block text-sm font-semibold text-gray-900 mb-2">New category</label>
      <input
        id="categoryName"
        type="text"
        bind:value={name}
        placeholder="e.g. Umowy"
        class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
        disabled={categoriesStore.saving}
      />
    </div>
    <div>
      <label for="categoryKind" class="block text-sm font-semibold text-gray-900 mb-2">Type</label>
      <select
        id="categoryKind"
        bind:value={kind}
        class="px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900"
        disabled={categoriesStore.saving}
      >
        {#each CATEGORY_KINDS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <button
      type="submit"
      disabled={categoriesStore.saving}
      class="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all"
    >
      {#if categoriesStore.saving}
        <Icon src={ArrowPath} class="w-5 h-5 mr-2 animate-spin" />
        Saving...
      {:else}
        <Icon src={Plus} class="w-5 h-5 mr-2" />
        Add
      {/if}
    </button>
  </form>

  {#if categoriesStore.error}
    <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-sm text-red-600">{categoriesStore.error}</p>
    </div>
  {/if}

  {#if categoriesStore.lastRemoval}
    {@const removal = categoriesStore.lastRemoval}
    <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p class="text-sm text-amber-800">
        <strong>{removal.name}</strong> removed: {removal.folders} folder(s) and
        {removal.files} file(s) deleted from Google Drive.
        {#if removal.unfiled > 0}
          {removal.unfiled} invoice(s) are pending again — re-approve them on the Invoices page
          to file them under another category.
        {/if}
      </p>
    </div>
  {/if}

</div>
