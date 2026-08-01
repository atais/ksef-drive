// Per-page state for the Custom categories page: the add form's fields and
// the two user actions. The page component only renders what's here.

import { categoriesStore } from './categoriesStore.svelte'
import { confirmAction } from './confirm.svelte'
import type { CategoryKind } from './categories'

export class CustomCategoriesPage {
  name = $state('')
  kind = $state<CategoryKind>('sold')

  // The banner from a previous visit describes an action the user has already
  // seen; the page clears it when it opens.
  constructor() {
    categoriesStore.dismissRemoval()
  }

  async add() {
    const trimmed = this.name.trim()
    if (!trimmed) return
    await categoriesStore.add(trimmed, this.kind)
    if (!categoriesStore.error) this.name = ''
  }

  // Removing a category deletes its folders and everything in them, so the
  // count of what's about to go is part of the question. A count that failed
  // (null) leaves the question without a number rather than blocking it — the
  // failure itself is already on screen as an error.
  async remove(key: string) {
    const files = await categoriesStore.countFiles(key)
    const confirmed = await confirmAction({
      title: `Remove "${key}" and its folder from every month?`,
      details: [
        files === null
          ? 'Could not count the files in those folders; they will be deleted anyway.'
          : files > 0
            ? `${files} file(s) will be deleted from Google Drive.`
            : '',
        'Invoices filed there go back to pending so you can re-file them elsewhere.',
      ],
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) return
    await categoriesStore.remove(key)
  }
}
