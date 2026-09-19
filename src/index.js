// Hukamnama — a single Cloudflare Worker serving three granths across four
// domains.
//
// sggs.dosanjhlabs.com     -> Sri Guru Granth Sahib Ji only
// dasam.dosanjhlabs.com    -> Sri Dasam Granth Sahib Ji + Sri Sarbloh Granth Sahib Ji
// sarbloh.dosanjhlabs.com  -> Sri Sarbloh Granth Sahib Ji only
// hukam.dosanjhlabs.com    -> all three, together, via a dropdown selector
//
// Routing is purely by request hostname, server-side, with no shared
// client-side toggle state — each domain only ever has access to its own
// dataset, so the sites cannot bleed into each other.

const GURMUKHI_RE = /[਀-੿]/;

// The border art and colour theme follow the ENTRY actually being shown,
// not the site/domain — so the same shabad always looks the same everywhere,
// and the combined hukam.dosanjhlabs.com can switch its frame per pick.
const SOURCE_THEME = {
  aad: { theme: "gold", border: "/borders/border-gold.webp" },
  dasam: { theme: "indigo", border: "/borders/border-indigo.webp" },
  sarbloh: { theme: "accent", border: "/borders/border-accent.webp" },
};

// Rotating hero banner shown atop every page (and reused, one at a time, as
// a slimmer strip inside the FAQ/Sources pages). Only the first is rendered
// as a real <img src>; the rest carry data-src and are faded in one at a
// time by app.js, so a visitor only ever downloads two of these at once.
const HERO_BANNERS = [
  "/images/banners/banner-01-sangat.webp",
  "/images/banners/banner-02-manuscript.webp",
  "/images/banners/banner-03-court.webp",
  "/images/banners/banner-04-musicians.webp",
  "/images/banners/banner-05-goldentemple.webp",
  "/images/banners/banner-06-canopy.webp",
  "/images/banners/banner-07-sketch.webp",
  "/images/banners/banner-08-falcon.webp",
  "/images/banners/banner-09-darbar.webp",
  "/images/banners/banner-10-academy.webp",
];

function heroCarouselHtml() {
  const slides = HERO_BANNERS.map((src, i) => {
    if (i === 0) {
      return `<img class="hero-slide active" src="${src}" alt="" loading="eager" fetchpriority="high">`;
    }
    return `<img class="hero-slide" data-src="${src}" alt="" loading="lazy">`;
  }).join("\n      ");
  const dots = HERO_BANNERS.map(
    (_, i) => `<button type="button" class="hero-dot${i === 0 ? " active" : ""}" data-index="${i}" aria-label="Show banner ${i + 1}"></button>`
  ).join("");
  return `
  <div class="hero-carousel" id="hero-carousel" aria-hidden="true">
    <div class="hero-slides">
      ${slides}
    </div>
    <div class="hero-dots">${dots}</div>
  </div>`;
}

// A single static banner (a different one per page, picked by index) used
// inside the FAQ/Sources pages so the collection of 10 photographs shows up
// throughout the site, not only in the top-of-page carousel.
function bannerStripHtml(index) {
  const src = HERO_BANNERS[index % HERO_BANNERS.length];
  return `<div class="banner-strip"><img src="${src}" alt="" loading="lazy"></div>`;
}

const SITES = {
  sggs: {
    hostnames: ["sggs.dosanjhlabs.com"],
    id: "sggs",
    title: "Sri Guru Granth Sahib Ji",
    titleGurmukhi: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
    tagline: "Vaak — A Living Word from the Eternal Guru",
    sources: ["aad"],
    toggle: false,
  },
  dasam: {
    hostnames: ["dasam.dosanjhlabs.com"],
    id: "dasam",
    title: "Sri Dasam Granth & Sri Sarbloh Granth",
    titleGurmukhi: "ਸ੍ਰੀ ਦਸਮ ਗ੍ਰੰਥ ਤੇ ਸ੍ਰੀ ਸਰਬਲੋਹ ਗ੍ਰੰਥ",
    tagline: "Vaak — A Living Word from the Tenth Master",
    sources: ["dasam", "sarbloh"],
    toggle: "pills",
    toggleOptions: [
      { keys: ["dasam", "sarbloh"], label: "Both" },
      { keys: ["dasam"], label: "Dasam Granth" },
      { keys: ["sarbloh"], label: "Sarbloh Granth" },
    ],
  },
  sarbloh: {
    hostnames: ["sarbloh.dosanjhlabs.com"],
    id: "sarbloh",
    title: "Sri Sarbloh Granth Sahib Ji",
    titleGurmukhi: "ਸ੍ਰੀ ਸਰਬਲੋਹ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
    tagline: "Vaak — A Living Word from the Sarbloh Granth",
    sources: ["sarbloh"],
    toggle: false,
  },
  all: {
    hostnames: ["hukam.dosanjhlabs.com", "hukamnama.dosanjhlabs.com"],
    id: "all",
    title: "Sri Guru Granth Sahib, Dasam Granth & Sarbloh Granth",
    titleGurmukhi: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ, ਦਸਮ ਗ੍ਰੰਥ ਤੇ ਸਰਬਲੋਹ ਗ੍ਰੰਥ",
    tagline: "GurVaak — Your Conversation with Your Guru",
    sources: ["aad", "dasam", "sarbloh"],
    toggle: "dropdown",
    // The default ("All Three") renders a side-by-side triptych rather than
    // one random pick from the union — see renderTriptych below. Every
    // other option behaves like the single-card view on the other domains.
    toggleGroups: [
      { label: null, options: [{ keys: ["aad", "dasam", "sarbloh"], label: "All Three Granths" }] },
      {
        label: "Single Granth",
        options: [
          { keys: ["aad"], label: "Sri Guru Granth Sahib Ji" },
          { keys: ["dasam"], label: "Sri Dasam Granth Sahib Ji" },
          { keys: ["sarbloh"], label: "Sri Sarbloh Granth Sahib Ji" },
        ],
      },
      {
        label: "Two Granths",
        options: [
          { keys: ["aad", "dasam"], label: "SGGS + Dasam Granth" },
          { keys: ["aad", "sarbloh"], label: "SGGS + Sarbloh Granth" },
          { keys: ["dasam", "sarbloh"], label: "Dasam Granth + Sarbloh Granth" },
        ],
      },
    ],
  },
};

