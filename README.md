# KSeF + Google Drive Integration

Svelte app integrating [KSeF](https://www.podatki.gov.pl/ksef/) (Polish e-invoicing system) with Google Drive.

**Live:** https://atais.github.io/ksef-gdrive/

## Tech Stack

- **Vite** + **Svelte 5** + **TypeScript**
- **Tailwind CSS v4** (via PostCSS)
- **Google Identity Services** for OAuth
- **svelte-hero-icons** for UI icons

## Setup

### Local Development

1. **Clone & install**
   ```bash
   git clone https://github.com/atais/ksef-gdrive
   cd ksef-gdrive
   npm install
   ```

2. **Create `.env.local`** (copy from `.env.example`)
   ```bash
   cp .env.example .env.local
   ```
   Add your Google OAuth Client ID:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   ```

3. **Run dev server**
   ```bash
   npm run dev
   ```
   Opens at http://localhost:5173/ksef-gdrive/

### Build & Preview

```bash
npm run build       # Produces /dist folder
npm run preview     # Preview production build locally
npm run lint        # Run ESLint
```

## Deployment to GitHub Pages

### 1. Add Google OAuth Redirect URI

Go to [Google Cloud Console](https://console.cloud.google.com/):
1. Select your project
2. APIs & Services → Credentials
3. Click your OAuth 2.0 Client ID
4. Add Authorized redirect URIs:
   ```
   https://atais.github.io/ksef-gdrive/
   ```

### 2. Add GitHub Secret

1. Go to repo Settings → Secrets and variables → Actions
2. Create new repository secret:
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: Your Google Client ID (same as `.env.local`)

### 3. Enable GitHub Pages

1. Go to repo Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **master** | Folder: **/root**

GitHub Actions will auto-deploy on every push to master.

## Architecture

Three isolated layers (peers don't import each other):

- **`src/ksef/`** — KSeF auth, invoice queries, XML parsing
- **`src/gdrive/`** — Google Drive OAuth, Drive API
- **`src/app/`** — Session, navigation, filing rules, shared state stores
- **`src/*.svelte`** — UI markup only, no business logic

Components read state from `app/` singletons (`session`, `navigation`, `filesStore`, `folderTree`).

## Google OAuth Setup (First-Time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project
3. Enable APIs:
   - Google Drive API
   - (Optional) Google Identity Services (auto-enabled)
4. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173`, `https://atais.github.io`
   - Authorized redirect URIs: `https://atais.github.io/ksef-gdrive/`
5. Download JSON credentials → rename to `.env.local`, extract `VITE_GOOGLE_CLIENT_ID`

## Known Limitations

- Single-page app, no routing library (sidebar navigation)
- Client-side OAuth only (no backend service)
- KSeF requires Polish tax ID + credentials
