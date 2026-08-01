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

// Only a definitive rejection means a stored token is dead. A network blip
// throws without a status and must not sign the user out — they'd have to
// re-consent.
export function isRejectedToken(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  return status === 401 || status === 403
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUser> {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })

  if (!response.ok) {
    throw Object.assign(new Error(`Google userinfo failed: ${response.status}`), { status: response.status })
  }

  const data = await response.json()
  return { email: data.email, name: data.name }
}
