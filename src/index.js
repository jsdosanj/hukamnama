// Hukamnama — a single Cloudflare Worker serving three granths on three domains.
//
// sggs.dosanjhlabs.com     -> Sri Guru Granth Sahib Ji only
// dasam.dosanjhlabs.com    -> Sri Dasam Granth Sahib Ji + Sri Sarbloh Granth Sahib Ji
// hukam.dosanjhlabs.com -> all three, together, with a toggle
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

// Rotating hero banner shown atop every page. Only the first is rendered
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
    toggle: true,
    toggleOptions: [
      { keys: ["dasam", "sarbloh"], label: "Both" },
      { keys: ["dasam"], label: "Dasam Granth" },
      { keys: ["sarbloh"], label: "Sarbloh Granth" },
    ],
  },
  all: {
    hostnames: ["hukam.dosanjhlabs.com", "hukamnama.dosanjhlabs.com"],
    id: "all",
    title: "Sri Guru Granth Sahib, Dasam Granth & Sarbloh Granth",
    titleGurmukhi: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ, ਦਸਮ ਗ੍ਰੰਥ ਤੇ ਸਰਬਲੋਹ ਗ੍ਰੰਥ",
    tagline: "Vaak — One Word from Any of the Three Granths",
    sources: ["aad", "dasam", "sarbloh"],
    toggle: true,
    // Every non-empty combination of the three granths, so a visitor can
    // read them together, separately, or any two at once.
    toggleOptions: [
      { keys: ["aad", "dasam", "sarbloh"], label: "All Three" },
      { keys: ["aad"], label: "SGGS" },
      { keys: ["dasam"], label: "Dasam" },
      { keys: ["sarbloh"], label: "Sarbloh" },
      { keys: ["aad", "dasam"], label: "SGGS + Dasam" },
      { keys: ["aad", "sarbloh"], label: "SGGS + Sarbloh" },
      { keys: ["dasam", "sarbloh"], label: "Dasam + Sarbloh" },
    ],
  },
};

const DATASETS = {
  aad: {
    file: "/data/aad.json",
    label: "Sri Guru Granth Sahib Ji",
    labelGurmukhi: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
  },
  dasam: {
    file: "/data/dasam.json",
    label: "Sri Dasam Granth Sahib Ji",
    labelGurmukhi: "ਸ੍ਰੀ ਦਸਮ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
  },
  sarbloh: {
    file: "/data/sarbloh.json",
    pagesFile: "/data/sarbloh_pages.json",
    label: "Sri Sarbloh Granth Sahib Ji",
    labelGurmukhi: "ਸ੍ਰੀ ਸਰਬਲੋਹ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ",
  },
};