// Translation layers available per source. "en" is loaded with the base
// dataset (small — one layer of English per verse); "pu" translations are
// full verse-by-verse Punjabi exegesis, so they live in a separate, much
// larger static asset (aad.pu.json / dasam.pu.json) that's only fetched the
// first time a visitor actually asks to see one. Dr. Sant Singh Khalsa's
// English rendering is intentionally not offered anywhere on this site.
const TRANSLATIONS = {
  aad: {
    en: [{ key: "ms", label: "Bhai Manmohan Singh" }],
    pu: [
      { key: "ss", label: "Prof. Sahib Singh — Sri Guru Granth Sahib Darpan" },
      { key: "ft", label: "Fareedkot Teeka" },
    ],
  },
  dasam: {
    en: [{ key: "bdb", label: "banidb English" }],
    pu: [{ key: "ss", label: "Verse-by-verse Punjabi steek" }],
  },
};

const DATASETS = {
  aad: {
    file: "/data/aad.json",
    // Cloudflare's 25 MiB per-asset limit meant a combined Punjabi file
    // (Darpan + Teeka together) didn't fit — each commentary is its own
    // file, fetched only once a visitor actually selects it.
    puFiles: { ss: "/data/aad.pu.ss.json", ft: "/data/aad.pu.ft.json" },
    structured: true,
    label: "Sri Guru Granth Sahib Ji",
    labelGurmukhi: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
  },
  dasam: {
    file: "/data/dasam.json",
    puFiles: { ss: "/data/dasam.pu.ss.json" },
    structured: true,
    label: "Sri Dasam Granth Sahib Ji",
    labelGurmukhi: "ਸ੍ਰੀ ਦਸਮ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
  },
  sarbloh: {
    file: "/data/sarbloh.json",
    pagesFile: "/data/sarbloh_pages.json",
    structured: false,
    label: "Sri Sarbloh Granth Sahib Ji",
    labelGurmukhi: "ਸ੍ਰੀ ਸਰਬਲੋਹ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
  },
};

// In-memory per-isolate cache. Cloudflare reuses isolates across many
// requests, so this avoids re-fetching/re-parsing multi-MB JSON every time.
const cache = {
  datasets: new Map(), // name -> parsed JSON
  puDatasets: new Map(), // name -> parsed JSON (Punjabi layers, loaded lazily)
  sortedKeys: new Map(), // name -> string[] (sorted numeric)
  sarblohPages: null, // { [id]: pageNumber }
};

async function loadJSON(env, path) {
  const url = new URL(path, "https://assets.internal");
  const res = await env.ASSETS.fetch(new Request(url));
  if (!res.ok) throw new Error(`Failed to load asset ${path}: ${res.status}`);
  return res.json();
}

async function getDataset(env, name) {
  if (cache.datasets.has(name)) return cache.datasets.get(name);
  const meta = DATASETS[name];
  const data = await loadJSON(env, meta.file);
  cache.datasets.set(name, data);
  return data;
}

async function getPunjabiDataset(env, name, key) {
  const cacheKey = `${name}.${key}`;
  if (cache.puDatasets.has(cacheKey)) return cache.puDatasets.get(cacheKey);
  const meta = DATASETS[name];
  const file = meta.puFiles && meta.puFiles[key];
  if (!file) return {};
  const data = await loadJSON(env, file);
  cache.puDatasets.set(cacheKey, data);
  return data;
}

async function getSortedKeys(env, name) {
  if (cache.sortedKeys.has(name)) return cache.sortedKeys.get(name);
  const data = await getDataset(env, name);
  const keys = Object.keys(data).sort((a, b) => Number(a) - Number(b));
  cache.sortedKeys.set(name, keys);
  return keys;
}

async function getSarblohPages(env) {
  if (cache.sarblohPages) return cache.sarblohPages;
  cache.sarblohPages = await loadJSON(env, DATASETS.sarbloh.pagesFile);
  return cache.sarblohPages;
}

