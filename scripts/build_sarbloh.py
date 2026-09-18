"""
Cleans the raw OCR'd + machine-translated page data for "Sampooran Sri
Sarbloh Granth Sahib" (see ../SOURCES.md) into a filtered list of
(page_number, gurmukhi_text, english_text) scripture entries, dropping
front matter, the printed chhand index, and publisher/library boilerplate.

Input (fetch once, not checked into this repo):
    sarbloh_gurmukhi_pages.json  -- extracted_pages.json from the HF dataset
    sarbloh_english_pages.json   -- translated_pages.json from the HF dataset

Output:
    sarbloh_entries.json  -- consumed by emit_sarbloh_json.py
"""
import json, re

GURMUKHI_RE = re.compile(r'[਀-੿]')
ADMIN_MARKERS = ['ਪ੍ਰਕਾਸ਼ਕ', 'THIS BOOK BELONGS', 'Publisher:', 'Jathedar', 'Library of',
                 'Meter No.', 'Table of Contents',
                 'ਸੂਚੀ ਪੱਤਰ', 'ਅਨੁਕ੍ਰਮਣਿਕਾ', 'ਸਫਾ', 'ਨੰ:']

def gurmukhi_ratio(text):
    if not text:
        return 0.0
    total = len(text)
    gc = len(GURMUKHI_RE.findall(text))
    return gc / max(total, 1)

def is_boilerplate(text):
    t = text.strip()
    if not t:
        return True
    if 'NamdhariElibrary' in t and len(t) < 250 and gurmukhi_ratio(t) < 0.05:
        return True
    return False

def clean_page_text(text):
    lines = text.split('\n')
    out = []
    for ln in lines:
        if 'NamdhariElibrary' in ln or 'Sri Satguru Jagjit Singh Ji eLibrary' in ln:
            continue
        if ln.strip().startswith('www.archive.org'):
            continue
        out.append(ln)
    cleaned = '\n'.join(out)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned

def admin_marker_count(text):
    return sum(1 for m in ADMIN_MARKERS if m in text)

g = json.load(open('sarbloh_gurmukhi_pages.json', encoding='utf-8'))
e = json.load(open('sarbloh_english_pages.json', encoding='utf-8'))
gp = g['pages']
ep = e['pages']

entries = []
skipped_admin = []
for k in sorted(gp.keys(), key=lambda x: int(x)):
    page_num = int(k)
    raw_g = gp[k]['text']
    raw_e = ep.get(k, {}).get('english_text', '')
    if is_boilerplate(raw_g):
        continue
    cg = clean_page_text(raw_g)
    ce = clean_page_text(raw_e)
    if gurmukhi_ratio(cg) < 0.15 or len(cg) < 40:
        continue
    if admin_marker_count(cg) + admin_marker_count(ce) >= 1:
        skipped_admin.append(page_num)
        continue
    entries.append((page_num, cg, ce))

print('Usable scripture pages:', len(entries))
print('Skipped as front-matter/admin:', len(skipped_admin), skipped_admin[:20])
print('First page:', entries[0][0], 'Last page:', entries[-1][0])

json.dump(entries, open('sarbloh_entries.json', 'w', encoding='utf-8'), ensure_ascii=False)

# quick length stats
lens = [len(cg) for _, cg, _ in entries]
print('avg gurmukhi chars/page:', sum(lens)//len(lens), 'min', min(lens), 'max', max(lens))