// In-memory per-isolate cache. Cloudflare reuses isolates across many
// requests, so this avoids re-fetching/re-parsing multi-MB JSON every time.
const cache = {
  datasets: new Map(), // name -> { [id]: text }
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

function parseSourcesParam(site, raw) {
  if (!site.toggle) return site.sources;
  if (!raw) return site.sources;
  const requested = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = requested.filter((s) => site.sources.includes(s));
  return valid.length ? valid : site.sources;
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

async function loadEntry(env, source, id) {
  const data = await getDataset(env, source);
  const text = data[id];
  if (text === undefined) return null;
  let citation = DATASETS[source].label;
  let citationGurmukhi = DATASETS[source].labelGurmukhi;
  if (source === "sarbloh") {
    const pages = await getSarblohPages(env);
    const page = pages[id];
    if (page) {
      citation = `${citation} · Page ${page}`;
      citationGurmukhi = `${citationGurmukhi} · ਪੰਨਾ ${page}`;
    }
  }
  return { id, source, text, citation, citationGurmukhi };
}

async function neighborId(env, source, id, direction) {
  const keys = await getSortedKeys(env, source);
  const idx = keys.indexOf(String(id));
  if (idx === -1) return keys[0];
  const nextIdx = (idx + direction + keys.length) % keys.length;
  return keys[nextIdx];
}

function classifyLines(text) {
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: "blank", text: "" };
    if (GURMUKHI_RE.test(trimmed)) return { type: "gurmukhi", text: trimmed };
    return { type: "translation", text: trimmed };
  });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function sourceOptionsHtml(site, activeSources) {
  if (!site.toggle || !site.toggleOptions) return "";
  const activeSet = [...activeSources].sort().join(",");
  return `
    <div class="source-toggle" role="tablist" aria-label="Choose bani source">
      ${site.toggleOptions
        .map((o) => {
          const key = o.keys.join(",");
          const isActive = [...o.keys].sort().join(",") === activeSet;
          return `<a role="tab" aria-selected="${isActive}" class="toggle-btn${
            isActive ? " active" : ""
          }" href="/?src=${encodeURIComponent(key)}">${o.label}</a>`;
        })
        .join("")}
    </div>`;
}

function pageHtml({ site, entry, activeSources }) {
  const rawTextJson = JSON.stringify(`${entry.citation}\n\n${entry.text}`);
  const verseHtml = renderLines(entry.text);
  const { theme, border } = SOURCE_THEME[entry.source];
  const themeClass = `theme-${theme}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6efe0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17140f" media="(prefers-color-scheme: dark)">
