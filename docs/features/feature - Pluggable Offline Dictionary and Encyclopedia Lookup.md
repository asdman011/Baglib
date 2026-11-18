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

---

## 5. Arabic Lexicons Pack (KEY-413, 2026-11-18)

### A. Verified Findings
- **Source structure (`wizsk/arabic_lexicons`):**
  - `assets/data/db/db.sqlite.zip` (47.7 MB compressed, 171.36 MB uncompressed `db.sqlite`) holds 10 Arabic lexicon tables:
    1. `lisanularab` (9,352 root rows; `|` line breaks) — *Lisān al-ʿArab*, Ibn Manẓūr (d. 711 AH / 1311 CE)
    2. `mujamul_shihah` (5,650 rows; `|` line breaks) — *Al-Ṣiḥāḥ*, al-Jawharī (d. 393 AH / 1002 CE)
    3. `maqayeesul_luga` (5,274 rows; `|` line breaks) — *Maqāyīs al-Lugha*, Ibn Fāris (d. 395 AH / 1004 CE)
    4. `mujamul_muhith` (38,944 rows) — *Al-Qāmūs al-Muḥīṭ*, al-Fīrūzābādī (d. 817 AH / 1414 CE)
    5. `mujamul_wasith` (6,763 rows; `<br>` line breaks) — *Al-Muʿjam al-Wasīṭ*, Academy of the Arabic Language in Cairo
    6. `mujamul_muashiroh` (32,297 rows; `<br>` line breaks) — *Al-Muʿjam al-Muʿāṣir*, Aḥmad Mukhtār ʿUmar (d. 1424 AH / 2003 CE)
    7. `mufradat_alfajul_quran` (1,631 rows; `|` line breaks and `﴿ayah﴾` Quranic quotes) — *Mufradāt Alfāẓ al-Qurʾān*, al-Rāghib al-Iṣfahānī (d. 502 AH / 1108 CE)
    8. `ghani` (29,844 rows with `root_id` / `root_secondary_id`) + `ghani_words` (91,305 surface/root forms pointing at `word_id` with `is_root`) — *Muʿjam al-Ghanī*, ʿAbd al-Ghanī Abū al-ʿAzm
    9. `hanswehr` (24,799 rows with `is_root`, `parent_id`, and `│` separators, plus `hanswehr_fts`) — *Hans Wehr Dictionary* (`ar`→`en`)
    10. `lanelexcon` (52,914 rows with `is_root`, `parent_id`, and inline `<i>` markup) — *Lane’s Arabic–English Lexicon*, Edward William Lane (d. 1876 CE, `ar`→`en`)
  - **Root family grouping nuances verified in `db.sqlite`:**
    - In `lanelexcon`, root entries have `parent_id = id` (e.g. `كتب` has `id = 42630, is_root = 1, parent_id = 42630`, and its derived children share `parent_id = 42630`). The root row itself holds only the bare root word in `meanings`, while children hold the definitions.
    - In `hanswehr`, root entries (`is_root = 1`) and their derived children share a common group `parent_id` that does not equal `id` (e.g. `كتب` has `id = 18380, is_root = 1, parent_id = 18460`, and derived words `id = 18381..18400` all share `parent_id = 18460`).
    - In `ghani`, `root_id` is an abstract group number (e.g. `2713` for `كتب`), not a foreign key to `ghani.id` (`ghani.id = 2713` is an unrelated word `مجنح`). The canonical root string for a `root_id` group is stored in `ghani_words` where `is_root = 1` joined on `ghani_words.word_id = ghani.id`.
  - **11th dictionary ("Direct", Buckwalter AraMorph 1.2.1):**
    - `assets/data/ar_en/` holds `dictprefixes` (78 unvocalized keys), `dictstems` (82,158 stem entries across 38,600 `;; ` lemmas and 5,630 `;--- ` roots), `dictsuffixes` (206 unvocalized keys), and compatibility tables `tableab` (1,648 pairs), `tableac` (598 pairs), and `tablebc` (1,285 pairs).
    - The files are ASCII Buckwalter transliteration with 89 proper-noun gloss lines in `dictstems` containing Latin-1 / Windows-1256 bytes (e.g., `Abbé`, `Español`).

