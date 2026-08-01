<script lang="ts">
  import { Icon, ChevronDown, ChevronUp, Plus, Trash } from 'svelte-hero-icons'
  import { CATEGORY_KINDS, kindLabel, type CategoryKind } from './app/categories'
  import { categoriesStore } from './app/categoriesStore.svelte'
  import { CustomCategoriesPage } from './app/customCategories.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import Spinner from './Spinner.svelte'

  const KIND_BADGES: Record<CategoryKind, string> = {
    sold: 'bg-green-50 text-green-700',
    bought: 'bg-amber-50 text-amber-700',
    other: 'bg-gray-100 text-gray-600',
  }

  const page = new CustomCategoriesPage()

  function submit(e: SubmitEvent) {
    e.preventDefault()
    void page.add()
  }
</script>

{#snippet moveButton(key: string, direction: 'up' | 'down', disabled: boolean)}
  {@const label = direction === 'up' ? 'Move up' : 'Move down'}
  <button
    type="button"
    onclick={() => categoriesStore.move(key, direction)}
    disabled={categoriesStore.saving || disabled}
    title={label}
    aria-label={label}
    class="btn btn-ghost w-6 h-4 p-0 rounded text-gray-500"
  >
    <Icon src={direction === 'up' ? ChevronUp : ChevronDown} class="w-4 h-4" />
  </button>
{/snippet}

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
          {@render moveButton(category.key, 'up', index === 0)}
          {@render moveButton(category.key, 'down', index === categoriesStore.categories.length - 1)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-900 truncate">{category.key}</p>
        </div>
        <span class="text-xs text-gray-500 flex-shrink-0">Category:</span>
        <span class="px-2 py-0.5 text-xs font-semibold rounded-full {KIND_BADGES[category.kind]}">
          {kindLabel(category.kind)}
        </span>
        <button
          type="button"
          onclick={() => page.remove(category.key)}
          disabled={categoriesStore.saving}
          title="Remove category"
          aria-label="Remove category"
          class="btn btn-icon btn-danger"
        >
          <Icon src={Trash} class="w-4 h-4" />
        </button>
      </li>
    {/each}
  </ul>

  <form onsubmit={submit} class="flex flex-wrap gap-3 items-end">
    <div class="flex-1 min-w-[12rem]">
      <label for="categoryName" class="block text-sm font-semibold text-gray-900 mb-2">New category</label>
      <input
        id="categoryName"
        type="text"
        bind:value={page.name}
        placeholder="e.g. Umowy"
        class="field w-full"
        disabled={categoriesStore.saving}
      />
    </div>
    <div>
      <label for="categoryKind" class="block text-sm font-semibold text-gray-900 mb-2">Type</label>
      <select id="categoryKind" bind:value={page.kind} class="field" disabled={categoriesStore.saving}>
        {#each CATEGORY_KINDS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <button type="submit" disabled={categoriesStore.saving} class="btn btn-primary">
      {#if categoriesStore.saving}
        <Spinner variant="inline" />
        Saving...
      {:else}
        <Icon src={Plus} class="w-5 h-5 mr-2" />
        Add
      {/if}
    </button>
  </form>

  <div class="mt-4">
    <ErrorBanner message={categoriesStore.error} />
  </div>

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
