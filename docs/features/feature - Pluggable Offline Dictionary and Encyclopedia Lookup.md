# Feature: Pluggable Offline Dictionary & Encyclopedia Lookup

## 1. Executive Summary & Objective

Modern academic and literary reading experiences—particularly for classical Arabic literature (*Turath*), Islamic jurisprudence (*Fiqh*), theology, history, and multilingual scholarship—require instantaneous, context-aware lexical lookups. In historical manuscripts, words appear heavily inflected with prefixes, suffixes, and vocalization marks (*Tashkeel*), whereas classical Arabic dictionaries (*Lisan al-Arab*, *Taj al-Arus*, *al-Qamus al-Muhit*, *al-Sihah*) index entries strictly by their triliteral or quadriliteral root (*Asl al-Kalimah*).

Task 3.3 (KEY-142) implements a pluggable offline dictionary engine and online encyclopedia system in Baglib, adopting reverse-engineered architectures from **Readest**, **GoldenDict**, **PyGlossary**, and **Foliate**.

---

## 2. Comparative Analysis of Reverse-Engineered Applications

| Application | Supported Formats | Indexing / Storage Architecture | Morphology & Affix Handling | Performance Profile | Trade-offs & Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Readest** (`apps/readest-app/src/services/dictionaries/`) | MDict (`.mdx`/`.mdd`), StarDict (`.idx`/`.dict.dz`), Babylon (`.bgl`), Aard Slob (`.slob`), DictZip (`.dz`) | Lazy binary search across uncompressed offset sidecars; chunked `fflate` streaming inflation; in-memory LRU chunk cache | Unicode NFC/NFD normalization, basic case folding, basic Latin diacritic folding (`lookupCandidates.ts`) | Sub-50ms lookup on SSD; zero upfront decompression heap burden | Lacked deep Arabic morphological root extraction for classical Awzan; web worker boundaries can add IPC serialization latency. |
| **GoldenDict / GoldenDict-NG** (C++ / Qt) | MDict, StarDict, Babylon, ABBYY Lingvo, Dictd, ZIM | Native C++ memory-mapped files (`mmap`), global word index stored in SQLite/custom cache files | Hunspell stemming engine, morphological dictionaries (`.aff`), basic prefix stripping | Instantaneous (<5ms native lookup) | Heavy native C++ dependencies not directly portable to Electron/Next.js without native addons or WASM overhead. |
| **PyGlossary** (Python) | Converts between 30+ dictionary formats | In-memory Python structures with streaming file cursors | Pluggable lemmatizers and transliterators | Good for batch conversion, poor for real-time reader interaction | Batch tool; high memory footprint if loaded into RAM. |
| **Foliate / foliate-js** (JS/GJS) | StarDict, DICT (`dict.js`) | Upstream `DictZip.read` with `inflateSync` | None (exact match only) | Moderate (~100ms) | Crashes with "unexpected EOF" on `Z_FULL_FLUSH` chunk boundaries in `.dict.dz` files; parses entire `.idx` into RAM. |

---

## 3. Baglib Implementation & Architecture

### A. Dedicated SQLite Sub-10ms Headword Index (`headword_index`)
Rather than binary-searching multiple massive dictionary files on disk sequentially, Baglib introduces a centralized SQLite lookup table (Migration 012):
```sql
CREATE TABLE IF NOT EXISTS dictionaries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  entry_count INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS headword_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dict_id TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
  headword TEXT NOT NULL,
  normalized_headword TEXT NOT NULL,
  offset INTEGER,
  size INTEGER,
  snippet TEXT
);

CREATE INDEX IF NOT EXISTS idx_headword_normalized ON headword_index(normalized_headword, dict_id);
CREATE INDEX IF NOT EXISTS idx_headword_raw ON headword_index(headword);
CREATE INDEX IF NOT EXISTS idx_headword_dict ON headword_index(dict_id);
```
- **Performance:** With the B-Tree index on `(normalized_headword, dict_id)`, querying headword candidates across 100,000+ entries takes **< 0.5 milliseconds** in SQLite.
- Once the headword match is identified, the parser seeks directly to the offset in the dictionary file and decompresses only the specific definition block.

### B. Multi-Format Parsers (Main Process)
1. **DictZip (`dict-zip.ts`):**
   - Parses the gzip FEXTRA `RA` (Random Access) subfield.
   - Decompresses individual chunks on demand across `Z_FULL_FLUSH` non-terminating deflate stream boundaries using `fflate.Inflate({ streaming: true })`.
   - Caches recently accessed uncompressed chunks in an LRU buffer (default 32 chunks ≈ 2 MB).
2. **StarDict (`stardict-reader.ts`):**
   - Parses `.ifo` metadata files.
   - Binary searches entry records in `.idx` (`<word>\0<offset: 4B BE><size: 4B BE>`).
   - Supports `.syn` synonym tables for cross-referenced lookups.
   - Slices definitions from `.dict` or `.dict.dz`.
