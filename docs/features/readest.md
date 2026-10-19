# Reverse-Engineering Findings: Readest

## 1. Overview & Source Identification

- **Application:** Readest (Modern rewrite of Foliate)
- **Repository Path:** `repos/readest-main.zip` -> `repos/readest/readest-main/`
- **Architecture:** Next.js 16 + React 19 + Tauri v2 / Electron + Rust / CEF + SQLite (`turso` / `better-sqlite3`)
- **Inspection Date:** October 2026

Readest is an open-source reader crafted specifically for immersive and deep reading experiences, parallel reading, synchronized audio narration, and extensive knowledge management.

---

## 2. Key Architectural Patterns & Implementations

### A. Foliate-JS Core Rendering Engine & Deduplication Pipeline
*Source:* `packages/foliate-js`, `apps/readest-app/src/libs/document.ts`, `FoliateViewer.tsx`
- **Multi-Format Ingestion:**
  - Integrates `foliate-js` for reflowable formats (EPUB, MOBI, AZW, AZW3, FB2, CBZ, TXT, MD, HTML).
  - Integrates `pdfjs-dist` for fixed-layout PDF with custom SVG canvas and text-layer overlay.
- **In-Flight Chapter De-duplication:**
  - `document.ts` implements an in-flight map for zip chapter extraction (`inflight = new Map<string, Promise<string | null>>()`).
  - When computing book navigation (`computeBookNav`), both raw HTML (for byte size math) and parsed DOM (for CFI calculation) are requested simultaneously. The deduplication map collapses these into a single zip inflate call, saving 300-500ms on initial book open.
- **Pre-fetch Fast Path:**
  - Caches `container.xml`, OPF package files, and NCX table of contents in memory so initial reader mount drops from ~1.5s to ~0.3s.

---

### B. Bi-Directional & Classical Arabic Layout Engine
*Source:* `apps/readest-app/src/utils/rtl.ts`, `apps/readest-app/src/utils/book.ts`
- **RTL Detection:**
  - Automatically checks book metadata language codes against an RTL language set (`ar`, `he`, `fa`, `ur`, `dv`, `ps`, `sd`, `yi`).
  - Sets iframe document writing direction (`dir="rtl"`) and pagination flow (`page-progression-direction="rtl"`).
- **CSS Logical Properties:**
  - Enforces `margin-inline-start`, `padding-inline-end`, and `inset-inline` across all reader overlays.
- **Classical Commentary & Annotation Layout:**
  - Implements `layoutWarichu` (`utils/warichu.ts`) for traditional inline multi-column glosses and commentaries (*Sharh*).

---

### C. Advanced Reading & Visual Aids
*Source:* `ReadingRuler.tsx`, `ParagraphOverlay.tsx`, `RSVPOverlay.tsx`
1. **Reading Ruler (`ReadingRuler.tsx`):**
   - Automatically measures visible line boxes across reflowable columns and vertical text flows (`buildLineBoxes`).
   - Uses `caretRangeFromPoint` and `caretPositionFromPoint` to snap smoothly to text line boundaries.
   - Dims non-focused text while rendering a custom tinted reading slot.
2. **Paragraph Focus Mode (`ParagraphOverlay.tsx`):**
   - Clones the active paragraph into a focused presentation overlay with smooth scale transitions.
   - Integrates the modern W3C **CSS Custom Highlight API** (`CSS.highlights.set('readest-tts-paragraph', range)`) to highlight active spoken words or sentences without modifying the DOM tree or causing layout reflows.
3. **Speed Reading RSVP (`RSVPOverlay.tsx`):**
   - Implements Rapid Serial Visual Presentation with centered Optical Recognition Points (ORP) colored in red, dynamic WPM scaling, and punctuation dwell timers.

---

