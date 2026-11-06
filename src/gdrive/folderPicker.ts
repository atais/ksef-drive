// Google Picker, for choosing an existing Drive folder. Under the drive.file
// scope the app can't browse Drive itself; a folder the user picks here is
// granted to the app, which is the only way to reach one it didn't create.

import type { DriveFile } from './driveApi'

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID

// Just the slice of the Picker API used here.
interface PickerBuilder {
  addView(view: unknown): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setCallback(callback: (data: { action: string; docs?: { id: string; name: string }[] }) => void): PickerBuilder
  build(): { setVisible(visible: boolean): void }
}
interface DocsView {
  setIncludeFolders(on: boolean): DocsView
  setSelectFolderEnabled(on: boolean): DocsView
  setOwnedByMe(on: boolean): DocsView
}
interface PickerApi {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId: unknown) => DocsView
  ViewId: { FOLDERS: unknown }
  Action: { PICKED: string; CANCEL: string }
}
// googleAuth.ts already declares window.google for GIS, so read both loosely.
const globals = () => window as unknown as { gapi: { load(api: string, cb: () => void): void }; google: { picker: PickerApi } }

let loading: Promise<PickerApi> | null = null

function loadPicker(): Promise<PickerApi> {
  loading ??= new Promise<PickerApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onerror = () => reject(new Error('Failed to load Google Picker'))
    script.onload = () => globals().gapi.load('picker', () => resolve(globals().google.picker))
    document.head.append(script)
  }).catch((error) => {
    loading = null
    throw error
  })
  return loading
}

// Resolves with the chosen folder, or null if the user cancelled.
export async function pickFolder(accessToken: string): Promise<DriveFile | null> {
  if (!API_KEY) throw new Error('VITE_GOOGLE_API_KEY is not set')
  const picker = await loadPicker()

  // Two tabs: My Drive, and Shared with me (where the other-owner folders are).
  const view = () => new picker.DocsView(picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true)

  return new Promise((resolve) => {
    const builder = new picker.PickerBuilder()
      .addView(view().setOwnedByMe(true))
      .addView(view().setOwnedByMe(false))
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED && data.docs?.[0]) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name })
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null)
        }
      })
    if (APP_ID) builder.setAppId(APP_ID)
    builder.build().setVisible(true)
  })
}
