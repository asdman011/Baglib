# Reverse-Engineered Feature Documentation: Library Genesis (LibGen / libgen.li)

## Overview & Investigation Context
- **Target Application / Service:** Library Genesis (`https://libgen.li` API & Web Portal)
- **Investigation Date:** October 2026
- **Endpoints Examined:**
  - `https://libgen.li/json.php` (Official Machine-to-Machine JSON API)
  - `https://libgen.li/index.php` (Search gateway & Table rendering engine)
  - `https://libgen.li/edition.php` (Edition detail page)
  - `https://libgen.li/ads.php` & `https://libgen.li/get.php` (Download gateway, token generation, and CDN redirector)
  - Public IPFS Gateways (Decentralized backup distribution via IPFS CID)

---

## 1. Official `libgen.li/json.php` API Specification

The `libgen.li` JSON API receives HTTP GET requests and returns up to 10,000 JSON records. It is strictly structured around relational database entities.

### 1.1 Mandatory `object` Parameter
Allowed values:
- `e`: Editions
- `f`: Files
- `w`: Works
- `a`: Authors
- `s`: Series
- `p`: Publishers

### 1.2 Supported Search Keys by Object
- **`object=e` (Editions):**
  - Searchable only by: `ids`, `id_start`, `id_end`, `timelast`, `timefirst`, `doi`, `isbn`, `dois`.
  - Core returned fields: `e_id, title, libgen_topic, type, series_name, title_add, author, publisher, city, edition, year, month, day, pages, editions_add_info, cover_url, cover_exists, doi`.
- **`object=f` (Files):**
  - Searchable only by: `ids`, `id_start`, `id_end`, `timelast`, `timefirst`, `md5`, `tth`, `sha1`, `sha256`, `crc32`, `edonkey`, `aich`, `btih`.
  - Core returned fields: `f_id, md5, pages, dpi, filesize, extension, locator, broken, cover_info, libgen_topic`.
- **`topic` Parameter:** Valid repositories:
  - `l`: Libgen (scientific/technical books)
  - `c`: Comics
  - `m`: Magazines
  - `a`: Scientific articles
  - `s`: Standards
  - `f`: Fiction
  - `r`: Russian fiction

### 1.3 Relational Subarrays (`ids` Mode Only)
When specific records are requested via the `ids` parameter:
- `object=e&ids={id}` automatically includes the related `files` and `works` subarrays.
- `object=f&ids={id}` automatically includes the related `editions` subarray.

### 1.4 Extended Metadata (`addkeys` Parameter & `add` Subarray)
Requesting `addkeys=*` or specific comma-separated numeric keys returns an associative `add` map where each entry has `{ e_add_id, key, value, name_en }`:
- `10`: Main Title in original language
- `13`: Main Title in English translation
- `101`: Language (`eng`, `ara`, etc.) / `102`: Language original
- `308`: Publisher ID
- `401`: Author (with role) / `415`: Translator
- `505`: ISBN / `501`: ISSN
- `606`: Topic (Books) / `630`: Series
- `851`: SHA1 / `852`: SHA256
- `863`: Cover URL
- `877`: IPFS CID (`bafykbzace...`)
- `920`: Open Library ID / `945`: Google Books ID
- `990`: Tags / `995`: Table of contents / `996`: Description / `999`: Notes

---

## 2. Baglib 3-Path Lookup Architecture

Because `json.php` does **not** support free-text keyword search directly, Baglib employs a hybrid 3-path pipeline:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Baglib Query / Input                   │
                  └──────────────────────────┬─────────────────────────────┘
                                             │
             ┌───────────────────────────────┼───────────────────────────────┐
             ▼                               ▼                               ▼
     [Path A: Local File]        [Path B: ISBN or DOI]         [Path C: Free-Text Query]
             │                               │                               │
    1. Calculate MD5/SHA1           1. Query json.php?              1. Scrape index.php?req=
    2. Query json.php?                 object=e&isbn=                  extract edition.php?id=
       object=f&md5=...             2. Extract e_id list               or ads.php?md5=
    3. Extract f_id & e_id          3. Hydrate files via            2. Hydrate top 10 e_ids via
    4. Hydrate full edition            json.php?object=e&ids=          json.php?object=e&ids=...
       via object=e&ids=...                                         3. Map candidates with
                                                                       nested files & cover
             │                               │                               │
             └───────────────────────────────┼───────────────────────────────┘
                                             ▼
                          NormalizedMetadataCandidate /
                             LibgenSearchResult List
```

### Path A: Hash Verification (Direct File Sync)
- Input: Existing file path or buffer.
- Flow: Compute `crypto.createHash('md5')`, call `json.php?object=f&md5=${md5}&fields=*&addkeys=851,852,877`, extract `f_id` and related `e_id`, then hydrate `object=e&ids=${e_id}` with full bibliographic and description data.

### Path B: Identifier Direct Lookup
- Input: ISBN (10 or 13 digits) or DOI.
- Flow: Query `json.php?object=e&isbn=${cleanIsbn}&fields=*&addkeys=*`. If matching edition is found, batch re-query with `ids` to ensure the nested `files` subarray (with direct download MD5s) is fully populated.

### Path C: Free-Text Search (Scrape $\rightarrow$ JSON Batch Hydration)
- Input: Book title, author name, or keywords.
- Flow: Query `index.php?req=${encodedQuery}` with browser headers. Extract edition IDs from table rows (`edition.php?id=(\d+)`) and file MD5s (`ads.php?md5=([a-fA-F0-9]{32})`). Batch query `json.php?object=e&ids=${ids.join(',')}&fields=*&addkeys=10,101,102,401,505,630,863,995,996` in a single HTTP request.

---

## 3. Resilient Download Pipeline & Gateway Resolution

Downloading files directly from `libgen.li` cannot be done via simple URL substitution because download links are protected by session/timestamp keys and hotlink referer checks.

### 3.1 Multi-Mirror Race Gateway Resolution
- Rather than sequentially polling mirrors when one times out, Baglib fires parallel requests to primary and mirror gateways (`https://libgen.li/ads.php?md5=${md5}` and `https://libgen.bz/ads.php?md5=${md5}`) using `Promise.any` with individual 6-second timeouts.
- As soon as either mirror responds with HTML containing a valid `get.php?md5=...&key=...` link, that mirror is immediately selected for the download stream, completely eliminating resolution lag or stalls caused by gateway delays.