### D. Stylus & Freehand Pressure-Sensitive Ink
*Source:* `apps/readest-app/src/app/reader/components/handwriting/`, `services/handwriting/renderer.ts`
- **Pointer Events Capture:**
  - Listens to `PointerEvent` (`pointerType === 'pen'`) on an interactive transparent canvas over the reader page.
  - Normalizes pressure via `pressureScale(p) = 0.5 + p`.
- **Bézier Disc Contour Tracing (`traceOutline`):**
  - Interpolates stroke segments into smooth quadratic Bézier curves with disc samples spaced at 1.5px intervals.
  - Traces the outer contour of the variable-width stroke as a single closed contour path (`traceOutline`), antialiasing only the true outer edge to prevent inner segment seam artifacts.

---

### E. Dictionaries, Arabic Roots & Morphology
*Source:* `apps/readest-app/src/services/dictionaries/`
- **Supported Formats:**
  - **MDict (`.mdx`/`.mdd`):** High-density bilingual dictionaries and audio assets via `js-mdict` (wrapper for `.mdx` records and companion `.mdd` audio/image files).
  - **StarDict (`.idx`/`.dict.dz`):** Lazy random-access binary search using `.idx` offset tables; resolves synonyms via `.syn`.
  - **DictZip (`.dz`):** Deflate stream separated by `Z_FULL_FLUSH` (BFINAL=0); decompresses individual chunks on demand via `fflate.Inflate({ streaming: true })` with an LRU chunk cache.
  - **Babylon (`.bgl`):** Reverse-engineers Babylon block streams (magic `0x12 0x34 0x00 0x01`/`0x02`), decoding multi-byte lengths, entry blocks (types 1, 7, 10, 11, 13), and codepages (`windows-1256` for Arabic, `windows-1252`, `shift_jis`, `gbk`).
  - **Aard Slob / ZIM (`.slob`):** Indexed container dumps for offline Wikipedia/Wiktionary, utilizing `ItemList<Ref>` binary search and zlib-decompressed store bins.
- **Candidate Normalization & Arabic Root Stripping (`lookupCandidates.ts`):**
  - Normalizes input across Unicode NFC and NFD forms.
  - Strips Latin diacritics and Arabic Tashkeel (*Harakat*: Fatha, Damma, Kasra, Sukun, Shadda, Tanwin, Tatweel).
  - Strips inflectional Arabic proclitics/prefixes (`الـ`, `و`, `ف`, `ب`, `ل`, `ك`, `لل`, `وال`, `فال`, `س`) and enclitics/suffixes (`ها`, `هم`, `هن`, `هما`, `كم`, `كن`, `نا`, `ين`, `ون`, `ان`, `ات`, `ية`, `وا`).
  - Evaluates classical morphological Awzan (*Istif'al*, *Maf'ul*, *Fa'il*, *Tafa'ul*, *Taf'il*, *Infi'al*) to extract the triliteral or quadriliteral root (*Asl al-Kalimah*) for classical lexicons (*Lisan al-Arab*, *Taj al-Arus*).
- **Online Wikipedia REST API:**
  - Summary cards (`/api/rest_v1/page/summary/`) fetching title, description, article thumbnail, extract HTML, and canonical desktop/mobile URLs.
  - Bilingual routing: targets `ar.wikipedia.org` for Arabic queries and `en.wikipedia.org` for English queries.
- **Baglib Enhancement:**
  - Indexed all dictionary headwords into a dedicated SQLite table (`headword_index`) with B-tree indexes on `(normalized_headword, dict_id)`, achieving **sub-10ms** (< 0.5ms measured) query execution.

---

### F. RAG AI Assistant with Anti-Spoiler Constraints
*Source:* `apps/readest-app/src/services/ai/`
- **Anti-Spoiler Reading Companion:**
  - System prompt passes current page context with a strict ceiling: `page_limit="${currentPage}"`.
  - Enforces that the model only discusses content up to the user's current reading position, preventing spoilers for plot twists or later commentary.
- **Provider Adapters:**
  - Unified client supporting OpenAI-compatible APIs, Gemini, Claude, and local Ollama instances.

