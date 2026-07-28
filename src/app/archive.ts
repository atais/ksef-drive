// The shape of our Drive archive:
//
//   ksef-gdrive/
//     .config/                  credentials + invoice DB
//     <yyyy>/
//       <MM.yyyy>/
//         _Sprzedaz/            sales invoices
//         _Koszty/              cost invoices
//         Wyciagi/              bank statements
//
// This is app knowledge, not Drive knowledge, so it lives here rather than in
// gdrive/ — that layer only understands files and folders.

import { ensureFolder, listFilesOnly, listSubfolders, type DriveFile } from '../gdrive/driveApi'
import { MONTH_KEY_PATTERN, monthKey } from './dates'

const ROOT_FOLDER_NAME = 'ksef-gdrive'
const CONFIG_FOLDER_NAME = '.config'
const YEAR_PATTERN = /^\d{4}$/

// Category subfolders created inside every month folder.
export const MONTH_CATEGORIES = ['_Sprzedaz', '_Koszty', 'Wyciagi'] as const

export type MonthCategory = (typeof MONTH_CATEGORIES)[number]
export type InvoiceCategory = Extract<MonthCategory, '_Sprzedaz' | '_Koszty'>

const CATEGORY_TITLES: Record<MonthCategory, string> = {
  _Sprzedaz: 'Sprzedaż',
  _Koszty: 'Koszty',
  Wyciagi: 'Wyciągi',
}

export function isInvoiceCategory(key: string): key is InvoiceCategory {
  return key === '_Sprzedaz' || key === '_Koszty'
}

export function ensureArchiveRoot(accessToken: string): Promise<DriveFile> {
  return ensureFolder(accessToken, ROOT_FOLDER_NAME)
}

export async function ensureConfigFolder(accessToken: string, rootFolderId: string): Promise<string> {
  const folder = await ensureFolder(accessToken, CONFIG_FOLDER_NAME, rootFolderId)
  return folder.id
}

// Ensures <yyyy>/01.<yyyy> .. 12.<yyyy> all exist under the archive root for
// the given date's year, plus the category subfolders inside each month.
export async function ensureYearFolders(
  accessToken: string,
  rootFolderId: string,
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
      MONTH_CATEGORIES.map((name) => ensureFolder(accessToken, name, monthFolder.id))
    )
  )
}

// Resolves (creating if missing) a specific month's category subfolder, e.g.
// ksef-gdrive/2026/03.2026/_Koszty.
export async function ensureCategoryFolder(
  accessToken: string,
  rootFolderId: string,
  year: string,
  month: string,
  category: InvoiceCategory
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

export interface CategorySection {
  key: MonthCategory
  title: string
  files: DriveFile[]
}

// Lists the files in each category subfolder of a month, in display order. A
// missing subfolder yields an empty section rather than being dropped, so the
// page layout stays stable.
export function listMonthCategories(accessToken: string, monthFolderId: string): Promise<CategorySection[]> {
  return listSubfolders(accessToken, monthFolderId).then((subfolders) => {
    const byName = new Map(subfolders.map((folder) => [folder.name, folder]))
    return Promise.all(
      MONTH_CATEGORIES.map(async (name) => ({
        key: name,
        title: CATEGORY_TITLES[name],
        files: byName.has(name) ? await listFilesOnly(accessToken, byName.get(name)!.id) : [],
      }))
    )
  })
}
