// KSeF authentication: sign a challenge with the user's certificate, wait for
// the async auth operation to settle, then redeem the resulting operation
// token for a real session token.

import { ksefFetchJson } from './http'
import { signXmlWithCertificate } from './xadesSigning'

export interface KsefCertificateCredentials {
  method: 'certificate'
  nip: string
  certPem: string
  keyPem: string
  keyPassword: string
}

export type KsefCredentials = KsefCertificateCredentials

export interface KsefToken {
  token: string
  validUntil: string
}

export interface KsefAccessTokenResponse {
  accessToken: KsefToken
  refreshToken: KsefToken
}

interface ChallengeResponse {
  challenge: string
  timestamp: string
  timestampMs: number
}

interface AuthInitResponse {
  referenceNumber: string
  authenticationToken: KsefToken
}

interface AuthStatusResponse {
  status: {
    code: number
    description: string
    details?: string[]
  }
}

const STATUS_IN_PROGRESS = 100
const STATUS_SUCCESS = 200

function getChallenge(): Promise<ChallengeResponse> {
  return ksefFetchJson<ChallengeResponse>('/auth/challenge', { method: 'POST' })
}

function buildAuthTokenRequestXml(challenge: string, nip: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.0">\n  <Challenge>${challenge}</Challenge>\n  <ContextIdentifier>\n    <Nip>${nip}</Nip>\n  </ContextIdentifier>\n  <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>\n</AuthTokenRequest>`
}

// Polls the authentication operation until it leaves the "in progress" state.
async function pollAuthStatus(
  referenceNumber: string,
  operationToken: string,
  { intervalMs = 1000, timeoutMs = 20000 } = {}
): Promise<AuthStatusResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const status = await ksefFetchJson<AuthStatusResponse>(`/auth/${referenceNumber}`, { token: operationToken })
    if (status.status.code !== STATUS_IN_PROGRESS) return status
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('KSEF authentication timed out')
}

export async function authenticateWithKsef(credentials: KsefCredentials): Promise<KsefAccessTokenResponse> {
  const { challenge } = await getChallenge()
  const xml = buildAuthTokenRequestXml(challenge, credentials.nip)
  const signedXml = await signXmlWithCertificate(xml, credentials)

  const init = await ksefFetchJson<AuthInitResponse>('/auth/xades-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: signedXml,
  })

  const operationToken = init.authenticationToken.token
  const status = await pollAuthStatus(init.referenceNumber, operationToken)

  if (status.status.code !== STATUS_SUCCESS) {
    const details = status.status.details?.length ? ` - ${status.status.details.join('; ')}` : ''
    throw new Error(`KSEF auth failed: ${status.status.description}${details}`)
  }

  return ksefFetchJson<KsefAccessTokenResponse>('/auth/token/redeem', {
    method: 'POST',
    token: operationToken,
  })
}