---

### G. Read-Along Narration & Audiobook Pairing
*Source:* `apps/readest-app/src/app/reader/components/audiobook/AudiobookPairingDialog.tsx`, `tts/TTSMiniPlayer.tsx`, `tts/TTSLyricsView.tsx`, `tts/useMiniPlayerAutoHide.ts`, `services/tts/mediaOverlay/parseSmil.ts`, `services/audiobook/mapping.ts`, `storage.ts`

- **Auto-Hiding Floating Transport (`useMiniPlayerAutoHide.ts`, `TTSMiniPlayer.tsx`):**
  - Features an auto-hiding floating mini player with a 5-second linger duration (`LINGER_MS = 5000`) and a 500ms buffering stall guard (`BUFFERING_SHOW_DELAY_MS = 500`).
  - Stays visible when hovered, during active interaction, or while paused, seamlessly minimizing intrusion on text reading.
  - Houses speed scrubbing (0.5x to 3.0x), countdown sleep timer, voice and language selectors, and progress scrubbing.
- **EPUB 3 Media Overlays (`parseSmil.ts`):**
  - Parses W3C EPUB 3 SMIL (`.smil`) files mapping text fragment IDs (`chapter1.xhtml#p1`) to audio timestamps (`clipBegin`, `clipEnd`).
  - Supports standard clock formats (`hh:mm:ss.mmm`, `mm:ss.mmm`) and unit-based timecounts (`s`, `ms`, `min`, `h`).
- **Karaoke Lyrics View (`TTSLyricsView.tsx`):**
  - Lyric-style transcript centering and lighting the currently spoken sentence, with real-time word-level highlighting and smooth auto-scrolling.
  - Interactive scrubbing: clicking any line jumps audio/TTS playback directly to that sentence.
- **5-Step Audiobook Pairing Wizard (`AudiobookPairingDialog.tsx`):**
  - 5-step wizard (`summary` -> `select` -> `abs` -> `anchor` -> `review`) pairing external DRM-free audio files (`.mp3`, `.m4a`, `.m4b`, `.aac`, `.flac`) or an Audiobookshelf (ABS) server stream with reflowable EPUBs.
  - **Continuum Ordinal Alignment Algorithm (`mapping.ts`):**
    - Computes `offset = ebookAnchorIndex - audioAnchorIndex` from a single user-selected matching anchor pair (e.g., eBook Chapter 1 ↔ Audio Track 2 if Track 1 is an Intro/Prologue).
    - Aligns all subsequent and prior chapters sequentially while excluding out-of-range chapters for explicit verification in the Review step.
  - **Audiobook Preview Player (`preview.ts`):**
    - Embeds a preview player in the wizard review table enabling users to play a quick snippet of each audio track to confirm chapter alignment before saving.

---

### H. KOReader Sync & SQLite Reading Analytics
*Source:* `KOSyncClient.ts`, `statisticsDb.ts`, `services/sync/`
- **KOReader Sync Protocol Architecture:**
  - Implements the KOReader Synchronization Protocol (kosync), enabling cross-device reading progress synchronization with KOReader on e-ink devices (Kindle, Kobo, Onyx Boox, Android).
  - **Dual-Authentication Negotiation:**
    - Standard kosync servers expect custom headers: `X-Auth-User: <username>` and `X-Auth-Key: <md5(password)>`.
    - Fallback mechanism: Certain reverse proxies and self-hosted instances strip non-standard headers or reject custom headers; the client falls back to standard HTTP Basic Authentication (`Authorization: Basic <base64(username:md5(password))>`).
  - **Automated User Registration & 401 Handshake:**
    - When testing credentials via `GET /users/auth`, an unauthenticated response (401) triggers an automated registration attempt via `POST /users/create` with `{ username, password: md5(password) }`. This enables seamless zero-touch account creation against public or private kosync servers.
  - **Document Digest Calculation:**
    - Computes an MD5 checksum over the document payload or initial byte slice. Both KOReader and desktop clients use this hash as the canonical document identifier (`document: md5Hex`), ensuring consistent book matching across devices regardless of differing filenames or directory structures.
  - **Progress Synchronization Endpoint (`/syncs/progress`):**
    - **Push:** Submits `{ document, progress, percentage, device, device_id }` with the client's current location (CFI or page number) and float percentage (0.0 to 1.0).
    - **Pull:** Retrieves the latest reading record for a given document digest. The payload includes `{ document, progress, percentage, device, device_id, timestamp }`.
  - **Bidirectional Merge Strategy:**
    - Uses server-side and local timestamp comparison to resolve conflicting updates. If the remote timestamp is newer than the local progress timestamp, the local reader position is updated; otherwise, the local position is pushed to the server.
