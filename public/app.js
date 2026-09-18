(function () {
  "use strict";

  // ---- Hero carousel ----
  // Only the active slide and the one queued up next ever have a real
  // `src` — the rest keep their image behind data-src until their turn,
  // so a visit only ever pulls down two of the ten banners.
  (function initHeroCarousel() {
    const carousel = document.getElementById("hero-carousel");
    if (!carousel) return;
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

  const state = {
    rawText: readJsonScript("raw-text") || "",
    meta: readJsonScript("entry-meta") || {},
  };
  // bodyText excludes the citation line, so the exported image doesn't
  // repeat the citation once as a heading and again as body copy.
  state.bodyText = state.rawText.replace(/^.*?\n\n/, "");

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

  function currentSrcParam() {
    const params = new URLSearchParams(location.search);
    return params.get("src") || (state.meta.sources || []).join(",");
  }

  // Track the current id/source ourselves rather than re-reading location.search,
  // since the initial server-rendered page does not put its own id in the URL bar.
  state.currentId = state.meta.id;

  function applyEntry(entry) {
    state.rawText = `${entry.citation}\n\n${entry.text}`;
    state.bodyText = entry.text;
    state.meta = { id: entry.id, source: entry.source, citation: entry.citation, theme: entry.theme, border: entry.border };
    state.currentId = entry.id;

    const citationEl = document.querySelector(".citation");
    if (citationEl) {
      citationEl.innerHTML = `${escapeHtml(entry.citationGurmukhi || entry.citation)}<br><span class="citation-en">${escapeHtml(
        entry.citation
      )}</span>`;
    }

    const verseBlock = document.getElementById("verse-block");
    if (verseBlock) verseBlock.innerHTML = renderLinesHtml(entry.text);

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
    history.pushState({}, "", url);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function classifyLines(text) {
    return text.split("\n").map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return { type: "blank", text: "" };
      if (GURMUKHI_RE.test(trimmed)) return { type: "gurmukhi", text: trimmed };
      return { type: "translation", text: trimmed };
    });
  }

  function renderLinesHtml(text) {
    const lines = classifyLines(text);
    const out = [];
    let para = [];
    let paraType = null;
    const flush = () => {
      if (!para.length) return;
      const cls = paraType === "gurmukhi" ? "verse" : "translation";
      out.push(`<p class="${cls}">${para.join("<br>")}</p>`);
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

  async function fetchEntry(path) {
    const url = new URL(path, location.origin);
    if (state.currentId) url.searchParams.set("id", state.currentId);
    const src = currentSrcParam();
    if (src) url.searchParams.set("src", src);
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
        applyEntry(await res.json());
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

  const copyTextBtn = document.getElementById("copy-text-btn");
  if (copyTextBtn) {
    copyTextBtn.addEventListener("click", async () => {
      const text = state.rawText;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setStatus("Copied to clipboard.", 2500);
      } catch (e) {
        setStatus("Couldn't copy — try selecting the text manually.", 4000);
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
        await document.fonts.load('700 40px "Noto Serif Gurmukhi"');
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

  async function buildShareCanvas() {
    await ensureFontsReady();
    const frameImg = document.getElementById("frame-img");
    await ensureImageLoaded(frameImg);
    const canvas = document.getElementById("export-canvas");
    const width = 1080;
    const paddingX = width * 0.12;
    const contentWidth = width - paddingX * 2;

    const measureCtx = canvas.getContext("2d");
    measureCtx.font = '600 34px "Noto Serif Gurmukhi", serif';
    const lines = classifyLines(state.bodyText).filter((l) => l.type !== "blank");

    let estHeight = 260; // header / citation area
    const wrapped = [];
    for (const line of lines) {
      const font =
        line.type === "gurmukhi"
          ? '600 34px "Noto Serif Gurmukhi", serif'
          : 'italic 26px "Cormorant Garamond", serif';
      measureCtx.font = font;
      const wl = wrapText(measureCtx, line.text, contentWidth);
      const lineHeight = line.type === "gurmukhi" ? 54 : 40;
      for (const w of wl) {
        wrapped.push({ text: w, font, lineHeight, type: line.type });
        estHeight += lineHeight;
      }
      estHeight += 12;
    }
    estHeight += 160; // footer

    canvas.width = width;
    canvas.height = Math.max(estHeight, 900);
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
    roundRect(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.fill();

    const accentColors = { gold: "#7a1f2b", indigo: "#8a3324", accent: "#1a3a8f" };
    ctx.textAlign = "center";
    ctx.fillStyle = accentColors[state.meta.theme] || "#7a1f2b";
    ctx.font = '600 24px "Noto Serif Gurmukhi", serif';
    let y = cardY + 60;
    const citationLines = wrapText(ctx, state.meta.citation || "", cardW * 0.85);
    for (const cl of citationLines) {
      ctx.fillText(cl, width / 2, y);
      y += 32;
    }
    y += 24;

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

  const copyImageBtn = document.getElementById("copy-image-btn");
  if (copyImageBtn) {
    copyImageBtn.addEventListener("click", async () => {
      setStatus("Preparing image…");
      try {
        const canvas = await buildShareCanvas();
        const blob = await canvasToBlob(canvas);
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setStatus("Image copied to clipboard.", 3000);
        } else {
          triggerDownload(blob);
          setStatus("Copy isn't supported here — downloaded instead.", 4000);
        }
      } catch (e) {
        setStatus("Couldn't create the image.", 4000);
      }
    });
  }

  function triggerDownload(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hukamnama-${state.meta.id || "shabad"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const downloadImageBtn = document.getElementById("download-image-btn");
  if (downloadImageBtn) {
    downloadImageBtn.addEventListener("click", async () => {
      setStatus("Preparing image…");
      try {
        const canvas = await buildShareCanvas();
        const blob = await canvasToBlob(canvas);
        triggerDownload(blob);
        setStatus("Image saved.", 2500);
      } catch (e) {
        setStatus("Couldn't create the image.", 4000);
      }
    });
  }
})();
