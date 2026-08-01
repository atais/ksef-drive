// Thin wrapper around Google Identity Services' token client (implicit flow),
// plus the userinfo lookup that tells us who a token belongs to and whether
// it is still good.

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token: string; error?: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
    }
  }
}

let scriptLoaded: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (scriptLoaded) return scriptLoaded
  scriptLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
  return scriptLoaded
}

export async function requestGoogleAccessToken(clientId: string, scope: string): Promise<string> {
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Google login failed'))
          return
        }
        resolve(response.access_token)
      },
    })
    client.requestAccessToken()
  })
}

export interface GoogleUser {
  email: string
  name: string
}

// Carries the HTTP status so callers can tell "this token is dead" from "the
// network hiccuped" without knowing anything about the transport.
export class GoogleAuthError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GoogleAuthError'
    this.status = status
  }
}

// Only a definitive rejection means a stored token is dead. A network blip
// must not sign the user out — they'd have to re-consent.
export function isRejectedToken(error: unknown): boolean {
  return error instanceof GoogleAuthError && (error.status === 401 || error.status === 403)
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUser> {
  let response: Response
  try {
    response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch (error) {
    throw new GoogleAuthError(error instanceof Error ? error.message : 'Google userinfo request failed')
  }

  if (!response.ok) throw new GoogleAuthError(`Google userinfo failed: ${response.status}`, response.status)

  const data = await response.json()
  return { email: data.email, name: data.name }
}
