(function () {
  "use strict";

  // ---- Hero carousel ----
  // Only the active slide and the one queued up next ever have a real
  // `src` — the rest keep their image behind data-src until their turn, so
  // a visit only ever pulls down two of the ten banners.
  (function initHeroCarousel() {
    const carousels = Array.from(document.querySelectorAll(".hero-carousel"));
    carousels.forEach((carousel) => {
      const slides = Array.from(carousel.querySelectorAll(".hero-slide"));
      const dots = Array.from(carousel.querySelectorAll(".hero-dot"));
      if (slides.length < 2) return;

      let current = slides.findIndex((s) => s.classList.contains("active"));
      if (current < 0) current = 0;
      let timer = null;
      const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      function ensureLoaded(index) {
        const img = slides[index];
        if (img.dataset.src && !img.src) img.src = img.dataset.src;
      }

      function goTo(index) {
        if (index === current) return;
        ensureLoaded(index);
        slides[current].classList.remove("active");
        if (dots[current]) dots[current].classList.remove("active");
        slides[index].classList.add("active");
        if (dots[index]) dots[index].classList.add("active");
        current = index;
        ensureLoaded((current + 1) % slides.length); // pre-warm the next one
      }

      function next() {
        goTo((current + 1) % slides.length);
      }

      function startAutoplay() {
        if (reduceMotion) return;
        stopAutoplay();
        timer = setInterval(next, 5500);
      }

      function stopAutoplay() {
        if (timer) clearInterval(timer);
        timer = null;
      }

      ensureLoaded((current + 1) % slides.length);

      dots.forEach((dot, i) => {
        dot.addEventListener("click", () => {
          goTo(i);
          startAutoplay();
        });
      });

      carousel.addEventListener("mouseenter", stopAutoplay);
      carousel.addEventListener("mouseleave", startAutoplay);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopAutoplay();
        else startAutoplay();
      });

      startAutoplay();
    });
  })();

  const GURMUKHI_RE = /[਀-੿]/;

  function readJsonScript(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toLarivaar(text) {
    return text.replace(/\s+/g, "");
  }

  const meta = readJsonScript("entry-meta") || {};
  const isTriptych = !!meta.triptych;

  const statusEl = document.getElementById("status");
  function setStatus(msg, timeout) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    if (timeout) {
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = "";
      }, timeout);
    }
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* private browsing / storage disabled — preference just won't persist */
    }
  }

  let larivaarOn = readStorage("hukamnama:larivaar") === "1";

  // ==== Single-entry page (sggs / dasam / sarbloh, and non-default hukam.dosanjhlabs.com views) ====
  if (!isTriptych) {
    const state = {
      rawText: readJsonScript("raw-text") || "",
      meta,
      verses: null,
    };
    state.bodyText = state.rawText.replace(/^.*?\n\n/, "");
    state.currentId = state.meta.id;
    state.prefs = state.meta.prefs || {};

    function currentSrcParam() {
      const params = new URLSearchParams(location.search);
      return params.get("src") || (state.meta.sources || []).join(",");
    }

    function storedPrefsFor(source) {
      const raw = readStorage(`hukamnama:prefs:${source}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    function buildVerseHtml(entry) {
      if (entry.verses) {
        return entry.verses
          .map((v) => {
            const gText = larivaarOn ? toLarivaar(v.g) : v.g;
            let html = `<p class="verse${larivaarOn ? " larivaar" : ""}">${escapeHtml(gText)}</p>`;
            if (v.en) html += `\n<p class="translation">${escapeHtml(v.en)}</p>`;
            if (v.pu) html += `\n<p class="translation-alt">${escapeHtml(v.pu)}</p>`;
            return html;
          })
          .join("\n");
      }
      return renderFlatLinesHtml(entry.text);
    }

    function classifyLines(text) {
      return text.split("\n").map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return { type: "blank", text: "" };
        if (GURMUKHI_RE.test(trimmed)) return { type: "gurmukhi", text: trimmed };
        return { type: "translation", text: trimmed };
      });
    }

    function renderFlatLinesHtml(text) {
      const lines = classifyLines(text);
      const out = [];
      let para = [];
      let paraType = null;
      const flush = () => {
        if (!para.length) return;
        const cls = paraType === "gurmukhi" ? "verse" : "translation";
        const joined = paraType === "gurmukhi" && larivaarOn ? para.map(toLarivaar) : para;
        out.push(`<p class="${cls}${paraType === "gurmukhi" && larivaarOn ? " larivaar" : ""}">${joined.join("<br>")}</p>`);
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
      return out.join("\n");
    }

    function renderSettingsPanel(entry) {
      const panel = document.getElementById("settings-panel");
      if (!panel) return;
      const opts = entry.translations;
      let html = "";
      if (opts) {
        const enChips = opts.en
          .map(
            (o) =>
              `<button type="button" class="settings-chip${o.key === state.prefs.en ? " active" : ""}" data-kind="en" data-key="${o.key}">${escapeHtml(o.label)}</button>`
          )
          .join("");
        const puChips = [{ key: "off", label: "Off" }, ...opts.pu]
          .map(
            (o) =>
              `<button type="button" class="settings-chip${(o.key === "off" ? !state.prefs.pu : o.key === state.prefs.pu) ? " active" : ""}" data-kind="pu" data-key="${o.key}">${escapeHtml(o.label)}</button>`
          )
          .join("");
        html += `
          <div class="settings-group">
            <h3>English translation</h3>
            <div class="settings-options" data-kind-group="en">${enChips}</div>
          </div>
          <div class="settings-group">
            <h3>Punjabi commentary</h3>
            <div class="settings-options" data-kind-group="pu">${puChips}</div>
          </div>`;
      }
      html += `
          <div class="settings-group">
            <h3>Reading style</h3>
            <div class="settings-options">
              <button type="button" class="settings-chip${larivaarOn ? " active" : ""}" id="larivaar-toggle" data-kind="larivaar">Larivaar (joined)</button>
            </div>
          </div>`;
      // Keep the <summary> (first child) and replace everything after it.
      const summary = panel.querySelector("summary");
      panel.innerHTML = "";
      if (summary) panel.appendChild(summary);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      Array.from(wrapper.children).forEach((child) => panel.appendChild(child));
    }

    function applyEntry(entry) {
      state.rawText = `${entry.citation}\n\n${entry.text}`;
      state.bodyText = entry.text;
      state.meta = { id: entry.id, source: entry.source, citation: entry.citation, theme: entry.theme, border: entry.border };
      state.currentId = entry.id;
      state.verses = entry.verses || null;
      if (entry.prefs) state.prefs = entry.prefs;

      const citationEl = document.querySelector(".citation");
      if (citationEl) {
        citationEl.innerHTML = `${escapeHtml(entry.citationGurmukhi || entry.citation)}<br><span class="citation-en">${escapeHtml(
          entry.citation
        )}</span>`;
      }

      const verseBlock = document.getElementById("verse-block");
      if (verseBlock) verseBlock.innerHTML = buildVerseHtml(entry);

      renderSettingsPanel(entry);

      // The border/colour theme follows the entry's own granth, not the
      // domain, so on a combined site (or the toggleable dasam+sarbloh one)
      // picking a new entry can change which frame is shown.
      if (entry.theme) {
        document.body.className = document.body.className
          .split(/\s+/)
          .filter((c) => !c.startsWith("theme-"))
          .concat(`theme-${entry.theme}`)
          .join(" ");
      }
      if (entry.border) {
        const frame = document.getElementById("letter-frame");
        if (frame) frame.style.setProperty("--frame-image", `url('${entry.border}')`);
        const frameImg = document.getElementById("frame-img");
        if (frameImg && frameImg.getAttribute("src") !== entry.border) {
          frameImg.src = entry.border;
        }
      }

      const url = new URL(location.href);
      url.searchParams.set("id", entry.id);
      if (currentSrcParam()) url.searchParams.set("src", currentSrcParam());
      if (state.prefs.en) url.searchParams.set("en", state.prefs.en);
      if (state.prefs.pu) url.searchParams.set("pu", state.prefs.pu);
      history.pushState({}, "", url);
    }

    async function fetchEntry(path, extraParams) {
      const url = new URL(path, location.origin);
      if (state.currentId) url.searchParams.set("id", state.currentId);
      const src = currentSrcParam();
      if (src) url.searchParams.set("src", src);
      if (state.prefs.en) url.searchParams.set("en", state.prefs.en);
      url.searchParams.set("pu", state.prefs.pu || "off");
      if (extraParams) {
        for (const k of Object.keys(extraParams)) url.searchParams.set(k, extraParams[k]);
      }
      const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("Network error");
      return res.json();
    }

    const newBtn = document.getElementById("new-btn");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");

    if (newBtn) {
      newBtn.addEventListener("click", async () => {
        newBtn.disabled = true;
        try {
          const url = new URL("/api/hukamnama", location.origin);
          url.searchParams.set("_", Date.now().toString());
          const src = currentSrcParam();
          if (src) url.searchParams.set("src", src);
          const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
          if (!res.ok) throw new Error("Network error");
          const entry = await res.json();
          // A fresh random pick resets to that source's default translation
          // rather than carrying over a choice that may not apply to it.
          state.prefs = entry.prefs;
          applyEntry(entry);
          setStatus("");
        } catch (e) {
          setStatus("Could not load a new hukamnama — check your connection.", 4000);
        } finally {
          newBtn.disabled = false;
        }
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener("click", async () => {
        try {
          applyEntry(await fetchEntry("/api/prev"));
        } catch (e) {
          setStatus("Could not load the previous entry.", 4000);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", async () => {
        try {
          applyEntry(await fetchEntry("/api/next"));
        } catch (e) {
          setStatus("Could not load the next entry.", 4000);
        }
      });
    }

    // ---- Translation / Larivaar settings (event delegation, since the
    // settings panel's chip buttons get rebuilt on every new entry) ----
    document.addEventListener("click", async (e) => {
      const chip = e.target.closest(".settings-chip");
      if (!chip) return;
      const kind = chip.dataset.kind;

      if (kind === "larivaar") {
        larivaarOn = !larivaarOn;
        writeStorage("hukamnama:larivaar", larivaarOn ? "1" : "0");
        chip.classList.toggle("active", larivaarOn);
        const verseBlock = document.getElementById("verse-block");
        if (verseBlock) {
          const fakeEntry = { verses: state.verses, text: state.bodyText };
          verseBlock.innerHTML = buildVerseHtml(fakeEntry);
        }
        return;
      }

      if (kind === "en" || kind === "pu") {
        const key = chip.dataset.key;
        if (kind === "en") state.prefs.en = key;
        if (kind === "pu") state.prefs.pu = key === "off" ? null : key;
        writeStorage(`hukamnama:prefs:${state.meta.source}`, JSON.stringify(state.prefs));
        setStatus("Loading translation…");
        try {
          const entry = await fetchEntry("/api/translation");
          applyEntry(entry);
          setStatus("");
        } catch (err) {
          setStatus("Couldn't load that translation.", 4000);
        }
      }
    });

    // Apply any saved per-source translation preference on first load (the
    // server-rendered page always starts from that source's default).
    (function restoreSavedPrefs() {
      if (!state.meta.source) return;
      const saved = storedPrefsFor(state.meta.source);
      if (!saved) return;
      const changed = (saved.en && saved.en !== state.prefs.en) || (saved.pu && saved.pu !== state.prefs.pu);
      if (!changed) return;
      state.prefs = { en: saved.en || state.prefs.en, pu: saved.pu || null };
      fetchEntry("/api/translation")
        .then(applyEntry)
        .catch(() => {});
    })();

    if (larivaarOn) {
      const toggle = document.getElementById("larivaar-toggle");
      if (toggle) toggle.classList.add("active");
      const verseBlock = document.getElementById("verse-block");
      if (verseBlock && state.meta.id) {
        // Re-render the server-rendered verses in Larivaar immediately.
        verseBlock.querySelectorAll("p.verse").forEach((p) => {
          p.textContent = toLarivaar(p.textContent);
          p.classList.add("larivaar");
        });
      }
    }

    const copyTextBtn = document.getElementById("copy-text-btn");
    if (copyTextBtn) {
      copyTextBtn.addEventListener("click", async () => {
        const text = `${state.rawText}\n\n${state.meta.canonicalUrl || location.href}`;
        try {
          await copyToClipboard(text);
          setStatus("Copied to clipboard.", 2500);
        } catch (e) {
          setStatus("Couldn't copy — try selecting the text manually.", 4000);
        }
      });
    }

    setupImageExport(state);
    setupShare(() => `${state.rawText}\n\n${state.meta.canonicalUrl || location.href}`, () => buildShareCanvasFor(state));
  }

  // ==== Triptych page (hukam.dosanjhlabs.com default "All Three" view) ====
  if (isTriptych) {
    const state = { entries: {} };
    const order = meta.sources || ["dasam", "aad", "sarbloh"];

    function renderColumn(source, entry) {
      const col = document.querySelector(`.letter-frame-col[data-source="${source}"]`);
      if (!col) return;
      const citationEl = col.querySelector(".citation");
      if (citationEl) {
        citationEl.innerHTML = `${escapeHtml(entry.citationGurmukhi || entry.citation)}<br><span class="citation-en">${escapeHtml(entry.citation)}</span>`;
      }
      const verseBlock = col.querySelector(".verse-block");
      if (verseBlock) {
        if (entry.verses) {
          verseBlock.innerHTML = entry.verses
            .map((v) => {
              let html = `<p class="verse">${escapeHtml(v.g)}</p>`;
              if (v.en) html += `\n<p class="translation">${escapeHtml(v.en)}</p>`;
              return html;
            })
            .join("\n");
        } else {
          verseBlock.innerHTML = entry.text
            .split("\n\n")
            .map((para) => `<p class="translation">${escapeHtml(para)}</p>`)
            .join("\n");
        }
      }
      state.entries[source] = entry;
    }

    const newBtn = document.getElementById("new-btn");
    if (newBtn) {
      newBtn.addEventListener("click", async () => {
        newBtn.disabled = true;
        setStatus("Fetching new hukamnamas…");
        try {
          const url = new URL("/api/triptych", location.origin);
          url.searchParams.set("src", order.join(","));
          const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
          if (!res.ok) throw new Error("Network error");
          const data = await res.json();
          order.forEach((source) => renderColumn(source, data[source]));
          setStatus("");
        } catch (e) {
          setStatus("Could not load new hukamnamas — check your connection.", 4000);
        } finally {
          newBtn.disabled = false;
        }
      });
    }

    function allText() {
      return order
        .map((s) => {
          const e = state.entries[s];
          return e ? `${e.citation}\n\n${e.text}` : "";
        })
        .filter(Boolean)
        .join("\n\n---\n\n");
    }

    const copyTextBtn = document.getElementById("copy-text-btn");
    if (copyTextBtn) {
      copyTextBtn.addEventListener("click", async () => {
        const text = allText() || readJsonScript("raw-text") || "";
        try {
          await copyToClipboard(text);
          setStatus("Copied to clipboard.", 2500);
        } catch (e) {
          setStatus("Couldn't copy — try selecting the text manually.", 4000);
        }
      });
    }

    setupShare(() => allText() || readJsonScript("raw-text") || "", null);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  // ---- Native share sheet (mobile Safari/Chrome) ----
  function setupShare(getText, getCanvas) {
    const shareBtn = document.getElementById("share-btn");
    if (!shareBtn || !navigator.share) return;
    shareBtn.style.display = "";
    shareBtn.addEventListener("click", async () => {
      try {
        const text = getText();
        let files;
        if (getCanvas && navigator.canShare) {
          try {
            const canvas = await getCanvas();
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            const file = new File([blob], "hukamnama.png", { type: "image/png" });
            if (navigator.canShare({ files: [file] })) files = [file];
          } catch (e) {
            /* fall back to text-only share below */
          }
        }
        await navigator.share(files ? { files, text } : { text });
      } catch (e) {
        /* user cancelled the share sheet — nothing to do */
      }
    });
  }

  // ---- Image export (Copy as Image / Save Image) ----

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  async function ensureFontsReady() {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.load('700 40px "Mukta Mahee"');
        await document.fonts.load('italic 28px "Cormorant Garamond"');
        await document.fonts.ready;
      } catch (e) {
        /* best effort */
      }
    }
  }

  function ensureImageLoaded(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
      setTimeout(resolve, 3000); // don't block export forever on a slow/broken load
    });
  }

  function classifyLinesForExport(text) {
    return text.split("\n").map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return { type: "blank", text: "" };
      if (GURMUKHI_RE.test(trimmed)) return { type: "gurmukhi", text: trimmed };
      return { type: "translation", text: trimmed };
    });
  }

  // Export resolution: try for 4K-equivalent width first, stepping down to
  // 1440p- then 1080p-equivalent (the hard floor — never lower) if the
  // estimated pixel area risks exceeding what older mobile browsers allow
  // a single canvas to hold (iOS Safari has historically capped this
  // around 16M px). Since wrap width changes with resolution, height is
  // re-estimated at each tier rather than just scaled.
  const BASE_WIDTH = 1080; // the width the original design proportions were tuned at
  const RESOLUTION_TIERS = [3840, 2560, 1920]; // 4K, 1440p, 1080p-floor
  const SAFE_CANVAS_AREA = 16_000_000;

  function measureAtScale(measureCtx, width, scale, bodyText) {
    const paddingX = width * 0.12;
    const contentWidth = width - paddingX * 2;
    measureCtx.font = `600 ${34 * scale}px "Mukta Mahee", serif`;
    const lines = classifyLinesForExport(bodyText).filter((l) => l.type !== "blank");

    let estHeight = 260 * scale; // header / citation area
    const wrapped = [];
    for (const line of lines) {
      const font =
        line.type === "gurmukhi"
          ? `600 ${34 * scale}px "Mukta Mahee", serif`
          : `italic ${26 * scale}px "Cormorant Garamond", serif`;
      measureCtx.font = font;
      const wl = wrapText(measureCtx, line.text, contentWidth);
      const lineHeight = (line.type === "gurmukhi" ? 54 : 40) * scale;
      for (const w of wl) {
        wrapped.push({ text: w, font, lineHeight, type: line.type });
        estHeight += lineHeight;
      }
      estHeight += 12 * scale;
    }
    estHeight += 160 * scale; // footer

    return { wrapped, height: Math.max(estHeight, 900 * scale), paddingX, contentWidth };
  }

  function pickResolution(measureCtx, bodyText) {
    let fallback = null;
    for (const width of RESOLUTION_TIERS) {
      const scale = width / BASE_WIDTH;
      const layout = measureAtScale(measureCtx, width, scale, bodyText);
      const candidate = { width, scale, ...layout };
      if (!fallback) fallback = candidate; // smallest tier seen so far == last in list == the 1080p floor
      if (width * layout.height <= SAFE_CANVAS_AREA) {
        return candidate;
      }
      fallback = candidate;
    }
    return fallback; // every tier exceeded the safe area — use the smallest (1080p) anyway, per the hard floor
  }

  async function buildShareCanvasFor(state) {
    await ensureFontsReady();
    const frameImg = document.getElementById("frame-img");
    await ensureImageLoaded(frameImg);
    const canvas = document.getElementById("export-canvas");
    const measureCtx = canvas.getContext("2d");

    const { width, scale, wrapped, height } = pickResolution(measureCtx, state.bodyText);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (frameImg.complete && frameImg.naturalWidth) {
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#f7f0df";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const cardX = width * 0.1;
    const cardY = canvas.height * 0.09;
    const cardW = width * 0.8;
    const cardH = canvas.height * 0.82;
    ctx.fillStyle = "rgba(255,253,246,0.95)";
    roundRect(ctx, cardX, cardY, cardW, cardH, 24 * scale);
    ctx.fill();

    const accentColors = { gold: "#7a1f2b", indigo: "#8a3324", accent: "#1a3a8f" };
    ctx.textAlign = "center";
    ctx.fillStyle = accentColors[state.meta.theme] || "#7a1f2b";
    ctx.font = `600 ${24 * scale}px "Mukta Mahee", serif`;
    let y = cardY + 60 * scale;
    const citationLines = wrapText(ctx, state.meta.citation || "", cardW * 0.85);
    for (const cl of citationLines) {
      ctx.fillText(cl, width / 2, y);
      y += 32 * scale;
    }
    y += 24 * scale;

    for (const w of wrapped) {
      ctx.font = w.font;
      ctx.fillStyle = w.type === "gurmukhi" ? "#262019" : "#4a4034";
      ctx.fillText(w.text, width / 2, y);
      y += w.lineHeight;
    }

    return canvas;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  function triggerDownload(blob, id) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hukamnama-${id || "shabad"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function setupImageExport(state) {
    const copyImageBtn = document.getElementById("copy-image-btn");
    if (copyImageBtn) {
      copyImageBtn.addEventListener("click", async () => {
        setStatus("Preparing image…");
        try {
          const canvas = await buildShareCanvasFor(state);
          const blob = await canvasToBlob(canvas);
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            setStatus("Image copied to clipboard.", 3000);
          } else {
            triggerDownload(blob, state.meta.id);
            setStatus("Copy isn't supported here — downloaded instead.", 4000);
          }
        } catch (e) {
          setStatus("Couldn't create the image.", 4000);
        }
      });
    }

    const downloadImageBtn = document.getElementById("download-image-btn");
    if (downloadImageBtn) {
      downloadImageBtn.addEventListener("click", async () => {
        setStatus("Preparing image…");
        try {
          const canvas = await buildShareCanvasFor(state);
          const blob = await canvasToBlob(canvas);
          triggerDownload(blob, state.meta.id);
          setStatus("Image saved.", 2500);
        } catch (e) {
          setStatus("Couldn't create the image.", 4000);
        }
      });
    }
  }
})();
