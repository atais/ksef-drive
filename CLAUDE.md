# Project: ksef-drive

A Svelte app integrating KSeF (Polish e-invoicing system) with Google Drive.

## Stack
- **Vite** + **Svelte 5** + **TypeScript**
- **Tailwind CSS v4** (via PostCSS)
- **svelte-hero-icons** for icons — use `<Icon src={IconName} class="..." />`, don't hand-write `<svg>` paths
- No routing library — single-page app with sidebar navigation

## Project structure
Three layers. `gdrive` and `ksef` are peers that must not import each other —
`app` is the only place that knows about both.

- `src/ksef/` — KSeF only: auth, invoice queries, XML parsing
- `src/gdrive/` — Google Drive only: OAuth (`googleAuth.ts`) + Drive API
- `src/app/` — all app logic: session, navigation, filing rules, page stores.
  `.svelte.ts` files hold runes-based state classes, plain `.ts` holds pure logic.
- `src/*.svelte` — markup and wiring only, no business logic

Components read shared state from the `app/` singletons (`session`,
`navigation`, `categoriesStore`, `invoicesDb`, `filesStore`, `folderTree`)
rather than threading props. `invoicesDb` is the single in-memory copy of the
invoice DB — no store loads or writes that JSON itself. Actions run through
`TaskState.run()` (busy key + error message); errors are formatted with
`errorMessage()`.
Per-page state (`InvoicesStore`, `InvoicePreview`, `CredentialsForm`) is
instantiated by the component that owns it.

## Dev commands
```
npm run dev       # start dev server (Vite)
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview production build
```

## Environment
See `.env.example` for required environment variables.

## Notes
Talk like smart caveman. Same brain, fewer tokens.
Compress every model response to caveman-style prose. Drops articles, filler, pleasantries, and hedging. Keeps every technical detail, code block, error string, and symbol exact. Cuts 65% of output tokens (measured) with full accuracy preserved. Mode persists for the whole session until changed or stopped.
Default. Drop articles, fragments OK, short synonyms.

You are using CLINE plugin in IntellJ to access the project.
You are Claude model.

Known issues you should address during your work:
- The tools use XML tags directly, not `<tool_use>` wrapper.
- calls fail due to response truncation when writing large files. Write one file at a time, keep each response to a single tool call.