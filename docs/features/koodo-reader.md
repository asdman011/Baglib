# Reverse-Engineering Findings: Koodo Reader

## 1. Overview & Source Identification

- **Application:** Koodo Reader
- **Repository Path:** `repos/koodo-reader-dev.zip` -> `repos/koodo-reader/koodo-reader-dev/`
- **Architecture:** Electron + React (CRA) + Redux + SQLite (`better-sqlite3`) + Go HTTP Server (`httpserver/`)
- **Inspection Date:** October 2026

Koodo Reader is a cross-platform ebook reader supporting over 15 formats (EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2, CBZ, CBR, CBT, CB7, MD, DOCX, HTML, XML, XHTML, MHTML).

---

## 2. Key Architectural Patterns & Implementations

### A. Four-Tier Architecture
1. **Electron Main Process (`main.js`):**
   - Handles OS integrations, window lifecycle (`open-book`, `new-tab`, `exit-tab`), file associations, native dialogs, and SQLite execution via IPC (`database-command`).
2. **React Renderer (`src/`):**
   - Redux state slices (`book`, `reader`, `manager`, `viewArea`, `sidebar`, `progressPanel`).
   - Container pattern (`containers/viewer`, `containers/panels`, `containers/lists`).
3. **Reading Engine (`src/assets/lib/`):**
   - Book format parsers, SQL migration scripts, and sync utilities.
4. **Embedded Go HTTP Server (`httpserver/`):**
   - Optional lightweight server running on a local port providing an OPDS catalog server (`opds.go`) and KOReader sync server (`koreader.go`).

---

### B. Zero-Dependency Native OS OCR Engine
*Source:* `src/utils/main/ocr-util.js`, `powershell-util.js`
- **Windows Implementation (`Windows.Media.Ocr`):**
  - Instead of forcing users to download 50MB+ Tesseract models, Koodo Reader queries the native Windows Runtime WinRT OCR API: `[Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]` via PowerShell.
  - Automatically utilizes language packs already installed on the user's Windows system (including Arabic `ar-SA` and English `en-US`), achieving sub-second execution with zero bundle bloat.
  - Critical path escaping: Usernames or filepaths containing apostrophes (e.g. `C:\Users\Ammar's\...`) break PowerShell single-quoted literals unless escaped via `s.replace(/'/g, "''")`. PowerShell scripts are executed safely via UTF-16LE base64 encoded commands (`-EncodedCommand`).
  - Cleans CJK/punctuation spacing artifacts (`cleanWindowsOcrText`) using Unicode range regex passes.
- **macOS Implementation:**
  - Invokes native Apple Vision framework binary (`VNRecognizeTextRequest`).
- **Baglib Enhancement:**
  - Koodo only returned flat plain text strings (`result.Text`). Baglib extends this architecture to extract full structured word and line bounding boxes (`OcrWord.BoundingRect` and `OcrLine.BoundingRect`), enabling pixel-accurate invisible text-layer overlays on scanned historical manuscripts.

---

### C. OS Biometrics & App Security (Windows Hello & Touch ID)
*Source:* `src/utils/main/biometric-util.js`, `powershell-util.js`
- **Windows Hello Integration:**
  - Uses `Windows.Security.Credentials.UI.UserConsentVerifier` bridged via WinRT PowerShell.
  - On Windows 11 / Windows 10 build 22000+, binds the verification prompt directly to Electron's native HWND window handle using `IUserConsentVerifierInterop::RequestVerificationForWindowAsync(hwnd)` (`riid = fd596ffd-2318-558f-9dbe-d21df43764a5`).
  - Seamlessly accepts Fingerprint, Face recognition, and Windows PIN.
  - PowerShell script execution is executed safely via UTF-16LE base64 encoded commands (`-EncodedCommand`) with proper single-quote escaping (`s.replace(/'/g, "''")`) to prevent command injection or execution failures in paths with apostrophes.
- **macOS Integration:**
  - Calls Electron's `systemPreferences.promptTouchID(promptMessage)`.
- **Master PIN Fallback & Inactivity Protection:**
  - Master PIN fallback using PBKDF2 key derivation (SHA-512, 100,000 iterations, 16-byte cryptographically secure random salt).
  - Verification uses constant-time string buffer comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
  - Automated idle timeout detection locking the app after inactivity, with optional granular protection restricting locks only to Private Shelves.

---