<title>${escapeHtml(site.title)} — Hukamnama</title>
<meta name="description" content="A daily Vaak from ${escapeHtml(site.title)}, presented as a hand-illuminated letter.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Gurmukhi:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="apple-touch-icon" href="/borders/border-accent.webp">
<script type="application/json" id="raw-text">${rawTextJson}</script>
<script type="application/json" id="entry-meta">${JSON.stringify({
    id: entry.id,
    source: entry.source,
    citation: entry.citation,
    sources: activeSources,
    theme,
    border,
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

    ${sourceOptionsHtml(site, activeSources)}

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
      </div>
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
    <p>Gurmukhi text with English translation, compiled from a long-standing community shabad database (Aad Guru Granth Sahib Ji verses, Mool Mantar through Mundavani).</p>
  </section>
  <section>
    <h2>Sri Dasam Granth Sahib Ji</h2>
    <p>Gurmukhi text with English translation, including the complete Dasam Bani corpus.</p>
  </section>
  <section>
    <h2>Sri Sarbloh Granth Sahib Ji</h2>
    <p>Digitized from <em>Sampooran Sri Sarbloh Granth Sahib</em>, published under the authority of Singh Sahib Baba Santa Singh Ji, Jathedar, Panth Akali Buddha Dal (Sri Satguru Jagjit Singh Ji eLibrary digitization, archive.org). Gurmukhi text is OCR-derived from the published Granth; the accompanying English rendering is a machine translation of that OCR text and has not been independently reviewed by a scholar &mdash; please treat it as a study aid rather than an authoritative translation. Front matter, indices, and publisher pages were excluded from the random selection pool; each entry cites its page number in that published edition.</p>
  </section>
  <p><a href="/">&larr; Back</a> &middot; <a href="/faq">FAQ &amp; Shortcuts setup</a></p>
</main>
</body>
</html>`;
}

function faqPageHtml() {
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
      <p>A daily Vaak (Hukamnama) drawn at random from Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib Ji, and Sri Sarbloh Granth Sahib Ji &mdash; presented as an illuminated letter. There are three addresses:</p>
      <ul>
        <li><a href="https://sggs.dosanjhlabs.com">sggs.dosanjhlabs.com</a> &mdash; Sri Guru Granth Sahib Ji only</li>
        <li><a href="https://dasam.dosanjhlabs.com">dasam.dosanjhlabs.com</a> &mdash; Dasam Granth &amp; Sarbloh Granth</li>
        <li><a href="https://hukam.dosanjhlabs.com">hukam.dosanjhlabs.com</a> &mdash; all three, together, separately, or any two at once, via the toggle at the top</li>
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
    <summary>Set up an iOS Shortcut &mdash; iOS 26 (step by step)</summary>
    <div class="faq-body">
      <ol>
        <li>Open the <strong>Shortcuts</strong> app &rarr; tap <strong>+</strong> in the top corner to create a new shortcut.</li>
        <li>Tap <strong>Add Action</strong>, search for <strong>Get Contents of URL</strong>, and add it.</li>
        <li>Tap the URL field and enter one of:
          <ul>
            <li><code>https://sggs.dosanjhlabs.com/text</code></li>
            <li><code>https://dasam.dosanjhlabs.com/text</code></li>
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
        <li><a href="https://sikhi.io">sikhi.io</a></li>
        <li><a href="https://sikhiuni.com">sikhiuni.com</a> &mdash; Sikh University</li>
        <li><a href="https://sikhinteractive.com">sikhinteractive.com</a></li>
        <li><a href="https://punjabiuni.com">punjabiuni.com</a></li>
        <li><a href="https://huggingface.co/datasets/jsdosanj/SikhLibrary">jsdosanj/SikhLibrary</a> on Hugging Face &mdash; the research corpus this site's Sarbloh Granth text comes from</li>
        <li><a href="https://basicsofsikhi.com">basicsofsikhi.com</a></li>
        <li><a href="https://forms.monday.com/forms/79d204bbfd466e71a18f6744dc5efd9f?r=use1">Basics of Sikhi &mdash; speaker request form</a></li>
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

  let entry;
  if (idParam && datasetForId(idParam) && activeSources.includes(datasetForId(idParam))) {
    entry = await loadEntry(env, datasetForId(idParam), idParam);
  }
  if (!entry) {
    const picked = await pickRandomEntry(env, activeSources);
    entry = await loadEntry(env, picked.source, picked.id);
  }

  return Response.json(entryResponse(entry));
}

async function handleNeighbor(env, url, site, direction) {
  const idParam = url.searchParams.get("id");
  const sourcesParam = url.searchParams.get("src");
  const activeSources = parseSourcesParam(site, sourcesParam);
  const source = (idParam && datasetForId(idParam)) || activeSources[0];
  const nid = await neighborId(env, source, idParam, direction);
  const entry = await loadEntry(env, source, nid);
  return Response.json(entryResponse(entry));
}

function entryResponse(entry) {
  return {
    id: entry.id,
    source: entry.source,
    citation: entry.citation,
    citationGurmukhi: entry.citationGurmukhi,
    text: entry.text,
    ...SOURCE_THEME[entry.source],
  };
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
<main class="page sources-page">
  <h1>Hukamnama</h1>
  <p>This service is reached via its dedicated addresses:</p>
  <ul>
    <li><a href="https://sggs.dosanjhlabs.com">sggs.dosanjhlabs.com</a> — Sri Guru Granth Sahib Ji</li>
    <li><a href="https://dasam.dosanjhlabs.com">dasam.dosanjhlabs.com</a> — Sri Dasam Granth &amp; Sri Sarbloh Granth</li>
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

    if (url.pathname === "/api/hukamnama") {
      return handleApi(env, url, site);
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
      const entry = await loadEntry(env, picked.source, picked.id);
      return new Response(`${entry.citation}\n\n${entry.text}`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/") {
      const sourcesParam = url.searchParams.get("src");
      const activeSources = parseSourcesParam(site, sourcesParam);
      const idParam = url.searchParams.get("id");
      let entry;
      if (idParam && datasetForId(idParam) && activeSources.includes(datasetForId(idParam))) {
        entry = await loadEntry(env, datasetForId(idParam), idParam);
      }
      if (!entry) {
        const picked = await pickRandomEntry(env, activeSources);
        entry = await loadEntry(env, picked.source, picked.id);
      }
      const html = pageHtml({ site, entry, activeSources });
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return env.ASSETS.fetch(request);
  },
};
