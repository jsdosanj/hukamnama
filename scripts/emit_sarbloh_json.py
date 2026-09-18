"""
Turns the cleaned page entries from build_sarbloh.py into the final
public/data/sarbloh.json + public/data/sarbloh_pages.json used by the app.

Usage:
    python3 build_sarbloh.py      # writes sarbloh_entries.json
    python3 emit_sarbloh_json.py  # reads it, writes the two data files
"""
import json

START_ID = 13000


def main():
    entries = json.load(open("sarbloh_entries.json", encoding="utf-8"))
    shabads = {}
    pages = {}
    for i, (page_num, gurmukhi, english) in enumerate(entries):
        key = str(START_ID + i)
        combined = gurmukhi.strip()
        if english and english.strip():
            combined += "\n\n" + english.strip()
        shabads[key] = combined
        pages[key] = page_num

    json.dump(shabads, open("../public/data/sarbloh.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump(pages, open("../public/data/sarbloh_pages.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(shabads)} entries, id range {START_ID}-{START_ID + len(shabads) - 1}")


if __name__ == "__main__":
    main()