- **KOReader-Compatible Schema:**
  - SQLite `statistics.db` tracking `book` (`id`, `title`, `authors`, `md5`, `total_read_time`, `total_read_pages`) and `page_stat` (`id_book`, `page`, `start_time`, `duration`).

---

### I. Multi-ID Parallel Reading Workspace & Synchronous Navigation
*Source:* `apps/readest-app/src/stores/parallelViewStore.ts`, `apps/readest-app/src/hooks/useProgressSync.ts`
- **Dual-Pane Split Layout:**
  - Resizable dual container supporting horizontal and vertical orientations with drag ratio constraints (clamped between 20% and 80%).
  - Multi-ID state isolation: Pane A and Pane B maintain independent CFI locations, font sizes, margins, reading themes, and TOC drawers.
- **Proportional Navigation & Relative Length Mapping:**
  - Synchronizes documents of vastly different page lengths (e.g. 50-page *Matn* vs 600-page *Sharh*) using normalized 0..1 reading fractions: `fraction = (currentPage - 1) / (totalPages - 1)`.
  - Target page computation: `targetPage = Math.round(fraction * (targetTotalPages - 1)) + 1`.
- **Bi-Directional Recursion Lock:**
  - Synchronized navigation updates are guarded by an `isDispatching` recursion lock preventing infinite ping-pong triggers when Pane A updates Pane B and Pane B attempts to echo the event back.

### J. 3rd-Party PKM & Spaced Repetition Integration
*Source:* `apps/readest-app/src/services/export/`, `pkm/`
- **AnkiConnect API:**
  - Automated flashcard creation via local HTTP port 8765 (`/addNote`).
  - Converts quotes and notes into Front/Back flashcard models with citation backlinks.
- **Obsidian & Markdown Callouts:**
  - Formats highlights using Obsidian callouts (`> [!quote]`, `> [!note]`) and `[[wikilinks]]` for knowledge graph ingestion.
- **Joplin Web Clipper & Notion:**
  - REST client integration for Joplin Web Clipper (port 41184) and Notion page blocks.

---

### K. Full-Text Search Worker & Streaming Algorithm
*Source:* `apps/readest-app/public/workers/library-search.worker.js`, `apps/readest-app/public/workers/library-search-algorithms.js`
- **Dedicated Web Worker Offloading:**
  - Background search requests execute in `library-search.worker.js` with structured IPC messaging (`{ type: 'search', payload: { id, sectionKey, text, query, mode, ... } }`).
  - Completely decouples CPU-heavy text analysis from the React UI thread, ensuring 60fps scrolling and frame rendering even when scanning megabyte-scale book sections.
- **Dynamic Programming Longest Common Subsequence (LCS) Fuzzy Alignment:**
  - `buildLcsTable` & `traceAlignment`: Computes optimal 2D alignment matrices between search query graphemes and chapter text.
  - Dynamically computes typo budgets based on query length (`getTypoBudget(len)`: length <= 2 -> 0 typos, <= 5 -> 1 typo, > 5 -> 2 typos).
