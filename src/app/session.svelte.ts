// The app's session: a Google Drive connection plus a KSeF connection, and
// the bootstrap that gets from "signed out" to both being usable.
//
// This is the one place that knows both domains have to be brought up
// together: KSeF credentials live in the archive's .config folder, so Drive
// must be connected before KSeF can authenticate.

import {
  fetchGoogleUserInfo,
  isRejectedToken,
  requestGoogleAccessToken,
  type GoogleUser,
} from '../gdrive/googleAuth'
import { deleteFileByName, readJsonFile, writeJsonFile } from '../gdrive/driveApi'
import { authenticateWithKsef, type KsefCredentials } from '../ksef/ksefAuth'
import { ensureArchiveRoot, ensureConfigFolder, ensureYearFolders } from './archive'
import { categoriesStore } from './categoriesStore.svelte'
import { i18n } from './i18n.svelte'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email'
const CREDENTIALS_FILENAME = 'ksef_credentials.json'
const STORAGE_KEY = 'gdrive_session'

export type { GoogleUser }

// Everything a Drive write needs, narrowed once so call sites are free of
// null-checks on ids that are always present while a page is mounted.
export interface DriveContext {
  accessToken: string
  rootFolderId: string
  configFolderId: string
}

interface StoredSession {
  accessToken: string
  user: GoogleUser
  configFolderId: string
  ksefCredentials: KsefCredentials | null
}

// A KSeF auth failure is either "your permissions are wrong, keep the
// credentials and let the user fix them" or "these credentials are bad, drop
// them". Anything else we surface but leave the session alone.
function isInvalidCredentialsError(message: string): boolean {
  if (message.includes('403') && message.includes('missing-permissions')) return false
  return message.includes('401') || message.includes('KSEF auth failed')
}

export class Session {
  user = $state<GoogleUser | null>(null)
  accessToken = $state<string | null>(null)
  configFolderId = $state<string | null>(null)
  rootFolderId = $state<string | null>(null)
  ksefCredentials = $state<KsefCredentials | null>(null)
  ksefSessionToken = $state<string | null>(null)

  restoring = $state(true)
  savingCredentials = $state(false)
  private driveSyncCount = $state(0)

  readonly isConnected = $derived(!!(this.ksefCredentials && this.ksefSessionToken))
  readonly driveSyncing = $derived(this.driveSyncCount > 0)

  // Every store that writes to Drive narrows the session the same way, so the
  // check lives here rather than once per store.
  requireDrive(): DriveContext {
    const { accessToken, rootFolderId, configFolderId } = this
    if (!accessToken || !rootFolderId || !configFolderId) throw new Error(i18n.t('session.connectDriveFirst'))
    return { accessToken, rootFolderId, configFolderId }
  }

  // The invoice DB is per-NIP. Without one there's no way to tell which DB to
  // read or rewrite, and an empty NIP would silently load an empty one.
  requireNip(): string {
    const nip = this.ksefCredentials?.nip
    if (!nip) throw new Error(i18n.t('session.connectKsefFirst'))
    return nip
  }

  requireKsefSession(): string {
    if (!this.ksefSessionToken) throw new Error(i18n.t('session.notConnectedKsef'))
    return this.ksefSessionToken
  }

  // Runs a Drive task in the background without blocking the caller, while
  // tracking it so the navbar can show a "syncing" indicator. Used for work
  // (like ensuring all 12 month folders exist) that shouldn't stall app init.
  runInBackground(task: () => Promise<unknown>) {
    this.driveSyncCount += 1
    task()
      .catch((error) => console.error('Background Drive sync failed:', error))
      .finally(() => (this.driveSyncCount -= 1))
  }

