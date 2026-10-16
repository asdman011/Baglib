# Feature: Full-Text Search Engine Inside Books and Across the Library Shelf

## 1. Overview & Context

Full-text search in a serious digital library presents two distinct computational challenges:
1. **In-Book Search (Ephemeral, Contextual, Live Navigation):** The user is reading a document (EPUB, PDF, TXT) and needs instantaneous, progressive search across chapters or pages to locate terms, phrases, or concepts. It requires sub-second responsiveness, non-blocking execution so the reading canvas does not stutter, exact coordinate mapping (EPUB CFI or PDF page/quads), and seamless highlight navigation.
2. **Library-Wide Search (Persistent, Indexed, Corpus Retrieval):** The user needs to search across hundreds or thousands of books on their shelf to locate references, citations, quotes, or mentions across millions of words. It requires inverted index acceleration, BM25 relevance ranking, phrase matching, Boolean querying (`AND`, `OR`, `NOT`), prefix matching (`word*`), and contextual snippet extraction with highlight markers.

For **Baglib**, there is an additional paramount requirement: **bilingual Arabic and English morphology handling as a first-class citizen**. Classical Arabic and modern Islamic literature feature vocalization diacritics (*Tashkeel* / *Harakat*), elongation characters (*Tatweel* / *Kashida*), and multiple orthographic variants of letters (Hamzated Alefs, Ta Marbuta vs Ha, Alif Maqsura vs Ya). A naive search engine fails completely when searching for unvocalized text in a vocalized book (e.g. searching "كتاب" against "كِتَابٌ أَنزَلْنَاهُ"). Furthermore, naive normalization breaks character offsets, corrupting highlight positions or mangling the authentic vowelled text.

This document synthesizes reverse-engineering findings from **Readest**, **Koodo Reader**, **Foliate**, and **Calibre**, detailing the architectural blueprints implemented in Baglib.

---

## 2. Cross-Application Comparative Analysis

| Dimension | Readest (`readest-app`) | Koodo Reader (`koodo-reader-dev`) | Calibre (Python Backend) | Foliate-JS (Web Core) | Baglib Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Search Scope** | In-Book + Ephemeral Library Scan | Title/Author/Tag Metadata only | Shelf-Wide SQLite FTS + In-Book Search | In-Book reflowable spine search | **Dual Tier:** In-Book Web Worker + Shelf-Wide SQLite FTS5 |
| **Library Engine** | Background Worker scan + Turso/LibSQL bench | SQL `LIKE %query%` or memory array `.includes()` | SQLite FTS4/5 background indexing daemon | None (Single book memory viewer) | **SQLite FTS5 (`book_content_fts`)** with BM25 ranking + `unicode61` |
| **In-Book Concurrency** | Dedicated Web Worker (`library-search.worker.js`) | Main thread linear loop | Native Python process worker | Async generator yielding spine items | **Dedicated Web Worker** + ~12ms time-sliced progressive engine |
| **Morphology & Diacritics** | Unicode NFD strip `\p{Mark}` + `Intl.Segmenter` | None (Exact lowercase substring) | Optional plugin tokenizers; ICU transform | Browser regex matching | **Custom Arabic Morphology Normalizer:** Tashkeel & Tatweel strip + Alef/Hamza/Ta Marbuta unification |
| **Snippet Character Alignment** | Grapheme index mapping | String slicing from index | SQLite `snippet()` function | Range boundary offsets | **Exact Character Alignment Map (`buildAlignmentMap`):** Preserves original vocalized text in `<mark>` highlights |
| **Ranking & Relevance** | LCS length + Typo budget | Alphabetical / Insertion order | SQLite BM25 + Recency | Document order | **SQLite BM25 Ranking** + chapter & page locality sorting |
| **Cancellation & Control** | IPC ID tracking | None (Synchronous blocking) | Worker process kill | Generator abort | **AbortSignal / AbortController** with progressive streaming |
| **UI Presentation** | Right drawer with match cards | Search dropdown bar | Modal dialog with result list | Bottom search toolbar | **Bilingual Slide-Out Drawer (`InBookSearchDrawer`)** + Library Hub Tab (`SearchHubModal`) |

