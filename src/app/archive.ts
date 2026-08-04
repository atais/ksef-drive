// The shape of our Drive archive:
//
//   ksef-drive/
//     .config/                  credentials + invoice DB + categories
//     <yyyy>/
//       <MM.yyyy>/
//         _Sprzedaz/            sales invoices     \
//         _Koszty/              cost invoices       > one folder per category
//         Wyciagi/              bank statements    /
//
// The category folders are whatever categories.ts says they are — this module
// only knows that each one is a subfolder of every month.
//
// This is app knowledge, not Drive knowledge, so it lives here rather than in
// gdrive/ — that layer only understands files and folders.

import {
  deleteFile,
  ensureFolder,
  listFilesOnly,
  listSubfolders,
  type DriveFile,
} from '../gdrive/driveApi'
import type { Category } from './categories'
import { MONTH_KEY_PATTERN, monthKey } from './dates'

const ROOT_FOLDER_NAME = 'ksef-drive'
const CONFIG_FOLDER_NAME = '.config'
const YEAR_PATTERN = /^\d{4}$/

export function ensureArchiveRoot(accessToken: string): Promise<DriveFile> {
  return ensureFolder(accessToken, ROOT_FOLDER_NAME)
}

export async function ensureConfigFolder(accessToken: string, rootFolderId: string): Promise<string> {
  const folder = await ensureFolder(accessToken, CONFIG_FOLDER_NAME, rootFolderId)
  return folder.id
}

// Ensures <yyyy>/01.<yyyy> .. 12.<yyyy> all exist under the archive root for
// the given date's year, plus a subfolder per category inside each month.
export async function ensureYearFolders(
  accessToken: string,
  rootFolderId: string,
  categoryNames: string[],
  date: Date = new Date()
): Promise<void> {
  const year = String(date.getFullYear())
  const yearFolder = await ensureFolder(accessToken, year, rootFolderId)

  const monthFolders = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      ensureFolder(accessToken, monthKey(i + 1, year), yearFolder.id)
    )
  )

  await Promise.all(
    monthFolders.flatMap((monthFolder) =>
      categoryNames.map((name) => ensureFolder(accessToken, name, monthFolder.id))
    )
  )
}

// Resolves (creating if missing) a specific month's category subfolder, e.g.
// ksef-drive/2026/03.2026/_Koszty.
export async function ensureCategoryFolder(
  accessToken: string,
  rootFolderId: string,
  year: string,
  month: string,
  category: string
): Promise<string> {
  const yearFolder = await ensureFolder(accessToken, year, rootFolderId)
  const monthFolder = await ensureFolder(accessToken, monthKey(month, year), yearFolder.id)
  const categoryFolder = await ensureFolder(accessToken, category, monthFolder.id)
  return categoryFolder.id
}

export interface MonthFolder {
  id: string
  name: string
}

export interface YearFolder {
  id: string
  name: string
  months: MonthFolder[]
}

// Builds the year/month folder tree for the sidebar. Years descending (most
// recent work first), months ascending.
export async function listYearMonthTree(accessToken: string, rootFolderId: string): Promise<YearFolder[]> {
  const topFolders = await listSubfolders(accessToken, rootFolderId)
  const yearFolders = topFolders.filter((folder) => YEAR_PATTERN.test(folder.name))

  const years = await Promise.all(
    yearFolders.map(async (yearFolder) => {
      const monthFolders = await listSubfolders(accessToken, yearFolder.id)
      return {
        id: yearFolder.id,
        name: yearFolder.name,
        months: monthFolders
          .filter((folder) => MONTH_KEY_PATTERN.test(folder.name))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }
    })
  )

  return years.sort((a, b) => b.name.localeCompare(a.name))
}

// Every month folder in the archive, flattened — the set a category folder
// has to be added to or removed from.
async function listAllMonthFolders(accessToken: string, rootFolderId: string): Promise<MonthFolder[]> {
  const years = await listYearMonthTree(accessToken, rootFolderId)
  return years.flatMap((year) => year.months)
}

// Creates a new category's folder in every existing month.
export async function createCategoryFolders(
  accessToken: string,
  rootFolderId: string,
  categoryName: string
): Promise<void> {
  const months = await listAllMonthFolders(accessToken, rootFolderId)
  await Promise.all(months.map((month) => ensureFolder(accessToken, categoryName, month.id)))
}

// Locates a category's folder in every month that has one.
async function findCategoryFolders(
  accessToken: string,
  rootFolderId: string,
  categoryName: string
): Promise<DriveFile[]> {
  const months = await listAllMonthFolders(accessToken, rootFolderId)
  const found = await Promise.all(
    months.map(async (month) => {
      const subfolders = await listSubfolders(accessToken, month.id)
      return subfolders.find((candidate) => candidate.name === categoryName) ?? null
    })
  )
  return found.filter((folder): folder is DriveFile => folder !== null)
}

// How many files sit in a category across the whole archive. Deleting a
// category takes them with it, so the UI asks before doing that.
export async function countCategoryFiles(
  accessToken: string,
  rootFolderId: string,
  categoryName: string
): Promise<number> {
  const folders = await findCategoryFolders(accessToken, rootFolderId, categoryName)
  const counts = await Promise.all(
    folders.map(async (folder) => (await listFilesOnly(accessToken, folder.id)).length)
  )
  return counts.reduce((total, count) => total + count, 0)
}

export interface CategoryRemoval {
  folders: number
  // Names of the files that went with the folders. Filed invoices are keyed by
  // filename, so this is what tells the invoice DB which entries to unfile.
  files: string[]
}

// Removes a category's folder from every month, contents and all. Drive
// deletes a folder's descendants along with it.
export async function removeCategoryFolders(
  accessToken: string,
  rootFolderId: string,
  categoryName: string
): Promise<CategoryRemoval> {
  const folders = await findCategoryFolders(accessToken, rootFolderId, categoryName)

  const removed = await Promise.all(
    folders.map(async (folder) => {
      const files = await listFilesOnly(accessToken, folder.id)
      await deleteFile(accessToken, folder.id)
      return files.map((file) => file.name)
    })
  )

  return { folders: folders.length, files: removed.flat() }
}

export interface CategorySection {
  category: Category
  files: DriveFile[]
}

// Lists the files in each category subfolder of a month, in category order. A
// missing subfolder yields an empty section rather than being dropped, so the
// page layout stays stable.
export function listMonthCategories(
  accessToken: string,
  monthFolderId: string,
  categories: Category[]
): Promise<CategorySection[]> {
  return listSubfolders(accessToken, monthFolderId).then((subfolders) => {
    const byName = new Map(subfolders.map((folder) => [folder.name, folder]))
    return Promise.all(
      categories.map(async (category) => ({
        category,
        files: byName.has(category.key) ? await listFilesOnly(accessToken, byName.get(category.key)!.id) : [],
      }))
    )
  })
}