function siteForHostname(hostname) {
  for (const site of Object.values(SITES)) {
    if (site.hostnames.includes(hostname)) return site;
  }
  return null;
}

function flatOptions(site) {
  if (site.toggleOptions) return site.toggleOptions;
  if (site.toggleGroups) return site.toggleGroups.flatMap((g) => g.options);
  return null;
}

function parseSourcesParam(site, raw) {
  if (!site.toggle) return site.sources;
  if (!raw) return site.sources;
  const requested = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = requested.filter((s) => site.sources.includes(s));
  return valid.length ? valid : site.sources;
}

// Default translation choice for a source: English defaults to that
// source's first (only) English layer; Punjabi defaults to "off" so the
// page reads exactly as it always has unless a visitor opts in.
function defaultTranslationPrefs(source) {
  const opts = TRANSLATIONS[source];
  if (!opts) return { en: null, pu: null };
  return { en: opts.en[0].key, pu: null };
}

function parseTranslationPrefs(source, url) {
  const opts = TRANSLATIONS[source];
  const defaults = defaultTranslationPrefs(source);
  if (!opts) return defaults;
  const enParam = url.searchParams.get("en");
  const puParam = url.searchParams.get("pu");
  const en = opts.en.some((o) => o.key === enParam) ? enParam : defaults.en;
  const pu = puParam === "off" || puParam === null ? (puParam === "off" ? null : defaults.pu) : (opts.pu.some((o) => o.key === puParam) ? puParam : defaults.pu);
  return { en, pu };
}

async function pickRandomEntry(env, sourceNames) {
  const pools = await Promise.all(
    sourceNames.map(async (name) => ({ name, keys: await getSortedKeys(env, name) }))
  );
  const total = pools.reduce((sum, p) => sum + p.keys.length, 0);
  let idx = Math.floor(Math.random() * total);
  for (const p of pools) {
    if (idx < p.keys.length) return { source: p.name, id: p.keys[idx] };
    idx -= p.keys.length;
  }
  return { source: pools[0].name, id: pools[0].keys[0] };
}

function datasetForId(id) {
  const n = Number(id);
  if (n >= 1 && n <= 6000) return "aad";
  if (n >= 7000 && n <= 12999) return "dasam";
  if (n >= 13000) return "sarbloh";
  return null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Structured (aad/dasam) verse rendering ----

function buildStructuredEntry(source, id, record, puVerses, prefs) {
  const verses = record.g.map((g, i) => {
    const en = prefs.en ? (record[prefs.en] ? record[prefs.en][i] : null) : null;
    const pu = prefs.pu && puVerses ? puVerses[i] : null;
    return { g, en: en || null, pu: pu || null };
  });

  const textParts = [];
  for (const v of verses) {
    textParts.push(v.g);
    if (v.en) textParts.push(v.en);
    if (v.pu) textParts.push(v.pu);
    textParts.push("");
  }
  const text = textParts.join("\n").replace(/\n+$/, "");

  return { verses, text };
}

function structuredVersesHtml(verses, { larivaar } = {}) {
  return verses
    .map((v) => {
      const gText = larivaar ? toLarivaar(v.g) : v.g;
      let html = `<p class="verse${larivaar ? " larivaar" : ""}">${escapeHtml(gText)}</p>`;
      if (v.en) html += `\n<p class="translation">${escapeHtml(v.en)}</p>`;
      if (v.pu) html += `\n<p class="translation-alt">${escapeHtml(v.pu)}</p>`;
      return html;
    })
    .join("\n");
}

function toLarivaar(text) {
  return text.replace(/\s+/g, "");
}

// ---- Flat-text (sarbloh) rendering, unchanged from the original format ----

function classifyLines(text) {
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: "blank", text: "" };
    if (GURMUKHI_RE.test(trimmed)) return { type: "gurmukhi", text: trimmed };
    return { type: "translation", text: trimmed };
  });
}

function renderLines(text) {
  const lines = classifyLines(text);
  const html = [];
  let para = [];
  let paraType = null;

  const flush = () => {
    if (!para.length) return;
    const cls = paraType === "gurmukhi" ? "verse" : "translation";
    html.push(`<p class="${cls}">${para.join("<br>")}</p>`);
    para = [];
    paraType = null;
  };

  for (const line of lines) {
    if (line.type === "blank") {
      flush();
      continue;
    }
    if (paraType && paraType !== line.type) flush();
    paraType = line.type;
    para.push(escapeHtml(line.text));
  }
  flush();
  return html.join("\n");
}

async function loadEntry(env, source, id, prefs) {
  const meta = DATASETS[source];
  const data = await getDataset(env, source);
  const record = data[id];
  if (record === undefined) return null;

  let citation = meta.label;
  let citationGurmukhi = meta.labelGurmukhi;
  let text;
  let verses = null;

  if (meta.structured) {
    const effectivePrefs = prefs || defaultTranslationPrefs(source);
    let puVerses = null;
    if (effectivePrefs.pu) {
      const puData = await getPunjabiDataset(env, source, effectivePrefs.pu);
      puVerses = puData[id] || null;
    }
    const built = buildStructuredEntry(source, id, record, puVerses, effectivePrefs);
    verses = built.verses;
    text = built.text;
  } else {
    text = record;
    if (source === "sarbloh") {
      const pages = await getSarblohPages(env);
      const page = pages[id];
      if (page) {
        citation = `${citation} · Page ${page}`;
        citationGurmukhi = `${citationGurmukhi} · ਪੰਨਾ ${page}`;
      }
    }
  }

  return { id, source, text, verses, citation, citationGurmukhi };
}