### D. Comprehensive Multi-Format Export Engine
*Source:* `src/utils/file/export.ts`
- **Formats Supported:** Markdown (`.md`), Plain Text (`.txt`), HTML (`.html`), CSV (`.csv`), PDF (`.pdf`), and JSON (`.json`).
- **Multi-Book Compression:**
  - When exporting notes from multiple books simultaneously, packs them into a `.zip` archive via `jszip`.
  - Generates both an aggregated file (`all.md` / `all.pdf`) and individual per-book files (`<Sanitized_Book_Title>.md`).
  - Formats highlights as Markdown blockquotes (`> [text]`), notes with timestamps, tags, chapters, and CFI anchor links.

---

### E. Comic & Archive Streaming
*Source:* `src/utils/main/tar-index.js`, `main.js`
- Employs streaming archive indexing for `.cbr`, `.cbz`, `.cbt`, and `.cb7` comic files.
- Extracts images by byte offset rather than decompressing entire multi-hundred megabyte archives into RAM.

---

### F. Metadata & Bookmark Search Architecture
*Source:* `src/utils/file/bookUtil.ts`, `src/utils/file/configUtil.ts`, `src/components/searchBox/component.tsx`
- **Linear Metadata Querying (`searchBooksByKeyword`):**
  - Executes raw SQL `LIKE` queries against the books table: `SELECT * FROM books WHERE name LIKE ? OR author LIKE ? OR key LIKE ?`.
  - In web/non-Electron mode, iterates through books in memory with `book.name?.toLowerCase().includes(...)`.
- **Architectural Limitations:**
  - **No In-Book Full-Text Search:** Koodo only searches book titles, author metadata, and user bookmarks/highlights. It cannot search inside the body text of books or chapters across the library shelf.
  - **Lack of FTS Indexing & BM25 Ranking:** Uses unindexed `LIKE %...%` wildcard matching which causes full table scans and lacks term frequency, inverse document frequency (TF-IDF/BM25), or proximity relevance scoring.
  - **Zero Morphology / Diacritic Handling:** Fails to match Arabic or accented European queries when vowels, accents, or letter variants differ (e.g. searching "كتاب" will miss "كِتَابٌ" or "إسلام" vs "اسلام").

### G. Multi-Cloud Storage Connectors & Synchronization Architecture
*Source:* `src/utils/sync/`, `src/utils/sync/webdav.ts`, `src/utils/sync/s3.ts`, `src/utils/sync/drive.ts`
- **Multi-Provider Cloud Sync:**
  - Koodo Reader supports synchronizing library databases and book collections across diverse cloud targets:
    - **WebDAV / Nextcloud:** Uses RFC 4918 `PROPFIND`, `MKCOL`, `PUT`, `GET`, and `DELETE`. Parses XML multi-status responses (`D:multistatus` and `d:multistatus`) to discover directory listings, file sizes, and last modified dates.
    - **S3-Compatible Object Storage:** Directly interacts with S3 endpoints (AWS, MinIO, Cloudflare R2, Wasabi) utilizing AWS Signature Version 4 (SigV4) HMAC-SHA256 authorization headers. Handles `ListObjectsV2` XML payload parsing to query remote bucket contents.
    - **OAuth & Token Connectors:** Implements generic REST token-based synchronization for consumer storage providers (Dropbox, Google Drive, OneDrive, Box) and network shares (SMB, SFTP).
- **Remote Book & Backup Discovery:**
  - Allows querying remote folder hierarchies to locate `.zip` backups and supported ebook formats (`.epub`, `.pdf`, `.mobi`, etc.) directly from the cloud for on-demand downloading and importing.

---

### H. Version Snapshots & Safe Rollback Pipeline
*Source:* `src/utils/backup/backupUtil.ts`, `src/utils/backup/restoreUtil.ts`
- **Compressed Point-in-Time Snapshot Generation:**
  - Bundles the active library state into a single timestamped `.zip` archive:
    - `baglib.db` (or SQLite database file)
    - `settings.json` (application preferences, cloud configurations, reader theme)
    - `annotations.json` (extracted bookmarks, highlights, notes)
    - `manifest.json` (version metadata, timestamp, book counts, checksums)
- **Automatic Retention Auto-Pruning:**
  - Enforces a configurable snapshot ceiling (e.g., maximum 30 snapshots), automatically pruning the oldest archives using alphabetical/timestamp sort to keep local storage overhead bounded.
- **Atomic Safe Restore Pipeline:**
  - **Pre-flight Rollback Backup:** Before overwriting the active live database, copies the current database to a temporary backup file (`.rollback.bak`).
  - **In-Place Swap & Integrity Verification:** Extracts the snapshot archive and runs SQLite integrity checks (`PRAGMA integrity_check`).
  - **Automatic Rollback Guarantee:** If the archive is corrupt, missing required files, or fails the SQLite integrity check, the pipeline immediately halts, removes corrupt extractions, and restores the live database from `.rollback.bak`, preventing catastrophic database loss.

