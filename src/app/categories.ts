// Custom categories: the user-editable list of subfolders created inside
// every month folder. Each category translates 1:1 to a Drive folder.
//
// A category's `kind` decides where it shows up:
//   sold   — offered when filing an invoice we issued (we're the seller)
//   bought — offered when filing an invoice we received (we're the buyer)
//   other  — never offered on the Invoices page, folder still exists
//
// Persisted as JSON in the archive's .config folder so the list follows the
// archive rather than the browser.

import { readJsonFile, writeJsonFile } from '../gdrive/driveApi'
import { i18n } from './i18n.svelte'

const CATEGORIES_FILENAME = 'categories.json'

export type CategoryKind = 'sold' | 'bought' | 'other'

export interface Category {
  // The category's name, shown as-is everywhere, and the literal name of its
  // folder inside each month. Also its identity: an invoice DB entry
  // references a category by this key.
  key: string
  kind: CategoryKind
}

export function categoryKinds(): { value: CategoryKind; label: string }[] {
  return [
    { value: 'sold', label: i18n.t('category.sold') },
    { value: 'bought', label: i18n.t('category.bought') },
    { value: 'other', label: i18n.t('category.other') },
  ]
}

// The three categories every archive starts with. They are ordinary
// categories — the only thing special about them is that they're seeded.
export const DEFAULT_CATEGORIES: Category[] = [
  { key: '_Sprzedaz', kind: 'sold' },
  { key: '_Koszty', kind: 'bought' },
  { key: 'Wyciagi', kind: 'other' },
]

export function defaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }))
}

export function kindLabel(kind: CategoryKind): string {
  return categoryKinds().find((option) => option.value === kind)?.label ?? kind
}

export function categoriesOfKind(categories: Category[], kind: CategoryKind): Category[] {
  return categories.filter((category) => category.kind === kind)
}

export function kindForRole(role: 'seller' | 'buyer'): CategoryKind {
  return role === 'seller' ? 'sold' : 'bought'
}

// The category an invoice should file into: its own, if that category still
// exists and still matches its role, otherwise the first of the right kind.
// Categories can be renamed away or re-kinded under a filed invoice, so every
// read has to be able to fall back.
export function resolveCategory(categories: Category[], kind: CategoryKind, preferred?: string): string | null {
  const options = categoriesOfKind(categories, kind)
  if (preferred && options.some((category) => category.key === preferred)) return preferred
  return options[0]?.key ?? null
}

// Drive tolerates most characters in folder names, but a slash or a leading
// dot makes a category that's confusing (or hidden) in the Drive UI, so those
// are rejected rather than silently rewritten.
export function validateCategoryName(name: string, existing: Category[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return i18n.t('category.nameEmpty')
  if (/[\\/]/.test(trimmed)) return i18n.t('category.nameSlash')
  if (trimmed.startsWith('.')) return i18n.t('category.nameDot')
  if (existing.some((category) => category.key.toLowerCase() === trimmed.toLowerCase())) {
    return i18n.t('category.nameExists')
  }
  return null
}

export function newCategory(name: string, kind: CategoryKind): Category {
  return { key: name.trim(), kind }
}

// Older archives have no categories file; they get the defaults. Entries that
// don't look like categories are dropped rather than crashing the page.
function sanitize(loaded: unknown): Category[] | null {
  if (!Array.isArray(loaded)) return null
  const categories = loaded
    .filter(
      (item): item is Category =>
        !!item && typeof item.key === 'string' && ['sold', 'bought', 'other'].includes(item.kind)
    )
    // Drop any stray fields (older files carried a separate display title) so
    // what's saved back stays the shape this module describes.
    .map(({ key, kind }) => ({ key, kind }))
  return categories.length > 0 ? categories : null
}

export async function loadCategories(accessToken: string, configFolderId: string): Promise<Category[]> {
  const loaded = await readJsonFile<Category[]>(accessToken, configFolderId, CATEGORIES_FILENAME)
  return sanitize(loaded) ?? defaultCategories()
}

export function saveCategories(accessToken: string, configFolderId: string, categories: Category[]): Promise<void> {
  return writeJsonFile(accessToken, configFolderId, CATEGORIES_FILENAME, categories)
}