async function neighborId(env, source, id, direction) {
  const keys = await getSortedKeys(env, source);
  const idx = keys.indexOf(String(id));
  if (idx === -1) return keys[0];
  const nextIdx = (idx + direction + keys.length) % keys.length;
  return keys[nextIdx];
}

function verseHtmlFor(entry, opts) {
  if (entry.verses) return structuredVersesHtml(entry.verses, opts);
  return renderLines(entry.text);
}

function sourceControlHtml(site, activeSources) {
  if (!site.toggle) return "";
  if (site.toggle === "dropdown") {
    const groups = site.toggleGroups;
    const activeSet = [...activeSources].sort().join(",");
    const renderOption = (o) => {
      const key = o.keys.join(",");
      const isActive = [...o.keys].sort().join(",") === activeSet;
      return `<option value="${encodeURIComponent(key)}"${isActive ? " selected" : ""}>${escapeHtml(o.label)}</option>`;
    };
    const body = groups
      .map((g) =>
        g.label
          ? `<optgroup label="${escapeHtml(g.label)}">${g.options.map(renderOption).join("")}</optgroup>`
          : g.options.map(renderOption).join("")
      )
      .join("");
    return `
    <form class="source-select-wrap" action="/" method="get">
      <select name="src" class="source-select" onchange="this.form.submit()" aria-label="Choose bani source">
        ${body}
      </select>
      <noscript><button type="submit" class="btn btn-outline" style="margin-top:8px">Go</button></noscript>
    </form>`;
  }
  // "pills" — a handful of options, shown as a wrap-friendly toggle group.
  const activeSet = [...activeSources].sort().join(",");
  return `
    <div class="source-toggle" role="tablist" aria-label="Choose bani source">
      ${site.toggleOptions
        .map((o) => {
          const key = o.keys.join(",");
          const isActive = [...o.keys].sort().join(",") === activeSet;
          return `<a role="tab" aria-selected="${isActive}" class="toggle-btn${
            isActive ? " active" : ""
          }" href="/?src=${encodeURIComponent(key)}">${escapeHtml(o.label)}</a>`;
        })
        .join("")}
    </div>`;
}

function settingsPanelHtml(source) {
  const opts = TRANSLATIONS[source];
  let translationGroups = "";
  if (opts) {
    const defaults = defaultTranslationPrefs(source);
    const enChips = opts.en
      .map(
        (o) =>
          `<button type="button" class="settings-chip${o.key === defaults.en ? " active" : ""}" data-kind="en" data-key="${o.key}">${escapeHtml(o.label)}</button>`
      )
      .join("");
    const puChips = [{ key: "off", label: "Off" }, ...opts.pu]
      .map(
        (o) =>
          `<button type="button" class="settings-chip${o.key === "off" ? " active" : ""}" data-kind="pu" data-key="${o.key}">${escapeHtml(o.label)}</button>`
      )
      .join("");
    translationGroups = `
      <div class="settings-group">
        <h3>English translation</h3>
        <div class="settings-options" data-kind-group="en">${enChips}</div>
      </div>
      <div class="settings-group">
        <h3>Punjabi commentary</h3>
        <div class="settings-options" data-kind-group="pu">${puChips}</div>
      </div>`;
  }
  return `
    <details class="settings-panel" id="settings-panel">
      <summary>Translations &amp; display</summary>
      ${translationGroups}
      <div class="settings-group">
        <h3>Reading style</h3>
        <div class="settings-options">
          <button type="button" class="settings-chip" id="larivaar-toggle" data-kind="larivaar">Larivaar (joined)</button>
        </div>
      </div>
    </details>`;
}

function pageHtml({ site, entry, activeSources, prefs }) {
  const rawTextJson = JSON.stringify(`${entry.citation}\n\n${entry.text}`);
  const verseHtml = verseHtmlFor(entry);
  const { theme, border } = SOURCE_THEME[entry.source];
  const themeClass = `theme-${theme}`;
  const canonicalUrl = `https://${site.hostnames[0]}/?id=${entry.id}${activeSources.length !== site.sources.length ? `&src=${activeSources.join(",")}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#16265f">
<title>${escapeHtml(site.title)} — Hukamnama</title>
<meta name="description" content="A daily Vaak from ${escapeHtml(site.title)}, presented as a hand-illuminated letter.">
<link rel="canonical" href="${canonicalUrl}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Mukta+Mahee:wght@400;500;600;700&family=Noto+Serif+Gurmukhi:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="icon" href="/icons/icon-192.png">
<script type="application/json" id="raw-text">${rawTextJson}</script>
<script type="application/json" id="entry-meta">${JSON.stringify({
    id: entry.id,
    source: entry.source,
    citation: entry.citation,
    sources: activeSources,
    theme,
    border,
    prefs,
    canonicalUrl,
  })}</script>
