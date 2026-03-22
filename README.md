<img src="packages/web/public/favicon.svg" width="48" alt="Stream icon" />

# Stream

A velocity-based RSS reader. Articles arrive, linger, and fade — they are not tasks to be cleared.

---

## The problem

Every mainstream RSS reader inherits the same foundational assumption from Brent Simmons' NetNewsWire (2002): feeds are an inbox, articles are items to be processed, and falling behind is a failure state. Unread counts, mark-as-read buttons, and three-pane layouts all reinforce what Terry Godier calls **phantom obligation** — guilt for something no one asked you to do.

Stream is a different kind of frontend for the same backends. It does not fetch or store feeds. It connects to FreshRSS, Miniflux, Feedbin, or NewsBlur via their existing APIs and presents what it finds as a river: things that arrived, each fading at a rate appropriate to its source. A breaking news feed fades in hours. A personal essay lingers for days. A prolific source cannot drown out a thoughtful one.

There are no unread counts. There is no mark-as-read. **You are not behind.**

---

## Inspiration

Stream is directly inspired by **[Current](https://www.terrygodier.com/current)** by Terry Godier — an RSS reader for iPhone, iPad, and Mac built around the same philosophy. Current's tagline is *"An RSS reader that doesn't count."* Its core argument: *"Every interface is an argument about how you should feel."*

Current is Apple-only. Stream exists to bring the same ideas to self-hosted RSS users on any platform, via a web app and browser extension that connect to existing backends without replacing them.

---

## How it works

Each source is assigned a velocity tier with a half-life in hours:

| Tier | Label | Half-life | Example |
|------|-------|-----------|---------|
| 1 | Breaking | 3h | BBC News, Reuters |
| 2 | News | 12h | Ars Technica, The Verge |
| 3 | Article | 24h | Most blogs (default) |
| 4 | Essay | 72h | Aeon, Craig Mod |
| 5 | Evergreen | 168h (7 days) | Tutorials, references |

Visibility score: `0.5 ^ (elapsed / halfLife)`. Articles below 0.05 disappear. Fresh articles are fully opaque; aging articles dim and their left border recedes. The river is what is here right now.

---

## Status

- [x] River engine with velocity-based aging
- [x] FreshRSS adapter (Google Reader API)
- [x] Feedbin adapter
- [x] Web app (Vite SPA) — deploy to Netlify or any static host
- [x] Browser extension (Firefox + Chrome, MV3) with built-in CORS proxy
- [x] Light / dark themes (Nord colour scheme)
- [x] Keyboard navigation (`j`/`k`, `d` dismiss, `s` save, `z` undo, `?` help)
- [x] Velocity settings per source and per category
- [x] Category filtering and unread-only toggle
- [x] OPML import, add feed by URL
- [x] Reading view with sanitised content
- [ ] Saved / Read Later view
- [ ] Background sync + badge count (extension)
- [ ] Firefox Add-ons / Chrome Web Store publication

---

## Architecture

Three packages in an npm workspace monorepo:

```
packages/
  core/       Preact components, river engine, backend adapters
  web/        Vite SPA — deploy alongside your RSS backend (same-origin)
  extension/  Browser extension — Firefox and Chrome from one codebase (MV3)
```

`stream-core` knows nothing about where it runs. Both shells import the same `App` component and adapter classes.

**Tech:** Preact · Vite · CSS Modules · IndexedDB (`idb`) · `webextension-polyfill`

---

## Running locally

```bash
npm install
npm run dev   # → http://localhost:5173
```

The dev server includes a reverse proxy that forwards API requests server-side, so CORS is handled automatically. Enter your backend root URL in the connect screen (e.g. `https://freshrss.example.com`).

**FreshRSS note:** the Google Reader API requires a separate API password — set one under Settings → Profile → API management. Your regular login password will not work here.

---

## Deployment

### Web app — Netlify (recommended)

Connect this repo to [Netlify](https://netlify.com). Build settings are read from `netlify.toml` automatically — no configuration needed. A serverless proxy function is bundled with the build to handle CORS for self-hosted backends.

### Web app — other static hosts

```bash
npm run build:web
# deploy packages/web/dist/ to your host
```

For self-hosted FreshRSS/Miniflux, your backend must send CORS headers. Add to your nginx config:

```nginx
add_header Access-Control-Allow-Origin  "*";
add_header Access-Control-Allow-Headers "Authorization, Content-Type";
add_header Access-Control-Allow-Methods "GET, POST";
```

Feedbin users need no extra configuration — Feedbin supports CORS natively.

### Browser extension

The extension includes its own CORS proxy (background service worker), so it works with any backend without any server configuration.

```bash
npm run package:extension   # → stream-extension.zip
```

- **Firefox**: `about:debugging` → This Firefox → Load Temporary Add-on → select the zip
- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked → select `packages/extension/dist/`

### Commands

| Command | Output |
|---------|--------|
| `npm run dev` | Dev server at localhost:5173 |
| `npm run build:web` | `packages/web/dist/` |
| `npm run build:extension` | `packages/extension/dist/` |
| `npm run package:extension` | `stream-extension.zip` |

---

## Licence

[AGPL-3.0](LICENSE.md)
