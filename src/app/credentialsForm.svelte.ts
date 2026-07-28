// Form state for entering KSeF certificate credentials. Editing an existing
// set is a fill-in-the-blanks affair: any field left untouched keeps whatever
// was already saved, so the user can rotate just the key or just the password.

import type { KsefCredentials } from '../ksef/ksefAuth'
import { isValidNip, NIP_LENGTH, toNipInput } from '../ksef/nip'

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export class CredentialsForm {
  nip = $state('')
  certPem = $state('')
  keyPem = $state('')
  keyPassword = $state('')
  error = $state('')

  readonly isEdit: boolean
  private current: KsefCredentials | null

  constructor(current: KsefCredentials | null) {
    this.current = current
    this.isEdit = !!current
    this.nip = current?.nip ?? ''
  }

  setNip(value: string) {
    this.nip = toNipInput(value)
  }

  async loadCert(file: File) {
    this.certPem = await readFileAsText(file)
  }

  async loadKey(file: File) {
    this.keyPem = await readFileAsText(file)
  }

  // Merges entered values over the saved ones and validates. Returns null and
  // sets `error` when the result isn't usable.
  private build(): KsefCredentials | null {
    if (!isValidNip(this.nip)) {
      this.error = `NIP must be ${NIP_LENGTH} digits`
      return null
    }

    const certPem = this.certPem || this.current?.certPem || ''
    const keyPem = this.keyPem || this.current?.keyPem || ''
    const keyPassword = this.keyPassword || this.current?.keyPassword || ''

    if (!certPem || !keyPem) {
      this.error = 'Upload both the certificate (.crt) and the private key (.key)'
      return null
    }

    return { method: 'certificate', nip: this.nip, certPem, keyPem, keyPassword }
  }

  async submit(save: (credentials: KsefCredentials) => Promise<void>) {
    this.error = ''
    const credentials = this.build()
    if (!credentials) return

    try {
      await save(credentials)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Save failed'
    }
  }
}