- **Intl.Segmenter Grapheme & Word Segmentation:**
  - Uses `new Intl.Segmenter(undefined, { granularity: 'grapheme' })` to safely break text into grapheme clusters, avoiding splitting composite emojis, Latin combining diacritics, or surrogate pairs.
- **LRU Byte-Capped Section Cache:**
  - Manages an in-memory Map of parsed chapter text and segmented word tokens capped at 16 MB (`MAX_CACHE_BYTES = 16 * 1024 * 1024`) and 256 sections (`MAX_CACHE_SECTIONS = 256`).
  ### L. Anti-Spoiler RAG Context Ceiling & Multi-Provider AI Architecture
*Source:* `apps/readest-app/src/services/ai/prompts.ts`, `apps/readest-app/src/services/ai/ragService.ts`, `apps/readest-app/src/services/ai/providers/`
- **Anti-Spoiler Context Boundary (`<BOOK_PASSAGES page_limit="${currentPage}">`):**
  - Readest introduces a strict anti-spoiler prompt ceiling enclosing indexed text up to the active reading page:
    ```xml
    <BOOK_PASSAGES page_limit="${currentPage}">
    [Chapter 1, Page 5]
    ...
    </BOOK_PASSAGES>
    ```
  - Any passages, indices, or chunks beyond `currentPage` are purged before feeding context to the model.
  - The system prompt enforces non-negotiable instructions:
    1. Only discuss content from pages 1 to `currentPage`.
    2. Never leak future plot twists, conclusions, or subsequent chapters from pre-trained parametric weights.
    3. Natural refusal: When asked about future content, provide warm, encouraging refusal responses (e.g., *"We haven't reached that section of the book yet! We are currently on page X."*).
- **BYOK Multi-Provider Architecture:**
  - Ollama (`OllamaProvider.ts`): Communicates over local HTTP (`/api/chat` and `/api/tags` healthcheck). Supports streaming and non-streaming inference.
  - OpenRouter / OpenAI (`OpenRouterProvider.ts`): Custom endpoints with Bearer authentication and model selection.
  - Dedicated translation and semantic embedding models (`nomic-embed-text`).

### M. Web Clipper & Browser Session Ingestion
*Source:* `apps/readest-app/src/services/send/conversion/convertToEpub.ts`, `assetBundler.ts`, `buildEpub.ts`, `services/novel/novelImport.ts`, `services/webBrowser/`
- **Readability Extraction & Clean Document Structure:**
  - Uses `@mozilla/readability` to score paragraphs and strip ads, banners, footers, navigation headers, and tracking scripts from web pages.
  - Prepends article title (as `<h1>`) and byline (as `<p>`) to extracted body so chapter openers always preserve provenance and authorship.
- **High-Resolution Asset Bundling (`assetBundler.ts`):**
  - Modern publishers (Substack, Medium, NYT) serve ~60px Low-Quality Image Placeholders (LQIP) in `src` for lazy loading, placing real image URLs in `srcset` with width (`Nw`) or density (`Nx`) descriptors.
  - Implements `pickLargestFromSrcset` to parse `srcset` candidates and choose the highest-resolution variant.
  - Falls back through `data-src`, `data-original`, and `data-lazy-src` before falling back to `src`.
  - Downloads referenced images concurrently (concurrency cap 4, per-asset limit 5MB, total budget 30MB) and rewrites DOM `<img>` elements to relative internal paths (e.g. `images/img_1.jpg`).
- **Spec-Compliant In-Memory EPUB Assembly (`buildEpub.ts`):**
  - Creates a valid EPUB 2.0/3.0 `.epub` container:
    - First entry: uncompressed `mimetype` (`application/epub+zip`).
    - `META-INF/container.xml` pointing to `OEBPS/content.opf`.
    - `OEBPS/content.opf` containing metadata, manifest, and spine.
    - `OEBPS/toc.ncx` mapping navigation points.
    - `OEBPS/chapterX.xhtml` with directionality attributes (`dir="rtl"` for Arabic, `dir="ltr"` for English).
    - `OEBPS/style.css` with clean reading typography.
