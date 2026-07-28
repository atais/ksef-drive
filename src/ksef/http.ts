// Shared transport for the KSeF v2 API. In dev the requests go through the
// Vite proxy to dodge CORS; in production KSeF's API sends no CORS headers,
// so requests go through a Cloudflare Worker proxy instead (see worker/).

const KSEF_API = import.meta.env.DEV ? '/api/ksef' : import.meta.env.VITE_KSEF_API_BASE

export interface KsefRequest extends RequestInit {
  // Bearer token, when the endpoint needs one. Some endpoints take the
  // session token, others a short-lived operation token.
  token?: string
}

// KSeF puts the useful part of a failure in the response body (exception
// codes, Polish-language detail), so it always gets folded into the error.
export async function ksefFetch(path: string, { token, headers, ...init }: KsefRequest = {}): Promise<Response> {
  const response = await fetch(`${KSEF_API}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`KSEF ${response.status}${body ? ` - ${body}` : ''}`)
  }

  return response
}

export async function ksefFetchJson<T>(path: string, init?: KsefRequest): Promise<T> {
  const response = await ksefFetch(path, init)
  return response.json()
}
