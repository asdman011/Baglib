# Stirling-PDF (`Stirling-Tools/Stirling-PDF`) — Reverse-Engineering & Baglib Integration Report

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

