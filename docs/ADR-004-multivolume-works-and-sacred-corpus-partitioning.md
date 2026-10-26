# ADR-004: Multi-Volume Works Modeling, Shielded External Ingestion, and Sacred Corpus Partitioning

## Status
Accepted

## Context
As Baglib expanded from single-volume book management into classical scholarship, multi-volume encyclopedic works, and sacred texts (the Holy Quran and the Prophetic Sunnah), three fundamental architectural challenges emerged:

1. **Multi-Volume Sets in Personal Libraries:** Classical literature, Islamic jurisprudence, historical chronicles, and multi-part books (e.g., *Sahih al-Bukhari*, *Tarikh al-Tabari*, *The Lord of the Rings*) frequently span multiple volumes. Previously, each volume had to be managed either as a completely disconnected work or artificially compressed into a single record, losing per-volume file associations, cover art, reading progress, and page positions.
2. **External Digital Ingestion Resilience (LibGen / Mirrors):** Remote search and download mechanisms were vulnerable to anti-hotlink protections (returning 0-byte images on missing referrers), format mismatches (saving EPUBs with `.pdf` extensions), disguised HTML error pages, and false-positive hash corruptions (comparing 32-character MD5 hashes against 64-character SHA-256 storage hashes).
3. **Sacred Corpus Integrity (Quran & Sunnah):** The Holy Quran and Sunnah corpora are immutable, sacred religious texts requiring canonical precision, zero-fabrication guarantees, orthographic variant preservation (e.g. Hafs vs. Warsh), and bilingual Arabic/English navigation. Storing these directly inside the mutable user library schema (`baglib.db`) would risk user accidental edits, cascade deletion, schema migration bloat, and validation failures.

---

## Decision

### 1. Multi-Volume Work Modeling via Work Metadata Extension
We preserved Baglib's strict **Work → Edition → Source** architectural boundary without altering the underlying relational SQLite schema or introducing unapproved container tables.

- **Derived UI Grouping:** Multi-volume sets are derived by normalizing the shared `seriesTitle` (set title) and `author` across works where `volumeNumber` is specified.
- **Independent Life-Cycles:** Each volume retains its own distinct `Work`, `Edition`, and `Source` records in SQLite. Each volume possesses its own independent digital file on disk, file hash, format, reading progress, bookmark collection, personal annotations, and lending history.
- **Extensible Storage:** `volumeNumber`, `totalVolumes`, and `seriesTitle` are stored in the existing `work.metadata_json` structure and validated atomically via `bookVolumeIssue`:
  - `totalVolumes`: Integer bounded between 1 and 10,000.
  - `volumeNumber`: String/number up to 40 characters supporting Arabic (`١, ٢, ٣`), Persian (`۱, ۲, ۳`), and Latin numerals.
  - `seriesTitle`: Normalized string up to 300 characters.
- **Safe Next-Volume Drafting:** `nextBookVolume` pre-fills shared bibliographic metadata (title, author, publisher, categories, language) into a new record while strictly omitting file paths, hashes, ISBNs, covers, notes, and loan history.

---

### 2. Shielded Digital Ingestion & Anti-Hotlink Protection
To guarantee stream reliability and prevent library corruption:
- **Hotlink Referer Injection:** `ContentShieldService.attachToSession` registers an Electron `webRequest.onBeforeSendHeaders` interceptor matching all LibGen domains (`libgen.li`, `libgen.bz`, `libgen.is`, `libgen.rs`, `booksdl.lc`), injecting `Referer: https://libgen.li/` and standard user agents. This resolves CDN 0-byte image suppression while `BookCoverThumbnail.tsx` uses `referrerPolicy="strict-origin-when-cross-origin"`.
- **Files-Tab Scrape Query:** `LibgenProvider.searchFreeTextHydrated` targets `curtab=f&covers=on`, ensuring authentic MD5 hashes, authentic file formats, sizes, and cover paths in search preview rows.
- **Magic-Bytes Format Correction:** `LibgenDownloadService` verifies magic bytes (`%PDF-`, `PK\x03\x04`, etc.) and automatically corrects filename extensions if the server stream differs from user expectations.
- **Identity Encoding & Decompression Fallback:** Downloads explicitly declare `Accept-Encoding: identity` to receive uncompressed streams directly, with automatic `zlib` gunzip/inflate/brotli stream fallbacks if a mirror forces compression.
- **Polymorphic Storage Hash Verification:** `StorageManagerService.verifyWorkStorage` checks hash length: 32-character hashes are validated against the file's MD5 via `computeFileMd5` and automatically upgraded in SQLite to SHA-256 upon verification.

---

### 3. Sacred Corpus Partitioning (Quran & Sunnah)
The sacred texts are strictly decoupled from the mutable user library database:

#### A. Quran Architecture (QPC & QUL Immutable Packs)
- **Separate SQLite Databases:** Stored under `.baglib-data/` and `repos/Quran/` as immutable SQLite files:
  - `qpc-hafs.db` / `qpc-v4.db`: Script words and Uthmanic glyphs (`words`).
  - `mushaf-layout`: Physical page geometry and line assignments (`pages`).
  - `surah-info-ar.db` / `surah-info-en.db`: Surah metadata and historical introductions (`surah_infos`).
  - `topics-ar.db` / `topics.db`: Thematic taxonomy with verified parent-child hierarchies (`topics`).
  - `ayah-themes-ar.db` / `ayah-themes.db`: Ayah-by-ayah themes (`themes`).
- **Cryptographic Hash-Bound Review Verification:** All Arabic metadata translations are validated against canonical Hafs quotes via `build.mjs` and bound to SHA-256 issue hashes in `reviews.json`.
- **Display-Only Deduplication:** Mushaf margin theme labels are deduplicated in memory within each exact surah/ayah range, leaving canonical source text untouched.
- **Khatmah Reading Plans:** Khatmah completion plans are stored in SQLite `app_settings` under key `quran.khatmah.v1`, tracking pacing and dwell intervals without mutating Quran files.

#### B. Sunnah Architecture (Six Canonical Hadith Compilations)
- **Isolated Storage:** Managed by `SunnahService` under `userData/sunnah/` with an authenticated `catalog.json` carrying an authentic SHA-256 hash.
- **Collections Supported:** Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud, Jami` al-Tirmidhi, Sunan an-Nasa'i, and Sunan Ibn Majah.
- **Bilingual Passages:** Every hadith entry stores parallel Arabic and English records structured into `full`, `isnad` (chain of narration), `matn` (core text), scholar `grade`, and chapter metadata.

---

## Consequences

### Positive
- Multi-volume book series are clearly organized, visually badged (`[المجلد 1 من 3]`), and navigable without database schema migrations.
- Online book downloads are 100% verified, correctly formatted, and immune to 0-byte hotlink suppression or false "corrupted" storage flags.
- Sacred Quran and Hadith texts remain immutable, tamper-evident, and isolated from user book deletions and library edits.
- Baglib maintains bilingual (Arabic RTL and English LTR) first-class user experience across all modules.

### Negative / Trade-offs
- Sets are derived based on normalized `seriesTitle` and `author`; sets by the same author with different editions require consistent set titles.
- Quran and Sunnah corpora require separate download/installation packages rather than residing inside the main application installer bundle.
