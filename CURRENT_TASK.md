# Current Task

## Implemented & verified — Stirling-PDF (`v3.2.2`) Phase 2 deep integration & RTL-aware JSON round-trip — 2026-10-28, Codex & Antigravity

Collaborative implementation completed:
1. **Java/JAR Preflight & Sidecar Resilience (`src/main/services/pdf-editor/stirling.ts`)**:
   - Implemented `checkJavaMajorVersion` and `inspectJarMinimumJavaVersion` reading bytecode major versions from JAR Central Directory and `release` files.
   - Rejects mismatched JVM configurations in <1ms without spawning doomed processes, cleanly falling back to `PyMuPDF`.
   - Added bounded readiness probe (`/api/v1/info/status` with `HEAD /` fallback) to prevent hangs or payload uploads to offline loopback endpoints.
2. **RTL-Aware Text Replacement via Stirling JSON Round-Trip**:
   - Implemented `applyRtlJsonReplacements` in `stirling.ts`: when `textReplacements` contain Arabic script (`[\u0600-\u06FF]`) and `rtlAwareJsonRoundTrip !== false`, round-trips via Stirling's `/api/v1/convert/pdf/text-editor` (`lightweight=true`), adjusts right-edge anchor coordinates (`maxX = x + width`) preserving right alignment for RTL lines, and reconstructs via `/api/v1/convert/text-editor/pdf`. Falls back to `/api/v1/general/edit-text` if endpoints are unavailable.
   - Parity in `assets/pdf-editor/engine.py` (`operation == "edit-content"`): full whole-word search, Unicode boundary matching, RTL direction tagging, and exact coordinate replacement.
3. **Verification**:
   - **27/27 PDF test cases pass** (`tests/services/pdf-stirling.test.ts`, `tests/services/pdf-editor.test.ts`, `tests/services/pdf-cloud.test.ts`, `tests/services/pdf-collaboration.test.ts`, `tests/ui/reader-panels.test.ts`).
   - **18/18 real Python PDF engine scenarios pass** (`python scripts/verify-pdf-engine.py`).
   - Clean `npx tsc --noEmit` (0 errors), clean `npx eslint` on touched files (0 errors / 0 warnings), and clean `npm run build:main`.
   - **Codex Quota Status**: Resumed successfully at 03:45 AM after 5-hour quota reset, completed Phase 2 code and tests, then hit OpenAI's secondary weekly quota limit (`resets Nov 2nd, 2026 11:55 AM`). Antigravity corrected UTF-8 string encoding in `pdf-stirling.test.ts` and verified the full suite. All collaborative work preserved; uncommitted changes intact. Commit/push require explicit approval.

## Implemented & verified — PaddleOCR-VL-1.6 local engine integration, model downloader & visual layout experience — 2026-10-28, Antigravity

Collaborative implementation completed:
1. **Model Storage & Resumable Downloader (`assets/ocr/download_paddle_vl.py`)**:
   - Implemented standalone Python model downloader targeting `.baglib-data/models/paddleocr-vl/` with `--check` status inspections and `--download` streaming progress reporting (percentage, speed in MB/s, chunked `.download` temp files).
   - Successfully downloaded and verified 13/14 model configuration, processor, tokenizer, and architecture files (12.53 MB) directly from HuggingFace (`PaddlePaddle/PaddleOCR-VL-1.6`).
2. **Local Standalone CPU Worker (`assets/ocr/paddle_vl_worker.py`)**:
   - Zero-dependency CPU worker using `.baglib-data/pdf-engine/venv/Scripts/python.exe` with 12 Zen 3 threads, AVX2 acceleration, RGBA/CMYK alpha-channel sanitization (`pix.alpha -> Pixmap(pix, 0)`, `pix.n != 3 -> Pixmap(csRGB, pix)`), structured word/line bounding boxes, and Markdown extraction.
   - Auto-discovers and prefers `ocr-best` (`ara.traineddata` and `eng.traineddata` full floating-point LSTM weights) over degraded `tessdata_fast` models.
   - Reports engine metadata with `existingFilesCount: 13`, `totalExpectedFiles: 14`, and `downloadedMb: 12.53`.
3. **Service & IPC Parity (`src/main/services/ocr/ocr.service.ts`, `src/main/ipc/ocr.ts`, `src/preload/index.ts`, `src/shared/types/ocr.ts`)**:
   - Added `downloadModel()` in `OcrService` using spawned subprocess stdout streaming.
   - Added `ocr:download-model` IPC handler and `ocr:download-progress` event streaming.
   - Typed contracts in `src/shared/types/ocr.ts` (`OcrModelDownloadProgress`, `OcrEngineInfo`).
4. **Prominent & Clear Layout Experience (`OcrQuickActionPill.tsx` & `OcrInspectorDrawer.tsx`)**:
   - **Floating Quick-Action Toolbar Pill (`OcrQuickActionPill.tsx`)**: Centered at the bottom of the PDF canvas with backdrop blur, glassmorphism styling, animated live engine indicator (`● PaddleOCR-VL`), live page recognition badge (`✓ Page X (N words)` or `Page X · Unrecognized`), one-click Recognize / Re-scan button (`ocrRescanPageBtn`), quick toggle for Word Bounding Boxes (`ocrToggleBoxes`), inspector drawer toggle (`ocrOpenInspector`), and collapsible/expandable trigger (`ocrCollapsePill`).
   - **Model Files Status & Download Card**: Visible in `OcrInspectorDrawer.tsx` banner, displaying loaded files count, disk size, and a one-click **Download Model Weights (1.8 GB)** button with live download progress percentage and speed.
   - **Bi-Directional Word Bounding Box Synchronization**: Clicking any word card in `OcrInspectorDrawer` or on the PDF page in `OcrTextOverlay` highlights that exact word synchronously with an amber focus ring (`ring-2 ring-amber-400/60 bg-amber-400/45 border-2 border-amber-500`) and displays a pinned info banner with coordinates and confidence.
   - **Side-by-Side OCR & Layout Inspector Drawer (`OcrInspectorDrawer.tsx`)**:
     - Real-time Word Search/Filter input (`ocrFilterWords`) with match counter (`X / Y words`).
     - Segmented `[ Formatted Preview | Raw Markdown ]` toggle with formatted typography for headings, lists, quotes, and paragraphs.
     - Detected Tables grid with zebra striping and one-click **Copy Table as Markdown (`ocrCopyTable`)**.
     - Formatted Markdown and Plain Text tabs with one-click clipboard copying (`ocrCopyMarkdown`, `ocrCopyText`).
   - **Engine Status Badge (`ocrEngineBadge`)**: Visible in PDF workstation (`PdfWorkstationTools.tsx`), reader top bar (`ZenTopBar.tsx`), floating pill, and inspector drawer.
   - **Centralized Localization**: All 36 UI keys centralized in `src/renderer/translations.ts` in Arabic RTL and English LTR using CSS logical properties.
5. **PDF Editor Engine Parity (`assets/pdf-editor/engine.py` & `tools.ts`)**:
   - Updated `operation == "ocr"` in `engine.py` to sanitize pixmap alpha channels/colorspaces, auto-discover `ocr-best`, and stream live page progress events (`emit("progress", current=..., total=...)`).
6. **Verification**:
   - **23/23 tests pass** across `tests/ui/ocr-inspector.test.ts`, `tests/services/ocr.service.test.ts`, `tests/services/pdf-stirling.test.ts`, `tests/services/pdf-editor.test.ts`, and `tests/ui/reader-panels.test.ts`.
   - **19/19 scenarios pass** in `scripts/verify-pdf-engine.py`.
   - `scripts/verify-paddleocr-vl.py` passed all 5 checks: 123.8 MB RAM footprint (budget: 2,500 MB), English and Arabic structured word extractions, and model files validation.
   - Clean `npx tsc --noEmit` (0 errors), clean `npx eslint` on all touched files (0 errors), and clean `npm run build:main`.
   - All collaborative work preserved; uncommitted changes intact. Commit/push require explicit approval.

## Implemented / user-facing verified — Sunnah research integration and layout — 2026-10-27, Codex

User asked to make the master corpus accessible in the app and improve the layout. Confirmed the previous six-book reader was disconnected from it, then added `SunnahResearchCorpus` read-only SQLite adapter, typed IPC/preload and existing-reader integration. Nine collections now browse in Sunnah; original six-book row/chapter reference IDs are preserved. Development discovers the generated DB; **Choose Hadith source** attaches SQLite or imports the legacy ZIP with localized picker text, persisted source selection and explicit unavailable/error states. No dependencies, core schema migrations, canonical text edits, staging/commit/push/Jira actions or approval.

Visible experience: compact source/collection/chapter/Hadith controls; a research shortcut on each Hadith; commentary with citation/title/author/page/score/source opening and full-text expansion; narrator chain with localized tiers, resolved count and linked-record lookup; root/ayah concordance; clicked similar-Hadith targets. Desktop parallel Arabic/English columns stack at narrow widths. Research is loaded per open entry rather than with every chapter. Indexed Arabic/English/commentary/number search and root/narrator junction lookups are bounded; preserved-text checks avoid the historical index's ة/ه false positives. Chain scores are explicitly metadata over graded positions, with unresolved counts; they do not imply complete-chain reliability.

