# Stirling-PDF (`Stirling-Tools/Stirling-PDF`) — Reverse-Engineering & Baglib Integration Report

## Page organizer persistent drafts, UI recovery button & Arabic replace certification — 2026-11-09, Antigravity

- **Persistent organizer drafts (`src/shared/pdf-organizer-draft.ts`, `src/renderer/components/reader/PdfPageEditor.tsx`)**: Unapplied page-organizer plans (page order, rotations, inserted blanks, split boundaries, imported page items) are now stored in the existing `SqliteSettingsRepository` (`app_settings` table) under `pdf.organizerDraft.v1:<sourceId>`, bound to `sourceSha256` and `totalPages` with no schema change. Drafts survive closing/reopening the book and full app restarts (verified across two Electron launches in `BAGLIB_TEST_ORGANIZER_DRAFT=1`, `run-uOap8u`), show a localized restore banner with a Discard button, and are automatically cleared on Apply, Reset All, Discard, or when the underlying file hash changes (showing a localized changed-file discard notice and never applying the stale plan).
- **Blank-page Apply serialization fix & 480 px organizer layout (`src/renderer/components/reader/PdfWorkstationPanel.tsx`)**: Fixed `onApply` in `PdfWorkstationPanel.tsx` so blank page items omit `page` instead of passing `page: undefined` (which `validatePdfJob` rejected with `invalid-request`). Hidden the secondary 275 px tools sidebar below `md` (`768px`) when `mode === 'organize'` so the central organizer grid has full width and zero horizontal overflow at `480 px` in both Arabic (`RTL`) and English (`LTR`).
- **UI recovery button verification (`scripts/pdf-workstation-live/recovered-main.mjs`)**: Verified in `BAGLIB_TEST_MUTATIONS=1` (`run-PE48fy`) that clicking the workstation header recovery button (`title={t('pdfUndo')}`) restores the pre-save PDF via `restoreLatestEmergencyCopy`, retains **1** emergency copy on disk, and refreshes the PDF.js viewer back to the original page geometry.
- **Arabic text replacement certification (`src/main/services/pdf-editor/stirling.ts`)**: Certified in `run-uOap8u` that `edit-content` with `textReplacements: [{ find: 'مرحبا', replace: 'أهلا' }]` against an Arabic PDF deterministically returns `{ state: 'failed', error: 'engine-missing' }`. In `stirling.ts` (`applyRtlJsonReplacements`, lines 897–905 and 1491–1509), Arabic replacements (`/[\u0600-\u06ff]/u`) route through `/api/v1/convert/pdf/text-editor` JSON round-trip and refuse arbitrary new replacement runs when `contentStreams` are present unless an identical measured run already exists on the page (`if (changed && !measured) throw new Error('engine-missing')`), avoiding fallback to `/api/v1/general/edit-text` because Stirling's `edit-text` endpoint lacks Arabic glyph shaping and font subsetting.

## Immersive native checks — 2026-10-29, Codex

`BAGLIB_TEST_IMMERSIVE=1 node scripts/pdf-workstation-live/run.mjs`, run-2Rtjbr, verifies actual Electron F11/Escape and mouse proximity at all four edges in Arabic RTL/English LTR, plus tools-sidebar pin retention after leaving the edge (pin activated using DOM click). Reduced motion is emulated for this hidden offscreen fixture. The reduced-motion CSS initially lost cascade priority; fixed its transition override. Normal animation timing, screenshots, other pin controls, full parent-reader deduplication and broader integration remain unverified. The legacy full fixture currently has obsolete header/dropdown selectors and is not passing acceptance evidence.

## PDF opening transport correction — 2026-10-29, Codex

Correction to the initial transport checkpoint: the default reader renders an embedded `PdfWorkstationPanel`, not the alternate native branch. That panel still requested a Java PNG preview on mount. It now accepts the revision-keyed local URL and renders PdfNativeViewer in reading mode immediately, independent of opening the editor session/capabilities. Initial Java preview is skipped for this path; page navigation uses PDF.js totals and source replacement updates the viewer URL. Editing modes retain existing previews pending unified overlay work. TypeScript and targeted lint pass; native runtime/latency validation remains pending, so the earlier transport patch alone must not be treated as proof the default path was fixed.

## Supplied frontend archive investigation — 2026-10-29, Codex

Additional source inspection from the same archive: read complete `app/core/src/main/java/stirling/software/SPDF/model/api/EditTableOfContentsRequest.java`, `model/api/misc/MetadataRequest.java`, and `controller/api/misc/MetadataController.java`. TOC request explicitly expects `bookmarkData` JSON containing `title`, one-based `pageNumber` and optional `children`, plus `replaceExisting`; corrected Baglib's erroneous `toc` multipart field. Added focused sidebar heading/page inputs with append default and explicit replace option, using existing staged output/save workflow. Twelve focused adapter tests pass including Arabic/English titles and both append/replace payloads; native UI/output-outline verification remains pending.

Metadata finding: `/update-metadata` assigns every standard metadata field, including null for omitted values. Simply sending only edited title/author would erase unrelated standard information. Existing Baglib `repair-metadata` actually calls `/misc/repair`, not metadata update. Directory action remains disabled pending a preservation-aware adapter/form; no claim this functionality is integrated. No schema changes made.

Applied the inspected single-host picker/configuration pattern in Baglib through `PdfToolDirectory.tsx` and `PdfWorkstationPanel.tsx`: localized six-category directory, filter, 265px dark sidebar and back navigation without stacking a second tool panel. Existing form modes remain the implementation adapters. Some source capabilities lack actual focused forms (metadata/TOC remain disabled); timestamp, compare, flatten and exact per-tool icons are still outstanding. This is partial UI implementation, not a screenshot match or proof of all tool behavior.

REA `open_binary` identified `repos/Stirling-PDF-main.zip` as a ZIP with SHA-256 `e680e5f84bbb9fc735725872ff5d1def9dbd644ca757f6efbfcff7c28101af77`. Source excerpts were then read directly from the archive without execution. Inspected first 80 lines of `frontend/src/editor/core/components/layout/Workbench.module.css`, `components/tools/RightSidebar.tsx`, and the complete short `constants/toolPanel.ts`.

- RightSidebar owns panel chrome and transitions between tool picker and selected configuration through `useToolWorkflow`, `handleToolSelect`, and `handleBackToTools`; it does not require stacking new sidebars for each tool.
- Tool panel mode defaults to `sidebar`, with a separate explicit fullscreen mode.
- Workbench CSS keeps the bar shell non-shrinking and isolates scrolling; it also contains physical right positioning that should not be copied into Baglib's bilingual layout.
- Applicable pattern: retain one tool-panel host with picker/configuration state and logical positioning. No new database schema or dependency is needed for this pattern.
- Limits: this is source inspection, not a running Stirling UI comparison. The taxonomy definitions and full component implementations still need inspection. The user-supplied screenshot is the requested visual reference, not evidence of actual catalog counts or processor telemetry.

Live follow-up: `node --import tsx scripts/verify-stirling-live.ts` passed against installed Java25/JAR after lifecycle changes: readiness, structured text, single/batched previews and independently inspected 90-degree rotation with unchanged source. Script reported 20,712ms across verification work; this is not PDF opening latency or full-app background startup verification.

Follow-up: main startup now queues `resolveStirlingEndpoint(pdfEngineTools())` with `setImmediate` after creating the window. Configuration or engine failures are logged without awaiting Java in window creation or PDF viewing. Shutdown guards prevent a queued warm-up from starting after quit; sidecar preflight checks intentional stop after asynchronous Java detection and directory creation. Concurrent callers share startup before using its eventual endpoint. Twelve focused Stirling tests (including cancellation before spawning), TypeScript, targeted lint and main build pass. Full app boot timing and background resource contention are not yet measured.

Source inspection of Baglib's `FullPageBookReader.tsx` established that its nominal streaming URL was fetched completely with `arrayBuffer()`, copied into a Blob, and passed separately through DocumentLoader before text extraction. This was not incremental viewer loading. The PDF branch now supplies the existing local asset protocol URL directly to PdfNativeViewer, without the full-file fetch, Base64 fallback, Blob copy, or duplicate DocumentLoader parse. Non-PDF loading is unchanged. A revision query invalidates the viewer after source replacement while preserving the reader's page state.

`PdfNativeViewer.tsx` explicitly enables streaming/auto-fetch with packed CMaps and destroys its loading task on replacement/unmount. The existing protocol now advertises byte ranges on full responses, validates bounded/open/suffix ranges, clips requested ends to file size, handles HEAD without streaming, and propagates request aborts. Four focused tests cover range parsing and encoded Arabic/Windows paths; they do not prove native transport timing or visible first paint.

This checkpoint inspects Baglib source only, not the supplied Stirling archive. External taxonomy investigation, background Java warm-up, exact four-zone UI, render/prewarm checks, native timing below 150ms, and operation acceptance remain pending. Whole-document text extraction still runs separately; contention with initial paint needs measurement. No universal latency guarantee is claimed.

## Default-runtime follow-up — 2026-10-28, Codex

Latest broad verification: 989 automated tests pass with no failures/skips. Real Java/Stirling selected inspection (`fromPage:2,toPage:2`) returns only page2 while retaining totalPages2; full inspection, single preview, Arabic keyed thumbnails and independently parsed rotation/source integrity also pass with Python disabled (16,812ms, JVM cleaned up). These do not establish full native in-place edits, all conversions, signature semantics or complete default-reader embedding.