### B. Assumptions vs. Verified Implementation
- **No schema changes:** `dictionaries.format` has no SQLite `CHECK` constraint, so `'arabic-lexicons'` is added in TypeScript (`DictionaryFormat`) and `headword_index.offset` stores the source row `id` (`word_id` for `ghani_words`).
- **Fixed table whitelist:** SQL table names are never read from user or database data; they are resolved strictly from `ARABIC_LEXICON_TABLES` in `src/main/services/dictionary/arabic-lexicons.ts`.
- **Clean-room Buckwalter analyzer (`src/main/services/dictionary/aramorph.ts`):** Written from scratch from the published LDC/Buckwalter specification (prefix 0–4 chars + stem ≥ 1 char + suffix 0–6 chars, checked against `tableAB`, `tableAC`, `tableBC`). Parses lazily in ~80 ms and answers individual word lookups in < 1 ms.
- **KEY-400 Root Card Integration:** `LexiconDeckService.buildRootCardFields` now prioritizes *Maqāyīs al-Lugha* first (root-based), then *Lisān al-ʿArab*, *Mufradāt*, *Al-Ṣiḥāḥ*, and *al-Ghanī*.

### C. Licensing & Data Boundary Note
- The `wizsk/arabic_lexicons` Flutter application code is licensed under **GPL-3.0**, and the Buckwalter AraMorph data files carry a GPLv2 notice (`GPL.redistributable.txt`).
- **No code or text from the Flutter app is copied or translated into BagLib**, and **none of the pack's database or data files are bundled or committed to the repository**. The user imports their local pack file at runtime into `<userData>/dictionaries/arabic-lexicons/`.

## 6. Lookup features (KEY-414, 2026-11-18)

Ideas came from the GPL-3.0 Arabic Lexicons Flutter app (suggestions, dictionary order, history, paste-and-read reader). Its behaviour was read for ideas only; no code or text was copied or translated. Everything below is BagLib's own design. No tables, columns, migrations or dependencies were added.

### A. Verified implementation
- **Multi-word search** (`DictionaryLookupModal.tsx`, `splitLookupWords`):
  - typed or pasted words are split on spaces, commas, Arabic commas, semicolons and new lines, de-duplicated by their suggestion form, and capped at 12;
  - each word is a tab (`role=tablist`), with arrow keys mirrored in RTL plus Home and End;
  - each word is looked up once while the window is open;
  - when more than one dictionary answers, chips switch between "All" and each answering dictionary.
- **Suggestions** (`dictionary:suggest`, `DictionaryService.suggest`):
  - the stored `normalized_headword` index gives the prefix range, with the enabled dictionaries only;
  - results are then filtered with `suggestionKey`, which strips tashkeel and tatweel, unifies alef forms and reads final ى as ي, but keeps **ة and ه apart** (the index form merges them);
  - up to 10 results, shortest first;
  - about 150 ms debounce; the input is a combobox with a listbox, arrow keys and Enter;
  - measured under 30 ms on a 60,000-headword index (unit test).
- **Dictionary order** (setting `dictionary.order.v1`, an id list):
  - `listDictionaries` applies it after the built-in pack order, so lookups, the modal's chips and the panel all follow it;
  - set from the Dictionaries panel by drag or by up/down buttons;
  - unknown ids are dropped when saved.
- **Root family:** the KEY-413 "Other words from this root" list is now expandable (`<details>`), and a word from it opens in a new tab.
- **History** (setting `dictionary.history.v1`):
  - the last 100 lookups (word, time, the dictionary that answered first), newest first;
  - looking a word up again moves it to the top;
  - shown when the search is empty, with re-open, remove one, and clear all.
- **Reading pad** ("لوح القراءة", `ReadingPad.tsx`, setting `dictionary.readingPad.v1`):
  - opened from the lookup window and from the command palette (both through `DictionaryHost` window events);
  - paste text, then read it with every word clickable. A click shows the top three results, "Add to revision" (KEY-400 quick-add) and "open in the dictionary window";
  - Ctrl/Alt/⌘ + click, or the popover button, highlights the word everywhere;
  - **Qasidah mode:** when most lines split into two hemistichs (by a tab, three or more spaces, `*`, `…` or `...`), verses are laid out in two columns, sadr then ajuz in reading direction;
  - only the text (at most 50,000 characters, longer text refused in IPC) and the highlighted words are kept. It is not a library item.

### B. Verification
- `tests/services/dictionary-features.test.ts`: 8/8.
- `scripts/dictionary-features-live` runs in ar and en, with the real `repos/arabic_lexicons-main.zip` and two real verses from a poetry corpus copy. Evidence: `.baglib-data/key414-evidence/`.