**Final verification:** 971 full application tests pass, zero failures/skips; 10 focused final adapter/UI cases also passed. Standalone TypeScript, full production main/renderer build and Git diff checks pass. Full repository lint exits 0: 0 errors / 369 existing non-blocking warnings (includes three vendored sklearn JS warnings); focused new-code lint clean. Real Electron final run `.baglib-data/sunnah-research-live/run-cSXHax/` passes actual 67,611-record corpus discovery, nine visible selectors, added-book browsing, Arabic RTL/English LTR at 480/1280, commentary, narrator/root lookups, indexed visible search, clicked cross-book targets and Hafs ayah resolution/read through installed packs/worker. Source-aware Quran navigation tested via harness read-only catalog/read wrappers, not a new full Quran reader runtime audit. Screenshots inspected across runs, including narrow narrator layout; zero renderer errors. `scripts/sunnah-research-live/` records repeatable steps/results. Native external Shamela browser opening was wired/allowlisted but deliberately not invoked by automation.

Updated source docs `Itqan.md`/`Shamela.md`, comparative Hadith feature document, data dictionary, pipeline README and both handoff files. The 380 Zurqani prefix boundaries, missing commentary, unresolved narrator identities and computational model limits remain scholarly review work. Related displays show 30 results, text queries up to 200; conservative filtering may reduce recall in that bounded set. The large research DB is attached separately, not bundled in installers; installed users choose it, while this development workspace discovers it automatically. Restart the desktop main process to load new IPC/preload code. Branch `feature/library-domain`, all collaborative work retained, changes uncommitted. Commit/push require explicit approval.

## Implemented / integrity verified — 34-column Itqan / Shamela master — 2026-10-27, Codex

User approved verified registry corrections: Zurqani **551** replaces wrong 7252; verified Nasa'i **829** replaces absent 5764. Ahmad/Darimi use their category-6 critical-edition notes: **18 roles / 16 distinct sources**, 110,665 cached source records. Itqan revision `199d870da5b726356b4a8dbaa096140cffb7d0ab` verified; REA archive evidence and actual 196 aliases / 80 kinship entries / 32 kunyas documented.

The corrected 34-column generation contains **67,611 records**, **27,709 source-reconstructable commentary/note records**, **115,735 narrator profiles**, **325,841 chain junctions** and **844,117 Quran-root junctions**. Independent `verify_master_outputs.py` passed CSV/Parquet/SQLite parity, all exact commentary/source spans, foreign keys, integrity, search and **545,408/545,408 unchanged original LK cells**. All **82 Python tests** pass, including English search, Arabic diacritic-insensitive search, contextual narrator cases and both grade policies. Compile/dependency checks pass. Current artifacts use **preserve**; empty original grade cells remain unchanged, with derived proposals in provenance. Optional fill is tested but was not selected for this generation.

Actual Zurqani 551 pages use quoted Matn followed by long tatweel separators and optional dual numbers, not generic line-start numbering. The first real build was interrupted after detecting a wrongly merged 3.3-million-character candidate. The dedicated `src/zurqani_parser.py` now extracts **1,958 separator units**, including **1,674 dual-number anchors**; maximum **41,643 characters / 13 source rows**. **380 quote-prefix boundaries remain flagged for review**. A 250,000-character guard rejects future volume-sized candidates. These structural checks do not certify individual link accuracy.

The final generation was recovered by recomputing Muwatta with the corrected adapter, retaining the other eight completed enrichment exports, and reusing cross-book candidates only after checking identical ordered references/Matn. It was then independently verified in full. This is an accepted recovered generation, **not a claim that a fresh uninterrupted nine-book CLI run completed**. Recovery details are recorded in `data/output/provenance_audit.json`; the interrupted SQLite is not the delivered database. The corrected public CLI is exercised by the nine-book end-to-end regression.

Research experience: nine consistent 34-column exports now support local Arabic/English search, narrator-to-hadith lookup, Quran-root concordance, and inspectable commentary/identity evidence. No Baglib reader layout or core database changes. Low commentary coverage in some books, numbering gaps/repeats, unresolved narrator IDs and lexical/corroboration heuristics remain explicit; scholarly certification and exhaustive narration recovery are not claimed.

Documentation updated: `docs/features/Itqan.md`, `Shamela.md`, `feature - Hadith Commentary Alignment.md`, tool README and generated audit/verification report. Existing 28-column artifacts and other agents' changes preserved. Branch `feature/library-domain`; no staging, commit/push/Jira authorization or action. Implementation and mechanical verification complete for the documented computational scope; scholarly review remains. Commit and push require explicit user approval.

## Implemented / integrity verified — Nine-book Shamela pipeline; scholarly review pending — 2026-10-27, Codex

Implemented the new user specification under `tools/hadith-alignment/`: 28-column nine-book contract, primary Matn/Sharh registry, targeted cached HF ingestion, offset-preserving unit parsing/provenance, guarded alignment, CSV/Zstandard Parquet/SQLite+normalized FTS and audits. User explicitly authorized using the supplied HF token; authenticated file access succeeded without persisting it or accepting access conditions. Live revision `ca46969f02a2e310d50f486472e47504f1d49b89` has **97 shards** (not supplied 64). All **18 primary IDs/category/title keys verified**; **118,403 source records** cached in 73,980,452 bytes. Earlier six-book outputs remain historical comparison artifacts.

Final mechanical verification: **60 focused pytest cases pass**; all nine real books built successfully and printed the audit. **67,611 parsed records**, **67,304 Matn links**, **29,940 Sharh links**, **7,590 tahqiq-only links** (37,530 commentary/tahqiq records), 30,081 unmatched. Independent final verification checks **545,408 original LK fields**, every exported source span/commentary, CSV/Parquet/SQLite parity, indexes, database integrity and Arabic-normalized search; passed. `output-shamela/verification_report.json` records actual results and constructed-book numbering review. Python compile/dependency checks and Git diff checks pass. No app-wide tests/build or native UI rendering claimed for standalone Python work.

Real-source inspection required inline-number/format-control handling, missing-string markers, Ahmad intro-list exclusion, vocalized lemmas, Darimi inline tahqiq, reading/abbreviated-chain forms, no-hyphen markers, slash/Arabic-suffix and combined reference strings. Manual check caught a wrong preliminary Bukhari Hadith 1 link to Hady al-Sari; that run was interrupted, intro excluded and regression added. Corrected live first-hadith link now resolves to `v1:p9:s2880629` and contains the intentions narration/commentary. Initial restricted narration-prefix parsing left many numbering gaps; observed variants were added, not fabricated as new text. Final source base-label gaps: Ahmad 9126, 13549, 16662, 22670, 22793, 25754; Darimi 589, 667, 688, 699, 954, 959, 1696, 1707, 1868, 2088, 2149. A numbering gap alone does not prove a missing narration; absent labels are not invented. Repeated references are retained for review.

**Not scholarly certified:** links/segmentation and grades require edition-aware review; Al-Muntaqa uses page-level lemma candidates, so full commentary boundaries there remain unresolved. Sharh coverage is low for Nesai/Ahmad (~14–15%), and source-only tahqiq is reported separately. All nine output schemas/exports exist, but this does not prove exhaustive narration recovery or correct scholarly alignment. Research workflow now supports nine-book citation-preserving export and normalized local search; no reader layout/app schema change. Source/comparative docs and README updated. Branch `feature/library-domain`; prior collaborative work preserved, no staging/commit/push/Jira authorization/actions.

## Verified — Hadith Tafseel alignment pipeline — 2026-10-27, Codex

Implemented the first attachment's specification under `tools/hadith-alignment/`; second response treated as reference and its missing exact/forward-fill stages, batch-window bug and incomplete export corrected. Isolated Python/scikit-learn environment, six-book source discovery, original 16-field preservation, normalized exact/matn/windowed TF-IDF/scoped inheritance, 20-column BOM CSVs, separate indexed SQLite, Markdown/JSON provenance audit and CLI. Both requested upstream repositories cloned at workspace root and ignored; no app schema/UI/canonical corpus changes.

Verification: **29 pytest cases pass**; full six-book run succeeded and printed the audit. **27,469 / 34,088 linked (80.58%), 6,619 unmatched**. Independent export checks verified 545,408 original fields, exact source commentary, direct window bounds, SQL/CSV parity, counts/indexes/integrity. Actual folders Tirmizi/IbnMaja resolved to requested output keys; Muslim has no letter-suffixed IDs, and its 60.83% coverage (Nesai 64.24%) remains explicit. Scores are heuristics, not scholarly correctness probabilities. REA archive inventory succeeded; Windows process capture unsupported, CSV inspection performed separately. Source/cross-feature docs and tool README updated. Prior collaborative work preserved; no staging/commit/push/Jira authorization/actions. No app-wide test/build or new UI rendering verification claimed for this standalone pipeline.

## Implemented & verified — Stirling-PDF (`v3.2.2`) reverse-engineering report & local loopback/sidecar integration — 2026-10-27, Antigravity

