# Stirling-PDF (`Stirling-Tools/Stirling-PDF`) — Reverse-Engineering & Baglib Integration Report

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
2. **Dual-Engine Coexistence with Local Python `PyMuPDF` ([`src/main/ipc/pdf-editor.ts`](file:///d:/Ammar%27s/Projects/Baglib/repo/Baglib/src/main/ipc/pdf-editor.ts))**:
   - Stirling-PDF `v3.2.2` requires **JDK 25** (`modernJavaVersion = 25` in `build.gradle`) and a **2 GB JVM heap (`-Xmx2g`)**. Because Baglib's default development environment provisions **Adoptium JRE 21** + **Python 3.12 (`PyMuPDF`)**, Baglib retains the fast Python `PyMuPDF` worker as the automatic fallback and uses it for coordinate-level `inspect`/`preview`/`create`, while routing supported document operations through Stirling-PDF whenever `preferStirling` + a local Stirling-PDF loopback URL or `Stirling-PDF-server.jar` is configured.

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
   - Routes supported operations to `runStirlingPdf` when Stirling-PDF is configured and preferred (or when the Python environment is absent and Stirling-PDF is available), with automatic fallback to `runPythonPdf` (`PyMuPDF`) for coordinate-level `inspect`/`preview`/`create` or if the Stirling sidecar is not running.
   - Extends `pdf-editor:capabilities` to advertise Stirling-PDF's full feature set when Stirling-PDF is active.

---

## 8. Evidence Classification Summary

### Verified Findings
- **Source & Artifact Verification**: Confirmed against `Stirling-Tools/Stirling-PDF` tag `v3.2.2` and REA artifact inspection `ev_9ea0f1d037ff5e7ec057d6a43e054526c4d291f6a4958771a5f14955ab06eb29`.
- **License Split**: Confirmed in `LICENSE`, `app/proprietary/LICENSE`, and `settings.gradle` that `app/core` and `app/common` are MIT-licensed while `app/proprietary`, `app/saas`, and `engine` are under the proprietary Stirling PDF User License.
- **Java 25 Requirement**: Confirmed in `build.gradle` (`modernJavaVersion = 25`).
- **REST API v1 Multipart Contracts**: Confirmed across 16 controller classes in `app/core/src/main/java/stirling/software/SPDF/controller/api/`.
- **Baglib Adapter Verification**: Confirmed via `tests/services/pdf-stirling.test.ts` (loopback mock server verifying multipart fields, binary/JSON responses, ZIP extraction, version sorting, security validation, and fallback behavior).

### Limitations & Unanswered Questions
- **Local Runtime Footprint**: Stirling-PDF `v3.2.2` requires a **JDK 25** runtime and ~2 GB RAM (`-Xmx2g`), plus external `tesseract`/`soffice` binaries on `PATH` for OCR and non-native Office conversions. On this machine, Adoptium JRE 21 is currently installed under `.baglib-data/pdf-engine/java/`, so live JVM execution of a `v3.2.2` `Stirling-PDF-server.jar` was not performed; instead, the adapter was verified against a live local Node HTTP loopback test server implementing Stirling-PDF's exact `/api/v1/...` multipart contracts, while `PyMuPDF` remains the active default engine.
- **RTL replacement / JSON reconstruction**: The corrected Section 5 supersedes the earlier `minX` claim. Existing page order determines the first touched anchor, and successful preserved-stream rewrites ignore coordinate changes. General Arabic shaping, new glyph coverage and exact replacement widths remain unverified in the Java runtime; conservative Python fallback is required where geometry cannot be established.


## 9. Fresh Contract Reconciliation — 2026-10-28, Codex

The 2026-10-27 source investigation was rechecked using selected official `v3.2.2` Java files and the fresh REA archive evidence listed above. Local files reside in `.baglib-data/stirling-research/`. This reconciliation records source reads and retained archive identity, not a successful Java 25 server launch or a new test count.

- `ConvertPDFToExcelController.java` lines 57-103 establishes `/api/v1/convert/pdf/xlsx`, inherited page-number selection, optional Tabula selection with `useStirlingOfficeConvert=false`, and HTTP 204 for empty extraction. Baglib should expose its existing `no-tables` result for that response.
- `RearrangePagesPDFController.java` accepts one-based user page lists for removal and `CUSTOM` rearrangement. Delete-only plans send the complement of the retained page plan; reordered/duplicated plans need explicit selection/order.
- `MergeController.java` accepts repeated `fileInput` fields. `sortType=orderProvided` preserves supplied order; `removeCertSign=true` removes certificate signatures. There is no merge page-range parameter, so range selections must be staged before merging. Signature removal is not a claim that the merged document retains prior signature validity.
- `CropController.java` uses PDF bottom-left crop coordinates and updates the media box after clipping. This differs from ordinary PyMuPDF top-left page coordinates and must be explicit wherever a crop payload is interpreted.
- `ConvertPdfJsonController.java`, the JSON models, and `PdfJsonConversionService.java` establish the stream/position limitations in Section 5. The original text-edit sorting hypothesis is superseded; full arbitrary-font RTL fidelity remains unresolved without runtime evidence.

See [Document Workstation](feature%20-%20Document%20Workstation.md) for the comparison with PyMuPDF and Baglib's source-bound staging architecture. Adapter tests, Python verification and UI verification are recorded separately when actually run.