</head>
<body class="${themeClass}">
  ${heroCarouselHtml()}
  <main class="page">
    <div class="ornament ornament-top" aria-hidden="true"></div>
    <header class="masthead">
      <p class="eyebrow">${escapeHtml(site.tagline)}</p>
      <h1 class="site-title">${escapeHtml(site.titleGurmukhi)}</h1>
      <p class="site-title-en">${escapeHtml(site.title)}</p>
    </header>

    ${sourceControlHtml(site, activeSources)}

    <section class="letter-frame" id="letter-frame" style="--frame-image:url('${border}')">
      <div class="letter-inner">
        <p class="citation">${escapeHtml(entry.citationGurmukhi)}<br><span class="citation-en">${escapeHtml(
    entry.citation
  )}</span></p>
        <div class="verse-block" id="verse-block">
          ${verseHtml}
        </div>
      </div>
    </section>

    <nav class="controls" aria-label="Hukamnama controls">
      <div class="controls-row">
        <button type="button" class="btn btn-ghost" id="prev-btn" aria-label="Previous">&larr;&nbsp;Previous</button>
        <button type="button" class="btn btn-primary" id="new-btn">New Hukamnama</button>
        <button type="button" class="btn btn-ghost" id="next-btn" aria-label="Next">Next&nbsp;&rarr;</button>
      </div>
      <div class="controls-row">
        <button type="button" class="btn btn-outline" id="copy-text-btn">Copy Text</button>
        <button type="button" class="btn btn-outline" id="copy-image-btn">Copy as Image</button>
        <button type="button" class="btn btn-outline" id="download-image-btn">Save Image</button>
        <button type="button" class="btn btn-outline" id="share-btn" style="display:none">Share</button>
      </div>
      ${settingsPanelHtml(entry.source)}
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </nav>

    <footer class="site-footer">
      <p>ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖ਼ਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ</p>
      <p class="footnote"><a href="/sources">Sources &amp; text provenance</a> &middot; <a href="/faq">FAQ &amp; Shortcuts setup</a></p>
    </footer>
  </main>

  <canvas id="export-canvas" style="display:none" aria-hidden="true"></canvas>
  <img id="frame-img" src="${border}" style="display:none" alt="" crossorigin="anonymous">
  <script src="/app.js" defer></script>