- **Embedded Browser Session ("From Web Browser"):**
  - Opens authenticated browser views enabling users to sign into subscription sites and capture full authenticated DOM trees with cookies intact.
### N. Reading Statistics & Analytics Engine (Readest & KOReader Pattern)
*Source:* `apps/readest-app/src/services/statisticsDb.ts`, `KOReader statistics.db`
- **Analytics Schema (`statistics.db`):**
  - Readest and KOReader adopt a decoupled local SQLite schema:
    - `reading_book_stat`: Tracks book totals (`id`, `title`, `authors`, `md5`, `total_read_time`, `total_read_pages`, `last_open`, `pages`, `subject`).
    - `reading_page_stat`: Granular page dwell events (`id_book`, `page`, `start_time`, `duration`, `total_pages`).
- **Dwell Time Capping & Idle Detection:**
  - Real-world readers frequently step away or leave reading apps in the background. Uncapped timers severely distort reading velocity and book progress metrics.
  - Readest applies a hard page dwell cap: `MAX_PAGE_SECONDS = 180s` (3 minutes). Any dwell time exceeding 180 seconds is clamped down to 180s.
  - Active heartbeat tracking detects inactivity gaps, ensuring that idle background tabs do not record phantom reading minutes. Rapid flips (< 1s) are filtered as accidental skimming.
- **Median Page Pace Calculation:**
  - Reading velocity calculation uses the mathematical median of the last 50 page visits rather than the mean arithmetic average, immunizing the metrics against outliers caused by maps, title pages, or complex illustrations.
- **365-Day Activity Heatmap & Streaks:**
  - Aggregates daily reading durations and book counts across a 365-day rolling window to construct a GitHub-style activity calendar heatmap.
  - Evaluates consecutive active days to compute current and longest reading streaks.

---

### O. Reader Plugins & Foliate Extension Architecture
*Source:* `packages/foliate-js/view.js`, `apps/readest-app/src/services/plugins/`
- **Sandboxed Extension Model:**
  - Foliate and Readest expose hookable extension points for reader views:
    - Dynamic CSS injection targeting reader iframes and overlays.
    - Custom TTS voice providers and dictionary lookup adapters.
    - Event hooks (`onReaderInit`, `onPageTurn`, `onReaderDestroy`).
### P. Reverse-Engineered Metadata Refresh & Rate-Limited Bulk Fetching
*Source:* `apps/readest-app/src/services/metadataRefresh.ts`, `packages/network-client/rateLimiter.ts`
- **Metadata Auto-Retrieve & Safe Refresh:**
  - Readest exposes an on-demand "Refresh Metadata" function for single books and library batches.
  - When refreshed, the application queries upstream catalogs (Google Books, Open Library) using title/author/ISBN fingerprints.
  - Rather than destructively clobbering existing local metadata, Readest computes a property-by-property delta (field diff) and only updates missing fields or placeholder values (`Unknown Author`, `New Title`), leaving user annotations and custom edits unmolested.
- **Provider-Aware Rate Limiting & Sliding Windows:**
  - Aggressive rapid requests to public book APIs (notably Google Books API) trigger HTTP 429 Too Many Requests and IP bans.
  - Readest introduces a provider-specific sliding token bucket / inter-request sleep gate:
    - Google Books: Minimum spacing of 1,500ms between calls + exponential backoff with jitter on 429 errors.
    - Open Library: 1,000ms minimum spacing between queries.
    - Internet Archive: 800ms minimum spacing between queries.
  - In Baglib, this pattern is formalized in `RateLimitGate` (`src/main/services/metadata/rate-limit-gate.ts`), wired into `HttpClient` (`src/main/services/metadata/http-client.ts`), and exposed via `enrichment:bulk-enrich-works` and `enrichment:refresh-work`.

