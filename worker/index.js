// Cloudflare Worker: CORS proxy for the KSeF v2 API.
// Only forwards requests from ALLOWED_ORIGIN and only to KSEF_TARGET.

const KSEF_TARGET = 'https://api.ksef.mf.gov.pl/v2'
const ALLOWED_ORIGIN = 'https://atais.github.io'

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''
    const headers = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403, headers })
    }

    const url = new URL(request.url)
    const target = `${KSEF_TARGET}${url.pathname}${url.search}`

    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        ...(request.headers.get('Authorization') ? { Authorization: request.headers.get('Authorization') } : {}),
      },
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    })

    const responseHeaders = new Headers(upstream.headers)
    for (const [key, value] of Object.entries(headers)) {
      responseHeaders.set(key, value)
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  },
}