</body>
</html>`;
}

// ---- "All Three" triptych: Dasam (30%, left) / SGGS (40%, middle) /
// Sarbloh (30%, right), each an independent random pick from its own
// granth rather than one pick from the union. ----

const TRIPTYCH_ORDER = ["dasam", "aad", "sarbloh"];
const TRIPTYCH_LABEL = {
  aad: "Sri Guru Granth Sahib Ji",
  dasam: "Sri Dasam Granth Sahib Ji",
  sarbloh: "Sri Sarbloh Granth Sahib Ji",
};

async function pickTriptych(env) {
  const entries = {};
  for (const source of TRIPTYCH_ORDER) {
    const keys = await getSortedKeys(env, source);
    const id = keys[Math.floor(Math.random() * keys.length)];
    const prefs = defaultTranslationPrefs(source);
    entries[source] = await loadEntry(env, source, id, prefs);
  }
  return entries;
}

function triptychColumnHtml(source, entry) {
  const { theme, border } = SOURCE_THEME[source];
  const verseHtml = verseHtmlFor(entry);
  return `
    <div class="letter-frame-col theme-${theme}" data-source="${source}">
      <p class="col-label">${escapeHtml(TRIPTYCH_LABEL[source])}</p>
      <section class="letter-frame" style="--frame-image:url('${border}')">
        <div class="letter-inner">
          <p class="citation">${escapeHtml(entry.citationGurmukhi)}<br><span class="citation-en">${escapeHtml(entry.citation)}</span></p>
          <div class="verse-block">${verseHtml}</div>
        </div>
      </section>
    </div>`;
}

function triptychResponse(entries) {
  const out = {};
  for (const source of TRIPTYCH_ORDER) {
    out[source] = entryResponse(entries[source]);
  }
  return out;
}

function triptychPageHtml({ site, entries }) {
  const rawText = TRIPTYCH_ORDER.map((s) => `${entries[s].citation}\n\n${entries[s].text}`).join("\n\n---\n\n");
  const columns = TRIPTYCH_ORDER.map((s) => triptychColumnHtml(s, entries[s])).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#16265f">
<title>${escapeHtml(site.title)} — Hukamnama</title>
<meta name="description" content="Today's Vaak from all three granths, side by side.">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Mukta+Mahee:wght@400;500;600;700&family=Noto+Serif+Gurmukhi:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="icon" href="/icons/icon-192.png">
<script type="application/json" id="raw-text">${JSON.stringify(rawText)}</script>
<script type="application/json" id="entry-meta">${JSON.stringify({ triptych: true, sources: TRIPTYCH_ORDER })}</script>
</head>
<body class="theme-gold">
  ${heroCarouselHtml()}
  <main class="page" style="max-width:1200px">
    <header class="masthead">
      <p class="eyebrow">${escapeHtml(site.tagline)}</p>
      <h1 class="site-title">${escapeHtml(site.titleGurmukhi)}</h1>
      <p class="site-title-en">${escapeHtml(site.title)}</p>
    </header>

    ${sourceControlHtml(site, site.sources)}

    <div class="triptych" id="triptych">
      ${columns}
    </div>

    <nav class="controls" aria-label="Hukamnama controls">
      <div class="controls-row">
        <button type="button" class="btn btn-primary" id="new-btn">New Hukamnama</button>
      </div>
      <div class="controls-row">
        <button type="button" class="btn btn-outline" id="copy-text-btn">Copy All Text</button>
        <button type="button" class="btn btn-outline" id="share-btn" style="display:none">Share</button>
      </div>
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </nav>

    <footer class="site-footer">
      <p>ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖ਼ਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ</p>
      <p class="footnote"><a href="/sources">Sources &amp; text provenance</a> &middot; <a href="/faq">FAQ &amp; Shortcuts setup</a></p>
    </footer>
  </main>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

function sourcesPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sources &amp; Provenance — Hukamnama</title>
<link rel="stylesheet" href="/style.css">
</head>
<body class="theme-gold">
<main class="page sources-page">
  <h1>Sources &amp; Text Provenance</h1>
  <section>
    <h2>Sri Guru Granth Sahib Ji</h2>
    <p>Gurmukhi text keyed to banidb.com's shabad IDs. English translation is Bhai Manmohan Singh's; Punjabi commentary options are Professor Sahib Singh's <em>Sri Guru Granth Sahib Darpan</em> and the classical Fareedkot Teeka, both selectable from the "Translations &amp; display" panel below each hukamnama. Dr. Sant Singh Khalsa's English translation is intentionally not offered on this site.</p>
  </section>
  ${bannerStripHtml(1)}
  <section>
    <h2>Sri Dasam Granth Sahib Ji</h2>
    <p>Gurmukhi text with banidb's English translation, including the complete Dasam Bani corpus, plus a selectable verse-by-verse Punjabi steek.</p>
  </section>
  <section>
    <h2>Sri Sarbloh Granth Sahib Ji</h2>
    <p>Digitized from <em>Sampooran Sri Sarbloh Granth Sahib</em>, published under the authority of Singh Sahib Baba Santa Singh Ji, Jathedar, Panth Akali Buddha Dal (Sri Satguru Jagjit Singh Ji eLibrary digitization, archive.org). Gurmukhi text is OCR-derived from the published Granth; the accompanying English rendering is a machine translation of that OCR text and has not been independently reviewed by a scholar &mdash; please treat it as a study aid rather than an authoritative translation. Front matter, indices, and publisher pages were excluded from the random selection pool; each entry cites its page number in that published edition.</p>
  </section>
  ${bannerStripHtml(5)}
  <p><a href="/">&larr; Back</a> &middot; <a href="/faq">FAQ &amp; Shortcuts setup</a></p>
</main>
</body>
</html>`;
}

const RESOURCE_LINKS = [
  { href: "https://sikhi.io", label: "Sikhi.io", desc: "Open-source Gurbani apps and developer tools for the Sikh community." },
  { href: "https://sikhiuni.com", label: "Sikh University", desc: "Free online courses on Sikh history, philosophy, and the Sikh way of life." },
  { href: "https://sikhinteractive.com", label: "Sikh Interactive", desc: "Interactive lessons and games for learning Gurmukhi and Sikhi fundamentals." },
  { href: "https://punjabiuni.com", label: "Punjabi University", desc: "Structured lessons for learning to read and write Punjabi in Gurmukhi script." },
  { href: "https://huggingface.co/datasets/jsdosanj/SikhLibrary", label: "SikhLibrary dataset (Hugging Face)", desc: "The research corpus this site's Sarbloh Granth text was digitized from." },
  { href: "https://basicsofsikhi.com", label: "Basics of Sikhi", desc: "Video talks and educational content introducing core Sikh teachings." },
  { href: "https://forms.monday.com/forms/79d204bbfd466e71a18f6744dc5efd9f?r=use1", label: "Basics of Sikhi speaker request form", desc: "Request a Basics of Sikhi speaker for an event or gathering." },
];

