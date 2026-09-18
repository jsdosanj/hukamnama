# Sources & Text Provenance

This app serves random Vaaks (Hukamnamas) from three granths. This document
records where each dataset came from, so anyone can trace and re-verify the
text.

## Sri Guru Granth Sahib Ji (`public/data/aad.json`)

Gurmukhi text paired line-by-line with English translation, carried over
from the original `aad_hukamnama` repository's `adi_maharaj_sbds.js`
(5,538 entries, keyed 1–5540). This is a long-standing community shabad
database; it has not been re-verified character-for-character against a
second source as part of this change. If you find a discrepancy against an
authoritative source (e.g. SGGS pothis, Sikhitothemax/Banidb), please open
an issue with the entry id and the correction.

## Sri Dasam Granth Sahib Ji (`public/data/dasam.json`)

Gurmukhi text paired line-by-line with English translation, carried over
from the original repositories' `dasam_sbd.js` (5,407 entries, keyed
7402–12808). Covers the full Dasam Bani corpus, including Charitropakhyan,
per an explicit decision to keep the corpus unfiltered on this site.

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

## Selection pool

- `sggs.dosanjhlabs.com` draws only from Sri Guru Granth Sahib Ji.
- `dasam.dosanjhlabs.com` draws from Sri Dasam Granth Sahib Ji and Sri
  Sarbloh Granth Sahib Ji combined by default, with a toggle to narrow to
  either one.

Both domains are served by the same Cloudflare Worker, which chooses the
dataset purely from the request's hostname — there is no shared
client-side state between the two sites.