Stirling inspect/text adapter now uses structured text with independent PDF.js permissions/page geometry, rather than Python. Real two-page inspection passed with Python disabled. Existing PDF.js blocks were corrected from raw bottom-left coordinates to viewport rectangles for top-left overlays, with parser regression. Complex rotated/skewed text geometry, selected ranges and full-reader verification remain outstanding; this is a hybrid Stirling/PDF.js path, not a claim of all-Stirling frontend code.

Real lightweight structured-text endpoint check succeeded: `/api/v1/convert/pdf/text-editor` returns two page models and PAGE1 text without Python. Captured JSON is retained in live-verification run directories. Actual element omitted x/y and provided `textMatrix:[40,0,0,40,30,900]`, width144.52/height23.12. Java nullable x/y fields therefore cannot be assumed present; inspector geometry needs verified matrix/baseline/rotation mapping or a full extraction comparison before integration.

Organizer preview supports sequential bounded `items`/`pages` batches (36 entries, 32MiB accumulated data), resolving session-bound sources and preserving session/page keys. Dimension-derived DPI targets <=180×240 thumbnails. Real Java/Stirling Arabic batch `[2,1]` passed with Python paths empty, matching keys/order and PNG sizes; single preview plus parsed rotation/source-hash checks also passed (12,248ms total). External-session and maximum-batch performance checks remain outstanding.

Single-page preview is now implemented through `/api/v1/convert/pdf/img` and registered in Stirling capabilities. PDF.js provides page geometry/permission checks without Python; Stirling renders PNG at 96 DPI with explicit page selection and annotations. PNG header/dimension and source-hash guards validate output. Actual page-two request succeeded with Python paths empty and 700×1000 point geometry (12,285 ms including rotation checks). Batch thumbnails and full reader-native inspection remain unfinished.

Pinned source inspection: fetched `app/core/src/main/java/stirling/software/SPDF/controller/api/converters/ConvertImgPDFController.java` and `model/api/converters/ConvertToImageRequest.java` from commit `684608d143779bf3a8ffc67639f077a1202c62ff`, retained under `.baglib-data/stirling-research`. Controller reads `imageFormat`, `singleOrMultiple`, `colorType`, `dpi`, `pageNumbers`, and `includeAnnotations`. This is source-contract evidence only; bounded preview adapter and runtime validation remain next work.

Overwrite publication now passes a dedicated backup directory (`.baglib-data/backups` in development; userData/backups when packaged). Physical-file regression verifies creation/location, exact pre-replacement backup hash and resulting target bytes; atomic same-directory target staging remains unchanged. Current UI also includes automatic existing-source first preview, canvas-first narrow stacking and a localized direct rotation action. These UX changes do not replace the still-missing Stirling-native preview/inspection/in-place operation adapters or establish complete default-reader embedding.

Native workstation fixture `run-YXj9LC` passed Arabic/English 480/1280 checks, editing/replacement IPC and staged/edition/overwrite publication with zero renderer errors. Narrow Arabic edit screenshot was visually inspected. These checks use available engine fallbacks and do not prove Stirling-only runtime coverage; the narrow stacked UI still places controls before canvas rather than delivering the requested default reader-centered workspace.

Electron shutdown now explicitly awaits `defaultStirlingSidecar.stop()` alongside audio cleanup before closing SQLite and allowing final quit. Re-entrant quit requests are guarded. This closes the previously missing main-process cleanup call; live Electron shutdown and concurrent-start race verification remain pending.

Primary routing no longer honors an old `preferStirling:false` setting for configured, adapter-supported jobs. These now always choose Stirling first; unsupported adapter operations remain unfinished and are not represented as Stirling-native. Full current regression suite returned 988 passing tests; the final preference edit passed TypeScript/main build and still needs a dedicated behavioral routing regression.

Live operation verification additionally rotates a generated two-page PDF through `runStirlingPdf` using the real loopback JVM with empty Python paths. The successful run produced a 1,034-byte PDF, preserved the source SHA-256, and cleaned up the JVM (9,956 ms total). This proves an actual rotation response, not complete operation coverage; output rendering/rotation geometry still need independent inspection.

Actual runtime smoke test: `node --import tsx scripts/verify-stirling-live.ts` launched the provisioned Java 25/JAR via `StirlingSidecarService`, passed bounded loopback readiness, and fetched the root with HTTP 200 (8,547 HTML bytes) after 8,881 ms. The verifier stopped its own JVM in `finally`. `/v3/api-docs` served HTML, not OpenAPI JSON; this smoke check does not verify version identity, operation endpoints, or the embedded reader UI.

Current IPC capability discovery now probes Stirling before Python and avoids launching the Python fallback when Stirling returns capabilities. Previously Python capability failure could prevent Stirling discovery. This is a routing correction, not proof that every operation or the full native workstation layout is integrated. The ten focused Stirling adapter tests pass; full live UI/default-runtime verification remains pending.