  private persist() {
    if (!this.accessToken || !this.user || !this.configFolderId) return
    const stored: StoredSession = {
      accessToken: this.accessToken,
      user: this.user,
      configFolderId: this.configFolderId,
      ksefCredentials: this.ksefCredentials,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  }

  // Resolves the archive root and its .config folder (both idempotent
  // lookups), loads the category list, then kicks off the month-folder
  // backfill without blocking on a dozen Drive round-trips. Categories have
  // to be known first — they're what the backfill creates inside each month.
  private async openArchive(token: string): Promise<string> {
    const root = await ensureArchiveRoot(token)
    this.rootFolderId = root.id
    this.configFolderId = await ensureConfigFolder(token, root.id)
    await categoriesStore.load(token, this.configFolderId)
    this.runInBackground(() => ensureYearFolders(token, root.id, categoriesStore.names))
    return root.id
  }

  private loadKsefCredentials(token: string, configFolderId: string) {
    return readJsonFile<KsefCredentials>(token, configFolderId, CREDENTIALS_FILENAME)
  }

  async restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const stored: StoredSession = JSON.parse(raw)
      try {
        await fetchGoogleUserInfo(stored.accessToken)
      } catch (error) {
        // Keep the stored session on a transient failure so a reload can
        // retry; only a rejected token warrants signing the user out.
        if (isRejectedToken(error)) localStorage.removeItem(STORAGE_KEY)
        throw error
      }

      this.accessToken = stored.accessToken
      this.user = stored.user
      this.configFolderId = stored.configFolderId
      this.ksefCredentials = stored.ksefCredentials

      await this.openArchive(stored.accessToken)
      if (this.ksefCredentials) void this.authenticateKsef(this.ksefCredentials)
    } catch (error) {
      console.error('Session restore failed:', error)
    } finally {
      this.restoring = false
    }
  }

  async login() {
    this.restoring = true
    try {
      const token = await requestGoogleAccessToken(GOOGLE_CLIENT_ID, DRIVE_SCOPE)
      this.accessToken = token
      this.user = await fetchGoogleUserInfo(token)

      await this.openArchive(token)
      this.ksefCredentials = await this.loadKsefCredentials(token, this.configFolderId!)
      this.persist()

      if (this.ksefCredentials) await this.authenticateKsef(this.ksefCredentials)
    } catch (error) {
      console.error('Login/init failed:', error)
    } finally {
      this.restoring = false
    }
  }

  logout() {
    localStorage.removeItem(STORAGE_KEY)
    this.user = null
    this.accessToken = null
    this.configFolderId = null
    this.rootFolderId = null
    this.ksefCredentials = null
    this.ksefSessionToken = null
  }

  // Saves credentials to Drive, then immediately tries them against KSeF.
  async saveKsefCredentials(credentials: KsefCredentials) {
    if (!this.accessToken || !this.configFolderId || !this.user) {
      throw new Error(i18n.t('session.notConnectedDrive'))
    }

    this.savingCredentials = true
    try {
      await writeJsonFile(this.accessToken, this.configFolderId, CREDENTIALS_FILENAME, credentials)
      this.ksefCredentials = credentials
      this.persist()
      await this.authenticateKsef(credentials)
    } catch (error) {
      console.error('Save credentials failed:', error)
      throw error
    } finally {
      this.savingCredentials = false
    }
  }

  async authenticateKsef(credentials: KsefCredentials) {
    try {
      const response = await authenticateWithKsef(credentials)
      this.ksefSessionToken = response.accessToken.token
    } catch (error) {
      console.error('KSEF auth failed:', error)
      const message = error instanceof Error ? error.message : String(error)
      if (isInvalidCredentialsError(message)) await this.discardKsefCredentials()
    }
  }

  private async discardKsefCredentials() {
    if (this.accessToken && this.configFolderId) {
      try {
        await deleteFileByName(this.accessToken, this.configFolderId, CREDENTIALS_FILENAME)
      } catch (error) {
        console.error('Failed to delete credentials:', error)
      }
    }
    this.ksefCredentials = null
    this.ksefSessionToken = null
    this.persist()
  }
}

export const session = new Session()
