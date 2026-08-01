// Generic Google Drive v3 access. This module knows nothing about invoices,
// years, months or category folders — it deals only in files, folders and
// their contents. Anything that encodes *our* archive layout belongs in
// app/archive.ts instead.

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFile {
  id: string
  name: string
}

async function driveFetch(accessToken: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Drive API error: ${response.status}${body ? ` - ${body}` : ''}`)
  }

  return response
}

// Drive's query language delimits string literals with single quotes and
// escapes them with a backslash. Names come from user data (and from KSeF
// numbers), so they can't be interpolated raw.
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const NOT_TRASHED = 'trashed=false'

const inParent = (parentId: string) => `${quote(parentId)} in parents`
const named = (name: string) => `name=${quote(name)}`
const isFolder = `mimeType=${quote(FOLDER_MIME)}`
const isNotFolder = `mimeType!=${quote(FOLDER_MIME)}`

// The single entry point for "find files matching this query". Every listing
// helper below is just a different set of clauses.
export async function queryFiles(accessToken: string, clauses: string[]): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    spaces: 'drive',
    fields: 'files(id,name)',
    pageSize: '1000',
  })

  const response = await driveFetch(accessToken, `${DRIVE_API}/files?${params}`)
  const data = await response.json()
  return data.files ?? []
}

export function listSubfolders(accessToken: string, parentId: string): Promise<DriveFile[]> {
  return queryFiles(accessToken, [inParent(parentId), isFolder, NOT_TRASHED])
}

export function listFilesOnly(accessToken: string, parentId: string): Promise<DriveFile[]> {
  return queryFiles(accessToken, [inParent(parentId), isNotFolder, NOT_TRASHED])
}

export async function findFile(accessToken: string, folderId: string, filename: string): Promise<DriveFile | null> {
  const files = await queryFiles(accessToken, [named(filename), inParent(folderId), NOT_TRASHED])
  return files[0] ?? null
}

async function createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
  const response = await driveFetch(accessToken, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })
  const data = await response.json()
  return { id: data.id, name: data.name }
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}`, { method: 'DELETE' })
}

export async function moveFile(
  accessToken: string,
  fileId: string,
  fromParentId: string,
  toParentId: string
): Promise<void> {
  const params = new URLSearchParams({ addParents: toParentId, removeParents: fromParentId })
  await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?${params}`, { method: 'PATCH' })
}

export async function downloadFileText(accessToken: string, fileId: string): Promise<string> {
  const response = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?alt=media`)
  return response.text()
}

// In-flight lock keyed by parent+name so concurrent callers await the same
// search/create instead of racing each other into creating duplicate folders.
const ensureFolderLocks = new Map<string, Promise<DriveFile>>()

export async function ensureFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
  const key = `${parentId ?? 'root'}:${name}`
  const inFlight = ensureFolderLocks.get(key)
  if (inFlight) return inFlight

  const promise = (async () => {
    const clauses = [named(name), isFolder, NOT_TRASHED]
    if (parentId) clauses.push(inParent(parentId))
    const matches = await queryFiles(accessToken, clauses)
    return matches[0] ?? createFolder(accessToken, name, parentId)
  })()

  ensureFolderLocks.set(key, promise)
  try {
    return await promise
  } finally {
    ensureFolderLocks.delete(key)
  }
}

// Writes a text file into a folder, replacing any existing file of the same
// name. Drive happily keeps same-named siblings, so an explicit lookup is the
// only way to get overwrite semantics.
export async function putTextFile(
  accessToken: string,
  folderId: string,
  filename: string,
  content: string,
  mimeType = 'application/json'
): Promise<void> {
  const existing = await findFile(accessToken, folderId, filename)

  if (existing) {
    await driveFetch(accessToken, `${UPLOAD_API}/files/${existing.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: content,
    })
    return
  }

  const boundary = '-------314159265358979323846'
  const body =
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name: filename, parents: [folderId] }) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    `\r\n--${boundary}--`

  await driveFetch(accessToken, `${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
}

// Deletes a named file from a folder, if present.
export async function deleteFileByName(accessToken: string, folderId: string, filename: string): Promise<void> {
  const existing = await findFile(accessToken, folderId, filename)
  if (existing) await deleteFile(accessToken, existing.id)
}

// Moves a named file between folders. No-op if it isn't in the source folder
// (e.g. it was never filed there).
export async function moveFileByName(
  accessToken: string,
  fromFolderId: string,
  toFolderId: string,
  filename: string
): Promise<void> {
  if (fromFolderId === toFolderId) return
  const existing = await findFile(accessToken, fromFolderId, filename)
  if (existing) await moveFile(accessToken, existing.id, fromFolderId, toFolderId)
}

// Returns null when the file doesn't exist. Network and parse failures throw,
// so callers can tell "nothing saved yet" apart from "couldn't reach Drive".
export async function readJsonFile<T>(accessToken: string, folderId: string, filename: string): Promise<T | null> {
  const file = await findFile(accessToken, folderId, filename)
  if (!file) return null
  const response = await driveFetch(accessToken, `${DRIVE_API}/files/${file.id}?alt=media`)
  return response.json()
}

export function writeJsonFile(
  accessToken: string,
  folderId: string,
  filename: string,
  data: unknown
): Promise<void> {
  return putTextFile(accessToken, folderId, filename, JSON.stringify(data, null, 2))
}