---

## 3. Lessons & Implications for Baglib

1. **Foliate-JS & In-Flight Deduplication:** Adopting Foliate's spine and ZIP deduplication model directly prevents memory thrashing when opening massive multi-volume classical Arabic texts.
2. **CSS Custom Highlight API:** Eliminates intrusive DOM element wrapping (`<span>`) for highlights and search highlights, keeping Arabic text shaping and Tashkeel perfectly intact.
3. **Anti-Spoiler RAG Context Ceiling:** Adapted Readest's `<BOOK_PASSAGES page_limit="${currentPage}">` paradigm specifically for scholarly texts, classical Turath, and Islamic science treatises in Baglib. Augmented with specialized academic prompts for Contextual Lexicons (*al-Mu'jam al-Siyaqi*), Structured Summaries with direct persistence to the reader's annotations/notes, Biographical Profiles (*Tarajim al-Rijal*), and high-fidelity literary translations.
4. **Multi-ID Parallel Reading:** Essential for scholars and researchers studying Arabic classical texts with side-by-side commentaries (*Matn* + *Sharh*) or translations (Arabic original + English translation), with proportional navigation and recursion-locked bi-directional synchronization.
5. **PKM & Spaced Repetition Flow:** Implemented automated AnkiConnect sync and Obsidian callout formatting in Baglib so readers can instantly convert classical vocabulary, definitions, and quotes into lifelong memory decks and networked notes.
6. **Full-Text In-Book Streaming Engine:** Adopted Readest's dedicated Web Worker paradigm (`librarySearchWorker.ts`) and chunked progressive streaming (`in-book-search.ts`). Advanced beyond Readest by implementing custom Arabic morphological normalization (Tashkeel stripping, Tatweel removal, and Hamza/Ta Marbuta letter unification) with an exact character alignment map (`buildAlignmentMap`) that preserves authentic vocalized text in search snippet highlights.
7. **Offline/Local BYOK Freedom:** Users can operate with 100% offline local LLMs via Ollama (`llama3.2`, `mistral`, `qwen2.5`) with zero telemetry or data leak, or bring their own API keys for Google Gemini, OpenAI, Anthropic Claude, and DeepL.
8. **KOReader Cross-Device Synchronization:** Reverse-engineering KOReader's document MD5 digest and REST API endpoints (`/syncs/progress`, `/users/create`, `/users/auth`) provides Baglib with direct, vendor-neutral reading synchronization across desktop computers, tablets, and physical e-ink devices (Kindle, Kobo, Boox) running KOReader.
9. **Web Clipper & Spec-Compliant EPUB Packaging:** Adopting Readest's Readability pipeline and `srcset` high-resolution image resolver lets Baglib readers turn web articles, academic blog posts, and serialized treatises into beautiful offline `.epub` and `.md` books, packaged purely in-memory using `fflate.zipSync` without temporary external tools.
10. **Reading Analytics & Dwell Protection:** Implemented the KOReader / Readest `reading_book_stat` and `reading_page_stat` schema in `014_reading_statistics.ts`, complete with `MAX_PAGE_SECONDS = 180s` capping, median page pace math, 365-day bilingual activity heatmap, reading velocity (pages/hour, words/min), and subject distribution across Islamic and academic domains.
11. **Sandboxed Reader Plugins:** Built `BaglibReaderPlugin` architecture supporting dynamic theme CSS injection, custom dictionaries, and TTS voice providers with instant hot-reloading in `FullPageBookReader`.
12. **Metadata Refresh & Rate-Limiting Gate:** Adapted Readest's safe metadata auto-retrieve and rate-limiting sliding window. Implemented `RateLimitGate` in Baglib to strictly throttle Google Books (1,500ms), Open Library (1,000ms), and Internet Archive (800ms) with non-destructive diff merging, protecting users' libraries against HTTP 429 quota exhaustion and data loss.