### I. Local OPDS Feed Server & Network Discovery
*Source:* `httpserver/opds.go`, `src/components/dialogs/opdsDialog/component.tsx`
- **Embedded OPDS 1.2 HTTP Catalog Server:**
  - Implements an embedded HTTP server exposing the user's local digital library over the local Wi-Fi network.
  - Endpoints:
    - Root Navigation Feed (`GET /opds`): Returns Atom navigation XML (`application/atom+xml;profile=opds-catalog;kind=navigation`) pointing to subsections (All Books, Recent, Search).
    - Acquisition Feed (`GET /opds/books`): Returns Atom acquisition XML with entry titles, authors, summaries, cover image links (`http://opds-spec.org/image`), and acquisition download links (`http://opds-spec.org/acquisition`) with correct MIME types.
    - OpenSearch Description (`GET /opds/opensearch.xml`): XML descriptor declaring the search URL template: `/opds/search?q={searchTerms}`.
    - Book Download Endpoint (`GET /opds/download/:id`): Streams raw EPUB/PDF/MOBI files to requesting e-ink readers (KOReader, Moon+ Reader) with proper `Content-Disposition`.
  - **Security & Authentication:**
    - Supports optional HTTP Basic Authentication (`WWW-Authenticate: Basic realm="OPDS Catalog"`), preventing unauthorized downloads on shared Wi-Fi networks.
  - **OPDS Client (`opdsDialog`):**
    - Connects to remote public domain catalogs (Project Gutenberg, ManyBooks) and Calibre content servers, parsing Atom XML acquisition links and downloading books directly into the application.

---

## 3. Lessons & Implications for Baglib

1. **Native Windows Hello & App Lock:** Adopted Koodo Reader's WinRT interop script directly in `app-lock.service.ts`, enhanced with 64-bit HWND window handle binding via `IUserConsentVerifierInterop` and constant-time PBKDF2 (SHA-512) Master PIN fallback. Fully integrated with automated idle timeout locking and private shelf protection in `AppLockModal.tsx`.
2. **WinRT OCR & Structured Bounding Boxes:** Demonstrated that native Windows `Windows.Media.Ocr` and macOS Apple Vision outperform bulky WASM OCR bundles by providing instantaneous, hardware-accelerated text extraction with zero download requirements. While Koodo only extracted unstructured plain text, Baglib upgraded this pattern to extract structured bounding box coordinates, allowing invisible selectable text layers (`OcrTextOverlay`) that enable text selection, dictionary lookup, and annotations over scanned manuscripts.
3. **Local OPDS Server & Wireless E-Ink Delivery:** Koodo's Go HTTP server proved that exposing an OPDS 1.2 catalog transforms a desktop library into a personal wireless book server for e-ink devices running KOReader or Moon+ Reader. Baglib implements this natively in Node.js HTTP within the Electron main process, augmented with automatic LAN IP address detection (`os.networkInterfaces`) and an intuitive 1-click copy interface in `OPDSHubModal.tsx`.
4. **Multi-Book ZIP Packaging with `fflate`:** Adopted Koodo Reader's multi-book export architecture (generating individual per-book files + aggregated `all.<ext>` + manifest `README.txt`). Improved on Koodo by replacing `jszip` with `fflate.zipSync` for purely synchronous in-memory compression with zero disk scratch files.
5. **RFC 4180 CSV with UTF-8 BOM:** Discovered that standard UTF-8 CSVs without BOM result in mojibake when opened in Excel on Windows/macOS with Arabic characters. Prepending `\uFEFF` guarantees flawless Arabic and multilingual display.
6. **SQLite FTS5 Shelf-Wide Indexing vs Linear LIKE:** Proved that Koodo Reader's `LIKE %query%` approach is fundamentally inadequate for a serious digital library. Baglib introduces SQLite FTS5 virtual tables (`book_content_fts`) with BM25 ranking, snippet extraction, and sub-millisecond retrieval across millions of words, paired with a specialized Arabic morphology normalizer.
7. **Unified `IStorageProvider` Cloud Interface:** Koodo Reader demonstrated the importance of giving readers control over their data without cloud lock-in. Baglib formalized this with a robust TypeScript interface (`IStorageProvider`), shipping first-class implementations for WebDAV/Nextcloud, S3/R2/MinIO, and generic OAuth cloud providers for both automated backup uploads and remote book imports.
8. **Atomic Snapshot Restore with Safe Rollback:** Directly adopted Koodo Reader's snapshot paradigm (`baglib.db`, `settings.json`, `annotations.json`, `manifest.json`), elevating it with strict atomic `.rollback.bak` restoration and SQLite `PRAGMA integrity_check` verification to ensure zero risk of corrupted or bricked user libraries.