### 3.2 Single-Use Key Token Mechanics & Zero-Preflight Streaming
- **Single-Use Key Token:** The key generated by `ads.php` (`get.php?md5=${md5}&key=${key}`) is strictly single-use.
- **Preflight Trap:** Making an exploratory `HEAD` or `GET` request to inspect response headers (such as `Location`) consumes the token. Subsequent requests to the CDN (`cdn*.booksdl.lc`) using the consumed token result in `403 Forbidden`, `404 Not Found`, or indefinite throttling/stalls.
- **Direct Stream Execution:** Baglib streams directly to the `get.php` endpoint in the Electron Main process, maintaining the origin `Referer: https://${host}/ads.php?md5=${md5}`. It follows the `307 Temporary Redirect` in-flight on the same connection pipeline directly to the CDN mirror without making any separate preflight requests.

### 3.3 High-Speed Binary Streaming Architecture
- **Elimination of IPC Throughput Bottlenecks:** Downloads run strictly inside Node's Main process. No binary data chunks are streamed across Electron IPC to the Renderer (which previously caused major CPU serialization lag).
- **1 MB Streaming Buffer:** File streams utilize `fs.createWriteStream(tempPath, { highWaterMark: 1024 * 1024 })` paired with `stream.PassThrough` to ensure Chromium and Node stream at native network line speeds.
- **Header Optimization:** Binary downloads avoid sending `Accept-Encoding: gzip, deflate, br` because proxy intermediaries attempt chunked gzip re-encoding on binary streams, introducing backpressure latency. Standard browser headers (`User-Agent`, `Referer`, `Connection: keep-alive`) and persistent HTTP agents (`keepAlive: true`) match browser throughput.
- **On-the-fly Validation:** The first data chunk is inspected for genuine magic bytes (`%PDF-` for PDF, `PK\x03\x04` for EPUB), while MD5 hash computation is performed concurrently in-stream via `crypto.createHash('md5')`.

### 3.4 Headless Native Chromium Fallback
- If Node's pure HTTP stream fails or is blocked by Cloudflare/DDoS verification, Baglib falls back to a hidden Electron `BrowserWindow`:
  - `show: false` and `skipTaskbar: true` are strictly enforced to prevent any UI flicker or window popups.
  - `webPreferences: { backgroundThrottling: false }` ensures Chromium does not throttle the background network stack.
  - `setWindowOpenHandler(() => ({ action: 'deny' }))` ensures gateway ad scripts or `target="_blank"` triggers cannot spawn secondary visible popup windows.
  - Intercepted natively via `session.once('will-download')` where Chromium's native C++ download manager writes directly to disk.

### 3.5 IPFS Decentralized Fallback
If `ads.php` or `get.php` CDN servers are offline or throttling:
- Check if key `877` (IPFS CID) was returned by `json.php`.
- If available, download directly from public IPFS gateways:
  - `https://ipfs.io/ipfs/${cid}`
  - `https://cloudflare-ipfs.com/ipfs/${cid}`
  - `https://gateway.pinata.cloud/ipfs/${cid}`
  - `https://dweb.link/ipfs/${cid}`

---

## 4. ContentShield & Ad-Blocker Integration

Gateway mirrors frequently deploy intrusive ad networks, popunders, and deceptive download buttons. Baglib integrates `ContentShieldService` across all Electron sessions:

- **Session Partition Protection:** Listens to `app.on('session-created')` and attaches to both `session.defaultSession` and any custom partitions (`persist:...`). All web requests across all sessions are filtered.
- **Comprehensive Ad & Tracker Blacklist:** Blocks over 35 known aggressive ad/popunder domains (such as `syndication.exdynsrv.com`, `adsterra`, `popcash`, `propellerads`, `highcpmgate.com`, `trafficfactory`, `admaven`, etc.).
- **Strict Popup Denial & Safe External Delegation:** Web contents have `setWindowOpenHandler` hooked to deny all internal popup windows (`{ action: 'deny' }`). If a user clicks an explicit external link, it is routed through `shell.openExternal(url)` to open in their default system browser, never inside a raw internal Electron `BrowserWindow`.

---

## 5. Architectural Alignment with Baglib
- **Work $\rightarrow$ Edition $\rightarrow$ Source Model**:
  - `object=e` maps directly to Baglib's `Edition` and `Work`.
  - `object=f` maps to `Source` (`file_source_detail`).
- **Safe Protocol**: Files are saved into managed storage, and covers are loaded via `baglib-asset://` or data URLs.
- **Bilingual Interface**: Arabic and English RTL/LTR interfaces fully supported for search, metadata display, and progress tracking.
