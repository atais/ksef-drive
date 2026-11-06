// Archive-wide settings that aren't categories or credentials. Persisted as
// JSON in the archive's .config folder so they follow the archive.
//
// Today that is just the name of the marker file ("komplet") dropped in a month
// folder to tell the accountant everything for that month is there.

import { readJsonFile, writeJsonFile } from '../gdrive/driveApi'
import { i18n } from './i18n.svelte'
import { session } from './session.svelte'
import { TaskState } from './task.svelte'

const SETTINGS_FILENAME = 'settings.json'
export const DEFAULT_COMPLETION_NAME = 'komplet'

interface StoredSettings {
  completionName?: string
}

// A name Drive would accept but that would be confusing or unusable as a
// marker: empty, or containing a slash.
export function validateCompletionName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return i18n.t('settings.completionEmpty')
  if (/[\\/]/.test(trimmed)) return i18n.t('settings.completionSlash')
  return null
}

export class ArchiveSettings {
  completionName = $state(DEFAULT_COMPLETION_NAME)
  private task = new TaskState()

  readonly saving = $derived(this.task.busy)
  readonly error = $derived(this.task.error)

  async load(accessToken: string, configFolderId: string) {
    const stored = await readJsonFile<StoredSettings>(accessToken, configFolderId, SETTINGS_FILENAME)
    this.completionName = stored?.completionName?.trim() || DEFAULT_COMPLETION_NAME
  }

  async setCompletionName(name: string) {
    const problem = validateCompletionName(name)
    if (problem) {
      this.task.error = problem
      return
    }
    await this.task.run(i18n.t('settings.completionSaveFailed'), async () => {
      const { accessToken, configFolderId } = session.requireDrive()
      const next = name.trim()
      await writeJsonFile(accessToken, configFolderId, SETTINGS_FILENAME, { completionName: next } satisfies StoredSettings)
      this.completionName = next
    })
  }
}

export const archiveSettings = new ArchiveSettings()
