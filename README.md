# Hukamnama

A single Cloudflare Worker serving a daily Vaak (Hukamnama) from Sikh
scripture, presented as an illuminated letter with an antique floral
border.

- **sggs.dosanjhlabs.com** — Sri Guru Granth Sahib Ji
- **dasam.dosanjhlabs.com** — Sri Dasam Granth Sahib Ji & Sri Sarbloh
  Granth Sahib Ji (toggle between them, or read both)
- **hukamnama.dosanjhlabs.com** — all three granths together, with a
  toggle to narrow to any one of them

One Worker, one codebase, routing purely by request hostname — see
`src/index.js`. Each domain only ever has access to its own dataset, so
there's no shared client-side state that could leak the wrong granth onto
the wrong domain (the bug this replaces). The border art and colour theme
follow whichever granth the current entry actually came from (gold for
SGGS, indigo for Dasam Granth, blue for Sarbloh Granth) — so on the
combined domain, the frame changes with each pick.

## Local development

```sh
npm install -g wrangler   # or use npx
wrangler dev
```

Then visit `http://localhost:8787` with a `Host` header (or an
`/etc/hosts` entry) for one of the three domains, since routing is
hostname-based.

**Note:** once `wrangler.toml` has `[[routes]]` with `custom_domain =
true`, `wrangler dev --local` simulates every request as the *first*
route regardless of the `Host` header you send — a local-dev-only quirk
that doesn't affect the real deployment (verified: production correctly
routes each domain independently). To test hostname-based branching
locally, temporarily comment out the `[[routes]]` blocks while running
`wrangler dev`, or just test against the deployed Worker directly.

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

`src` is a comma-separated subset of that domain's sources: `dasam,sarbloh`
on `dasam.dosanjhlabs.com`, or `aad,dasam,sarbloh` on
`hukamnama.dosanjhlabs.com` (e.g. `?src=aad` there shows SGGS only). It has
no effect on `sggs.dosanjhlabs.com`, which only ever has the one source.

## iOS Shortcuts

Each domain is meant to be pointed at directly by its own Shortcut — since
routing is purely server-side by hostname, a Shortcut aimed at
`sggs.dosanjhlabs.com` can never come back with Dasam or Sarbloh content,
and vice versa. That's what fixes the earlier bug where a hukamnama
request would resolve to SGGS no matter which site/Shortcut it came from.

### Simplest: the plain-text endpoint

This is the most reliable option, since there's no HTML to parse — the
Shortcut just fetches a URL and gets back the shabad as plain text.

1. Open the **Shortcuts** app → **+** → **Add Action**.
2. Add **Get Contents of URL**, and set the URL to one of:
   - `https://sggs.dosanjhlabs.com/text` — Sri Guru Granth Sahib Ji
   - `https://dasam.dosanjhlabs.com/text` — Dasam Granth & Sarbloh Granth
   - `https://hukamnama.dosanjhlabs.com/text` — all three
   - Add `?src=aad`, `?src=dasam`, or `?src=sarbloh` to the combined URL to
     pin a Shortcut to just one granth (e.g.
     `https://hukamnama.dosanjhlabs.com/text?src=sarbloh`).
3. Add whatever you want to do with the result — **Show Result**, **Speak
   Text**, **Send Message**, a **Notification**, etc. — and feed it the
   output of the previous step (usually offered automatically as
   "Contents of URL").
4. Name the Shortcut (e.g. "SGGS Hukamnama") and optionally add it to your
   Home Screen or set up an automation (e.g. every morning at 6am) to run
   it on a schedule.

### Alternative: the illuminated page itself

If you'd rather capture the actual designed page (e.g. to screenshot it,
or because you're already using this pattern):

1. Add **Get Contents of Webpage**, URL as above but without `/text` (e.g.
   `https://sggs.dosanjhlabs.com/`).
2. Add **Get Text from Input**, with input set to "Contents of Webpage".
3. Continue as in step 3 above.

This works because the shabad is rendered directly into the page's HTML
server-side — it doesn't depend on JavaScript running, so both Shortcuts
actions can read it correctly.
