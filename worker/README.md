# ksef-drive-proxy (Cloudflare Worker)

CORS proxy for the KSeF v2 API. KSeF sends no `Access-Control-Allow-Origin`
header, so the GitHub Pages site can't call it directly — this Worker sits in
between, forwards requests, and adds CORS headers scoped to
`https://atais.github.io`.

## Deploy (one-time)

```
cd worker
npx wrangler login          # opens browser, free Cloudflare account is fine
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g.:
`https://ksef-drive-proxy.<your-subdomain>.workers.dev`

## Wire it up

1. In the GitHub repo settings → Secrets and variables → Actions, add secret
   `VITE_KSEF_API_BASE` = the Worker URL above (no trailing slash).
2. For local prod builds, put the same value in `.env` as `VITE_KSEF_API_BASE`.
3. Dev (`npm run dev`) is unaffected — it still uses the Vite proxy in
   `vite.config.ts`.

## Notes

- Free tier: 100k requests/day, no credit card required.
- Only `https://atais.github.io` origin is allowed (see `ALLOWED_ORIGIN` in
  `index.js`) — update it if the site moves.
- The Worker doesn't store or log tokens; it just forwards headers/body.