- **Date Investigated**: 2026-10-27; source-contract reconciliation 2026-10-28, Codex
- **Repository**: [`Stirling-Tools/Stirling-PDF`](https://github.com/Stirling-Tools/Stirling-PDF)
- **Version Inspected**: `v3.2.2`; fresh source resolves to commit `684608d143779bf3a8ffc67639f077a1202c62ff`. Earlier tag-date/star-count observations are historical, not a runtime identity check.
- **REA Evidence IDs**:
  - Artifact Inspection: `ev_9ea0f1d037ff5e7ec057d6a43e054526c4d291f6a4958771a5f14955ab06eb29`
  - Session Open Parent: `ev_6fbc79761511583313ce5b779b0aed3dbff4d676ab8c1852df81a66d042a227f`
  - Inspected Source Bundle SHA-256: `9facc3a45618412e39ee4e28d85c6f48c63c7fcb7ec8243b7a17491fb8ddb1aa` (`stirling_pdf_v3_2_2_sources.zip`, 27 key build, Tauri sidecar, frontend, and Java controller/service files)
- **Fresh contract evidence**: REA artifact inspection `ev_e1b98a4614fa05eed14f3623c3213e0ca4de6901b0474bd51a33d8d3877635ee`; archive SHA-256 `674469696d51c7cf00dc3edbfa7b0ead47fccc5c682b4ad40967c3e3fd17b829`. Local archive and portable evidence: `.baglib-data/stirling-research/stirling-v3.2.2-contracts.zip` and `rea-evidence.json`. The ten-file archive inventory is REA evidence; behavioral conclusions below come from reading those Java sources. `PdfJsonFont.java` was read separately after archiving and is not part of that archive. No live JVM validation is implied.
- **Related Feature Document**: [`feature - Document Workstation.md`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/docs/features/feature%20-%20Document%20Workstation.md)
- **Baglib Implementation Modules**:
  - [`src/main/services/pdf-editor/stirling.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/stirling.ts)
  - [`src/main/services/pdf-editor/tools.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/tools.ts)
  - [`src/main/services/pdf-editor/python.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/python.ts)
  - [`src/main/ipc/pdf-editor.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/ipc/pdf-editor.ts)

---

## 1. Executive Summary & Architectural Verdict

**Stirling-PDF** (v3.x) is a hybrid client/server PDF suite combining:
1. **A React 19 + Vite 7 Frontend (`frontend/`)** powered by client-side **PDFium WASM (`@embedpdf/*` `2.15.1`)**, **`@cantoo/pdf-lib` (`2.8.2`)**, and **`pdfjs-dist` (`5.4.149`)** for zero-latency viewport rendering, annotation, client-side rotation, and redaction rectangle placement.
2. **A Spring Boot 4.1.1 + JDK 25 Backend (`app/core/`, `app/common/`)** powered by **Apache PDFBox `3.0.8`**, **JPDFium `1.1.6`** (native Windows/Linux/macOS JNI bindings to PDFium), **BouncyCastle `1.85`**, **veraPDF `1.30.2`**, **Apache POI `5.5.1`**, **Stirling Office Convert `0.2.2`** (direct PDF-to-DOCX/PPTX without LibreOffice), and external CLI wrappers (`tesseract`/`ocrmypdf`, `qpdf`, `soffice`, `weasyprint`).
3. **A Desktop Sidecar Launcher (`frontend/src-tauri/src/commands/backend.rs`)** that spawns `Stirling-PDF-server.jar` on an OS-assigned ephemeral loopback port (`-Dserver.port=0`), disables login/CSRF (`-Dsecurity.enableLogin=false -Dsecurity.csrfDisabled=true`), passes parent PID watchdogs (`TAURI_PARENT_PID`), and coordinates shutdown via a sentinel file (`STIRLING_PDF_SHUTDOWN_FILE`).

### How Baglib Integrates Stirling-PDF
Rather than replacing Baglib's Electron + Next.js reader UI with Stirling-PDF's standalone Mantine/Vite SPA (which would break Baglib's `Work → Edition → Source` session tracking, bilingual RTL/LTR layout system, and `Safe Save` atomic publication), Baglib integrates Stirling-PDF at **two complementary layers**:
1. **Stirling-PDF Local Sidecar & Loopback REST Engine Adapter ([`src/main/services/pdf-editor/stirling.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/stirling.ts))**:
   - Ported directly from Stirling Desktop's `frontend/src-tauri/src/commands/backend.rs` and REST API v1 controllers (`app/core/src/main/java/stirling/software/SPDF/controller/api/`).
   - Can either **spawn a local `Stirling-PDF-server.jar` sidecar** (using Stirling's exact `version_key` JAR selector, JVM flags, parent-PID watchdog, and shutdown sentinel file) OR **connect to a running local Stirling-PDF loopback instance** (`http://127.0.0.1:<port>`).
   - Translates Baglib's typed `PdfOperation` requests (`edit-content`, `split`, `organize`, `redact`, `encrypt`, `ocr`, `export-docx`, `export-pptx`, `export-html`, `validate`, `sign`, `verify-signatures`) into multipart `/api/v1/...` calls while keeping all staged outputs inside Baglib's job directory for `Safe Save` SHA-256 verification and atomic replacement.
2. **Sole Primary Engine Takeover ([`src/main/ipc/pdf-editor.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/ipc/pdf-editor.ts))**:
   - Stirling-PDF `v3.2.2` runs on **Java 25 LTS** (`.baglib-data/pdf-engine/java/jdk-25.0.5+8-jre/bin/java.exe`) with `Stirling-PDF-server.jar` under `.baglib-data/pdf-engine/stirling/`.
   - Complete 100% zero-trace purge of PyMuPDF (`fitz` / `pymupdf`): all operations, inspection, previews, and conversions route through Stirling-PDF v3.2.2 and PDF.js, with zero active Python worker dependencies.

---

## 2. Licensing & Build Flavor Boundaries (Critical Legal Finding)

Inspection of [`LICENSE`](https://github.com/Stirling-Tools/Stirling-PDF/blob/v3.2.2/LICENSE), [`app/proprietary/LICENSE`](https://github.com/Stirling-Tools/Stirling-PDF/blob/v3.2.2/app/proprietary/LICENSE), and [`settings.gradle`](https://github.com/Stirling-Tools/Stirling-PDF/blob/v3.2.2/settings.gradle) verified that the `Stirling-Tools/Stirling-PDF` monorepo is **split-licensed**:

| Directory / Gradle Flavor | License | Permitted in Baglib? | Evidence |
| --- | --- | --- | --- |
| `app/core/`, `app/common/` (`-PstirlingFlavor=core -PdisableAdditional=true`) | **MIT License** | **Yes** | Root `LICENSE` lines 1–27 |
| `frontend/src/core/`, `frontend/src/editor/core/` | **MIT License** | **Yes** | Root `LICENSE` lines 1–27 |
| `frontend/src-tauri/` | **MIT License** | **Yes** | Root `LICENSE` lines 1–27 |
| `app/proprietary/`, `app/saas/` (`stirlingFlavor=proprietary` / `saas`) | **Stirling PDF User License** (Proprietary: forbids copying, modification, and production use without a paid license) | **No** | `LICENSE` lines 19–25; `app/proprietary/LICENSE` lines 1–42 |
| `engine/` (`stirling-engine` Python FastAPI microservice) | **Stirling PDF User License** (Proprietary) | **No** | `LICENSE` line 21 (`"engine"`) |
| `frontend/src/editor/{proprietary,desktop,saas,cloud}/` | **Stirling PDF User License** (Proprietary) | **No** | `LICENSE` lines 22–25 |

### Verified Build Command for Pure MIT `core` JAR
In `settings.gradle` (lines 14–48) and `app/core/build.gradle` (lines 72–76), the default Gradle build includes `:proprietary` unless overridden. To build a **100% MIT-licensed** `Stirling-PDF-server.jar` with zero proprietary classes:
```bash
./gradlew :stirling-pdf:bootJar -PstirlingFlavor=core -PdisableAdditional=true
```
All endpoints integrated by Baglib's [`stirling.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/stirling.ts) reside strictly inside `app/core/src/main/java/stirling/software/SPDF/controller/api/` (MIT License).

---

## 3. Verified Backend Architecture (`v3.2.2`)

### 3.1 Gradle Build & Runtime Dependencies
Inspected in `build.gradle`, `app/core/build.gradle`, and `app/common/build.gradle`:
- **Java Toolchain**: `modernJavaVersion = 25` (`JavaLanguageVersion.of(25)`). Running a `v3.2.2` JAR on Java 21 throws `UnsupportedClassVersionError` (class file version `69.0` vs Java 21's `65.0`).
- **Web Framework**: `org.springframework.boot` `4.1.1` with **Eclipse Jetty** (`spring-boot-starter-jetty`, `jetty-alpn-java-server`, `jetty-http2-server`) replacing Tomcat, plus **Jackson 3** (`tools.jackson.databind.ObjectMapper`).
- **Core PDF & Native Engines (`app/common/build.gradle` & `app/core/build.gradle`)**:
  - `org.apache.pdfbox:pdfbox:3.0.8`, `xmpbox:3.0.8`, `preflight:3.0.8`
  - `com.stirling:jpdfium:1.1.6` + platform JNI libraries (`jpdfium-natives-windows-x64`, `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`)
  - `com.stirling:stirling-office-convert:0.2.2` (native Java PDF-to-Office converter used when `stirling.office-convert.enabled=true`, avoiding LibreOffice cold-start overhead for `docx`/`pptx`/`txt`)
  - `org.verapdf:validation-model:1.30.2` (in-process PDF/A & PDF/UA validation via `VeraPDFService`, avoiding subprocess spawn overhead per validation job)
  - `org.bouncycastle:bcprov-jdk18on:1.85` & `bcpkix-jdk18on:1.85` (PKCS#12 signing, PKIX certificate path validation, and `ETSI.RFC3161` document timestamp verification)
  - `org.apache.poi:poi:5.5.1` & `poi-ooxml:5.5.1`
  - `technology.tabula:tabula:1.0.5` (table extraction)

### 3.2 Desktop Sidecar Lifecycle (`frontend/src-tauri/src/commands/backend.rs`)
Inspection of `frontend/src-tauri/src/commands/backend.rs` (lines 1–640) revealed how Stirling-PDF Desktop manages its local Java sidecar:
1. **JAR Selection (`select_newest_jar` & `version_key`, lines 23–129)**:
   - Scans `<resource_dir>/libs/` for `Stirling-PDF-server*.jar` (or fallback `*.jar`).
   - Parses version strings (`major.minor.patch[-prerelease]`) into a sortable tuple `(major, minor, patch, is_final, prerelease_stage, prerelease_num)` where:
     - `is_final = 1` for stable releases and `0` for prereleases (so `3.2.2` > `3.2.2-rc.1`).
     - `prerelease_stage` ranks `snapshot (0) < alpha (1) < beta (2) < milestone/m (3) < rc (4) < other (5)`.
     - Numeric segments are compared as integers (so `3.10.0` > `3.9.0`).
2. **JVM Invocation & Security Hardening (`start_backend`, lines 280–455)**:
   - Spawns `java` (or bundled `jre/bin/java.exe` with `CREATE_NO_WINDOW = 0x08000000` on Windows) with:
     ```text
     -Xmx2g
     -DBROWSER_OPEN=false
     -DSTIRLING_PDF_TAURI_MODE=true
     -Dlogging.file.path=<log_dir>
     -Dlogging.file.name=stirling-pdf.log
     -Dserver.port=0
     -Dserver.forward-headers-strategy=none
     -Dsecurity.enableLogin=false
     -Dsecurity.csrfDisabled=true
     -jar <jar_path>
     ```
   - Injects environment variables:
     - `TAURI_PARENT_PID`: PID of the parent desktop process so the Java backend self-terminates if the host application crashes.
     - `STIRLING_PDF_SHUTDOWN_FILE`: Path to `<work_dir>/.backend-stop-<pid>-<timestamp>`. Creating this empty file triggers a clean Spring Boot shutdown hook before `kill()` is needed.
     - `STIRLING_PDF_CONFIG_DIR`, `STIRLING_PDF_LOG_DIR`, `STIRLING_PDF_WORK_DIR`.
3. **Ephemeral Port Discovery (lines 460–495)**:
   - Because `-Dserver.port=0` lets the OS pick a free port, the parent process reads `stdout` line-by-line until it matches `"running on port: <PORT>"`, then stores `http://127.0.0.1:<PORT>` as the active backend URL.

---

## 4. Verified REST API v1 Endpoints & Controller Mechanics

All REST API endpoints in `app/core/src/main/java/stirling/software/SPDF/controller/api/` use multipart form data (`multipart/form-data`) and annotate their controllers with custom meta-annotations (`@GeneralApi` → `/api/v1/general`, `@SecurityApi` → `/api/v1/security`, `@ConvertApi` → `/api/v1/convert`, `@MiscApi` → `/api/v1/misc`).

| Baglib Operation | Stirling-PDF Endpoint | Controller & Method | Request Parameters (`multipart/form-data`) | Response Format |
| --- | --- | --- | --- | --- |
| `edit-content` (Find & Replace text) | `POST /api/v1/general/edit-text` | `EditTextController#editPdfText` | `fileInput` (PDF), `edits` (JSON array `[{"find":"...","replace":"..."}]`), `wholeWordSearch` (`boolean`) | Modified `application/pdf` binary |
| Interactive Text Editor JSON Export / Import | `POST /api/v1/convert/pdf/text-editor`<br>`POST /api/v1/convert/text-editor/pdf` | `ConvertPdfJsonController` | Export: `fileInput` (PDF), `lightweight` (`boolean`)<br>Import: `fileInput` (JSON) | JSON document model ↔ `application/pdf` |
| Charcode Glyph Incremental Save | `POST /api/v1/general/text-editor/apply-charcode-edits` | `PdfTextEditorCharcodeController` | `fileInput` (PDF), `request` (`CharcodeEditRequest` JSON with `pageChanges`, `customFonts`) | Incrementally saved `application/pdf` |
| `split` | `POST /api/v1/general/split-pages` | `SplitPDFController#splitPdf` | `fileInput` (PDF), `pageNumbers` (e.g. `"1,3,5-9"` or `"all"`) | `application/zip` containing split PDFs (or single PDF) |
| `organize` (Merge) | `POST /api/v1/general/merge-pdfs` | `MergeController#mergePdfs` | `fileInput` (multiple PDFs), `sortType` (`orderProvided`), `removeCertSign` (`true`) | Merged `application/pdf` |
| `organize` (Delete pages) | `POST /api/v1/general/remove-pages` | `RearrangePagesPDFController` | `fileInput` (PDF), `pageNumbers` (1-indexed CSV) | Modified `application/pdf` |
| `organize` (Rearrange / Duplicate) | `POST /api/v1/general/rearrange-pages` | `RearrangePagesPDFController` | `fileInput` (PDF), `pageNumbers` (1-indexed order CSV), `customMode` | Modified `application/pdf` |
| `organize` (Rotate) | `POST /api/v1/general/rotate-pdf` | `RotationController#rotatePDF` | `fileInput` (PDF), `angle` (multiple of `90`) | Rotated `application/pdf` |
| `organize` (Crop) | `POST /api/v1/general/crop` | `CropController#cropPdf` | `fileInput` (PDF), `x`, `y`, `width`, `height` in PDF bottom-left coordinates | Cropped `application/pdf` |
| `redact` (Coordinate Boxes) | `POST /api/v1/security/redact` | `RedactController#redactPdf` | `fileInput` (PDF), `redactions` (JSON `[{"page":1,"x":...,"y":...,"width":...,"height":...,"color":"#000000"}]`), `convertPDFToImage` (`boolean`) | Redacted `application/pdf` |
| `redact` (Text / Regex Search) | `POST /api/v1/security/auto-redact` | `RedactController#redactPdf` | `fileInput` (PDF), `listOfText` (newline-separated), `useRegex`, `wholeWordSearch`, `redactColor`, `convertPDFToImage`, `customPadding` | Redacted `application/pdf` |
| `encrypt` (Add Password & Permissions) | `POST /api/v1/security/add-password` | `PasswordController#addPassword` | `fileInput` (PDF), `password`, `ownerPassword`, `keyLength` (`40`\|`128`\|`256`), `canAssembleDocument`, `canExtractContent`, `canExtractForAccessibility`, `canFillInForm`, `canModify`, `canModifyAnnotations`, `canPrint`, `canPrintFaithful` | Encrypted `application/pdf` |
| `encrypt` (Remove Password) | `POST /api/v1/security/remove-password` | `PasswordController#removePassword` | `fileInput` (PDF), `password` | Decrypted `application/pdf` |
| `ocr` | `POST /api/v1/misc/ocr-pdf` | `OCRController#processPdfWithOCR` | `fileInput` (PDF), `languages` (`["ara","eng"]`), `sidecar` (`false`), `deskew`, `clean`, `cleanFinal`, `ocrType` (`"skip-text"`\|`"force-ocr"`\|`"Normal"`), `ocrRenderType` (`"hocr"`\|`"sandwich"`), `removeImagesAfter` | Searchable `application/pdf` (or `.zip` if `sidecar=true`) |
| `export-docx` | `POST /api/v1/convert/pdf/word` | `ConvertPDFToOffice#processPdfToWord` | `fileInput` (PDF), `outputFormat` (`"docx"`\|`"doc"`\|`"odt"`) | `.docx` binary |
| `export-xlsx` | `POST /api/v1/convert/pdf/xlsx` | `ConvertPDFToExcelController` | `fileInput` (PDF), `pageNumbers`, `useStirlingOfficeConvert=false` selects Tabula | `.xlsx` binary; HTTP 204 when no tables/cells exist |
| `export-pptx` | `POST /api/v1/convert/pdf/presentation` | `ConvertPDFToOffice#processPdfToPresentation` | `fileInput` (PDF), `outputFormat` (`"pptx"`\|`"ppt"`\|`"odp"`) | `.pptx` binary |
| `export-html` | `POST /api/v1/convert/pdf/html` | `ConvertPDFToHtml#processPdfToHTML` | `fileInput` (PDF) | `.html` or `.zip` binary |
| `validate` (veraPDF PDF/A & PDF/UA) | `POST /api/v1/security/verify-pdf` | `VerifyPDFController#verifyPdf` | `fileInput` (PDF) | JSON `List<PDFVerificationResult>` (`standard`, `compliant`, `totalFailures`, `failedChecks[]`, `passedChecks`, `summary`) |
| `sign` (PKCS#12 Certificate Signing) | `POST /api/v1/security/cert-sign` | `CertSignController#signPDFWithCert` | `fileInput` (PDF), `certType` (`"PKCS12"`), `p12File` (`.p12`/`.pfx`), `password`, `showSignature`, `reason`, `location`, `name`, `pageNumber`, `showLogo` | Signed `application/pdf` |
| `verify-signatures` | `POST /api/v1/security/validate-signature` | `ValidateSignatureController` | `fileInput` (PDF), optional `certFile` (X.509 trust root) | JSON `List<SignatureValidationResult>` (`valid`, `chainValid`, `trustAnchor`, `signerName`, `reason`, `location`, `signDate`, `coversWholeDocument`, `keySize`, `sigAlgName`) |

---

## 5. Server-Side Text Editing and Arabic RTL: Corrected Source Findings

### 5.1 Superseded finding

The initial report attributed a `LINE_TOLERANCE` grouping step, X-coordinate sorting, and a `minX` anchor to `EditTextController`. Those details are **not present** in the freshly downloaded official `v3.2.2` source at commit `684608d143779bf3a8ffc67639f077a1202c62ff`; they must not guide implementation. The historical evidence ID was not retained in the fresh REA session, so the reason for the discrepancy is unresolved. Preserve the original investigation attribution without treating its contradicted algorithm as verified for this revision.

### 5.2 Verified replacement mechanics

Source: `app/core/src/main/java/stirling/software/SPDF/controller/api/EditTextController.java`, `compileEdit` and `applyEditsToPage` / `applyEditToPage` / `applyMatchToElements` (fresh local copy lines 143-336).

- Find strings are quoted as literals and matched case-sensitively. Replacement strings are quoted too, so dollar signs and backslashes remain literal.
- Whole-word mode adds `(?<!\w)` / `(?!\w)` lookarounds without enabling Unicode character classes. Baglib's Unicode-aware Arabic boundaries intentionally need stronger semantics than this upstream implementation.
- The controller concatenates text elements in **existing page order**, tracks character offsets, and applies matches from last to first. It does not reconstruct logical reading order or group lines in this method.
- A cross-element replacement is written into the **first touched element** after its retained prefix; intermediate elements become empty, while the last touched element retains its suffix. Modified elements have `charCodes` cleared so reconstruction re-encodes the new text.
- This preserves the first element's anchor, not a guaranteed Arabic right edge. Source PDF element order, shaped glyph coverage and run direction remain relevant to correctness.

### 5.3 JSON model and reconstruction constraints

Sources: `model/json/PdfJsonDocument.java`, `PdfJsonPage.java`, `PdfJsonTextElement.java`, `PdfJsonFont.java`, and `service/PdfJsonConversionService.java`.

- The model uses `pages[].textElements[]`, document `fonts[]`, and page images, resources, content streams and annotations. Elements can contain text, font identifiers, width, font size, spacing/scaling and a six-entry `textMatrix`.
- `compactTextElement` (service lines 5662-5696) removes `x` and `y` when a six-entry matrix exists. Position then lives in `textMatrix[4]` and `textMatrix[5]`. Updating only `x` is insufficient.
- `convertJsonToPdf` (lines 694-810) first tries to retain existing streams and rewrite their text operators. `rewriteTextOperators` (lines 3912-4038) rewrites `Tj/TJ` text but does **not** apply changed element coordinates/matrices. A successful JSON import therefore does not prove an RTL alignment adjustment was honored.
- Regeneration can position text from the model. Clearing preserved streams simply to force that path can lose vector graphics and is not a safe general workaround. Font-ID aliasing might force regeneration while retaining extracted vectors, inferred from `TextElementCursor.consume` (lines 4424-4467), but this has not been runtime-validated and is not an approved production technique.
- Font models expose embedded font programs / COS dictionaries and optional Type3 data, not a ready per-character-width table. No Arabic bidi/shaping implementation was found in the inspected conversion service. Character-count-based width estimates cannot certify Arabic right-edge preservation.
- Synchronous `lightweight=true` export retains resources and streams; asynchronous processing can strip image/font data for lazy loading. Incomplete/lazy models must not be imported as though they contained the full document.

### 5.4 Implications for Baglib

The optional `/api/v1/convert/pdf/text-editor` → `/api/v1/convert/text-editor/pdf` route must validate the model and preserve `maxX = x + width` using justified geometry. Unsupported models or unknown font metrics should use the existing Python worker, whose bundled DejaVu Sans shaping and coordinate boxes support Arabic direction/alignment. Endpoint absence can fall back to `/api/v1/general/edit-text`, but that legacy path is not a certified Arabic layout-preserving conversion. Do not claim identical behavior for arbitrary PDFs across engines. No dependency, SQL field or canonical Work → Edition → Source change is warranted by these findings.

---

## 6. Frontend v3 Architecture (`frontend/`) — Findings & Reusable Patterns

Inspection of `frontend/package.json` and `frontend/src/editor/core/` confirmed:
- **Client-Side PDFium WASM (`@embedpdf/*` `2.15.1`)**:
  - Stirling-PDF v3 uses `@embedpdf/core`, `@embedpdf/engines` (PDFium compiled to WebAssembly), `@embedpdf/plugin-annotation`, `@embedpdf/plugin-redaction`, `@embedpdf/plugin-rotate`, `@embedpdf/plugin-selection`, `@embedpdf/plugin-thumbnail`, and `@embedpdf/plugin-tiling`.
  - However, `@embedpdf/*` requires downloading and instantiating a ~5–8 MB `pdfium.wasm` binary in the renderer and uses Mantine UI 8 (`@mantine/core` `8.3.0`), whereas Baglib already bundles `pdfjs-dist` (`5.5.207`) and React 19 with Tailwind CSS. Adding `@embedpdf/*` and `@mantine/*` would violate Baglib's rule against unapproved major frontend dependencies and duplicate PDF rendering engines in the renderer.
- **Multi-Tool Chaining Pattern (`FileContext.tsx` & `useToolOperation.ts`)**:
  - Stirling-PDF's best UX pattern is **stateful multi-tool chaining**: when a user runs Rotate → OCR → Sign, each tool consumes the staged output of the previous operation while keeping an undoable history stack before final export.
  - **Already Matched in Baglib**: Baglib's `PdfEditorJobs` (`src/main/services/pdf-editor/jobs.ts`) already chains `workingPath` across sequential operations within a session while keeping the canonical `Source` untouched until explicit `Safe Save` (`overwrite`, `edition`, `new-work`, or `copy`).

---

## 7. Baglib Integration Design & Implementation

### 7.1 Components Added / Updated
1. **[`src/main/services/pdf-editor/stirling.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/stirling.ts)**:
   - **`parseStirlingJarVersion` & `selectNewestStirlingJar(directory)`**: Implements Stirling Desktop's exact `version_key` semver + prerelease comparator (`snapshot < alpha < beta < milestone < rc < final`, numeric segment ordering) to discover the newest `Stirling-PDF-server*.jar` in `<runtime>/stirling/` or `<runtime>/libs/`.
   - **`validateStirlingLoopbackUrl(rawUrl)`**: Enforces strict loopback security (`http://127.0.0.1:<port>` or `http://localhost:<port>`), rejecting remote hosts, credentials in URLs, or non-HTTP protocols so document contents never leave the local machine.
   - **`StirlingSidecarService`**:
     - Spawns `java -Xmx2g -DBROWSER_OPEN=false -DSTIRLING_PDF_TAURI_MODE=true -Dserver.port=0 -Dserver.forward-headers-strategy=none -Dsecurity.enableLogin=false -Dsecurity.csrfDisabled=true -jar <jar>` with `TAURI_PARENT_PID` and `STIRLING_PDF_SHUTDOWN_FILE`.
     - Parses `"running on port: <PORT>"` from `stdout`.
     - Provides graceful shutdown via the `.backend-stop-<pid>-<timestamp>` sentinel file followed by process-tree cleanup.
   - **`canStirlingHandle(operation, payload)` & `runStirlingPdf(tools, input, signal, progress)`**:
     - Maps Baglib's `PdfOperation` payloads to Stirling-PDF `/api/v1/...` multipart requests (`edit-content` find/replace, `split`, `organize` rotate/delete/rearrange/merge/crop, `redact` regions & terms, `encrypt` add/remove password & permissions, `ocr` `ara`/`eng`, `export-docx`, `export-pptx`, `export-html`, `validate` veraPDF, `sign` PKCS#12, and `verify-signatures`).
     - Unpacks `.zip` responses when `/api/v1/general/split-pages` returns a multi-file archive, verifies output magic bytes (`%PDF-`, `PK\x03\x04`, HTML), computes SHA-256 digests, and returns Baglib's exact `PdfEngineResult` contract.
2. **[`src/main/services/pdf-editor/tools.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/tools.ts) & [`src/main/services/pdf-editor/python.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/services/pdf-editor/python.ts)**:
   - Extended `PdfEngineTools` with `stirlingJar?: string`, `stirlingUrl?: string`, and `preferStirling?: boolean`, discoverable automatically under `.baglib-data/pdf-engine/stirling/` (or `<userData>/pdf-editor/runtime/stirling/`) or configurable via `app_settings` key `pdf-editor.engine.v1` and environment variables (`BAGLIB_STIRLING_URL`, `BAGLIB_STIRLING_JAR`).
3. **[`src/main/ipc/pdf-editor.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/ipc/pdf-editor.ts)**:
   - Routes all operations strictly to `runStirlingPdf` (Stirling-PDF v3.2.2) and `inspectPdfFile` (PDF.js). PyMuPDF has been 100% purged from Baglib.
   - Extends `pdf-editor:capabilities` to advertise Stirling-PDF's full feature set (`sanitize`, `watermark`, `compress`, `page-numbers`, `add-image`, `unlock-forms`, `extract-images`, `export-markdown`, `export-text`, `export-csv`, `convert-pdfa`, `scale-pages`, `multi-page-layout`, `pdf-to-single-page`, `edit-toc`).
   - Exposes `pdf-editor:engine-status` and broadcasts `pdf-editor:engine-status-changed` events for real-time workstation status indication.

---

## 8. Evidence Classification Summary

### Verified Findings
- **Source & Artifact Verification**: Confirmed against `Stirling-Tools/Stirling-PDF` tag `v3.2.2` and REA artifact inspection `ev_9ea0f1d037ff5e7ec057d6a43e054526c4d291f6a4958771a5f14955ab06eb29`.
- **License Split**: Confirmed in `LICENSE`, `app/proprietary/LICENSE`, and `settings.gradle` that `app/core` and `app/common` are MIT-licensed while `app/proprietary`, `app/saas`, and `engine` are under the proprietary Stirling PDF User License.
- **Java 25 Requirement**: Confirmed in `build.gradle` (`modernJavaVersion = 25`) with Java 25 LTS executable provisioned at `.baglib-data/pdf-engine/java/jdk-25.0.5+8-jre/bin/java.exe`.
- **REST API v1 Multipart Contracts**: Confirmed across 16 controller classes in `app/core/src/main/java/stirling/software/SPDF/controller/api/`.
- **Baglib Adapter Verification**: Confirmed via `tests/services/pdf-stirling.test.ts` and `tests/services/pdf-routing.test.ts` (loopback mock server verifying multipart fields, binary/JSON responses, ZIP extraction, version sorting, security validation, and status lifecycle).

### Limitations & Unanswered Questions
- **Local Runtime Footprint**: Stirling-PDF `v3.2.2` requires a **JDK 25** runtime and ~2 GB RAM (`-Xmx2g`), plus external `tesseract`/`soffice` binaries on `PATH` for OCR and non-native Office conversions. Java 25 LTS JRE is provisioned under `.baglib-data/pdf-engine/java/jdk-25.0.5+8-jre/bin/java.exe` and `Stirling-PDF-server.jar` under `.baglib-data/pdf-engine/stirling/`.
- **RTL replacement / JSON reconstruction**: Section 5 details the anchor and preserved-stream behavior. Stirling-PDF replaces text using bounding box parameters; where geometry cannot be matched, user overlays provide safe visual replacements.


## 9. Fresh Contract Reconciliation — 2026-10-28, Codex

The 2026-10-27 source investigation was rechecked using selected official `v3.2.2` Java files and the fresh REA archive evidence listed above. Local files reside in `.baglib-data/stirling-research/`. This reconciliation records source reads and retained archive identity, not a successful Java 25 server launch or a new test count.

- `ConvertPDFToExcelController.java` lines 57-103 establishes `/api/v1/convert/pdf/xlsx`, inherited page-number selection, optional Tabula selection with `useStirlingOfficeConvert=false`, and HTTP 204 for empty extraction. Baglib should expose its existing `no-tables` result for that response.
- `RearrangePagesPDFController.java` accepts one-based user page lists for removal and `CUSTOM` rearrangement. Delete-only plans send the complement of the retained page plan; reordered/duplicated plans need explicit selection/order.
- `MergeController.java` accepts repeated `fileInput` fields. `sortType=orderProvided` preserves supplied order; `removeCertSign=true` removes certificate signatures. There is no merge page-range parameter, so range selections must be staged before merging. Signature removal is not a claim that the merged document retains prior signature validity.
- `CropController.java` uses PDF bottom-left crop coordinates and updates the media box after clipping. This must be taken into account wherever a crop payload is interpreted.
- `ConvertPdfJsonController.java`, the JSON models, and `PdfJsonConversionService.java` establish the stream/position limitations in Section 5. The original text-edit sorting hypothesis is superseded; full arbitrary-font RTL fidelity remains unresolved without runtime evidence.

See [Document Workstation](feature%20-%20Document%20Workstation.md) for Baglib's source-bound staging architecture. Adapter tests, Python verification and UI verification are recorded separately when actually run.
# Vector ink overlay integration — 2026-10-29, Codex

Source contract inspected in supplied archive: `app/core/src/main/java/stirling/software/SPDF/controller/api/PdfOverlayController.java` and `model/api/general/OverlayPdfsRequest.java`. Foreground overlay accepts base `fileInput`, `overlayFiles`, `overlayMode=SequentialOverlay`, and `overlayPosition=0` at `/api/v1/general/overlay-pdfs`.

Baglib's `ink-overlay.ts` writes bounded transparent vector PDF pages; `stirling.ts` gathers source dimensions with PDF.js, calls that endpoint, and uses existing staged output. Rotated or nonzero-origin pages currently fail explicitly rather than silently misplacing ink. `PdfInkPad.tsx` and `PdfWorkstationTools.tsx` share selected swatch color with the generated strokes. This is real PDF ink, not review-note persistence or a digital certificate signature.

Verified: focused adapter multipart tests; independent PDF.js vector parsing; live Java25 `scripts/verify-stirling-live.ts` run produced two pages, preserved page2 text and source hash, and contained a stroke operator. Live test does not yet prove exact color pixels, rotated-page placement, all themes, or complete user interaction. Those remain unverified, not assumed.

# Startup health correction — 2026-10-29, Codex

Fault-injection verification passed: actual JVM announced port;16intercepted health requests returned503; observed statuses starting/error/stopped, never ready. Sidecar stopped cleanly. Healthy-path live verification also passed in the same work session.

Source inspection found `spawnBackend` cleared its startup deadline on the port marker and unconditionally announced ready after the15second health loop, including its catch path. Corrected lifecycle retains startup timeout until successful readiness probe; URL and ready publication require the same child, no intentional shutdown, and an unsettled startup. Duplicate markers cannot start overlapping probes. Verified typecheck,12adapter tests and healthy live Java25 rotate/ink smoke. Dedicated `verify-stirling-health-live.ts` injects503health responses while starting a real JVM; its result must be recorded separately rather than assumed. This is own-source debugging, not a new external reverse-engineering claim.

# Nested outline roundtrip — 2026-10-29, Codex

`scripts/verify-stirling-live.ts` now calls real `/api/v1/general/edit-table-of-contents` with nested Arabic/English headings, then reads saved PDF using independent PDF.js `getOutline`/`getPageIndex`. Verified exact titles, child destination page2, retained2pages and original SHA256. This proves transport/output semantics for the tested replace operation, not native UI interaction or append behavior. A separate opt-in BAGLIB_TEST_TOC native fixture is being run for JSON import/apply/export controls; do not conflate the two scopes.
# Processor defaults and live pipeline evidence — 2026-10-29, Codex

Disposable watched-folder verification passed: real handleData rotation180degrees on both pages, generated outbox output independently inspected, archived source hash unchanged, processedCount1persisted, next scan0processed. Entire healthy JVM smoke completed12934ms. This does not establish keep-mode deduplication or daemon cancellation.

Own-source audit found backend defaults fabricated235processed PDFs and two enabled personal watch folders with invented142/93counts. Removed them: missing configuration now has no watches and zero daily output. Existing saved user configuration/counts are preserved; historical count accuracy cannot be inferred from current state. Scoped constructor data-directory injection allows isolated verification without rewriting user settings.

Overlapping watch scans share one in-flight promise; focused regression verifies one scan across concurrent ticks and subsequent retry after completion. Live Java25 `handleData` call using full `/api/v1/general/rotate-pdf` path produced a two-page90degree-rotated PDF, independently checked with PDF.js-backed inspection and unchanged source hash. Exactly one real processed count recorded in isolated state. Conditional filters, keep-mode deduplication and in-flight daemon cancellation remain separate unverified requirements. Disposable watched-folder archival check is being run; do not assume it passed until result recorded.
# Keep-mode watch receipts — 2026-10-29, Codex

`processor.ts` now stores hashed source/output/pipeline identities and source-content/pipeline-step fingerprints in local `watch-receipts.json`, atomically replaced through unique temporary file+rename. This is operational processing cache, not a new Work/Edition/Source field or database entity. Successful unchanged kept inputs skip on later scans and new service instances. Content or step changes invalidate their receipt; disabled pipelines and directory entries are skipped. Source hash is rechecked before output publication/destructive postprocessing; changed originals are preserved and staged output discarded.

Focused regressions cover persistence/restart, source and step changes, disabled pipelines, overlapping scan timing and mid-job file modification. This is not a cross-filesystem transactional exactly-once guarantee: crash between output copy and receipt commit can still produce a duplicate on retry. Native controls and daemon cancellation remain separate requirements.
# Watch daemon lifecycle — 2026-10-29, Codex

Source audit found `startWatchedFoldersDaemon` had no main-process caller. Main startup now starts policy-gated periodic scanning after window creation, and before-quit awaits stop. No folders are fabricated; only configured watching sources are eligible. Timer is unref'd; callback identity rejects policy promises from older stopped timers.

Each shared scan owns an AbortController. Stop clears interval, aborts scan, and awaits it. Signal reaches pipeline fetch; late results from a provider ignoring cancellation are discarded before publication/archival/deletion. Work already in the publication critical section completes before stop resolves, rather than leaving a deliberate half-published output. Focused tests verify late-result source preservation/cleanup and fake-clock policy-disable/stop/restart. These do not prove remote Java computation ceases on HTTP abort or full application shutdown under every race.
# Archive collision protection — 2026-10-29, Codex

Live JVM archive workflow verified collision preservation with older named archive plus source-matching uniquely named new archive. Added same-folder feedback protection: generated output hashes are separately receipted when canonical input/output directories coincide, so unchanged generated PDFs never become fresh input on later scans/restarts. Modified generated content remains eligible. Actual-filesystem regression ages generated output beyond settle delay and restarts service, verifying0processing. This does not claim multi-process coordination or crash-atomic publication.

Own-source audit found watched archival used rename onto `_archive/<original-name>`, which can replace an earlier archived original. Now copy uses `COPYFILE_EXCL`; existing names trigger a UUID-suffixed name, then the input is removed only after successful copy. Failed requested deletion propagates instead of recording success. Actual-filesystem regression verifies old and new bytes coexist and the successfully archived input is removed. This preserves older originals but is not a transactional crash-proof move: interruption after copy/before unlink can leave both copies, intentionally preferable to data loss.
# Organizer/native-reader integration corrections — 2026-10-29, Codex

Own-source/runtime work, not a new external-source investigation: `PdfWorkstationPanel` passed fallback1page whenever mode was not view, despite knowing native total; corrected count survives organizer entry. View now switches back to reader and gates server preview on URL availability rather than mode (mode had falsely triggered Java work and disabled later controls). `PdfPageEditor` gets actual sepia context, baseline undo state, pure event-driven history updates, localized labels, logical earlier/later movement, focus-revealed controls and keyboard-accessible insertion dividers outside grid cells. Fractional page1.5 is no longer mistaken for a1–5range;1..3 remains supported.

Native run-j3Fi2E verifies2page count,sepia root/card colors,blank insert/undo/redo/reset,rotation and View returning to PAGE1text in actual ar/RTL and en/LTR. These actions use DOM click/focus, not drag/keyboard traversal or Apply→PDF publication. Per-control contrast and remaining tool semantics are not inferred from this pass.
# Organizer split and Windows native packaging — 2026-10-29, Codex

Own UI/source audit found split markers were purely visual and per-page rotation/blank plans were excluded from Stirling routing. Apply now carries transient `splitAfter`; organizer validates every page/rotation, builds blank pieces, applies group rotation, merges in order and stages split ranges. Invalid NaN pages are rejected. These are operation payloads, not new database/domain fields.

Live verification exposed missing Windows JPDFium native module in supplied Linux-oriented JAR. REA archive identity/inventory, selected source controller inspection, observed server exceptions and official module/loader docs are recorded in [JPDFium](JPDFium.md) and [Spring Boot](Spring%20Boot.md). Setup now provisions exact-version/SHA256-verified native JAR; PropertiesLauncher exposes it without rewriting server JAR. Ordinary reading remains offline and independent of server startup.

Actual compound test produces part1=PAGE2 rotated90degrees; part2=blank then PAGE1, preserving original hash. Direct native split endpoint also produces ordered one-page parts after packaging repair. Organizer range extraction uses PDFBox removal and stages parts separately; it may repost the full arranged PDF per part, a performance trade-off. Full native UI→IPC→publication and drag/split undo semantics still need acceptance.
# 2026-10-29 background scheduling checkpoint

## Shared Hub failures and staged mutation visibility

Source inspection after the user's clarification found the Hub treated `PdfResult<T>` envelopes as raw outputs, reporting successful operations as Operation failed and discarding wrapped telemetry/lists. The Hub now reads `ok/data/error`. Standalone Hub tools previously used `/pipeline/handleData` for every individual conversion; an explicit singleTool contract now sends the validated tool endpoint and multipart parameters directly, while saved pipelines retain pipeline execution. A new mocked HTTP regression verifies direct Markdown routing, multipart fields, preserved .md output and telemetry. Actual external-file Markdown/UI acceptance still requires live verification; do not infer that all tools are repaired.

The native reader also continued displaying its original file URL after successful processing. Status responses now supply a staged-PDF preview URL only after owner and file-hash verification. Completed single-PDF jobs update the native viewer's source; organizer and text edits return to document view. Original files remain untouched until explicit save. Actual JVM English replacement of PAGE1 to EDIT1 was independently parsed successfully; native UI Apply/replacement acceptance is running. Initial native checks incorrectly clicked while busy / expected a false data attribute that is omitted; corrected fixtures are being rerun, not counted as application passes.

Baglib's sidecar launcher now requests OS BELOW_NORMAL priority after the child spawns and passes `-Dspring.main.lazy-initialization=true` / `-XX:TieredStopAtLevel=1`. Failed priority changes log a diagnostic but do not prevent processing. Actual Java25 live regression passes with these flags: text extraction/preview, rotation, blank+rotation+split organizer, native split, ink, bilingual TOC and pipelines/watchers. Total live suite19108ms is not a renderer latency or startup-only measurement. No shared-class archive flag was enabled without verifying the necessary archive configuration. No new upstream reverse-engineering claim is made by this own-source scheduling change.

## Live API contract and tool audit (2026-10-31, Claude Code)

`scripts/pdf-workstation-live/stirling-audit.mts` compares Baglib's endpoints with the running v3.2.2 OpenAPI document. `stirling-tools-live.mts` runs every Hub tool and built-in pipeline against the real JVM. `stirling-availability.mts` prints why endpoints are disabled.

**Verified root causes of pipeline `invalid-output`:**
- `handleData` answers 200 with an empty body or empty ZIP when a step fails or a filter rejects the file; Baglib treated that as corrupt output.
- 18 Hub endpoints did not exist in v3.2.2. Real mappings now live in `src/shared/stirling-contract.ts`; interactive tools open the workstation instead of posting.
- Presets used wrong parameters (`conformance`, `words`, `pages`) and omitted fields the controllers dereference without a null check (`alphabet`, `customColor`, `splitValue`).
- Single-file `handleData` responses are always `application/octet-stream`, so format must come from magic bytes first.

**Now:** `classifyStirlingOutput` handles PDF, ZIP, Office, HTML, Markdown, CSV, JSON, XML, RTF and images. A filtered file is `no-output`, a missing external tool is `engine-missing`, a table-free document is `no-tables`. Steps needing extra files run as direct multipart calls between `handleData` segments. Stirling has no annotation remover, so `/api/v1/misc/remove-annotations` is a local pikepdf step.

**Live audit result (development machine):** 39 of 67 runs pass. The other 28 are:
- 15 tools and the Pre-Publish pipeline disabled by missing external tools. OCR & Archival and Scholarly Scan stop at their image filter on this image-free sample, and also need Tesseract. Stirling's own log names `gs`, `weasyprint`, `tesseract`, `rar`, `soffice`, `qpdf`, `unoconvert` and OpenCV; `url-to-pdf` is off by configuration.
- Expected results for this audit's input: `no-output` from filters and `extract-images`, `no-tables`, `split-pdf-by-chapters` on a PDF without bookmarks, and `add-image` and `cert-sign` without their extra file. The `pipeline-processor` Hub entry opens the Pipeline view rather than posting.

**Not verified:** tools disabled by missing components have not been run; their parameters are checked against the OpenAPI document only.

## Export and redaction findings (2026-11-01, verified on the v3.2.2 jar with a real book)

- `system.stirlingOfficeConversion` (env `SYSTEM_STIRLINGOFFICECONVERSION=true`) enables `/convert/pdf/word` and `/convert/pdf/presentation` with the converter inside the jar. No LibreOffice is needed.
- `/convert/pdf/text` returns 400 without `outputFormat`. `/convert/pdf/csv` returns an empty archive without `pageNumbers`.
- `/convert/pdf/html` and `/convert/pdf/markdown` are listed as disabled without `pdftohtml`. Baglib reflows the extracted text when the HTML or Markdown call reports the endpoint disabled. The reflow keeps no layout, tables or images. Markdown came back with engine-style headings through Baglib's multipart call even though a direct `FormData` call got 403; the reason is **unexplained**.
- `/security/redact`: sending `pageNumbers: all` with `pageRedactionColor` blacks out **every whole page**. Baglib must not send it, although the OpenAPI document marks it required.
- `convertPDFToImage=false` only paints a box: the text under it is still extractable. `true` removes it but rasterizes every page of the file (5 MB to 121 MB, about 70 s), and all text in the file stops being selectable.
- Box position is correct on upright pages (top-left origin, points). Rotated pages are handled by the per-page flow below.

## Per-page redaction (2026-11-01)

**Verified on the real engine.** `redact_pages.py prepare` copies only the chosen pages to a temporary PDF, upright and starting at the origin. `redaction-plan.ts` remaps pages and converts boxes from displayed to stored coordinates. The engine redacts that file, then `merge` replaces content in the original page objects, so bookmarks and links stay valid, and saves one clean revision.

`egypt-inequality-book.pdf`, 2 pages redacted: 4.76 MB in about 10 s, against 121 MB and about 70 s for the whole file. The other 153 pages keep identical text and decoded content. Rotations 0, 90, 180 and 270 were verified by rendering.

**Failure rule:** the output is reopened and checked for page geometry, unchanged other pages, no fonts or forms on rasterized pages, no original stream of a redacted page, one `%%EOF`, and unchanged bookmarks. Text extraction must also return nothing on those pages. Any failure gives `redaction-unverified`; there is no fallback.

**Limits:** rasterizing removes `/StructTreeRoot`, `/MarkInfo` and `/XFA` for the whole file, because they can hold page text. Fields and annotations overlapping a box are removed; others stay. Bookmark titles, metadata and comments outside a box are not altered, so text repeated there survives. A stream shared with an unredacted page stays. Files with an applied signature are refused with `signed-document-locked`. Selecting every page still costs about 122 MB and 81 s on this book.

## Tool options and reverse-engineering scope (2026-11-01)

**Verified:** the 0.26.1 server from `Stirling-PDF.exe` renders tool forms at `localhost:8080`; 35 pages and 121 fields were read. Option names were then checked against the 3.2.2 API and run live. Acrobat's `.aapp` descriptors, `Mobile.optimize` and `.joboptions` informed option grouping only.

**Superseded limit:** this section first said no disassembly had been done. The second pass below did it, within the limits it states.

**Findings:** Stirling has no fonts for Japanese, Korean or Chinese stamps, and its Arabic and Thai fonts have no Latin glyphs, so the alphabet choice was removed and Arabic is detected from the text. Mixed Arabic and Latin stamp text is refused by the engine. WebP output needs `pdf2image`, so that choice was removed. Update-metadata clears empty fields, and the form says so.

## Tool options, second pass (2026-11-01)

**Method.** `Stirling-PDF.exe` is a native launcher with a Spring Boot JAR from offset 77824. REA opened the extracted JAR (SHA-256 `87e9c613...`, 1,731 entries, evidence `ev_4582c870...`), and its templates and `messages_*.properties` were read. Every Hub tool was then compared by script with the live 3.2.2 API document: field names, enum values and defaults. Uncertain behaviour was run on the real engine (`scripts/pdf-workstation-live/tool-options-probe.mts`).

Acrobat: REA with Ghidra 12.1.4 analysed `Acrobat.exe`, a launcher. REA's PE parser mapped `AcrobatRes.dll` (evidence `ev_bdb52bd1...`), which has only 44 string blocks and 17 dialogs. `Acrobat.dll` is 109 MB and was **not disassembled**; its text and that of `AcrobatRes.dll` and the plug-ins came from a raw string scan outside REA. `PDF Optimizer/Mobile.optimize`, `Settings/*.joboptions` and `DocSettings/Redaction/ENU/SearchRedactPatterns.xml` were read directly. Acrobat findings are wording and defaults, not traced logic.

**Verified on the real engine, against the API text:**
- `add-page-numbers` selects pages with `pagesToNumber`. `pageNumbers` is accepted and ignored, so Baglib numbered every page whatever was chosen. Both accept `2n+1`.
- Position 1 is top left and 9 bottom right, for stamps and page numbers. The API says 1 is bottom left.
- `overrideX` and `overrideY` must be sent as -1 to use a position; omitting them puts every stamp at the corner. They measure from the bottom left in points.
- `update-metadata` deletes `CreationDate`, `ModDate` and `Trapped` when they are omitted or malformed. The date format is `yyyy/MM/dd HH:mm:ss`.
- `stampType=qr` renders `stampText` as a QR image sized by `fontSize`.
- `/convert/pdf/word` with `doc` returns RTF bytes, so it is not offered. `docx`, `odt`, `pptx`, `ppt` and `odp` are real files.
- `alias` is ignored for keystore files: a non-existent alias still signs.
- Restricting actions needs a separate permissions password. `removeAll` with only the opening password returns 403. Replacing the permissions password while keeping others needs both current passwords.
- `cert-sign` throws without a `password` field, even for an unencrypted key, and PEM accepts only traditional keys (`BEGIN RSA PRIVATE KEY`). PKCS#8 fails with a class cast.
- Compression on this machine: levels 1 and 2 return the file unchanged, level 4 took a 3.24 MB book to 2.56 MB, levels 6 and 9 and target size need Ghostscript, line art needs ImageMagick, and linearize changes nothing. The cause of the linearize result (assumed qpdf) is a **hypothesis**. These results predate the Ghostscript install below, and compression has not been rerun.
- Ghostscript detection (verified 2026-11-01, Stirling 3.2.2 on Windows): `ExternalAppDepConfig` checks for a command named `gs` on PATH. `GHOSTSCRIPT_PATH` did not satisfy it, and neither did `gswin64c.exe` on PATH. A `gs.exe` copy beside `gswin64c.exe`, with that folder on PATH, enabled `repair`, `replace-invert-pdf`, `scanner-effect`, `pdf-to-vector` and `vector-to-pdf`. Disabled endpoints went from 17 to 12 of 99. `repair` belongs to both the Ghostscript and qpdf groups, and either one is enough (verified with Ghostscript only). The sidecar now adds the Ghostscript and qpdf folders to PATH. That qpdf needs the same PATH route is a **hypothesis**, because qpdf was not installed.
- The three endpoints reported as `CONFIG` (verified 2026-11-01, jar plus v3.2.2 source of `EndpointConfiguration`): `CONFIG` is only the default reason, so it does not prove a setting exists. `pdf-to-ua` and `accessibility-report` are disabled when no `PdfaLevelAServiceInterface` bean exists. The source says that tagger and the endpoints ship in the proprietary module, which this jar does not contain, and neither route is in its 148 OpenAPI routes, so no setting can enable them here. `url-to-pdf` has a real setting. The sidecar now sets `SYSTEM_ENABLEURLTOPDF=true`, which moved its reason from `CONFIG` to `DEPENDENCY` without editing `settings.yml`. With WeasyPrint on PATH it turned on, then failed on every request (see below). `settings.yml` describes the feature as internal only with known security issues.
- WeasyPrint (verified 2026-11-01, v70.0 Windows onedir build, SHA-256 matches the release digest, executable not code-signed): in `.baglib-data/pdf-engine/weasyprint`, on the sidecar PATH, and provisioned by `scripts/setup-pdf-engine.ps1`. Disabled endpoints went from 12 to 9 of 99 (`html-to-pdf`, `eml-to-pdf`, `url-to-pdf`). Live: HTML, Markdown and EML with Arabic text return PDFs.
- `url-to-pdf` is broken in Stirling 3.2.2 (verified): `ConvertWebsiteToPDF` line 76 calls `ServletUriComponentsBuilder.fromCurrentContextPath()` inside the virtual-thread job, which throws `No current ServletRequestAttributes` before the URL is read. Baglib's Hub therefore bypasses it and runs `weasyprint.ts` directly. Each redirect hop is resolved and refused if it is loopback, private or link-local, and WeasyPrint gets `--no-http-redirects`. Stirling's `urlSecurity` is not involved in that path. A page's subresources are not checked hop by hop, and DNS rebinding is not defended against.
- WeasyPrint sandbox (verified): without a limit, `<link rel="attachment" href="file:///...">` embedded a local file in the PDF, and a `file:` image rendered. `--allowed-protocols data` blocks both, so every clipped or reader render uses it with HTML on stdin. stdin needs `--encoding utf-8`; without it, one run produced a nearly empty PDF. The Windows build has no CA list, so HTTPS needs `SSL_CERT_FILE`; Baglib writes Node's root certificates to a temp file.
- Clipped and reader PDFs use `--pdf-variant pdf/ua-1`. veraPDF passed all checked outputs as PDF/UA-1 (Arabic book, English article, reader exports, annotation export). This is PDF/UA for documents Baglib generates. It is not a conversion of an existing PDF, so `pdf-to-ua` stays unavailable.

**Auto-redact.** Matches on simple (non-composite) fonts fail closed. On a non-embedded Helvetica fixture and an embedded simple TrueType fixture, the JVM dies with an access violation in `harfbuzz.dll` under `jpdfium_redact_words_ex`, leaving `hs_err_pid*.log` in the engine folder. On a real book with Type 1C fonts the engine answers 500, "Redaction could not be verified". Composite fonts work, and rasterized output had no match left. No output is returned in any failing case, and the engine restarts on the next job. Box redaction worked on the non-embedded fixture. The exact font condition is a **hypothesis** from about ten files.

**Now in the Hub.** Coverage: every API field is exposed, fixed by Baglib, or deliberately left out. Left out: `doc`, `alias`, 40-bit keys, the `PKCS11`, `WINDOWS_STORE` and `SERVER` certificate types, `webp` (needs `pdf2image`), and rotate by 0.

Added: exact and QR stamps, five page-order modes, sheet margins, Word, slide and text output formats, password modes, metadata dates, target-size compression, line-art edge, PDF/UA, redaction presets, and links and form fields kept when removing comments. `remove_annotations.py` previously deleted links and form fields too. Modelled on Acrobat: the two passwords must differ, the opening password is not enough to lift restrictions, and search presets, rewritten with Arabic digits. Balanced is now the default compression, because Light does nothing here.

**Not exposed because the engine has no such option:** Acrobat's odd or even page rotation, watermark behind the page, and Word export layout modes.

**Unverified:** `pdfUa`, target size, Strong and Maximum compression, and line art need components missing here, so they were never run. `repair-pdf` answers 422 on a healthy book; the cause is unknown. Over 30 engine endpoints have no Hub entry, including `split-pdf-by-sections`, `decompress-pdf`, `auto-rotate-pdf`, `scanner-effect` and the attachment tools.

## OCR through Tesseract and OCRmyPDF (verified 2026-11-01 on the v3.2.2 jar)

Supersedes the OCR parts of the live audit above and the "tesseract on PATH" note in the runtime footprint.

**What Stirling needs, tested by hiding each tool from a real sidecar and running real jobs:**

| Available to Stirling | `ocr-pdf` reported | Real job | Path taken |
|---|---|---|---|
| Tesseract and OCRmyPDF | enabled | passes | `processWithOcrMyPdf` |
| Tesseract only | enabled | passes | `processWithTesseract` |
| OCRmyPDF only | enabled | **fails, HTTP 500** (OCRmyPDF exits 3, no Tesseract) | `processWithOcrMyPdf` |
| Neither | disabled, `DEPENDENCY` | not run | none |

So Tesseract is required and OCRmyPDF is the preferred optional layer. `/api/v1/config/endpoints-availability` says `enabled` for OCRmyPDF alone, so that flag does not prove a job can run. `auto-rotate-pdf` also turns on with Tesseract and goes off without it.

**Setup in `stirling.ts`:** Stirling finds both tools on PATH. The sidecar PATH gets the Tesseract folder first and the venv `Scripts` folder last, so the venv's `python.exe` cannot shadow anything. `TESSDATA_PREFIX` and `SYSTEM_TESSDATADIR` point at `ocr-best`.

**`ocr-best` needed more than language files.** With only `ara` and `eng`, OCRmyPDF stopped with `read_params_file: Can't open hocr`, because Tesseract reads `configs/hocr` from the language folder. `configs`, `tessconfigs`, `osd.traineddata` and `pdf.ttf` are now copied in from the Tesseract install. `ocr-best/ara.traineddata` is the real `tessdata_best` file (SHA-256 `ab9d157d...`, 12.6 MB). `ocr-best/eng.traineddata` is the same file as `tessdata_fast`, despite the folder name.

**Availability:** `stirling-availability.mts` reports 7 of 99 disabled: `accessibility-report` and `pdf-to-ua` (CONFIG, proprietary module), `pdf-to-xml`, `extract-image-scans`, `form-detection`, `pdf-to-pdfa`, `pdf-to-cbr` (DEPENDENCY). This work turned on `ocr-pdf` and `auto-rotate-pdf`; without Tesseract the same machine reports 9.

**Dependency groups of the remaining 7 (verified 2026-11-01 from `EndpointConfiguration.class` in the 3.2.2 jar and the live availability call):** `pdf-to-pdfa` and `pdf-to-xml` need LibreOffice, `extract-image-scans` needs OpenCV and is also in the Python group, and `pdf-to-cbr` needs `rar`. `form-detection` is only in the Java group, which is present, so why it is off is **unknown**. These were not installed and retested.

**Removed from the layout (2026-11-01, user decision):** Baglib no longer offers PDF/A, PDF to XML or scanned-photo split. The Hub entries, the PDF/A pipeline step, the reader's `convert-pdfa` feature and the PDF/A policy rule are gone. The built-in OCR and Pre-Publish pipelines no longer end in PDF/A. The other four endpoints never had a UI entry. Earlier notes about these tools are history. The engine contract still resolves `/api/v1/convert/pdf/pdfa`, so a saved custom pipeline with that step loads, and it fails while the engine reports the endpoint disabled.

**Hub jobs through the real UI, throwaway profile, one image-only page each:**

| Page | UI | Languages | Time | Peak memory* | Independent check (`pdftotext`) |
|---|---|---|---|---|---|
| English | Arabic | `ara,eng` (default) | 4.5 s | 135 MB | 374 of 376 words; search finds `Inequality`, `Republic`, `project` |
| English | English | `eng` | 3.4 s | 130 MB | 374 of 376 words, same searches pass |
| Arabic verse | Arabic | `ara,eng` (default) | 15.3 s | 272 MB | letter CER 59.3%, 53 of 285 marks; `الأولى` found, `عليكم`, `فإنها`, `الرحمن` not |
| Arabic verse | English | `ara` | 6.9 s | 256 MB | letter CER 46.2%, 145 of 285 marks; same searches |

*Python, OCRmyPDF, Tesseract and Ghostscript processes, sampled about once a second. The JVM is excluded.

Both pages had no text layer before the job. Output is staged under `.baglib-data/pdf-engine/staged`; source hashes were unchanged after every job.

**Hub limits:**
- Stirling exposes no page segmentation option, so the Hub cannot use the `--psm 4` setting the reader uses. On two-column Arabic verse the Hub reads far worse than the reader (46% against 27%). `ocrRenderType=sandwich` is only slightly better (43.8%, 177 words against 151), so the default stays `hocr`.
- The default `ara,eng` is worse than `ara` on Arabic pages.
- OCRmyPDF warns that no installed font has Arabic glyphs, so the layer is invisible when selected in a viewer. Text stays extractable by `pdftotext`. No font was added.
- `jbig2` and `pngquant` are absent, so OCRmyPDF skips those optimizers. `unpaper` is absent, so the Hub's clean options are unverified.
- PaddleOCR-VL was not added to the Hub.
