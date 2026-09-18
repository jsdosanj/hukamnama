# Hukamnama

A single Cloudflare Worker serving a daily Vaak (Hukamnama) from Sikh
scripture, presented as an illuminated letter with an antique floral
border.

- **sggs.dosanjhlabs.com** — Sri Guru Granth Sahib Ji
- **dasam.dosanjhlabs.com** — Sri Dasam Granth Sahib Ji & Sri Sarbloh
  Granth Sahib Ji (toggle between them, or read both)

One Worker, one codebase, routing purely by request hostname — see
`src/index.js`. Each domain only ever has access to its own dataset, so
there's no shared client-side state that could leak the wrong granth onto
the wrong domain (the bug this replaces).

## Local development

```sh
npm install -g wrangler   # or use npx
wrangler dev
```

Then visit `http://localhost:8787` with a `Host` header (or an
`/etc/hosts` entry) for `sggs.dosanjhlabs.com` / `dasam.dosanjhlabs.com`,
since routing is hostname-based.

## Deploy

```sh
wrangler deploy
```

Then attach both hostnames as Workers Custom Domains in the Cloudflare
dashboard (or via the API) — see `DEPLOY.md`.

## Structure

```
src/index.js        Worker: routing, data loading, HTML + JSON API rendering
public/style.css     Design system (Apple HIG-informed, antique/royal theme)
public/app.js        Client-side: copy text, copy/save as image, prev/next, toggle
public/borders/      Antique floral border art (served as static assets)
public/data/         Gurmukhi + English text for all three granths (JSON)
scripts/             One-off scripts used to build the Sarbloh Granth dataset
SOURCES.md           Text provenance for all three granths
```

## API

- `GET /` — full HTML page with a shabad server-rendered into the DOM
  (so it reads correctly even for clients that don't run JavaScript, e.g.
  the iOS Shortcuts "Get Contents of Webpage" action).
- `GET /api/hukamnama?src=<sources>` — JSON `{id, source, citation, text}`
  for a new random entry.
- `GET /api/next?id=<id>&src=<sources>` / `/api/prev` — JSON for the
  neighboring entry.
- `GET /text` — the same random entry as plain text (`Content-Type:
  text/plain`), for the simplest possible Shortcuts/automation integration.
- `GET /sources` — human-readable text provenance page.

`src` (only meaningful on `dasam.dosanjhlabs.com`) is a comma-separated
subset of `dasam,sarbloh`.