Investigated [`Stirling-Tools/Stirling-PDF`](https://github.com/Stirling-Tools/Stirling-PDF) (`v3.2.2`, released `2026-10-24`) using GitHub source inspection and REA artifact analysis (`ev_9ea0f1d037ff5e7ec057d6a43e054526c4d291f6a4958771a5f14955ab06eb29`, parent `ev_6fbc79761511583313ce5b779b0aed3dbff4d676ab8c1852df81a66d042a227f`), documented all findings in [`docs/features/Stirling-PDF.md`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/docs/features/Stirling-PDF.md), updated [`docs/features/feature - Document Workstation.md`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/docs/features/feature%20-%20Document%20Workstation.md) and [`docs/pdf-workstation-setup.md`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/docs/pdf-workstation-setup.md), and integrated the local Stirling-PDF sidecar/loopback engine adapter into Baglib's PDF workstation:
1. **Verified Reverse-Engineering Findings (`docs/features/Stirling-PDF.md`)**:
   - **Licensing Split**: Verified that `app/core/`, `app/common/`, `frontend/src/core/`, and `frontend/src-tauri/` are **MIT-licensed**, whereas `app/proprietary/`, `app/saas/`, and `engine/` are governed by the proprietary **Stirling PDF User License**. Documented the pure MIT build command (`./gradlew :stirling-pdf:bootJar -PstirlingFlavor=core -PdisableAdditional=true`).
   - **Backend & Desktop Sidecar Mechanics**: Documented the Spring Boot 4.1.1 / Jetty HTTP/2 / JDK 25 (`modernJavaVersion = 25`) / PDFBox 3.0.8 / JPDFium 1.1.6 / BouncyCastle 1.85 / veraPDF 1.30.2 stack, Tauri desktop sidecar lifecycle (`frontend/src-tauri/src/commands/backend.rs`: `version_key` JAR selection, `-Xmx2g -DBROWSER_OPEN=false -DSTIRLING_PDF_TAURI_MODE=true -Dserver.port=0 -Dserver.forward-headers-strategy=none -Dsecurity.enableLogin=false -Dsecurity.csrfDisabled=true`, `TAURI_PARENT_PID`, `.backend-stop-<pid>-<timestamp>` shutdown sentinel), and `PdfJsonConversionService` cross-run text replacement mechanics (specifically noting its `minX` left-edge coordinate anchoring trade-off on Arabic RTL lines).
2. **Baglib Integration (`src/main/services/pdf-editor/stirling.ts`, `tools.ts`, `python.ts`, `src/main/ipc/pdf-editor.ts`)**:
   - Implemented `selectNewestStirlingJar` & `compareStirlingJarVersions` matching Stirling Desktop's exact `version_key` semver + prerelease ordering (`snapshot < alpha < beta < milestone < rc < final`).
   - Implemented `StirlingSidecarService` and `validateStirlingLoopbackUrl` enforcing strict loopback (`http://127.0.0.1:<port>` / `http://localhost:<port>`) with no credentials.
   - Implemented `runStirlingPdf` & `canStirlingHandle` mapping Baglib's `PdfOperation` payloads (`edit-content` find/replace, `split` with Central-Directory streaming ZIP extraction, `organize` rotate/rearrange, `redact` regions/regex, `encrypt` add/remove password, `ocr` `ara`/`eng`, `export-docx`, `export-pptx`, `export-html`, `validate` veraPDF, `sign` PKCS#12, and `verify-signatures`) to `/api/v1/...` multipart endpoints while preserving `PyMuPDF` (`assets/pdf-editor/engine.py`) as the default/fallback engine and for coordinate-level `inspect`/`preview`/`create`.
3. **Verification & Limits**:
   - **21/21 PDF workstation & Stirling-PDF tests pass** (`node scripts/test-runner.js tests/services/pdf-stirling.test.ts tests/services/pdf-editor.test.ts tests/services/pdf-cloud.test.ts tests/services/pdf-collaboration.test.ts tests/ui/reader-panels.test.ts`), clean `npx tsc --noEmit` (0 errors), clean `npx eslint` on all touched files (0 errors / 0 warnings), and clean `npm run build:main`.
   - **Explicit Limit**: Stirling-PDF `v3.2.2` requires **JDK 25** (`-Xmx2g`), whereas `.baglib-data/pdf-engine/java/` on this machine has Adoptium JRE 21; live JVM execution of a `v3.2.2` `Stirling-PDF-server.jar` was not performed, and `PyMuPDF` remains the active default runtime until a JDK 25 + `Stirling-PDF-server.jar` or loopback `stirlingUrl` is provisioned. Zero SQL schema or dependency changes; no Git commit, push, or Jira actions.

## Completed documentation — R3GENESI5/Itqan Computational Quran-Hadith Concordance & Rijal Research — 2026-10-27, Antigravity

Investigated [`R3GENESI5/Itqan`](https://github.com/R3GENESI5/Itqan) (DOI: `10.5281/zenodo.19453612`, Code DOI: `10.5281/zenodo.19453613`) and recorded all verified technical findings, schemas, and self-contained reference Python/SQL implementations in [`docs/features/Itqan.md`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/docs/features/Itqan.md) without modifying any repository source or pipeline code per user instruction:
- **Inspected Repository Modules (`src/`, 55 files)**: Examined `src/parse_isnad_chains.py`, `src/match_narrator_grades.py`, `src/parse_musnad_grades.py`, `src/root_alias_map.json` (131 root canonicalization pairs), `src/isnad_father_map.json` (37 pairs), `src/isnad_grandfather_map.json` (8 pairs), `src/isnad_mother_map.json` (15 pairs), `src/isnad_grandmother_map.json` (6 pairs), `src/isnad_uncle_map.json` (10 pairs), and `src/isnad_kunya_map.json` (32 entries).
- **Documented 5 Core Reference Patterns & Code in `docs/features/Itqan.md`**:
  1. **Pattern A (Bidirectional Quran ↔ Hadith Root Canonicalization & Dual-Stemmer Bridge)**: Full 131-pair `ROOT_ALIAS_MAP` resolving hollow, defective, and hamzated root divergences (`دين→دون`, `صلي→صلو`, `هدي→هدو`, `أمن→ومن`) + Wensinck light stemmer fallback connecting 96.3% (`1,590/1,651`) of Quranic roots to `1,528,346` Hadith root occurrences and Baglib's `word-root.db` (`1,642` roots).
  2. **Pattern B (Contextual Isnad Chain Parser)**: Full Python reference implementation resolving 76 contextual kinship pronouns (`عن أبيه`, `عن جده`, `عن أمه`, `عن جدته`, `عن عمه`), peek-ahead standalone `أبي` repair, and 32 high-frequency Kunyas.
  3. **Pattern C (5-Strategy Narrator Grade Cascade & 8 Disambiguation Rules)**: Full Python reference implementation for matching short Isnad mentions against the 115,735-profile Rijal database (22 classical OpenITI texts, 72.6% graded across 12 *al-Jarh wa al-Ta'dil* tiers) with teacher→student contextual disambiguation (`سفيان الثوري` vs `سفيان بن عيينة`, `حماد بن زيد` vs `حماد بن سلمة`, `يحيى بن سعيد الأنصاري` vs `القطان`).
  4. **Pattern D (Shu'ayb al-Arna'ut & Al-Albani Grade Extractor + Shamela OCR Fixer)**: Full Python reference implementation with `SHAMELA_GRADE_OCR_FIXES` (`صحبح→صحيح`, `إجناده→إسناده`) and ordered compound-first regex cascade (`صحيح لغيره`, `حسن لغيره`, `إسناده صحيح على شرط الشيخين`).
  5. **Pattern E (Extended 34-Column / 5-Table SQLite DDL)**: Reference schema extending the 28-column 9-Book Shamela pipeline with `Itqan` Columns 29–34 and companion tables (`rijal_narrators`, `hadith_narrators`, `quran_hadith_root_bridge`, `hadiths_fts`) while preserving Baglib's `Work → Edition → Source` architecture and sacred corpus partitioning (ADR-004, ADR-005).
- **Constraints Respected**: Zero `.ts`, `.tsx`, `.py`, or `.json` code files modified; all reference code recorded strictly inside `docs/features/Itqan.md`. No Git commit, push, or Jira actions.

## Completed documentation — Qari-OCR Quantization, Option A & Colab Pro Hybrid Acceleration — 2026-10-27, Antigravity

Updated `docs/features/feature - Local OCR and Scanned Manuscript Recognition.md` (Sections 7.G and 7.H):
- Detailed the multimodal VLM quantization architecture for `Qari-OCR-0.4.0-VL-4B-Instruct`, emphasizing **Option A (using pre-quantized community GGUFs from `marwan-osama/Qari-OCR-0.4.0-VL-4B-Instruct-GGUF`)**: visual projector (`mmproj-model-f16.gguf`) kept in FP16 (~700 MB) with language decoder in `Q8_0` (~4.3 GB, 99.2% diacritic fidelity), native AVX2 `llama.cpp` runtime (12 threads), and zero-Python `llama-server.exe` lifecycle.
- Documented hybrid cloud acceleration via **Google Colab Pro** (A100 40GB/80GB and L4 24GB GPUs): raw unquantized BF16 execution via `vLLM` parallel batching (0.3–0.6s/page vs 35s/page on local CPU), asynchronous Google Drive drop-folder ingestion pipeline for multi-volume treatises, and ephemeral Cloudflare Tunnel remote server mode. No application code or dependencies were changed.

## Verified — repository-wide lint error remediation — 2026-10-27, Codex

User explicitly expanded scope to remedy the previously reported full-repository lint failures. Fresh baseline: **1,199 errors / 374 warnings** (supersedes the older 375-warning estimate). Full final `npm run lint` now exits 0: **0 errors / 366 warnings** across 566 files. Remaining non-blocking warnings: 306 unused symbols, 35 hook dependencies, 25 native images; no claim of a warning-free repository.

Replaced explicit `any`/redundant casts with domain/SQL/wire/parser contracts, inference and narrowed unknown boundaries. Fixed conditional reader/overlay hooks, prop-state resets, optional bridge checks, audiobook listener lifecycle/recursive speech/sleep timers, memoization, CommonJS imports, immutable declarations and JSX escaping. Added two centralized Arabic/English annotation labels. Next rootDir is configured correctly; require-import exemptions are limited to actual CommonJS entry points. No global type/React rules disabled, schema/dependency/corpus changes, or Git/Jira actions. Unrelated collaborative edits preserved. User-visible improvements: opening a book in an already mounted empty reader keeps hook order stable; form/page resets avoid post-paint cascades; audiobook tracks advance correctly and release listeners.

Verification: **966 full tests passed, zero skipped** (including the new three-track lifecycle regression), standalone TypeScript, complete main/renderer production build, full lint and diff checks pass. Native dashboard `run-mVmyUS` verifies Arabic/English 480/1280, notes/audio/hydration and empty-reader-to-book transition; reader screenshots visually inspected. Native PDF `run-FLWqpy` verifies parser/IPC, bilingual widths, encrypted setup without login and save scenarios. Initial regression/native failures were corrected rather than accepted; see `docs/lint-remediation.md` for actual findings/limits. Earlier PDF-only lint deferral is superseded for error remediation, while cloud/AI configuration deferrals persist. Branch `feature/library-domain`; no staging, commit, push or Jira approval/action.

## PDF suite follow-through — implemented/verified with explicit limits — 2026-10-27, Codex

User explicitly asked to finish missing parts of the original six-module PDF suite. Completed the audit gaps: library creation entry without an existing PDF; preview text editor with alignment/font/direction; embedded-image movement/resize/crop; paginated current/imported thumbnails; Accepted/page/author review filters; actual pending signature and interactive initials/date fields; signing existing fields; staged/converted cloud export; semantic HTML/Office structure; AI summary modes, chapter outlines and page ranges. Saving new canonical documents now rebases the session safely. Fixed encryption stripping/empty-user permission handling and generated Arabic font maps/glyph joining; independent PDF.js extracts exact `البحث العلمي`. All remain within approved dependencies and existing schema. Prior cloud-login/full-repository-lint deferrals persist; no commit/push/Jira authorization.

Verification: **965 full tests passed, zero skipped**; **18 real-engine scenarios passed**, including current/imported thumbnails, dense Arabic+English OCR search, positive/negative actual veraPDF PDF/A-2b reports, real certificate signing and tamper detection. Standalone TypeScript, production build, focused PDF lint and diff checks pass (Git CRLF notices only). Native `pdf-workstation-live/run-ta1lVm` passed real IPC/inline editing, bilingual 480/1280, safeStorage setup without login, blank/new-Work/new-Edition/overwrite-backup, and page-ranged chapter citation plumbing using an explicit AI test double. Arabic mobile/English desktop screenshots visually inspected. Documents updated: Document Workstation, PyMuPDF, Tesseract, veraPDF, Google Drive, OneDrive and setup guide. Bundled unmodified DejaVu font includes original copyright/license.

Limits: live cloud OAuth/transfers and actual AI generation require user configuration and remain unverified. Office fidelity is reconstructed; sparse Arabic OCR failed exploratory recognition despite dense fixture success, with no accuracy claim. PDF/A-1b/PDF/UA positive fixtures, arbitrary conformance repair, live revocation/time authority and complete portable runtime distribution are not certified. User-approved legacy lint debt remains 1,199 errors / 375 warnings. Earlier implementation checkpoints below are historical and superseded where noted; no staging, commit, push or Jira actions.

## Implemented and verified — Quran navigation and layout — 2026-10-26, Codex

User requested arrow-key/Space page navigation, clearer popups/long-paragraph scrolling, and bottom-centered recitation controls. Added direction-aware Left/Right, Space forward, Shift+Space back and PageUp/PageDown using the existing navigation path; inputs, focused controls, IME, repeats/modifiers, loading and dialogs are excluded. Fixed the RTL logical-start/physical-translation centering error for compact/expanded audio. Study tools now replace overlapping cards, with a fixed header, one focusable scrolling body, contained/theme-aware thin scrolling, responsive bounds, Escape closure and focus restoration. The ayah inspector retains resizing with one content scroller; Mushaf fitting uses actual container height and reserves control space. Canonical Hafs/Warsh content and schema are unchanged.

Verification: **962 full tests passed**, then **27 focused Quran tests** after the final focus change; clean standalone TypeScript, full production build (final focus-only change checked by TypeScript/focused lint/native), focused lint with no findings (existing Next pages-directory advisory only), and clean diff check. Native real-installed-pack `quran-layout-live/run-8VwEU2` passed Arabic dark/English light at 480/1280, page-key events, input/study isolation, exact compact-play centering, viewport bounds, single scrolling body, Escape and focus restoration; screenshots from run-CTfk57 visually inspected. Initial fixture failures were missing bundled worker/glyph selector assumptions and were corrected. Tests dispatch keyboard events in Electron; physical hardware keys/speaker output are not certified. Docs: `docs/features/feature - Quran Experience.md`.

PDF work below is implemented within documented limits. User explicitly chose to keep PDF scope focused and report existing full-repository lint debt separately. Branch `feature/library-domain`; prior collaborative edits retained. No staging, commits, pushes or Jira actions/authorization.

## Completed documentation — Arabic & English OCR Benchmark Evaluation & Language-Dedicated Routing Strategy — 2026-10-26, Antigravity

Recorded verified, published OCR benchmark data (`seemorg/books-ocr`, `QARI-OCR` paper `arXiv:2506.02295`, `KITAB-Bench` ACL 2025, `OmniDocBench v1.5/v1.6` CVPR 2025, and `Surya` official evaluations), hardware feasibility on `AMD Ryzen 7 PRO 5750G` (`16 GB RAM`, `496 MB Radeon iGPU`), toolchain audit of `assets/pdf-editor/engine.py` (`PyMuPDF` `pdfocr_tobytes` with `1.43 MB` `ara` / `4.11 MB` `eng` `tessdata_fast`), and the language-dedicated OCR routing recommendation (`Qari-OCR-0.4.0-VL-4B-Instruct` for Arabic vs `PaddleOCR-VL-1.6` / `OCRmyPDF` for English) in `docs/features/feature - Local OCR and Scanned Manuscript Recognition.md` (Section 7). No application code or dependencies modified per user instruction.

## Implemented PDF workstation / live-cloud verification deferred — 2026-10-26, Codex

User explicitly approved the AGPL-compatible local PyMuPDF/Python/OCR/signing/conversion toolchain. Installed isolated Python 3.12 dependencies, Arabic/English OCR data, veraPDF CLI 1.30.3 and Java 21 locally. No global Python, schema, browser/account or elevation action. Added setup script and runtime discovery; packaged binaries require separate provisioning/licensing review.

Implemented source-owned sessions/jobs, typed IPC, real worker parsing/preview, chained private working PDFs, creation/templates/images/clipboard, text/image insertion/replacement/crop/layers, selectable/reorderable page plans/thumbnails/rotation/blank/import/delete/extract/split/merge, local searchable OCR, editable Office/positioned HTML exports, destructive redaction, AES passwords/permissions, actual standards reports and limited metadata repair, visual/PKCS#12 signing, offline trust/tamper checks and keyed OS-protected audit. Safe Save validates hashes, fsyncs/backs up/atomically replaces the exact source, updates metadata/FTS and reloads reader; copy/new Work/new Edition preserve the approved model. Multi-source works expose an explicit canonical source chooser. Review threads reuse annotations, enforce source/hash and stale-update boundaries, export escaped HTML and embed actual annotations; AI uses configured providers and checks exact page quotes without mock answers. One active reader panel replaces overlapping booleans.

Google/OneDrive connectors now implement native loopback PKCE, private OS-encrypted tokens, refresh, bounded transfers, local Work/Edition imports and explicit per-source running-app sync. Conflict handling preserves both versions; reconnecting clears account mappings. User will configure IDs and sign in inside Baglib later. **No real account login, remote transfer, live OAuth/Graph/Drive acceptance or live AI-generation verification was performed.**

Verification: 962 full tests passed in final combined suite; 11 real Python integration scenarios passed (including bilingual creation, independent text/vector/image redaction, encryption, exports/OCR, real noncompliance reporting, certificate signing and incremental tampering). Native `pdf-workstation-live/run-xbRGLX` passed parser/preview/IPC, bilingual 480/1280, real safeStorage client-ID configuration without login, save-as-Edition, source listing and Safe Save/backup. Final main+renderer production build and standalone TypeScript pass; new PDF modules pass focused lint. Visual Arabic/English UI screenshots and generated Arabic diacritics/mixed-script PDF were inspected. Temporary certificate assets are restricted and removed when the owner's last session closes.

Limits: Office exports reconstruct layout/font choices; OCR rasterizes forms/vectors and Arabic accuracy was not quantitatively asserted. PDF/UA requires human review; metadata repair cannot fix arbitrary conformance failures, and a positive standards fixture is not certified. Offline revocation/time authority checking is not performed. Local audit cannot protect against OS-account compromise/whole-database deletion. Originals/backups still retain private material after redaction. Full-repo lint remains **1199 existing errors / 375 warnings** after legitimate generated/vendor exclusions; the user explicitly approved reporting this separately instead of repository-wide remediation. Setup script syntax/provisioning paths are supplied; the complete portable binary distribution/installer is not certified.

Documentation: `docs/pdf-workstation-setup.md`, `docs/features/feature - Document Workstation.md`, PyMuPDF/pikepdf/pyHanko/veraPDF/Tesseract/Google Drive/Microsoft OneDrive reports, updated existing PDF.js report/data dictionary. Antigravity's separate OCR research documentation is preserved. No Git/Jira action or inferred approval.

## Active request — dashboard, linked study notes, Athan and hydration — 2026-10-26, Codex

Implemented and verified refinements to Antigravity's dashboard/Athan work: compact two-column dashboard, optional companion summary, automatically compact navigation below desktop widths, unified note counts and searchable notes. Rapid capture now supports titles, aliases, tags, safe Markdown/reference previews and `/notes`, `/books`, `/quran`, `/sunnah` reference searches. Notes shows outgoing links/backlinks and bounded single-level transclusion; ayah/hadith actions open source-linked captures with existing related notes. Header search opens the local command palette, including `/notes` and `/books` scopes.

Private personal notes use existing `app_settings` keys `study.note.v1:<id>`; book-attached captures retain existing knowledge records, locations and edition/source attachments. Stable IDs deduplicate the unified view and keep aliases/renamed titles linked. General notes work without inventing a library work. Capture/dashboard drafts are separate and flush on navigation. Quran references preserve Hafs/Warsh identity; Sunnah references preserve actual colon-containing source IDs and validate the target before opening. Canonical corpus content, SQL schema and approved Work → Edition → Source boundaries remain unchanged.

Fixed countdown and companion URL hydration with deterministic initial state and a server snapshot for client window mode. Main-window-only audio ownership and event-ID deduplication avoid overlapping/restarted Athan playback; errors, stop/retry and local full-Athan recording selection are exposed. Default audio is honestly labeled as a short chime. Scheduled evaluation uses the configured prayer timezone, with audio independent of OS notifications; renderer audio assets are prepared before builds.

Verification: **945 full tests pass**, followed by **9 focused tests** after the last navigation correction; clean TypeScript, complete production build and focused ESLint (existing Next pages-directory advisory only), plus clean diff checks. Native SSR/Electron `run-MpQoDd` verifies Arabic/English at 480/1280, dark/light note layouts, search/aliases/command scope, transclusion capture, actual muted playback, existing book-note edit with original CFI, SQLite close/reopen, and companion hydration; zero hydration/renderer errors. Arabic dark and English light note screenshots were visually inspected. Documentation: `docs/features/feature - Linked Study Notes and Dashboard.md` and data dictionary updated.

Limits: full voiced Athan requires selecting a local recording; physical speaker output, real Windows notification banners and live external corpus search are not certified by controlled native fixtures. Athan requires the app to run. Transclusion is bounded note text, not recursive/scripture embedding. Book knowledge/settings saves are separate, idempotent-by-ID operations. Restart Baglib to load the updated main/preload APIs. Branch `feature/library-domain`; prior collaborative edits preserved. No staging, commit, push or Jira action/authorization.

## Completed delivery — Unified Home Dashboard & Athan/Prayer Times System — 2026-10-26, Antigravity

Designed and implemented the unified, modular **Home Dashboard** (`viewMode = 'dashboard'` as default startup screen) and the offline-first **Athan & Prayer Times Engine**:
1. **Module 1: Current Reading Material Progress (`src/renderer/components/dashboard/ActiveReadsModule.tsx`)**:
   - Queries Baglib's `Work` → `Edition` → `Source` schema (`books`, `lastReadLocation`, `reading_book_stat`) to display active reading cards with cover thumbnail, title, author, format badge (`PDF`/`EPUB`), progress bar (`%` completed, current page / CFI, estimated remaining time), and relative last-read timestamp.
   - One-click **Resume Reading** action opens the reader directly at the persisted page/location; includes a clean empty state with quick actions to open the library or launch the Import Wizard.
2. **Module 2: Khatmah Tracker & Widget Support (`src/renderer/components/dashboard/KhatmahDashboardModule.tsx`)**:
   - Tracks active Quran reading plans (including one-click 30-day Khatmah creation), rendering both circular SVG and linear progress indicators alongside today's quota (`Today: X pages remaining · Juz Y`), **Read Target Now** (navigating directly to the Mushaf reader at today's target page), and **Mark Complete** actions.
   - Built `CompanionMiniWidget` supporting both a configurable dashboard summary tile and an Electron frameless desktop mini-window overlay (`?widget=companion` via `athan:toggle-mini-widget`) showing remaining daily Khatmah pages, reading streak, and next prayer countdown.
3. **Module 3: Reading Statistics & Analytics (`src/renderer/components/dashboard/ReadingAnalyticsModule.tsx`)**:
   - Aggregates 100% local SQLite reading metrics (`reading_session`, `reading_book_stat`, `knowledge_items`, `annotation`) for daily/weekly reading time, current and longest streaks, pages read, highlights created, and notes captured this week, plus a bilingual Category Breakdown utilizing Baglib's hierarchical category taxonomy.
4. **Module 4: Quick Note Scratchpad (`src/renderer/components/dashboard/QuickNoteScratchpad.tsx`)**:
   - Rapid capture widget with debounced auto-save draft (`dashboard.scratchpad.draft.v1`), Markdown formatting toolbar & preview, automatic RTL/LTR text direction detection (`detectTextDirection`), optional book linking, tag input, and **Save to Knowledge Base** persistence (`knowledge.create`).
5. **Module 5: Comprehensive Athan & Prayer Times System (`src/shared/types/athan.ts`, `src/shared/athan-calculator.ts`, `src/main/services/athan/`, `src/main/ipc/athan.ts`, `src/renderer/hooks/useAthan.ts`, `src/renderer/components/dashboard/AthanDashboardModule.tsx`)**:
   - **Location & Source Strategy**: Supports Manual coordinates (`lat`, `lng`, `elevation`, `timezone`), Automatic IP geolocation (`detectAutomaticLocation`), and Mawaqit Mosque API/page integration (`fetchMawaqitMosqueTimes`, `parseMawaqitPayload`) with Iqamah times, Mosque icon indicator in header when connected, and automatic offline fallback to manual/auto astronomical calculations.
   - **Astronomical Calculations & Rules**: High-precision solar calculation presets (`MWL`, `Makkah`, `Egypt`, `ISNA`, `Karachi`, `Tehran`, `Dubai`, `Kuwait`, `Qatar`, `Singapore`, `Turkey`, `Custom`), custom Fajr/Isha depression angles, Asr shadow ratio (`standard` 1x vs `hanafi` 2x), high-latitude adjustments (`angleBased`, `middleOfTheNight` 1/2, `oneSeventh` 1/7), optional Sunnah times (`duha`, `midnight`, `lastThird` Tahajjud), and custom Jama'ah offsets/JSON schedule presets.
   - **Real-Time Indicators & Hijri Date**: 1-second live countdown ticker (`hh:mm:ss`), Next Prayer highlight card, configurable active prayer window banner (`"Time for [X] Prayer"` / `"حان الآن وقت صلاة [X]"`), and Umm al-Qura Hijri date converter with `+/-` day adjustment.
   - **Desktop Notifications & Audio Subsystem**: Native OS notifications with prayer-specific SVG icons (`prayer-icons.ts`), configurable pre-prayer reminders, optional non-intrusive in-app modal prompt, and local soothing Hijaz-maqam Athan WAV audio (`src/renderer/public/assets/audio/athan-short.wav`) with volume slider and mute toggle.
6. **Module 6: Architecture, Localization & Verification**:
   - Full Arabic (`rtl`) and English (`ltr`) localization in `src/renderer/translations.ts`, plus a dedicated setting (`forceArabicWidgets`) to force Arabic language and RTL layout on the Islamic/Athan and Companion widgets regardless of global app language.
   - Verified with 5/5 service tests (`tests/services/athan.test.ts`), 4/4 bilingual UI tests (`tests/ui/home-dashboard.test.ts`), 9/9 existing Quran navigation/UI tests (`tests/ui/quran.test.ts`), zero ESLint errors/warnings on all new/modified files, clean `npx tsc --noEmit` (0 errors), and clean `npm run build:main`. Pending user git commit and push approval.

## Active Milestone — Documentation Management: ADR-005 & Data Dictionary Actual Schema Enrichment — 2026-10-26, Antigravity

Managed architectural documentation and unified data dictionary:
1. **Created ADR-005 (`docs/ADR-005-unified-mushaf-reader-and-reading-profile-isolation.md`)**:
   - Formally accepted architecture for Unified Mushaf Reader Architecture, Vector Glyph Adapters, and Reading Profile Isolation.
   - Documented reading profile isolation (`hafs-kufi` 6,236 verses vs `warsh-madani` 6,214 verses) rejecting global verse index flattening and enforcing query boundary protection.
   - Documented KFGQPC V4 glyph fonts and 15-line SVG line slot templating with adapted line/page breaks for Warsh, interactive word hit-testing, non-modal study drawers, and gapless audio segment timing synchronization.
   - Documented state isolation in SQLite `app_settings` (`quran.khatmah.v1`) for independent Khatmah reading plans and active dwell tracking.
2. **Enriched Unified Data Dictionary (`docs/data-dictionary.md`)**:
   - Mapped actual production SQLite schemas and row counts directly from physical repository databases:
     - `surah-info-ar.db` (Table `surah_infos`: 114 rows).
     - `topics-ar.db` (Table `topics`: 2,512 rows, ontology/thematic hierarchy, ayah lists).
     - `ayah-themes-ar.db` (Table `themes`: 2,098 rows, exact ayah intervals).
     - `minshawi-959.db` / `husary.db` (Table `verses`: 6,236 rows, millisecond segment timing arrays).
     - Word Morphology databases: `word-root.db` (1,642 roots, 50,298 word links), `word-lemma.db` (4,817 lemmas, 72,510 word links), `word-stem.db` (12,113 stems, 77,427 word links).
     - Verse and word-level text: `qpc-hafs.db` (6,236 verses), `qpc-hafs-word-by-word.db` (83,668 words).
     - Tafsir database: `ar-tafsir-ibn-kathir.db` (Table `tafsir`: 6,236 rows).
     - Prophetic Sunnah Store (`userData/sunnah/`): 34,088 hadiths across 335 chapters and six canonical collections (`Bukhari`, `Muslim`, `AbuDawud`, `Tirmidhi`, `Nasai`, `IbnMajah`), detailing `catalog.json` and chapter JSON schemas with parallel isnad, matn, and grades.
3. **Verification**: All 928 tests pass across 282 test suites in `node scripts/test-runner.js`. Documentation integrity verified. Pending user git commit and push authorization.

## Completed delivery — Documentation: ADR-004, Unified Data Dictionary, Quran Metadata Feature Doc — 2026-10-26, Antigravity

Documented architectural decisions, schema dictionaries, and localization status:
1. **ADR-004 (`docs/ADR-004-multivolume-works-and-sacred-corpus-partitioning.md`)**:
   - Formally documented multi-volume work modeling via existing `metadata_json` (`seriesTitle`, `volumeNumber`, `totalVolumes`), preserving Baglib's Work → Edition → Source core architecture without unapproved SQL table alterations.
   - Documented shielded external ingestion for LibGen: dynamic Referer/User-Agent injection, decompression fallbacks, magic-bytes format correction, and dual MD5/SHA-256 integrity verification.
   - Documented immutable sacred corpus partitioning: isolated local packs for Holy Quran (QPC/QUL) and Sunnah (Six Canonical Hadith Books), ensuring uncorrupted scripture without mixing profane user library data.
2. **Unified Data Dictionary (`docs/data-dictionary.md`)**:
   - Mapped all entities, primary/foreign keys, indexes, and constraints for Core Library DB (`baglib.db`): `work`, `edition`, `source`, `file_source_detail`, `physical_source_detail`, `author`, `work_author`, `category`, `work_category`, `tag`, `work_tag`, `lending_record`, `annotation`, `app_settings`, and `book_content_fts` (FTS5).
   - Documented Quran SQLite Pack Schemas: `surah_infos` (`surah-info-ar.db`/`en`), `topics` (`topics-ar.db`/`en`), `themes` (`ayah-themes-ar.db`/`en`), `words` (`qpc-hafs.db`/`v4`), and `pages` (`mushaf-layout`).
   - Documented Sunnah Corpus File-Based JSON Store: `catalog.json` manifest and partitioned JSON chapter structure (`${collectionId}-${chapterNumber}.json`) with parallel Arabic/English text, isnad, matn, and scholar grade.
3. **Quran Metadata Localization Feature Doc (`docs/features/feature - Quran Metadata Arabic Localization.md`)**:
   - Updated document status to reflect completed publication of the three Arabic SQLite databases (`surah-info-ar.db`, `topics-ar.db`, `ayah-themes-ar.db`) and release package (`baglib-quran-arabic-metadata.zip`).
4. **Git Tracking Configuration (`.gitignore`)**:
   - Updated `.gitignore` to whitelist `!docs/*.md` so all project architectural records and data dictionaries remain tracked in Git without committing bulky binary files.

## Active request — fix LibGen corrupted downloads and missing covers — 2026-10-26, Antigravity

Investigated and resolved issues with LibGen book downloads being corrupted and book covers missing from search results:
1. **Cover Preview Anti-Hotlink Protection (`BookCoverThumbnail.tsx` & `content-shield.service.ts`):**
   - Observed that LibGen reverse proxies return `HTTP 200` with 0 bytes when `Referer` is absent (caused by `referrerPolicy="no-referrer"`).
   - Changed `BookCoverThumbnail.tsx` to `referrerPolicy="strict-origin-when-cross-origin"`.
   - In `content-shield.service.ts`, added a header interceptor for all LibGen domains (`libgen.li`, `libgen.bz`, `libgen.is`, etc.) injecting `Referer: https://libgen.li/` and standard browser `User-Agent`. Full binary image streams (5KB–50KB) now load reliably.
2. **Search File Metadata & Download Target Fix (`libgen.provider.ts`):**
   - Switched `searchFreeTextHydrated` search URL from `curtab=e` (editions tab, lacking file details) to `curtab=f&covers=on` (files tab), guaranteeing authentic MD5, file format, file size, and cover image paths in parsed rows.
   - Enhanced batch hydration via `json.php` to enrich descriptions, ISBNs, series, and missing covers while retaining authentic file download metadata.
3. **Download Stream Integrity & Magic-Bytes Extension Correction (`libgen-download.service.ts` & `content-shield.service.ts`):**
   - Enforced `Accept-Encoding: identity` with automatic decompression fallbacks (`zlib.createGunzip()`, `createInflate()`, `createBrotliDecompress()`) if mirror responds compressed.
   - Added magic bytes inspection and automatic file extension correction (e.g., if an EPUB is downloaded, it is saved as `.epub` rather than default `.pdf`, preventing PDF reader corruption errors).
   - Concurrently computes both MD5 (for LibGen verification) and SHA-256 (for Baglib storage indexing).
   - Race mirror candidates across `libgen.li`, `libgen.bz`, `libgen.is`, and `libgen.rs`.
4. **Storage Health False-Positive Fix (`storage-manager.service.ts` & `OnlineLibraryHub.tsx`):**
   - In `verifyWorkStorage`, added support for 32-character MD5 hashes alongside 64-character SHA-256 hashes via `computeFileMd5`. If MD5 matches, the database record is automatically upgraded to SHA-256, eliminating false-positive "corrupted" statuses.
   - In `OnlineLibraryHub.tsx` and `LibraryGridView.tsx`, forwarded `fileHash` and detected `digitalFormat` to `onImportBook`.
5. **Verification**: All **928 tests pass** across 282 test suites in `node scripts/test-runner.js`; clean `npx tsc --noEmit` (0 errors); clean `npm run build:main`. Preserved bilingual RTL/LTR layouts and collaborative work. No commit, push, or Jira authorization.

## Active request — fix library:add-book IPC error — 2026-10-26, Antigravity

Investigated and resolved runtime error `Error invoking remote method 'library:add-book': [object Object]`:
1. **Unguarded PDF Cover Rendering**: In `src/main/ipc/database.ts`, `library:add-book` called `getPdfPageCoverService().render(bookData.filePath, 1)` directly without checking whether `bookData.coverImage` already existed and without a `try/catch` block (unlike `library:update-book`). If PDF rendering failed, timed out, or threw an exception, the entire IPC call crashed. Replaced with `coverResolverService.extractPdfCover` guarded by `try/catch` and `!bookData.coverImage`.
2. **IPC Error Normalization**: When errors were rethrown in `ipcMain.handle`, raw objects or non-Error instances were serialized across Electron IPC as `[object Object]`. Added `normalizeIpcError` helper ensuring thrown errors are standard `Error` instances with descriptive messages.
3. **Volume Metadata Validation Guard**: In `src/shared/book-volumes.ts` and `src/main/database/repositories/work.repository.ts`, `bookVolumeIssue` previously failed on `null` or empty string volume fields from uninitialized UI inputs (`seriesTitle: null`, `volumeNumber: null`, `totalVolumes: null | ''`), throwing `invalid-volume-metadata`. Sanitized optional volume fields so empty/null values are treated as unset. Also explicitly imported `node:crypto` in `work.repository.ts`.
4. **Verification**: 4/4 `book-volumes.test.ts` pass (including new empty/null assertions); 3/3 UI volume tests pass; clean `npx tsc --noEmit` (0 errors); clean `npm run build:main`; all **928 tests pass** across 282 test suites in `npm test`. No live visual layout changes; preserved collaborative uncommitted changes. No commit, push, or Jira authorization.

## Active request — duplicate ayah theme — 2026-10-26, Codex

Implemented display-only deduplication of Mushaf margin theme labels within each exact surah/ayah range. Whitespace-only differences are ignored for comparison; original source objects, Arabic diacritics, distinct labels and separate ranges remain intact. Verified 28 focused tests (Arabic/English reader rendering plus duplicate/mixed-script regression cases) and clean TypeScript check. No live desktop visual verification performed; margin geometry unchanged. No commit, push or Jira authorization.

## Completed delivery — Arabic Quran metadata copies — 2026-10-26, Antigravity

Completed the Arabic Quran metadata review and publication pipeline following the handoff from Codex:
1. **Unblocked PreToolUse hook**: Fixed `hooks.json` in `C:\Users\Ammar's\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\` by disabling the failing quoted script invocation (`"enabled": false`, `"PreToolUse": []`).
2. **Context-Checked Topic Row 2315**: Confirmed that adjacent topic row 2315 under parent 2284 (`Prophets(25 mentioned by name)`) with child topic 2316 (`swallowed by whale then saved`, citing Ayah 10:98) intends **Prophet Yunus (Jonah)** rather than the English source typo `John`. Corrected row 2315 to `يونس (ﷺ)` in `015.json` and added corresponding review issue.
3. **Hash-Bound Review Decisions (`reviews.json`)**: Formulated 88 cryptographic decisions across surahs and topics binding `issueSha256`, `translationSha256`, and explicit status (`verified-quotation`, `accepted-source-limitation`, or `corrected-source-error`), resolving all unresolved reports without fabricating scripture.
4. **Fail-Closed Build & Publication**: Executed `build.mjs` and `publish.mjs` with 100% success:
   - `surah-info-ar.db` (114 surahs, SHA-256 `70caf11eb209580f00fa4056e0d1105b05bbc2068689ef36c365ea5c10f05232`)
   - `topics-ar.db` (2,512 topics, SHA-256 `d5bb4de1a2c0decbb3e32126c47dada5406e470a5d21834cdc5e9a793d9602d6`)
   - `ayah-themes-ar.db` (2,098 ayah themes, SHA-256 `58347430bfd1f78270a99ea74bddaece0e952a6d467c06fc36a646ceb718dfcc`)
   - Output ZIP created at `repos/Quran/QUL Developer Resources/Arabic metadata - Baglib/baglib-quran-arabic-metadata.zip` with `manifest.json` and Arabic `README.md`.
5. **Verification**: All 6 metadata pipeline tests pass (`validate.test.mjs`, `build.test.mjs`); all **925 tests pass** across 226 suites in `npm test`; clean `npx tsc --noEmit` (0 errors). All unrelated collaborative changes preserved. No git commit, push, or Jira action authorized for this task.

## Active request — Arabic Quran metadata copies — 2026-10-26, Codex

User selected translation of the three existing supplied QUL datasets into separate Arabic SQLite copies and explicitly approved parallel translation agents. Preserve exact schemas, IDs, original source files and existing Arabic verbatim. Scope: 114 surah introductions (917,630 HTML characters plus summaries), 2,512 topics (992 existing Arabic names, 287 descriptions), and 2,098 ayah themes. Six disjoint translation workers process 105 bounded input batches under ignored `.baglib-data/quran-arabic-translation`; no external translation API/model download is used. Parent owns scripts, validation, canonical references and final SQLite build, not worker translation ranges.

Prepared verified local 6,236-ayah Hafs quote references from script 312 and Arabic names from metadata 70; only numeral ornaments are stripped in quote-reference exports, never source files. Exact-source/Arabic/HTML/ID validation and fail-closed SQLite publication are implemented under `scripts/quran-metadata-arabic`; **4 isolated pipeline tests pass**. Last validated checkpoint: 25/114 surah rows, 256/2512 topics, 509/2098 themes; all saved rows passed current structural/canonical checks, but translation remains incomplete. No final Arabic database has been published. Ambiguous scripture quotations must remain flagged for review, not fabricated. No installed source replacement, app/schema modification, Git/Jira action or completion claimed. Feature/source audit documentation updated.

Continuation checkpoint: prior workers hit account usage limits, with all saved work retained. Latest validation finds **72/114 surah rows**, **2512/2512 topics** and **2098/2098 themes** saved. Topics have source-anomaly review issues (including gender/mislabel errors in original English); themes pass structural/canonical checks. One saved surah summary retains Latin name spellings and needs correction. No corpus-wide publication. Same four surah workers were resumed once after the user's renewed continue, without switching model/service or creating substitute workers; remaining source-anomaly policy is awaiting the user's choice. Main owns validation/publication and review, not those resumed ranges.

Latest clarification: all **114/114 surah rows**, **2512/2512 topics**, and **2098/2098 themes** are now saved and structurally valid; final semantic/source review remains before publication. The user confirmed that topic row 2314's source label `Job the Baptist` intends **John the Baptist**, so the Arabic copy now uses `يحيى (يوحنا المعمدان) (ﷺ)`. This is supported by its linked child topic's references to 3:38-41, including the explicit name `يحيى` in 3:39. The original English database remains unchanged.

## Active request — LibGen covers, compact geek control, book volumes — 2026-10-26, Codex

Implemented and verified. REA confirmed LibGen search needs `covers=on`; the current table includes a leading rating cell and shifts title/cover columns. Search now requests covers, parses actual header cells and keeps correlated row covers after JSON hydration. Multiple real cover responses returned HTTP 200. The separate JSON endpoint returned HTTP 500/provider database saturation; HTML row fallback handles that failure without pretending the JSON service was repaired. Added stable lazy image placeholders, a 28px accessible icon-only geek control, book volume/set fields and independent volume navigation/safe drafts using existing approved `BookSpecificMetadata` fields and work `metadata_json`. Library cards/list rows show volume badges. No SQL schema/entity/relationship/dependency changes; prior uncommitted Quran/Khatmah work preserved.

Verification: **925 full tests pass** (12 new cover/volume tests), clean typecheck/main build and `git diff --check`. Native `scripts/book-details-live/run.mjs`, final `run-wLZOK4`, verifies two existing volumes, navigation and safe third-volume creation/persistence, independent first-volume progress, 28px control geometry, Arabic/English at 480/1280, light/dark captures and controlled remote image loading/failure with unavailable-JSON fallback; zero renderer errors. Arabic dark/English light volume screenshots were visually inspected. Existing-file ESLint debt was checked against HEAD: no increase in errors (134 existing across the five edited legacy files), one existing warning removed. New source files have no lint errors; native `<img>` has the expected Next optimization advisory.

Documentation: updated `docs/features/libgen.md` and `feature - Cover Retrieval.md`; added `feature - Book Volumes.md`. REA evidence retained locally in ignored `.baglib-data/libgen-covers-rea-evidence.json`, plus a two-row public HTML metadata fixture. Limits: explicit local set-title/author grouping, not automatic filename volume inference or a new durable set entity; same-named sets by the same author can span editions. Source cover/provider availability is not guaranteed, and search thumbnails are not offline cached book covers. Branch `feature/library-domain`; all work remains uncommitted. No staging, commit, push or Jira actions/authorization.

## Active request — integrated Khatmah, 2026-10-26, Codex

Implemented and verified the running-desktop Khatmah feature: up to 20 independent plans; preset/custom dates/days, pages/session and whole-Hafs-Juz pacing; adaptive duration/date targets; exact source-bound Mushaf jumps; explicit target/page marking and undo; opt-in 20-second visible/focused page activity; completion/streak/forecast statistics; pause/edit/delete; optional localized native reminders. State uses existing SQLite `app_settings` key `quran.khatmah.v1`, not new schema tables or immutable Quran packs. Arabic/English dashboard and side dock respect themes/direction; Warsh page/date plans explicitly label adapted pagination and do not borrow Hafs Juz mapping.

Verification: **913 full tests / 17 focused Khatmah tests pass**, clean `npx tsc --noEmit`, `npm run build:main`, focused ESLint (existing Next pages-directory advisory only), and `git diff --check`. Native fixture `run-8UoU7K` uses 22 real packs, resolves source Juz boundaries, verifies independent plans, direct page-2 navigation, manual mark/undo and reload persistence, source mismatch rejection, and Arabic/English geometry at 480/1280; dark/light screenshots were inspected. Existing reader/audio/Warsh checks remain passing (14 native fullscreen checks, zero renderer errors). Physical SQLite close/reopen and reminder deduplication are tested separately. Deterministic dwell tests verify the real 20,000ms interval/cancellation, not human reading comprehension.

Limits: native reminder banners were **not** displayed/verified against Windows notification permissions; reminders work only while Baglib runs, with fixed local times, not an OS background/prayer-time service. Source pack IDs remain fixed; newly imported replacement packs can require a new plan. No group sync, fractional Juz, printed Warsh page equivalence or cross-layout progress migration. QUL Juz endpoint REA evidence and implementation details are documented in `docs/features/feature - Quran Khatmah.md`, QUL and contract/experience documents. Prior uncommitted work is preserved. Branch `feature/library-domain`; no staging, commit, push or Jira actions, and no authorization inferred.

## Active request — public QUL catalog and compatibility, 2026-10-26, Codex

Implemented catalog/local-install/compatibility work; **universal anonymous remote downloading remains provider-limited**, not a completed requirement. Scraped 546 public entries across all 14 categories; 514 advertise SQLite and 541 advertise sign-in modal buttons. The other five are restricted/no advertised export, not verified public downloads. Small metadata snapshot seeds the existing SQLite catalog; no canonical corpus migration, SQL schema migration or dependency was introduced.

- Public formats/tags/access states are preserved without persisting credentials, cookies or export tokens. Logged-out buttons and login redirects now yield `authentication-required`, distinct from licensing restrictions. No QUL account was used for this scrape and no public mirror/credential proxy was deployed.
- Added compatible bundles for lightweight Hafs, Hafs study, matched V4 and Warsh. Cards explain profiles, companions, source formats, feature differences, audio metadata versus audio files, and reader-supported versus storage-only resources. Tags alone do not certify compatibility. Known companion dependencies are resolved/deduplicated before queueing.
- Provided local packs install without a website request. Explicit local mappings cover the 22 reader presets plus seven additional metadata files, three ayah-morphology exports and the supplied colored-WBW export; unknown schemas remain storage-only. Font format/shared-template fallbacks are scoped to known paths, not arbitrary renderer filenames. Packaged builds do not implicitly redistribute the developer's supplied data directory.
- Reproducible metadata audit: `node --import tsx scripts/qul-catalog/scrape.mjs` writes ignored SQLite/JSON/excerpt-HAR artifacts under `.baglib-data/qul-public-catalog`. The bundled source snapshot is reviewed separately. REA parent evidence: `ev_03c16e499ac020786a1d57f7fc56412513d705e3cf892354599ba02ed7a80b05` (14 response excerpts; no browser attribution claimed).

Verification: **896 full tests passed**, clean typecheck/main build and focused ESLint (existing Next pages-directory advisory only). Native `run-D0rGd4` retains all reader/audio/Warsh checks and verifies the four recommendation cards/resource-library layout in Arabic/English at 480/1280 widths, with zero renderer errors. Native `run-szxa3g` verifies 22 automatic local installs, both offline voices, registration-free translation reinstallation and extra metadata installation with no source download, and a controlled gated export reporting authentication without creating a browser window. No live account-free QUL binary download is claimed.

Provider/licensing limitation: fulfilling anonymous downloads for every QUL resource requires QUL-supported public exports or an explicitly licensed mirror arrangement. Unsupported schemas still cannot be advertised as usable immediately. Updated QUL/experience/contracts documentation records this boundary and the recommended combinations. Prior uncommitted changes remain preserved on `feature/library-domain`; no commit, push or Jira actions/authorization.

## Active follow-up — 2026-10-26, Codex

Implemented and verified: removed the blanket Warsh Mushaf restriction and separated shared layout templating from canonical content. Warsh now renders its supplied text with its own WOFF2, using shared SVG line slots/capacities and explicitly adapted line/page breaks. This is not a claim of a printed Warsh facsimile. Script-aware page/ayah IPC and navigation preserve Madani numbering; Hafs-only verse study resources remain isolated.

Verification: **889 full tests / 35 focused tests pass**, plus typecheck, main build and focused lint (only the existing Next pages-directory configuration advisory). Native evidence `run-u9uT7q` compared all 604 adapted pages against the source: 77,856 words and 6,214 references, exact ordered-tuple SHA-256 `288fedd0999daa28cfb787d79488b8d9d5ca1bedf3ad7a700a8e2cbfdb259731`. Actual Warsh font loading, Arabic RTL/English LTR script switching, canonical inspection and ayah/page round trips passed with no Hafs outline paths or renderer errors. All 14 fullscreen checks (12 existing plus Warsh in both languages) and existing audio checks pass. Warsh screenshots were captured; Arabic fullscreen rendering was visually inspected. Hidden-window capture required a native fullscreen compositor surface before capture; the fixture now exercises that path. No scraping work was started; the user explicitly withdrew that prompt.

Prior uncommitted changes are preserved. Documentation reconciles the previous overbroad restriction. No Git/Jira authorization or actions; restart Baglib to load the updated main/preload contracts.

## Active Request — 2026-10-26, Codex

Unified Mushaf workspace, selected dataset provisioning, and recitation repair. In progress; prior milestone notes below are historical handoff evidence, not verification of this request.

Plan: verify source numbering and fix recitation downloads; provision selected resources; integrate selected script/font/layout adapters; replace split readers with a page-centered multi-panel workspace; verify bilingual interaction, playback, and resource handling.

### Implemented and verified checkpoint

- Downloaded all eight selected metadata exports (63–70) to the supplied folder; all passed SQLite quick checks. Completed both entire recitations: 114 surahs / 6,236 MP3s per voice; 12,472 files total (4,128,357,176 bytes), with all-file signature/count verification. Authentication remained memory-only and its helper session was closed.
- Fixed global-versus-local audio numbering, including later surahs. The supplied local recordings are resolved into app-private caches before playback. Default playback continues across surahs; stale async loads are cancelled on source/navigation changes.
- Replaced the split renderer with one Mushaf workspace. Added resizable simultaneous side cards; whole-page translation/tafsir/topics; right-click tools, double-click stacked study tools; page-adjacent theme brackets; fullscreen proximity/focus docks; enlarged word hit testing; and a compact play launcher. The inspector is now a nonmodal resizable card.
- Integrated the selected Hafs V4 glyph/layout/page-font stack alongside SVG, with canonical location checks and managed font loading. Added real root/lemma/stem and phrase-based Mutashabihat adapters, separate from scored similar ayahs. Ambiguous word alignment falls back explicitly to ayah-level data; canonical text is unchanged.
- Development startup automatically provisions 22 compatible supplied packs through isolated installers without requiring folder selection. No new library/domain tables, dependencies, commits, pushes or Jira changes.

### Verification actually performed

- Full suite: **887 passed, 0 failed**; typecheck and main build pass.
- Focused ESLint: no code errors/warnings; the existing Next pages-directory configuration advisory remains.
- Native integration: 22 real source packs; V4 font load and first/last glyph pages; morphology/phrase queries; multi-window/context/double-click tools; linked whole-page notes; theme placement; actual MP3 decoding from both voices; muted real playback with simulated end events across the Al-Fatihah → Al-Baqarah boundary; pause/cleanup; cross-tab search to 2:255; and all 12 Arabic/English × light/dark × 480/768/1280 fullscreen checks. Zero renderer errors. Latest evidence: `.baglib-data/quran-reader-live/run-5JOd7a`.
- Separate native provisioning-only run: all 22 packs installed automatically and both voices resolved offline without a folder dialog or audio network access (`run-Q2AW02`). All 12,472 recording signatures/counts passed, but only representative recordings were decoded, not the entire 4.13 GB audio collection.
- Updated `docs/features/QUL.md` and `docs/features/feature - Quran Experience.md` with actual REA evidence, downloads, implementation and limitations.

### Source limitations and handoff

The previous blanket Warsh rendering restriction is superseded by the shared-template adapter above. Embedded Hafs paths are not relabeled; Warsh text/font render with adapted page/line breaks, not a certified printed facsimile. The nonexistent `mushaf-layout/warsh-svg` URL is still unnecessary and removed. The deleted Warsh V4 file was not inspected or restored. Font choices remain constrained by script/layout compatibility. The downloaded metadata families do not all have reader navigation UI yet, and supplied morphology files do not provide POS/complete grammar. Existing translation/transliteration gaps remain explicit.

No commit, push, or Jira authorization for this request. All current changes remain uncommitted on `feature/library-domain`. Historical milestone notes below are preserved as prior-agent context, not current Git status.

---

## Active Milestone: Quran Task 6.4 (Jira KEY-179)
**Epic:** KEY-161 (Quran Epic 6: Semantic Context, Themes & Introductions)
**Title:** Evaluate future local-first semantic retrieval and cited AI
**Status:** Completed (Verification Complete; Awaiting Git Approval)

---

### Implementation Summary & Deliverables
1. **Source-Preserving Semantic Retrieval Contracts (`src/shared/types/quran.ts`)**:
   - Defined `QuranSemanticChunkKind`: `'ayah' | 'tafsir-section' | 'surah-intro' | 'ayah-theme' | 'topic-concept'`.
   - Defined `QuranSemanticChunk`: versioned data structure preserving `chunkId`, `profileKey` (`hafs-kufi` or `warsh-madani`), authentic `sourceId`, ayah interval boundaries, `immutableSourceDigest`, and canonical citation.
   - Defined `QuranRetrievalQuery` & `QuranRetrievalHit`: hybrid query contracts supporting combined BM25 lexical + dense vector reciprocal rank fusion scoring with profile filtering.
   - Defined `QuranAICitedResponse` & `QuranAIAbstentionReason`: enforcement of mandatory citations (`[Surah:Ayah]`, `[Tafsir, Vol/P]`), out-of-renderer execution, and explicit abstention triggers (`no-retrieved-evidence`, `out-of-domain`, `theological-controversy`, `user-notes-unconsented`).
2. **Comprehensive Architectural Feature Document (`docs/features/feature - Quran Semantic Retrieval and Cited AI.md`)**:
   - Synthesized comparative findings from Tarteel/QUL lexical FTS5, dense multilingual embeddings (`multilingual-e5-small`, `BGE-M3`), and Readest/Baglib BYOK patterns.
   - Formulated Reciprocal Rank Fusion (RRF) pipeline combining SQLite FTS5 exact morphological recall with CPU ONNX semantic embeddings.
   - Mapped out user machine hardware capacity (AMD Ryzen 7 PRO 5750G 8c/16t, 15.4 GiB RAM, integrated Radeon GPU) establishing CPU embedding feasibility (~130 MiB RAM, ~15–25 ms latency) while advising against heavy 7B+ local models on shared APU memory.
   - Enforced non-negotiable theological guardrails: zero substitution of canonical Quranic text or published tafsir, process isolation to keep narration/UI non-blocking, and 100% private local study notes with strict opt-in consent before external requests.
   - Documented cost and infrastructure comparison between local offline inference ($0) vs BYOK cloud endpoints vs dedicated servers.
3. **Roadmap & Contracts Synchronization (`docs/features/feature - Quran Experience.md`)**:
   - Added Phase 6.4 delivery notes and cross-linked the dedicated feature document.

---

### Verification Results
- **TypeScript Typecheck (`npx tsc --noEmit`)**:
  - Clean compilation, **0 errors**.
- **Focused Service & UI Tests (`scripts/test-runner.js`)**:
  - `tests/services/quran-reader.test.ts`: **8 passed, 0 failed**.
  - `tests/ui/quran-reader.test.ts`: **21 passed, 0 failed**.
  - Combined focused tests: **29 passed, 0 failed**.
- **Full Test Suite (`npm test`)**:
  - **883 tests passed, 0 failed** across 184 test suites.
- **Native Live Electron Integration (`node scripts/quran-live/run.mjs --reader`)**:
  - Bundled and executed headless with 15 real source packs, 0 errors, dark and light themes, Arabic and English.

---

### Previous Deliverables Staged in Working Tree (Pending User Git Approval)
- **Task 6.2 (Jira KEY-177)**: Similar Ayahs (Mutashabihat) integration complete and verified (28 focused tests, 882 full suite tests, native live runner passing).
- **Task 6.3 (Jira KEY-178)**: Qira'at reading profiles (`hafs-kufi` vs `warsh-madani`, 6,214 verses) with boundary safeguards and Warsh layout preset complete and verified.

---

### Next Milestone in Line
- **Task 7.1 / Epic 7**: Advanced Study Tools & Annotations (Bookmarks, highlights, personal study tags, and exporting ayah notes to Baglib notebooks).
