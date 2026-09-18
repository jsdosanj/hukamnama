# Sources & Text Provenance

This app serves random Vaaks (Hukamnamas) from three granths. This document
records where each dataset came from, so anyone can trace and re-verify the
text.

## Sri Guru Granth Sahib Ji (`public/data/aad.json`)

Gurmukhi text paired line-by-line with English translation, carried over
from the original `aad_hukamnama` repository's `adi_maharaj_sbds.js`
(5,538 entries, keyed 1–5540).

## Sri Dasam Granth Sahib Ji (`public/data/dasam.json`)

Gurmukhi text paired line-by-line with English translation, carried over
from the original repositories' `dasam_sbd.js` (5,407 entries, keyed
7402–12808). Covers the full Dasam Bani corpus, including Charitropakhyan,
per an explicit decision to keep the corpus unfiltered on this site.

## Verification: SGGS + Dasam Granth against banidb.com

Both datasets turned out to already be keyed by banidb.com's own shabad
IDs (confirmed by direct sampling), so every entry was cross-checked
against the live `api.banidb.com/v2/shabads/{id}` endpoint — an
independent, community-maintained Gurbani database that is itself one of
`jsdosanj/SikhLibrary`'s cited sources for Dasam Granth
(`Gurbani/Dasam_Granth_Hazoor_Sahib_(BaniDB)`). This was an exact,
exhaustive, automated diff of the Gurmukhi text for every entry, not a
sample:

- **SGGS: 5,538 / 5,538 entries matched exactly.** Zero discrepancies.
- **Dasam Granth: 5,405 / 5,407 matched exactly.** Two entries had a
  single-character OCR/typo error each, both now fixed to match banidb:
  - id `7988`: `ਕਾਨ੍ਰਹਰੇ` → `ਕਾਨ੍ਹਰੇ` (stray inserted ਰ)
  - id `9868`: `ਲੇਾਂਡੀ` → `ਲੇਂਡੀ` (malformed double vowel-sign from OCR)

A separate, supplementary check was run against SikhLibrary's *own* raw
OCR of SGGS and Dasam Granth (`Primary Scripture/1(-2). SGGSJ ... Bhaag_gurmukhi`
and `Primary Scripture/1(-2) Dasam Granth Sahib WC ..._gurmukhi`), by
searching for each sampled entry's text as a substring of that OCR corpus.
This was noisier: ~82% of a 200-entry SGGS sample matched verbatim, and
the Dasam Granth OCR barely matched at all. Investigating the misses
showed why: that raw OCR pass has real gaps (23 SGGS pages and 52 Dasam
Granth pages are simply missing from the extracted text, e.g. SGGS page
261 outright failed to extract) and visible cross-script OCR corruption
in the Dasam Granth file (stray Devanagari characters mid-word). In other
words, the misses trace back to holes/noise in that particular raw OCR
pass, not to errors in this app's data — which is exactly what the
banidb cross-check (the cleaner, curated source) already confirmed at
100% / 99.96%.

### Available alternate translations (not yet integrated)

banidb carries more than one translation per verse for both granths,
already aligned to the same shabad/verse IDs used here, which would be
straightforward to add later:

**SGGS** — English: Dr. Sant Singh Khalsa (`ssk`, the wording currently
baked into `aad.json`), Bhai Manmohan Singh (`bdb`, banidb's own default —
identical to `ssk` for many verses), and Dr. Manmohan Singh (`ms`, a
distinctly-worded alternate). Punjabi: **Professor Sahib Singh's *Sri Guru
Granth Sahib Darpan*** (`ss`, verse-by-verse exegesis, confirmed present
and substantive across a spread sample) and the classical **Fareedkot
Teeka** (`ft`).

**Dasam Granth** — English: only banidb's own default (`bdb`); no ssk/ms
equivalent exists for Dasam Granth. Punjabi: a verse-by-verse steek under
the same `ss` key (confirmed present and substantive), though it is not
established whether this is also Professor Sahib Singh's work specifically
for Dasam Granth or a different contributor banidb files under the same
key — `ft` (Fareedkot Teeka) is present in the API shape for Dasam Granth
but empty in practice, since that Teeka only ever covered SGGS.