---

## 3. Investigated Applications & Architectural Findings

### A. Readest
*Source Inspected:* `apps/readest-app/public/workers/library-search.worker.js`, `library-search-algorithms.js`, `bench/library-search-turso.bench.ts`
- **Architecture:** Decouples text search entirely from the Next.js React UI thread by dispatching jobs to a background Web Worker (`library-search.worker.js`).
- **LCS Alignment Algorithm:** Employs Dynamic Programming Longest Common Subsequence (`buildLcsTable`, `traceAlignment`) with adaptive typo budgets (`getTypoBudget(query.length)`).
- **Intl.Segmenter:** Uses standard ECMAScript `Intl.Segmenter(undefined, { granularity: 'grapheme' })` to safely break text into grapheme clusters, avoiding breaking combining diacritics or emojis.
- **LRU Byte-Capped Cache:** Implements an in-memory Map capped at 16MB (`MAX_CACHE_BYTES = 16 * 1024 * 1024`) and 256 sections to cache segmented chapter texts.
- **Limitations for Classical Arabic:** Readest's diacritic stripping (`result.normalize('NFD').replace(/\p{Mark}/gu, '')`) strips general Unicode marks, but does not perform Arabic letter variant normalization (e.g. `[أإآٱ] -> ا`, `ة -> ه`, `ى -> ي`, `ؤ -> و`). It also does not maintain an alignment index between normalized and raw text, so extracting a matched substring from normalized text loses the original vowelled orthography.

### B. Koodo Reader
*Source Inspected:* `src/utils/file/bookUtil.ts` (lines 769-794), `src/utils/file/configUtil.ts`, `src/components/searchBox/component.tsx`
- **Architecture:** Queries SQLite via Electron IPC (`custom-database-command`) or searches in-memory arrays in browser mode.
- **Query Mechanism:** `SELECT * FROM books WHERE name LIKE ? OR author LIKE ? OR key LIKE ?`.
- **Critical Weaknesses:**
  - **No In-Book Full-Text Search:** Koodo cannot search inside book chapters or page bodies.
  - **No Inverted Index:** `LIKE %...%` executes an unindexed sequential table scan, which degrades as library size grows.
  - **Zero Morphology Support:** An Arabic query will miss all books if the spelling variant or diacritics differ even slightly.

### C. Calibre
*Source Inspected:* `calibre-master/src/calibre/gui2/fts/`, `calibre/db/fts/`
- **Architecture:** Background indexing process using SQLite FTS (FTS4/FTS5). Reads EPUB/PDF content into plain text streams, tokenizes them, and populates SQLite virtual tables.
- **Ranking:** Uses SQLite's native BM25 ranking algorithm to order shelf-wide results by relevance.
- **Lessons for Baglib:** SQLite FTS5 is exceptionally fast, rock-solid, and embedded directly inside the application's existing database architecture without requiring heavyweight external search engines like Elasticsearch or Meilisearch.

---

## 4. Baglib Technical Architecture & Implementation

### A. Dual-Tier Search Engine

Baglib unifies in-book interactive navigation and shelf-wide corpus search into a seamless dual-tier architecture:

```
+---------------------------------------------------------------------------------------+
|                                    BAGLIB APPLICATION                                 |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|  TIER 1: IN-BOOK LIVE SEARCH (Ephemeral)       TIER 2: SHELF-WIDE CORPUS FTS (Persistent)
|  ---------------------------------------       ----------------------------------------
|  * Component: InBookSearchDrawer.tsx           * Component: SearchHubModal.tsx (fulltext)
|  * Engine: in-book-search.ts                   * Engine: content-fts.repository.ts
|  * Worker: librarySearchWorker.ts              * Storage: SQLite FTS5 (book_content_fts)
|  * Granularity: Page, CFI, Chapter, Offsets   * Granularity: Book, Page, Chapter, BM25
|  * Strategy: Non-blocking time-slicing         * Strategy: Tokenized unicode61 inverted index
|  * Streaming: Progressive chunk delivery       * Ranking: BM25 relevance score
|                                                                                       |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                    BILINGUAL MORPHOLOGY & ALIGNMENT CORE ENGINE                       |
|                             (shared/utils/text-normalizer.ts)                         |
+---------------------------------------------------------------------------------------+
|  1. Unicode Normalization: NFC / NFD decomposition and canonical composition          |
|  2. Arabic Tashkeel Stripping: Fatha, Damma, Kasra, Tanween, Sukun, Shadda, Maddah     |
|  3. Tatweel Stripping: U+0640 character removal                                       |
|  4. Letter Variant Unification: [أإآٱ] -> ا, ة -> ه, ى -> ي, ؤ -> و, ئ -> ي           |
|  5. Exact Character Alignment Map: Normalized Index -> Raw Character Index Map        |
|  6. Highlighting Extractor: Preserves authentic vowelled classical Arabic in <mark>  |
+---------------------------------------------------------------------------------------+
```