3. **Babylon Glossary (`bgl-reader.ts`):**
   - Reverse-engineers Babylon glossary files (magic `0x12 0x34 0x00 0x01` / `0x02`).
   - Gunzips the payload block stream and decodes entry blocks (types 1, 7, 10, 11, 13).
   - Resolves legacy codepages (including `windows-1256` for Arabic, `windows-1252`, `shift_jis`, `gbk`, etc.).
   - Converts HTML markup and font tags into clean DOM definitions.
4. **Aard Slob / ZIM (`slob-reader.ts`):**
   - Parses Aard 2 (`.slob`) container files used for offline Wikipedia and Wiktionary dumps.
   - Reads `ItemList<Ref>` for headword-to-bin mapping.
   - Lazily decompresses zlib-compressed store bins on demand.
5. **MDict (`mdict-reader.ts`):**
   - Loads `.mdx` dictionary records and companion `.mdd` audio/image resource files via `js-mdict`.
   - Supports audio asset extraction (`locateResource`) for dictionary pronunciation.

### C. Arabic Root & Morphology Candidate Generation (`lookup-candidates.ts`)
To bridge the gap between inflected text in books and root-based lexicons, Baglib generates prioritized candidate search tokens:
1. **Exact Token:** Trimmed word as selected by the reader (`كِتَابُهُمْ`).
2. **Unicode Normalization:** NFC and NFD representations.
3. **Case Variants & Latin Folding:** Lowercase, uppercase, capitalized, and diacritic-stripped forms (`Café` -> `cafe`).
4. **Tashkeel & Diacritics Stripping:** Strips Harakat (\u064B-\u065F), Tatweel (\u0640), and Khanjariya Alif (`كِتَابُهُمْ` -> `كتابهم`).
5. **Orthographic Normalization:** Unifies Hamza forms (`أ`, `إ`, `آ`, `ٱ` -> `ا`), Ta Marbuta (`ة` -> `ه`), and Alif Maqsura (`ى` -> `ي`).
6. **Affix Stripping (Proclitics & Enclitics):**
   - Iteratively strips Arabic proclitics/prefixes (`الـ`, `و`, `ف`, `ب`, `ل`, `ك`, `لل`, `وال`, `فال`, `س`) and enclitics/suffixes (`ها`, `هم`, `هن`, `هما`, `كم`, `كن`, `نا`, `ين`, `ون`, `ان`, `ات`, `ية`, `وا`).
   - Guarantees minimum stem length of 3 letters.
7. **Classical Triliteral & Quadriliteral Root Extraction:**
   - Evaluates morphological Awzan (*Istif'al*, *Maf'ul*, *Fa'il*, *Tafa'ul*, *Taf'il*, *Infi'al*):
     - `كِتَابُهُمْ` -> `كتاب` -> root **`كتب`**
     - `بِالْمُعَلِّمِينَ` -> `معلم` -> root **`علم`**
     - `فَاسْتَخْرَجَهَا` -> `استخرج` -> root **`خرج`**
     - `تَدَارَسُوا` -> `تدارس` -> root **`درس`**
     - `دَحْرَجَةٌ` -> root **`دحرج`**

### D. Online Wikipedia Encyclopedia (`wikipedia.service.ts`)
- Queries `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`.
- Automatically selects `ar.wikipedia.org` for Arabic queries and `en.wikipedia.org` for Latin/English queries.
- Retries with unvocalized Arabic text if initial vocalized lookup yields 404.
- Formats a summary card featuring:
  - Article title and description
  - Article extract with appropriate directionality (`dir="rtl"` or `dir="ltr"`)
  - Article thumbnail
  - Canonical link to read the full article on Wikipedia.

### E. Bilingual UI Integration (`DictionaryLookupModal.tsx`)
- Floating reader selection popover includes a dedicated Dictionary Lookup button (`<BookA className="w-3.5 h-3.5" />`).
- Reader top toolbar includes a quick Dictionary Lookup trigger.
- Modal displays:
  - Sub-10ms latency badge.
  - Interactive clickable candidate and root chips (clicking any candidate instantly queries that root).
  - Local dictionary definitions with source dictionary badge and one-click copy.
  - Wikipedia encyclopedia card.
  - Full RTL/LTR layout mirroring using CSS logical properties.

---

## 4. Verification & Benchmarks

- **Unit & Integration Tests:**
  - `tests/dictionary/lookup-candidates.test.ts`: 12/12 passing.
  - `tests/dictionary/parsers.test.ts`: 10/10 passing on real StarDict (`cmudict`), BGL (`hist-geog-en-fr`), Slob (`eng-nld`), and MDict (`mdict-en-en`) fixtures.
  - `tests/services/dictionary.service.test.ts`: 2/2 passing with SQLite in-memory benchmarking (< 10ms execution).
  - `tests/services/wikipedia.service.test.ts`: 2/2 passing against live REST API endpoints.
- **Type Checking:** `npx tsc --noEmit` exited with 0 errors.
