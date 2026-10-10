# ADR-003: External Bibliographic Metadata Discovery, Candidate Ranking, and Multi-Source Cover Recovery

## Status
Accepted

## Context
In typical personal library workflows, users import local book files (EPUB, PDF) whose metadata fields are incomplete and where the user does not know the ISBN. Relying exclusively on Open Library or Google Books produces metadata gaps, particularly for non-Western, classical Arabic, or specialized publications. Furthermore, book covers are frequently missing, low-resolution, or return false-positive 1x1 transparent placeholders (e.g., Open Library's 43-byte empty GIF when queried without `?default=false`).

Baglib requires an extensible, resilient discovery system that:
1. Extracts maximum evidence locally first (from filename patterns and embedded file headers).
2. Searches multiple authoritative bibliographic providers (Open Library, Google Books, Library of Congress).
3. Evaluates and ranks candidate results using explicit scoring rules without collapsing distinct Editions into a single generic record.
4. Discovers ISBNs automatically from high-confidence matches.
5. Resolves cover art through a dedicated, validated multi-source cascade.
6. Strictly adheres to Baglib's approved Work → Edition → Source domain model without introducing unapproved columns (such as `name_ar` or `name_en`).
7. Operates offline without breaking book imports when network connectivity is lost.

---

## Decision

### 1. Progressive Discovery Strategy
We implemented a multi-stage progressive discovery pipeline orchestrated by `BibliographicMetadataService`:
- **Stage A — Local Evidence:** Inspects the file path, filename, and embedded file metadata (PDF via `pdf-parse`, EPUB via `yauzl`). Assembles candidate fields and determines initial confidence.
- **Stage B — Primary Provider (Open Library):** If an ISBN is extracted locally, performs an exact ISBN search. If not, performs a structured title/author search against Open Library.
- **Stage C — Secondary Provider (Internet Archive):** Queries the global Internet Archive Advanced Search API (`archive.org/advancedsearch.php`), completely unblocked and rich in Arabic and international digitized texts.
- **Stage D — Tertiary Provider (Google Books):** Queried when prior providers return no results. Uses field-specific search tokens (`intitle:`, `inauthor:`) with automatic rate-limit failover.
- **Stage E — Candidate Evaluation & ISBN Discovery:** Compares returned candidates against target evidence, assigns confidence scores, and extracts authentic ISBN-10/13 identifiers when missing.
- **Stage F — Cover Art Resolution:** Queries the centralized cover resolver across multiple verified image sources.

---

### 2. Layered Filename Parsing Engine (`FilenameParser`)
Local filenames often encode valuable bibliographic details. `FilenameParser` processes filenames through a non-destructive, layered parser:
1. **Normalization & Cleaning:** Removes file extensions and strips tracker/piracy tags (e.g., `(z-lib.org)`, `[libgen.li]`, `(Anna's Archive)`, `[1]`, `copy`) while preserving 4-digit publication years.
2. **ISBN Extraction & Checksum Verification:** Detects candidate ISBN-10 and ISBN-13 strings and verifies them against authentic checksum algorithms (Modulo 11 for ISBN-10, Modulo 10 with alternating weights 1/3 for ISBN-13). Validated ISBNs receive a 1.0 confidence score.
3. **Publication Year Extraction:** Extracts 4-digit years (1800–2099) enclosed in parentheses, brackets, or isolated by hyphens.
4. **Edition Recognition:** Detects English (`2nd Edition`, `3rd ed`, `revised edition`) and Arabic (`الطبعة الثانية`, `ط2`) edition markers.
5. **Role Label Detection:** Identifies explicit labels in both English and Arabic:
   - Translators: `translated by`, `translator:`, `ترجمة`, `المترجم`, `نقل`, `تعريب`
   - Authors: `by`, `written by`, `author:`, `بقلم`, `تأليف`, `لـ`, `للمؤلف`
   - Publishers: `publisher:`, `published by`, `دار`, `دار النشر`, `منشورات`, `مؤسسة`, `مطبعة`, `مركز`, `مكتبة`
6. **Multi-Author Splitting:** Splits author lists across commas, `and`, `&`, and Arabic `و` (surrounded by whitespace).
7. **Canonical Text Preservation:** Never destructively alters canonical stored text. Arabic diacritics (tashkeel), hamzas, and original Latin spellings are fully preserved in extracted titles and author names. Normalization is strictly isolated to search/matching routines.
8. **Confidence Scoring:** Outputs granular confidence scores (0.0 to 1.0) for every extracted field and computes an overall confidence metric.

---

### 3. Evidence-Based Candidate Matcher & Ranking Engine (`CandidateMatcher`)
External search results are never accepted blindly. `CandidateMatcher` ranks candidate records using weighted evidence:
- **Exact Validated ISBN Match:** `+60 points` (immediate high certainty).
- **Title Similarity (Normalized):** Up to `+30 points`. Compares strings using Levenshtein edit distance, token Jaccard overlap, and subtitle prefix matching across normalized Arabic (unifying alefs `أ/إ/آ -> ا`, taa marbuta `ة -> ه`, alef maqsura `ى -> ي`, stripping tashkeel).
- **Author Agreement:** Up to `+20 points`. Checks token overlap between query authors and candidate contributors.
- **Publisher Agreement:** Up to `+10 points`.
- **Publication Year Agreement:** Up to `+10 points` (exact year = 10, within 2 years = 7).
- **Language Agreement:** Up to `+5 points`.
- **Edition Agreement:** Up to `+5 points`.

#### Confidence Thresholds:
- **Certain Match (`score >= 70` or exact ISBN):** Safe for automatic enrichment. Missing fields (publisher, year, description) are populated automatically.
- **Suggestion (`40 <= score < 70`):** Retained as an unresolved candidate for user review. Never silently overwrites user data.
- **Rejected (`score < 40`):** Discarded.

#### Multi-Edition Discrimination:
A title match alone never collapses distinct Editions. If a Work has multiple candidate editions (e.g., paperback vs. hardcover vs. Arabic translation), `CandidateMatcher` selects the specific edition closest in publisher, year, and language, maintaining Baglib's intellectual distinction between Work and Edition.

#### ISBN Discovery:
When an import lacks an ISBN, `CandidateMatcher` inspects candidate editions for valid ISBN-10 or ISBN-13 checksums. Discovered ISBNs are cross-checked and linked to the Edition.

---

### 4. Dedicated Multi-Source Cover Discovery (`CoverResolverService`)
Rather than relying on a single provider's cover URL, `CoverResolverService` evaluates cover sources in prioritized cascade:
1. **Embedded Cover Art:** Extracted directly from local EPUB files (via OPF `cover-image` item extraction) or PDF headers. Returned as high-performance data URLs.
2. **Winning Provider Cover:** Cover URL returned by the highest-confidence bibliographic match.
3. **Open Library Covers API:**
   - Queried via ISBN (`/b/isbn/{isbn}-L.jpg?default=false`), OLID (`/b/olid/{olid}-L.jpg?default=false`), or Cover ID (`/b/id/{id}-L.jpg?default=false`).
   - **Crucial Implementation Note:** Always includes `?default=false`. Without this parameter, Open Library returns a 1x1 transparent GIF (43 bytes) with HTTP 200 when an image is missing. With `?default=false`, it returns HTTP 404, allowing deterministic validation.
4. **Google Books ImageLinks:**
   - Upgrades URLs to HTTPS, strips `&edge=curl`, and cascades from `extraLarge` down to `thumbnail`.
5. **Internet Archive:**
   - Resolves book imagery via `https://archive.org/services/img/{ia_id}` when an Internet Archive or Open Library `ocaid` identifier is linked.
6. **Goodreads Uncompressed Master Covers:**
   - Leverages the reverse-engineered Goodreads master resolution technique (from `bookcover-api`): strips `_[^_]*_.` from Amazon/Goodreads CDN thumbnail URLs to access original full-resolution master cover art.
7. **Internet Archive Title Search Cover Fallback:**
   - Queries `archive.org/advancedsearch.php` by clean title to retrieve direct cover art.

#### Image Validation:
Every candidate remote cover is validated before selection:
- HTTP status 200 or 206.
- `Content-Type` header starting with `image/` (`image/jpeg`, `image/png`, `image/webp`).
- `Content-Length` >= 1000 bytes (filters out transparent 1x1 GIFs, empty 43-byte responses, and broken placeholders).
- Timeout protection (5000ms) with AbortController.

#### Caching & Storage:
- **Positive Cache:** In-memory validated cover cache with a 24-hour TTL.
- **Negative Cache:** Missing covers are cached for 5 minutes to avoid hammering remote endpoints during repeated user lookups without permanently locking out transient network issues.
- **Storage Strategy:** Covers are referenced via validated remote URLs or stored in Baglib's local image cache directory (`<userData>/covers/<hash>.jpg`), strictly avoiding unapproved database schema changes.

---

### 5. Architectural & Electron Main Process Boundaries
- **Process Isolation:** All network requests and file parsing occur exclusively in the Electron main process (`src/main/services/metadata/`).
- **Secure IPC Bridge:** Exposed via `library:lookup-metadata`, `library:parse-filename`, `library:resolve-cover`, and `library:discover-metadata` in `src/preload/index.ts`.
- **Throttling & Backoff:** `HttpClient` applies per-provider rate limits (Open Library: 1 req/sec; Internet Archive: 3 req/sec; Google Books: 5 req/sec). Transient errors (HTTP 5xx, timeouts) use exponential backoff with jitter. Rate-limit responses (HTTP 429) respect the `Retry-After` header.
- **User-Agent:** Every request sends the required identifying User-Agent: `Baglib/1.0 (https://github.com/asdman011/Baglib; asdman011@example.com)`.
- **Offline Resilience:** If offline, `discoverBook` falls back cleanly to local filename and embedded evidence without throwing unhandled exceptions, ensuring book imports always succeed.

---

## Consequences

- **Positive:** Books imported without an ISBN are automatically identified, populated with accurate bibliographic fields, and enriched with verified cover art.
- **Positive:** Multi-source cover discovery eliminates the missing-cover gap and prevents 1x1 transparent placeholders from being displayed.
- **Positive:** Full bilingual support for Arabic and English filenames, role markers, and search queries with non-destructive diacritic preservation.
- **Positive:** Strict preservation of Baglib's Work → Edition → Source schema and architectural boundaries.
- **Positive:** Deterministic automated test suite (132/132 tests passing) using mocked network fixtures without external network dependencies.