---

### B. Arabic Morphology Normalizer & Character Alignment Map

The core algorithmic challenge in Arabic full-text search is that removing diacritics changes string lengths and offsets:
- Raw text: `"كِتَابٌ أَنزَلْنَاهُ"` (Length: 18 characters)
- Normalized text: `"كتاب انزلناه"` (Length: 12 characters)

If a search algorithm matches `"كتاب"` at index 0-4 of the normalized text and naively slices index 0-4 of the raw text, it extracts `"كِتَا"`, severing the word and dropping the remaining characters!

Baglib solves this with the `buildAlignmentMap` algorithm:

```typescript
// src/shared/utils/text-normalizer.ts
export function buildAlignmentMap(rawText: string): {
  normalized: string;
  rawIndices: number[];
} {
  const rawIndices: number[] = [];
  let normalized = '';

  const clean = rawText.normalize('NFD');
  for (let i = 0; i < rawText.length; i++) {
    const char = rawText[i];
    const code = char.charCodeAt(0);

    // Skip Arabic Tashkeel and Tatweel
    if (
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670 ||
      (code >= 0x06d6 && code <= 0x06ed) ||
      code === 0x0640
    ) {
      continue;
    }

    // Unify letter variants
    let normChar = char;
    if (char === 'أ' || char === 'إ' || char === 'آ' || char === 'ٱ') normChar = 'ا';
    else if (char === 'ة') normChar = 'ه';
    else if (char === 'ى') normChar = 'ي';
    else if (char === 'ؤ') normChar = 'و';
    else if (char === 'ئ') normChar = 'ي';

    normalized += normChar;
    rawIndices.push(i);
  }

  return { normalized: normalized.normalize('NFC'), rawIndices };
}
```

When finding matches (`findMatchesInText`), the start and end indices of the match in `normalized` are translated back to `rawIndices[matchStart]` and `rawIndices[matchEnd - 1] + 1`, guaranteeing that the sliced text contains the complete original vowelled word (e.g. `<mark>كِتَابٌ</mark>`).

---

### C. SQLite FTS5 Shelf-Wide Schema & BM25 Querying

Migration 011 creates an SQLite FTS5 virtual table optimized for multilingual literature:

```sql
-- Migration 011: src/main/database/migrations/011_book_content_fts.ts
CREATE VIRTUAL TABLE IF NOT EXISTS book_content_fts USING fts5(
  book_id UNINDEXED,
  page_number UNINDEXED,
  location_cfi_or_page UNINDEXED,
  chapter_title,
  content,
  normalized_content,
  tokenize = 'unicode61'
);
```

#### Key Design Decisions:
1. **`tokenize = 'unicode61'`**: SQLite's built-in Unicode tokenizer correctly handles word boundaries across Arabic, English, and Latin scripts without external C library dependencies.
2. **Dual Content Columns (`content` vs `normalized_content`)**:
   - `content`: Stores original raw text with full diacritics and typography for snippet display.
   - `normalized_content`: Stores morphologically normalized text for diacritic-insensitive and variant-insensitive matching.
3. **Targeted Column Filtering**: Queries are executed against `{chapter_title normalized_content}: (query)`, allowing searchers to locate matches regardless of spelling variants while BM25 ranks relevance and `snippet()` extracts contextual highlights from the original text.

---

### D. In-Book Non-Blocking Streaming Engine

