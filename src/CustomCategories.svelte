<script lang="ts">
  import { Icon, ChevronDown, ChevronUp, Plus, Trash } from 'svelte-hero-icons'
  import { categoryKinds, kindLabel, type CategoryKind } from './app/categories'
  import { categoriesStore } from './app/categoriesStore.svelte'
  import { CustomCategoriesPage } from './app/customCategories.svelte'
  import { i18n } from './app/i18n.svelte'
  import ErrorBanner from './ErrorBanner.svelte'
  import Spinner from './Spinner.svelte'

  const KIND_BADGES: Record<CategoryKind, string> = {
    sold: 'bg-green-50 text-green-700',
    bought: 'bg-amber-50 text-amber-700',
    other: 'bg-gray-100 text-gray-600',
  }

  const page = new CustomCategoriesPage()
  const kinds = $derived(categoryKinds())

  function submit(e: SubmitEvent) {
    e.preventDefault()
    void page.add()
  }
</script>

{#snippet moveButton(key: string, direction: 'up' | 'down', disabled: boolean)}
  {@const label = direction === 'up' ? i18n.t('customCategories.moveUp') : i18n.t('customCategories.moveDown')}
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
    <h2 class="text-3xl font-bold text-gray-900 mb-2">{i18n.t('customCategories.title')}</h2>
  </div>

  <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <p class="text-sm text-blue-600">
      {i18n.t('customCategories.info')}
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
        <span class="text-xs text-gray-500 flex-shrink-0">{i18n.t('customCategories.category')}</span>
        <span class="px-2 py-0.5 text-xs font-semibold rounded-full {KIND_BADGES[category.kind]}">
          {kindLabel(category.kind)}
        </span>
        <button
          type="button"
          onclick={() => page.remove(category.key)}
          disabled={categoriesStore.saving}
          title={i18n.t('customCategories.removeCategory')}
          aria-label={i18n.t('customCategories.removeCategory')}
          class="btn btn-icon btn-danger"
        >
          <Icon src={Trash} class="w-4 h-4" />
        </button>
      </li>
    {/each}
  </ul>

  <form onsubmit={submit} class="flex flex-wrap gap-3 items-end">
    <div class="flex-1 min-w-[12rem]">
      <label for="categoryName" class="block text-sm font-semibold text-gray-900 mb-2">{i18n.t('customCategories.newCategory')}</label>
      <input
        id="categoryName"
        type="text"
        bind:value={page.name}
        placeholder={i18n.t('customCategories.namePlaceholder')}
        class="field w-full"
        disabled={categoriesStore.saving}
      />
    </div>
    <div>
      <label for="categoryKind" class="block text-sm font-semibold text-gray-900 mb-2">{i18n.t('customCategories.type')}</label>
      <select id="categoryKind" bind:value={page.kind} class="field" disabled={categoriesStore.saving}>
        {#each kinds as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    <button type="submit" disabled={categoriesStore.saving} class="btn btn-primary">
      {#if categoriesStore.saving}
        <Spinner variant="inline" />
        {i18n.t('customCategories.saving')}
      {:else}
        <Icon src={Plus} class="w-5 h-5 mr-2" />
        {i18n.t('customCategories.add')}
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
        {i18n.t('customCategories.removed', { name: removal.name, folders: removal.folders, files: removal.files })}
        {#if removal.unfiled > 0}
          {i18n.t('customCategories.removalUnfiled', { n: removal.unfiled })}
        {/if}
      </p>
    </div>
  {/if}

</div>