function faqPageHtml() {
  const resources = RESOURCE_LINKS.map(
    (r) => `<li><a href="${r.href}">${escapeHtml(r.label)}</a><span class="resource-desc">${escapeHtml(r.desc)}</span></li>`
  ).join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FAQ &amp; Shortcuts Setup — Hukamnama</title>
<meta name="description" content="How to set up iOS Shortcuts for daily hukamnamas, and related Sikhi resources.">
<link rel="stylesheet" href="/style.css">
</head>
<body class="theme-gold">
<main class="page faq-page">
  <img class="faq-hero" src="/images/manuscript-hero.webp" alt="" loading="eager">
  <h1>FAQ &amp; Shortcuts Setup</h1>

  <details open>
    <summary>What is this site?</summary>
    <div class="faq-body">
      <p>A daily Vaak (Hukamnama) drawn at random from Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib Ji, and Sri Sarbloh Granth Sahib Ji &mdash; presented as an illuminated letter. There are four addresses:</p>
      <ul>
        <li><a href="https://sggs.dosanjhlabs.com">sggs.dosanjhlabs.com</a> &mdash; Sri Guru Granth Sahib Ji only</li>
        <li><a href="https://dasam.dosanjhlabs.com">dasam.dosanjhlabs.com</a> &mdash; Dasam Granth &amp; Sarbloh Granth</li>
        <li><a href="https://sarbloh.dosanjhlabs.com">sarbloh.dosanjhlabs.com</a> &mdash; Sri Sarbloh Granth Sahib Ji only</li>
        <li><a href="https://hukam.dosanjhlabs.com">hukam.dosanjhlabs.com</a> &mdash; all three, together (side by side by default), separately, or any two at once, via the dropdown at the top</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>How accurate is the text?</summary>
    <div class="faq-body">
      <p>Sri Guru Granth Sahib Ji and Sri Dasam Granth Sahib Ji have been checked entry-by-entry against banidb.com. Sri Sarbloh Granth Sahib Ji is OCR from a published edition and hasn't been independently proofread. Full details, sources, and caveats are on the <a href="/sources">Sources &amp; provenance</a> page.</p>
    </div>
  </details>

  <details>
    <summary>How do the translation and display options work?</summary>
    <div class="faq-body">
      <p>Under each hukamnama, open <strong>Translations &amp; display</strong> to choose an English translation, turn on a Punjabi commentary (Professor Sahib Singh's Darpan or the Fareedkot Teeka for SGGS; a verse-by-verse steek for Dasam Granth), or switch the Gurmukhi to Larivaar (joined, with no gaps between words, the way gurbani is printed in a saroop). Your choice is remembered on this device.</p>
    </div>
  </details>

  ${bannerStripHtml(3)}

  <details>
    <summary>Set up an iOS Shortcut &mdash; iOS 26 (step by step)</summary>
    <div class="faq-body">
      <ol>
        <li>Open the <strong>Shortcuts</strong> app &rarr; tap <strong>+</strong> in the top corner to create a new shortcut.</li>
        <li>Tap <strong>Add Action</strong>, search for <strong>Get Contents of URL</strong>, and add it.</li>
        <li>Tap the URL field and enter one of:
          <ul>
            <li><code>https://sggs.dosanjhlabs.com/text</code></li>
            <li><code>https://dasam.dosanjhlabs.com/text</code></li>
            <li><code>https://sarbloh.dosanjhlabs.com/text</code></li>
            <li><code>https://hukam.dosanjhlabs.com/text</code> (add <code>?src=aad</code>, <code>?src=dasam</code>, or <code>?src=sarbloh</code> to pin it to one granth, or e.g. <code>?src=aad,dasam</code> for two)</li>
          </ul>
        </li>
        <li>Add another action &mdash; <strong>Show Result</strong>, <strong>Speak Text</strong>, <strong>Send Message</strong>, or <strong>Show Notification</strong> all work. When it asks for input, choose <strong>Contents of URL</strong> (offered automatically from the step above).</li>
        <li>Tap the shortcut's name at the top to rename it (e.g. "Hukamnama"), then tap <strong>Done</strong>.</li>
        <li>Optional: tap the settings icon on the shortcut, turn on <strong>Add to Home Screen</strong>, or set up an <strong>Automation</strong> (e.g. every morning at 6am) so it runs on its own.</li>
      </ol>
    </div>
  </details>

  <details>
    <summary>Set up an iOS Shortcut &mdash; iOS 27 (prompt-based)</summary>
    <div class="faq-body">
      <p>If your Shortcuts app can build a shortcut from a plain-language description, you can skip the manual steps above and just give it a prompt like one of these:</p>
      <ul>
        <li>"Create a shortcut that fetches <code>https://sggs.dosanjhlabs.com/text</code> and shows me the result."</li>
        <li>"Create a shortcut that fetches <code>https://dasam.dosanjhlabs.com/text</code> and speaks the result out loud."</li>
        <li>"Create a shortcut that fetches <code>https://hukam.dosanjhlabs.com/text?src=aad,dasam</code> and sends it to me as a notification every morning at 6am."</li>
      </ul>
      <p>Swap in whichever domain and <code>?src=</code> combination you want (see the step-by-step section above for the full list) &mdash; the prompt only needs to name the URL and what to do with the text it gets back.</p>
    </div>
  </details>

  <details>
    <summary>Related resources</summary>
    <div class="faq-body">
      <ul>
        ${resources}
      </ul>
    </div>
  </details>

  <p><a href="/">&larr; Back</a> &middot; <a href="/sources">Sources &amp; text provenance</a></p>
</main>
</body>
</html>`;
}

async function handleApi(env, url, site) {
  const idParam = url.searchParams.get("id");
  const sourcesParam = url.searchParams.get("src");
  const activeSources = parseSourcesParam(site, sourcesParam);

  let source;
  let id;
  if (idParam && datasetForId(idParam) && activeSources.includes(datasetForId(idParam))) {
    source = datasetForId(idParam);
    id = idParam;
  } else {
    const picked = await pickRandomEntry(env, activeSources);
    source = picked.source;
    id = picked.id;
  }
  const prefs = parseTranslationPrefs(source, url);
  const entry = await loadEntry(env, source, id, prefs);

  return Response.json({ ...entryResponse(entry), prefs });
}

async function handleTriptych(env) {
  const entries = await pickTriptych(env);
  return Response.json(triptychResponse(entries));
}

async function handleNeighbor(env, url, site, direction) {
  const idParam = url.searchParams.get("id");
  const sourcesParam = url.searchParams.get("src");
  const activeSources = parseSourcesParam(site, sourcesParam);
  const source = (idParam && datasetForId(idParam)) || activeSources[0];
  const nid = await neighborId(env, source, idParam, direction);
  const prefs = parseTranslationPrefs(source, url);
  const entry = await loadEntry(env, source, nid, prefs);
  return Response.json({ ...entryResponse(entry), prefs });
}

async function handleTranslation(env, url) {
  const id = url.searchParams.get("id");
  const source = id && datasetForId(id);
  if (!source || !DATASETS[source].structured) return Response.json({ error: "not found" }, { status: 404 });
  const prefs = parseTranslationPrefs(source, url);
  const entry = await loadEntry(env, source, id, prefs);
  if (!entry) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ...entryResponse(entry), prefs });
}

function entryResponse(entry) {
  return {
    id: entry.id,
    source: entry.source,
    citation: entry.citation,
    citationGurmukhi: entry.citationGurmukhi,
    text: entry.text,
    verses: entry.verses,
    translations: TRANSLATIONS[entry.source] || null,
    ...SOURCE_THEME[entry.source],
  };
}

function manifestJson() {
  return JSON.stringify({
    name: "Hukamnama",
    short_name: "Hukamnama",
    description: "A daily Vaak from Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib Ji & Sri Sarbloh Granth Sahib Ji.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1230",
    theme_color: "#16265f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}

function landingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hukamnama</title>
<link rel="stylesheet" href="/style.css">
</head>
<body class="theme-gold">
<main class="page landing-page">
  <h1>Hukamnama</h1>
  <p>This service is reached via its dedicated addresses:</p>
  <ul>
    <li><a href="https://sggs.dosanjhlabs.com">sggs.dosanjhlabs.com</a> — Sri Guru Granth Sahib Ji</li>
    <li><a href="https://dasam.dosanjhlabs.com">dasam.dosanjhlabs.com</a> — Sri Dasam Granth &amp; Sri Sarbloh Granth</li>
    <li><a href="https://sarbloh.dosanjhlabs.com">sarbloh.dosanjhlabs.com</a> — Sri Sarbloh Granth Sahib Ji</li>
    <li><a href="https://hukam.dosanjhlabs.com">hukam.dosanjhlabs.com</a> — all three granths, together</li>
  </ul>
</main>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const site = siteForHostname(url.hostname);

    if (!site) {
      if (url.pathname === "/") {
        return new Response(landingHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/manifest.webmanifest") {
      return new Response(manifestJson(), { headers: { "content-type": "application/manifest+json" } });
    }
    if (url.pathname === "/api/hukamnama") {
      return handleApi(env, url, site);
    }
    if (url.pathname === "/api/triptych") {
      return handleTriptych(env);
    }
    if (url.pathname === "/api/translation") {
      return handleTranslation(env, url);
    }
    if (url.pathname === "/api/next") {
      return handleNeighbor(env, url, site, 1);
    }
    if (url.pathname === "/api/prev") {
      return handleNeighbor(env, url, site, -1);
    }
    if (url.pathname === "/sources") {
      return new Response(sourcesPageHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/faq") {
      return new Response(faqPageHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/text") {
      const sourcesParam = url.searchParams.get("src");
      const activeSources = parseSourcesParam(site, sourcesParam);
      const picked = await pickRandomEntry(env, activeSources);
      const prefs = parseTranslationPrefs(picked.source, url);
      const entry = await loadEntry(env, picked.source, picked.id, prefs);
      return new Response(`${entry.citation}\n\n${entry.text}`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/") {
      const sourcesParam = url.searchParams.get("src");
      const activeSources = parseSourcesParam(site, sourcesParam);

      // The hub domain's default ("All Three") renders the side-by-side
      // triptych instead of a single card — see pickTriptych/triptychPageHtml.
      if (site.toggle === "dropdown" && activeSources.length === site.sources.length && !url.searchParams.get("id")) {
        const entries = await pickTriptych(env);
        return new Response(triptychPageHtml({ site, entries }), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      const idParam = url.searchParams.get("id");
      let source;
      let id;
      if (idParam && datasetForId(idParam) && activeSources.includes(datasetForId(idParam))) {
        source = datasetForId(idParam);
        id = idParam;
      } else {
        const picked = await pickRandomEntry(env, activeSources);
        source = picked.source;
        id = picked.id;
      }
      const prefs = parseTranslationPrefs(source, url);
      const entry = await loadEntry(env, source, id, prefs);
      const html = pageHtml({ site, entry, activeSources, prefs });
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return env.ASSETS.fetch(request);
  },
};