For active reading, searching a 600-page book on the main thread would freeze the UI for several seconds. Baglib implements a progressive, time-sliced scanning engine (`in-book-search.ts`) with Web Worker capability (`librarySearchWorker.ts`):

1. **Chunked Yielding:** The engine processes pages in batches, inspecting elapsed execution time. Every ~12ms (matching standard 60fps monitor refresh deadlines) or every 25 pages, it yields to the JavaScript event loop via `await new Promise(r => setTimeout(r, 0))` or Web Worker `postMessage`.
2. **Progressive Match Streaming:** As matches are discovered, they are streamed immediately to the UI through the `onProgress` callback (`{ current, total, percentage, matches }`), allowing the reader to begin browsing the first matches while later chapters are still scanning.
3. **Instant Cancellation:** Accepts standard `AbortSignal`. If the user types a new character or closes the search drawer, the active search terminates instantly without lingering CPU work.

---

### E. Bilingual UI/UX & Layout Integration

1. **In-Book Search Drawer (`InBookSearchDrawer.tsx`):**
   - Positioned as a floating slide-out drawer inside `FullPageBookReader.tsx`.
   - Keyboard shortcut: `Ctrl+F` / `Cmd+F` opens the drawer with auto-focused input.
   - Match navigation: Previous (`Up`) and Next (`Down`) stepper buttons with current match index tracking (`Match 3 of 42`).
   - Match Options: Toggles for Case Sensitive, Whole Word, and Arabic Morphology (*Ignore Tashkeel/Variants*).
   - Click-to-Jump: Clicking any match card instantly navigates the reader to the exact CFI location (EPUB) or page number (PDF).
   - Directional Layout: Uses CSS logical properties (`inset-inline-end`, `margin-inline-start`, `text-align: start`) for natural RTL in Arabic and LTR in English.

2. **Search Hub Modal (`SearchHubModal.tsx`):**
   - Added `'fulltext'` scope tab alongside `'all'`, `'books'`, `'authors'`, and `'tags'`.
   - Displays BM25-ranked results with book cover thumbnail, author, chapter, page number, and highlighted snippet preview.
   - Clicking a result navigates directly into the book reader at the exact page.

---

## 5. Verification & Test Suite

The full-text search implementation is validated by a rigorous test suite running under Electron's Node runtime:

1. **Morphology & Normalization Tests (`tests/reader/search-normalizer.test.ts`):**
   - 11/11 tests passing.
   - Verifies Arabic Tashkeel stripping, Tatweel removal, Hamza/Alef unification, Ta Marbuta unification, and exact character alignment snippet preservation.
2. **SQLite FTS5 Repository Tests (`tests/database/content-fts.repository.test.ts`):**
   - 10/10 tests passing.
   - Verifies virtual table creation, book content indexing, deletion, BM25 relevance sorting, phrase searching, and book metadata joins.
3. **In-Book Search Engine Tests (`tests/reader/in-book-search.test.ts`):**
   - 5/5 tests passing.
   - Verifies progressive streaming, cancellation via `AbortController`, search option toggling, and multi-page match navigation.
4. **TypeScript Verification:**
   - `npx tsc --noEmit` completes with **0 errors**.

---

## 6. Decisions, Alternatives Considered & Future Directions

1. **SQLite FTS5 vs External Search Daemon (Meilisearch / Tantivy):**
   - *Considered:* Spawning an external search binary or WASM instance.
   - *Decision:* SQLite FTS5 is natively available within Baglib's existing `better-sqlite3` database. It requires zero additional background services, zero socket latency, and guarantees atomic database transactions and backups alongside book records.
2. **Character Alignment Map vs String Mutation:**
   - *Decision:* Maintaining a strict index array (`rawIndices[normalizedIndex] = rawIndex`) guarantees 100% preservation of original classical Arabic diacritics in snippet rendering.
3. **Future Enhancement: Trigram Tokenizer / Arabic Lemmatizer:**
   - While the current morphology normalizer handles all common spelling variants and diacritics, future iterations may integrate root extraction algorithms (similar to Readest's triliteral root analyzer) to support morphological root-based semantic searches across classical Islamic encyclopedias.
