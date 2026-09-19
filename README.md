# Hukamnama

A single Cloudflare Worker serving a daily Vaak (Hukamnama) from Sikh
scripture, presented as an illuminated letter with an antique floral
border, on a royal-blue backdrop drawn from the three colours (blue,
white, and basanti yellow) Guru Gobind Singh Ji gave the Khalsa.

- **sggs.dosanjhlabs.com** — Sri Guru Granth Sahib Ji
- **dasam.dosanjhlabs.com** — Sri Dasam Granth Sahib Ji & Sri Sarbloh
  Granth Sahib Ji (toggle between them, or read both)
- **sarbloh.dosanjhlabs.com** — Sri Sarbloh Granth Sahib Ji only
- **hukam.dosanjhlabs.com** — all three granths together. The default view
  shows all three side by side (Dasam Granth on the left, Sri Guru Granth
  Sahib in the middle, Sri Sarbloh Granth Sahib on the right); a dropdown
  narrows it to any single granth or pair (`hukamnama.dosanjhlabs.com`
  still works too, as an alias)

One Worker, one codebase, routing purely by request hostname — see
`src/index.js`. Each domain only ever has access to its own dataset, so
there's no shared client-side state that could leak the wrong granth onto
the wrong domain (the bug this replaces). The border art and colour theme
follow whichever granth the current entry actually came from (gold for
SGGS, indigo for Dasam Granth, blue for Sarbloh Granth) — so on a combined
domain, the frame changes with each pick.

## Translations

Under each hukamnama, the "Translations & display" panel lets a reader
choose:

- **English** — Bhai Manmohan Singh for SGGS, banidb's English for Dasam
  Granth. Dr. Sant Singh Khalsa's translation is intentionally not offered
  anywhere on this site.
- **Punjabi commentary** (off by default) — Professor Sahib Singh's *Sri
  Guru Granth Sahib Darpan* or the classical Fareedkot Teeka for SGGS; a
  verse-by-verse Punjabi steek for Dasam Granth.
- **Larivaar** — joins the Gurmukhi into one continuous run with no gaps
  between words, the way gurbani is printed in a saroop.

Choices persist per source in `localStorage`. Punjabi commentary text is
large (full verse-by-verse exegesis for ~11,000 shabads) and lives in
separate static assets fetched only once a reader actually selects it —
see "Data" below.

## Local development

```sh
npm install -g wrangler   # or use npx
wrangler dev
```

Then visit `http://localhost:8787` with a `Host` header (or an
`/etc/hosts` entry) for one of the four domains, since routing is
hostname-based.

**Note:** once `wrangler.jsonc` has `routes` with `custom_domain: true`,
`wrangler dev --local` simulates every request as the *first* route
regardless of the `Host` header you send — a local-dev-only quirk that
doesn't affect the real deployment (verified: production correctly routes
each domain independently). To test hostname-based branching locally,
temporarily remove the `routes` array while running `wrangler dev`, or
just test against the deployed Worker directly.

## Deploy

```sh
wrangler deploy
```

Then attach each hostname as a Workers Custom Domain in the Cloudflare
dashboard (or via the API) — see `DEPLOY.md`.

## Structure

```
src/index.js         Worker: routing, data loading, HTML + JSON API rendering
public/style.css      Design system (Apple HIG-informed, royal-blue/antique theme)
public/app.js         Client-side: copy text/image, share sheet, translations, prev/next
public/borders/       Antique floral border art (served as static assets)
public/images/        Hero carousel banners + FAQ imagery
public/icons/         App icons (referenced by manifest.webmanifest)
public/data/          Gurmukhi + translation text for all three granths (JSON)
scripts/              One-off scripts used to build the Sarbloh Granth dataset
SOURCES.md            Text provenance for all three granths
```

## API

- `GET /` — full HTML page with a shabad server-rendered into the DOM
  (so it reads correctly even for clients that don't run JavaScript, e.g.
  the iOS Shortcuts "Get Contents of Webpage" action). On
  `hukam.dosanjhlabs.com` with no `src`/`id` given, this renders the
  side-by-side triptych instead of a single card.
- `GET /api/hukamnama?src=<sources>` — JSON `{id, source, citation, text,
  verses, translations}` for a new random entry.
- `GET /api/triptych` — JSON `{aad, dasam, sarbloh}`, one fresh random
  entry per granth, for the hub domain's default view.
- `GET /api/translation?id=<id>&en=<key>&pu=<key|off>` — JSON for the same
  entry with a different translation layer applied.
- `GET /api/next?id=<id>&src=<sources>` / `/api/prev` — JSON for the
  neighboring entry.
- `GET /text` — the same random entry as plain text (`Content-Type:
  text/plain`), for the simplest possible Shortcuts/automation integration.
- `GET /sources` — human-readable text provenance page.
- `GET /manifest.webmanifest` — web app manifest (Add to Home Screen).

`src` is a comma-separated subset of that domain's sources: `dasam,sarbloh`
on `dasam.dosanjhlabs.com`, or `aad,dasam,sarbloh` on
`hukam.dosanjhlabs.com` (e.g. `?src=aad` there shows SGGS only). It has
no effect on `sggs.dosanjhlabs.com` or `sarbloh.dosanjhlabs.com`, which
each only ever have the one source.

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
   - `https://sarbloh.dosanjhlabs.com/text` — Sri Sarbloh Granth Sahib Ji
   - `https://hukam.dosanjhlabs.com/text` — all three
   - Add `?src=aad`, `?src=dasam`, or `?src=sarbloh` to the combined URL to
     pin a Shortcut to just one granth (e.g.
     `https://hukam.dosanjhlabs.com/text?src=sarbloh`).
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

## Known follow-ups

Two of the earlier feature ideas are intentionally not implemented yet,
since both need infrastructure this Worker doesn't have:

- **A fixed "today's hukamnama" + archive** would need durable per-day
  state (e.g. a KV namespace binding) rather than the current pure
  random-pick-per-request model.
- **Jump to a specific Ang/page** isn't offered because the underlying
  data is keyed by banidb's shabad IDs, not by physical Ang/page number —
  building this correctly needs an Ang→shabad-ID index that doesn't exist
  in the current datasets.