`jsdosanj/SikhLibrary` separately holds a `Prof Sahib Singh` folder of his
scanned works, but as individual booklets (Japji Steek, Sidh Gosht Steek,
Slok Guru Angad Sahib Steek, Nitnem Steek, etc.) rather than a complete
verse-aligned SGGS Darpan — banidb's `ss` key is the more complete,
already-structured option if this gets added.

## Sri Sarbloh Granth Sahib Ji (`public/data/sarbloh.json`)

Newly added in this change. There was no Sarbloh Granth text in either
source repository before this. Source:

- **Work:** *Sampooran Sri Sarbloh Granth Sahib* (Gurmukhi, complete)
- **Publisher:** Published under the authority of Singh Sahib Baba Santa
  Singh Ji, Jathedar, Panth Akali Buddha Dal (Fifth Takht, Chakravarti),
  from Guru Ka Bagh, Sri Anandpur Sahib
- **Digitization:** Sri Satguru Jagjit Singh Ji eLibrary (`archive.org/details/namdhari`)
- **Retrieved via:** `jsdosanj/SikhLibrary` dataset on Hugging Face
  (`Aad Dasam Sarabloh Gutka Sahibs/Sampooran Sri Sarbloh Granth Sahib_gurmukhi`
  and `..._english`), OCR'd page images with page-aligned Gurmukhi text.

**Important caveat:** the Gurmukhi text is OCR output from the published
Granth and has not been proofread character-by-character against the
physical book. The accompanying English text is a *machine translation* of
that OCR output, generated for the SikhLibrary corpus — it has **not** been
reviewed by a scholar or translator, and should be treated as a study aid,
not an authoritative rendering. Front matter, the printed index of chhands,
publisher/library boilerplate, and a handful of stray pages were excluded
from the random-selection pool (see `scripts/build_sarbloh.py` for the
exact filtering logic). Each entry's citation includes the page number of
the published edition it came from, so it can be checked against the
source PDF directly.

If a better-vetted digitization of Sri Sarbloh Granth Sahib becomes
available (e.g. a proofread transcription), it should replace this dataset.

**On independent verification:** unlike SGGS and Dasam Granth (see
"Verification" below), there is no independent, non-OCR digitization of Sri
Sarbloh Granth Sahib to cross-check against — banidb.com does not carry this
granth, and the only other Gurmukhi copy in the SikhLibrary corpus
(`Gurbani/Sri Sarbloh Granth 12 Languages/punjabi`) is itself an AI
back-translation from English (`model: google/gemini-2.5-flash-lite`,
`source: translated_from_english` in its own page records), not a second
original source, so comparing against it would not be a meaningful check.
What was done instead: an automated integrity scan of all 1,026 entries for
OCR corruption signatures (Unicode replacement characters, stray control
characters, truncated/near-empty entries, runaway repeated characters) —
none were found; the only repeated-character hits were legitimate
decorative dividers from the printed edition (e.g. rows of `❀`). This
confirms the data is clean of common OCR failure modes, but does not confirm
word-for-word accuracy against the physical Granth.

## Selection pool

- `sggs.dosanjhlabs.com` draws only from Sri Guru Granth Sahib Ji.
- `dasam.dosanjhlabs.com` draws from Sri Dasam Granth Sahib Ji and Sri
  Sarbloh Granth Sahib Ji combined by default, with a toggle to narrow to
  either one.
- `hukam.dosanjhlabs.com` draws from all three granths combined by
  default, with a toggle to narrow to any one of them.

All three domains are served by the same Cloudflare Worker, which chooses
the dataset purely from the request's hostname — there is no shared
client-side state between the sites. The border art and colour theme
follow the entry actually shown (gold for SGGS, indigo for Dasam Granth,
blue for Sarbloh Granth), not the domain, so the same shabad always looks
the same wherever it's read.
