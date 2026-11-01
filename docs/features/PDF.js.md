# PDF.js: complete-page PDF covers

## 2026-10-30 document-scoped raster-worker integration

Supersedes the earlier isolated-only checkpoint: ordinary `PdfNativeViewer` now schedules raster-worker initialization750ms after its first bitmap and scroll idle. Initial/unready-worker draws retain the existing renderer path and never await worker startup. Once ready, uncached page draws request transferred ImageBitmaps and put successful frames into the existing bitmap LRU; selectable text/annotations remain on the renderer. Unsupported worker filters, per-page errors, crashes, queue pressure or timeout fall back to the existing pooled renderer. This intentionally retains a local fallback; it is not a claim that every PDF feature rasterizes off-thread.

`PdfRasterClient` bounds pending requests to8, cancels aborted jobs, closes late frames, settles pending promises on shutdown and terminates its worker. Initialization timeout is15seconds without blocking first paint; individual draw timeout is capped at1.5seconds. Document cleanup cancels idle warm-up/disposes the client. Worker-side pending-ID tracking ignores cancellation of already-finished jobs. No full-book buffers/IPC are introduced.

Native5Y7FEJ verifies actual reader page5 reports worker paint and matches a separately rendered reference pixel-for-pixel. ArabicNrfeTy and EnglishNxKtqj additionally navigate to page12 and observe the raster worker's CDP target disappear after reader unmount. `Target.getTargets` did not enumerate these worker targets, so the final test uses auto-attach notifications rather than interpreting an empty inventory as cleanup. Exactly one document raster target is counted; complete independent inventory of nested parser workers is not established by that count. Four client regressions cover unready fallback, successful transfer ownership, cancellation/late frames/request isolation, timeout/shutdown and fatal failure. Full1,066test suite passed before the fourth regression/timeout refinement; final rerun is pending at this checkpoint.

Limitations: worker warm-up still parses a second document; it occurs after first paint instead of delaying it. The first page remains on the existing renderer; this does not establish the sub100ms cold/full-app goal. Idle preload still has its existing local rendering path. Native rapid page setters are batched, not proof of every possible in-flight cancellation race. Broad font/SVG/image-mask fallback and representative scrolling performance need further verification.

## 2026-10-30 isolated OffscreenCanvas raster prototype

`assets/pdf-raster-worker.ts` runs the existing display API in a dedicated worker with an OffscreenCanvas, worker FontFaceSet, explicit byte-range transport and a nested existing PDF parser worker. The returned ImageBitmap transfers ownership to the caller, which closes it after drawing. One render is serialized at a time, a canvas is reused, and output pixels are capped. `scripts/copy-pdfjs-assets.js` bundles the prototype as a local module alongside existing parser/CMap/font assets. It is NOT yet used by the ordinary reader.

Focused follow-up inspection of the same installed display source previously examined with REA found DOMCanvasFactory needs `ownerDocument.createElement('canvas')`, FontLoader uses ownerDocument.fonts, and getUrlProp dereferences window.location for string inputs. A constructed URL avoids that last Window dependency. The worker supplies only OffscreenCanvas creation and FontFaceSet, not a general fake DOM. SVG/filter methods explicitly fail; a future caller must fall back, not silently drop PDF filters. No broad claim of support for every font, image mask, blend or form is made.

Native Y6q9ED verifies byte-identical first-page pixels for a text/vector fixture at840×1200,147ms inclusive worker/parser startup. Native NQpUZS verifies exact pixels for the existing scanned Avicenna first page at619×876,1539ms on its unoptimized original, including duplicate parsing. These are capability proofs, not faster startup evidence. Subsequent fixture code adds an explicit original-SHA assertion; that assertion was not in the recorded NQpUZS run. Initialization during idle time, display integration, robust cancellation/disposal, fonts/filter fallback and avoiding duplicate first-open parsing remain pending. Main application behavior/layout is unchanged.

## 2026-10-30 progressive refinement isolation

Final current-source checks: ArabicjdqTkt repeats the white-clear preview-preservation probe successfully. English60-page Xozeb0 preserves idle preload cache hits (~0.1ms draw), at most5mounted canvases and sampled animation intervals no greater than16.8ms with no observed long tasks in this synthetic offscreen run. These narrow observations are not a universal60FPS/scanned-book claim or proof of off-thread rasterization. Typecheck, main build and1,063tests pass; renderer build is running at this checkpoint.

Real-book BueVpZ stage telemetry: cached document-ready82.6ms, page requested84.4ms/ready85.1ms, raster85.3→180.7ms. Most remaining post-document time is inside the render promise; no off-thread improvement or sub100ms conclusion follows.

Own-reader inspection found preview and target rendering shared the visible context, allowing a renderer background clear to erase the preview before completion. When a bitmap preview exists, `PdfPageItem` now obtains a detached canvas from the existing bounded-idle pool, renders the crisp result there, copies it to the visible canvas on success and releases after task settlement. Cached exact-scale draws still avoid rendering; first uncached pages do not acquire the extra refinement canvas. Loading blur/spinner is removed once a preview is visible. This is double buffering on the renderer thread, not worker rasterization.

Native Zj8Z1a monkey-patches only its disposable test page's render entry to clear the destination white and immediately sample the actual visible canvas: the target is detached and the visible preview remains opaque red. This directly tests the previous flash mechanism, not an FPS guarantee. Typecheck passes; viewer lint has0errors/four pre-existing dependency warnings. Cancellation/scroll and bilingual reruns are pending at this checkpoint.

## 2026-10-30 cached-derivative failure recovery

Latest real-book stage telemetry (ixpiYK) confirms cached document-ready68.7ms and first bitmap157.1ms, versus original2413.8ms/2576.8ms, with five requests/211KB and exact pixels/page count/source checksum. Remaining~88ms between cached readiness and bitmap completion warrants rendering-path investigation; this observation does not itself prove all that time is rasterization. Current typecheck/hooklint pass.

Follow-up validation: final English opyVrC and Arabic Nsehbk native fault tests pass with exact pixels/source SHA and automatic source-edit reload; full1,063tests/typecheck/mainbuild pass before the subsequent one-line late-range callback refinement. That callback now also requests original fallback after a cached range fails on an already-loaded document; dedicated post-paint fault injection has not yet verified this path. The initial parsing-failure native checks do not claim that broader coverage.

`usePdfViewSource` tracks a rejected cached URL for the mounted original and exposes a one-shot fallback. Initial PDF loading/parsing failures retry the canonical original; a failed derivative is not repeatedly selected by same-key polling. Original failures retain the existing localized error interface. This does not persistently quarantine a corrupted entry across reader remounts or yet cover every failure after initial bitmap completion.

Native AEgs8g deliberately overwrites only its disposable cache entry with same-length invalid PDF content while retaining `%PDF-` so the service header check still passes. The actual renderer rejects it and reopens the original: both cache and original requests recorded, two pages/exact first-page pixels/original SHA preserved, then deliberate source replacement automatically loads three pages. Recovery paint64.8ms is a synthetic warm fixture measurement, not representative-book performance. New behavior is invisible during ordinary reading: no extra toolbar/dialog and no manual retry for this cache fault.

## 2026-10-30 flat page-tree startup amplification

REA inspected the shipped `build/pdf.worker.mjs` within installed pdfjs-dist: parent evidence `ev_403c1e0ab8a62e9c184db4c6a6b1c8470243cd02d92ee1f899feaf78fc0b7e97`, summary `ev_262c896849678bacd15aba55f72b56bc6527247647edc06064a2095388689c72`. One2,209,730-byte file/320,134AST nodes was parsed;110other files excluded. Primitive byte and semantic-node/unknown budgets were reached; this bounded static graph does not establish runtime causality alone.

Focused source inspection supplies the relevant call path: worker `loadDocument` ensures `checkFirstPage` then `checkLastPage` before document readiness (around56460). `PDFDocument.checkLastPage` calls `getPage(numPages-1)` (55109). `Catalog.getPageDict` fetches each uncached child dictionary to determine its page count (37133). A flat641-child root therefore reads page dictionaries distributed among image streams even when only page1 is requested. This is required validation behavior, not a defeated `disableAutoFetch` flag. No vendored worker patch was made.

Controlled alternatives on the same book: linearization alone gave599requests/39MB and~921ms cached paint. Generating object streams did not materially help (nL08vv:598requests/39MB/~851ms), so that experimental option was removed. Balancing only already-flat roots into groups of32pages before linearization retained21root groups (verified on disk). Native qoGN05 then served210,620bytes/five requests with175.2ms cached paint versus2486.5ms original.641pages, exact first-page pixels and source checksum all match. Three real-helper Python tests verify order, inherited geometry, non-rebalancing of already-grouped trees, source preservation, encrypted refusal and output budget. Seven cache-service tests pass. This is a large measured improvement, still not proof of the requested sub100ms cold/full-app target.

Cache format identity advances to version2 so previous scattered-layout derivatives regenerate. Nested trees are left alone; original page objects/content remain canonical and only the disposable derivative's parent/index structure changes. See [pikepdf](pikepdf.md) and [Document Workstation](feature%20-%20Document%20Workstation.md).

## 2026-10-29 local-reader byte-range correction

Scope extends to the existing reader, without superseding cover findings. Direct installed-source inspection of `node_modules/pdfjs-dist/build/pdf.mjs::validateRangeRequestCapabilities` verified that built-in network range support is disabled when isHttp is false. Consequently baglib-asset/local-pdf URLs downloaded completely despite range headers/disableAutoFetch configuration. The public PDFDataRangeTransport contract was checked in `types/src/display/api.d.ts`; no new REA run is claimed for this own-reader integration pass.

Actual native baseline using a valid32MiB synthetic unused-image-stream PDF served33555542bytes via one200GET and observed paint331.6ms. The explicit range adapter in `PdfNativeViewer.tsx` now uses `src/shared/pdf-byte-source.ts` to request HEAD metadata, initial64KiB and only PDF.js-requested ranges. Responses must be206 with exact Content-Range and bounded body length; wrong/truncated/oversized responses fail instead of buffering whole files. Cancellation closes reads; late range faults surface reader load failure rather than hang. The shared server response core is `src/main/services/digital/asset-range.ts::streamAssetResponse`, called by production protocol authorization and reused under fixture-specific authorization.

Final bounded-body native rerun served66646bytes via two206GETs and observed131.5ms paint; injected later-range failure Xp85gc surfaced without hanging. Full1055tests/typecheck/main+rendererbuild and bilingual staged mutation checks pass. Targeted lint has0errors/4existing dependency warnings. These are synthetic/offscreen observations, not real-book/sub100ms/cold-open proof; transport source/cancellation correctness is separate from worker rasterization and font/rendering performance. See [Immersive reader acceptance](Immersive%20reader%20acceptance.md) for limits and superseded range claims.

## 2026-10-26 workstation extension

The existing `pdfjs-dist@4.10.38` also powers bounded main-worker inspection and text-only HTML fallback in `src/main/services/pdf-editor/inspection.ts` and `src/main/pdf-editor-worker.ts`. This is implemented/runtime-tested extraction, not a new writing/signing capability. Tests exercise the real parser, permissions, source ownership and escaped bilingual HTML. The fallback refuses to label signatures or archival/accessibility conformance as verified. `electron-builder.yml` includes the existing package for packaged worker resolution. Advanced mutation now uses the separately approved local toolchain; see [Document Workstation](feature%20-%20Document%20Workstation.md). Historical cover research below remains applicable; no additional external reverse engineering is claimed by this extension.

Investigated 2026-10-24; installed `pdfjs-dist@4.10.38`. Scope: local PDF cover generation, not a replacement of the document reader or metadata parser.

## Evidence

### Approved viewing-cache preparation — 2026-10-30

Final native checkpoint: real79HphF verifies exact first-page pixels,641pages and unchanged source checksum; initial2802.3ms→cached920.7ms with599warm requests/39MB. SyntheticfC1J2S verifies exact pixels, automatic stale-source reload and cached53.5ms/1558bytes/two requests. Typecheck passes. These stronger runs supersede earlier pixel-check-pending statements, not the remaining real-book latency gap. See [pikepdf](pikepdf.md) for helper evidence and limits.

Native follow-up (same day): `run-eIyk3l` proves real cache IPC/subprocess/renderer reuse on the disposable 32 MiB fixture and automatic invalidation after a deliberate replacement with a three-page fixture. First paint was338.8ms initially and66.6ms on reload. `run-cu9iDC` tests the actual86,588,927-byte Avicenna PDF without modifying it:641pages before/after, checksum unchanged, first paint3102ms initially and981.8ms cached. The cached run still served39,136,842bytes; the sub100ms representative-book objective is not met. Both timings use fresh renderer reloads, warmed filesystem and offscreen canvas completion, not compositor/full-app/cold-disk timing. JSON evidence is stored inside each named `.baglib-data/pdf-workstation-live/` run. Subsequent pixel-equality tests are pending at this checkpoint. The synthetic warm-byte report in eIyk3l includes subsequent deliberate edit traffic; newer harness revisions snapshot warm traffic before that edit.

Integration follow-up: cache acquisition/release/change notifications now cross owner-validated `pdf-editor` IPC and preload contracts. `usePdfViewSource` resolves only the display URL; processing sessions continue to receive the canonical source. Initial lookup waits for metadata/cache validation, never generation. Same-key background completion does not replace an already-open original; reopening uses the derivative. Source-key changes cause a new display load after directory-watch notification or 1-second polling fallback. Main application shutdown awaits service disposal. Native fixtures use isolated cache directories and raw performance probes disable the cache to preserve baseline measurements. Typecheck, main build, hook lint and 1,063 tests pass at this integration checkpoint; native cache-hit performance is not yet verified. The preparation-only status below describes the earlier checkpoint, not the current wiring.

The user approved background optimization of large or fragmented PDFs into disposable viewing derivatives. `src/main/services/pdf-editor/view-cache.ts` is a preparation-stage service, not yet connected to the viewer. It keys entries by canonical source path, modification time and size; serializes generation; protects active cache leases; and applies a default 2 GiB LRU limit to its published cache directory. Output staging is separate and individually bounded, so the published-cache limit is not a claim that aggregate temporary-plus-published storage never exceeds 2 GiB. Encrypted PDFs are excluded by the Python helper to avoid writing decrypted derivatives.

`assets/pdf-editor/view_cache.py` uses the existing pikepdf dependency to coalesce incremental updates and linearize a derivative, never overwriting the original. A disposable two-page fixture produced a verified linearized 1,558-byte output. Seven service regressions pass: nonblocking original fallback/deduplication/persisted reuse; path/mtime/size invalidation and owner isolation; LRU with active-reader protection; invalid/oversized output rejection; concurrent source-edit discard; shutdown cancellation; and startup pruning with unrelated-file preservation. The fake optimizer tests validate service behavior, not PDF rendering fidelity or actual subprocess cancellation. No cache speed improvement, real-book preservation comparison, renderer integration or packaged-runtime validation is claimed yet.

- REA `analyze_javascript_application` inspected installed `node_modules/pdfjs-dist`, restricted to `build/pdf.mjs`. Summary evidence: `ev_1c97a48249b464c3179a75fc4acf354317378cf33d58262ea1abc038aba69053`; parent: `ev_c7d8724ba82629c766984fdf292a91f88ad2b71ce928622dd29fe8753397622c`.
- The analysis parsed one 658,371-byte JavaScript file (109,245 AST nodes); the semantic graph was capped at 500 nodes and 100 unknowns. The remaining 110 inventoried files were outside the source-analysis scope. This was bounded static analysis, not complete decompilation or proof of runtime fidelity.
- Direct source inspection and runtime tests verified the `getDocument` → `getPage` → `getViewport` → `page.render` canvas path. Unlike PDF image-resource enumeration, this renders text, vectors, backgrounds and positioned images together.
- The former `src/renderer/utils/pdf-page-renderer.ts` relied on a shared PDF.js global without reliable worker initialization and fell back to embedded-image extraction. That fallback could not implement page selection.

## Baglib implementation

- `src/main/services/metadata/pdf-page-cover.service.ts` queues rendering in a dedicated hidden, sandboxed Electron renderer. Its local frame has no Node integration, denies permissions/window opening and blocks external requests. Local CMaps and standard fonts are provisioned with the existing PDF.js assets.
- `assets/pdf-cover-frame.js` installs an explicit module `Worker` through `GlobalWorkerOptions.workerPort` before opening documents. `scripts/copy-pdfjs-assets.js` bundles the installed PDF.js browser entry and copies the frame/worker assets into development and packaged-output asset directories. There is no renderer-global PDFJS dependency, CDN or added dependency.
- Canvas output is a full-page JPEG, normally 750 pixels wide, bounded to four million pixels. Pages are rendered serially; canvas/document resources are released. A 60-second render deadline and renderer-exit handling reset a failed host. Shutdown closes the host.
- Results are stored under the existing user-data `covers` directory using source path, size, modification time, width and page as the cache identity. Only paths cross ordinary cover IPC; an in-memory cache retains at most 30 entries. Temporary writes are cleaned up. Persistent files are book artwork, not temporary import payloads.
- Automatic PDF ingestion renders page 1 before successful import/addition. Explicit user-selected covers remain overrides. EPUB/MOBI cover behavior and Work → Edition → Source remain unchanged; no migration is required.
- Manual extraction returns actual pages 1–5, or fewer for short PDFs. Localized thumbnail buttons and cached previous/next selection do not enumerate image resources.

## Verification and limits

`node scripts/pdf-cover-live/run.mjs` used an isolated Electron profile, real preload/IPC and SQLite. A seven-page fixture contained an unrelated blue embedded image but a red first page: the resulting cover was red. Five distinct pages, two-page/image-free documents, first-page automatic additions/imports, retained manual page 3, malformed-document recovery and a real repository PDF were verified. The frame's tightened CSP was included in the successful run. Synthetic and real first-page images were visually inspected.

The combined focused regression run passed 109 tests; Arabic/English UI tests exercise localized page choices and selection. TypeScript and main/preload/worker builds passed. This does not certify every font, encrypted/malformed PDF, a packaged installer, every OS drop source, or the complete application test suite. Old library artwork is not mass-overwritten. A failed page render is reported rather than silently substituting an embedded image. The earlier 301-book import benchmark predates this page-rendering change and is not a performance measurement of the new cover path.

See [Cover Retrieval](feature%20-%20Cover%20Retrieval.md), [pdf-parse](pdf-parse.md) and [Digital Library Import](feature%20-%20Digital%20Library%20Import%20and%20Deduplication.md).

## Single worker-hosted pipeline (2026-10-31, Claude Code)

**Verified parser inventory before this change:** opening a book created a renderer `getDocument` with its own transport, and after idle a second `getDocument`, transport and nested core worker inside `pdf.raster.worker.mjs`, so the file was parsed twice. PDF.js display objects cannot be shared across threads, so the two could not be merged while the renderer kept a `PDFDocumentProxy`.

**Design now in place:** `src/renderer/libs/reader/pdf-view-document.ts` (`PdfViewDocument`) is the only document object the reader sees. Parsing and painting live in the raster host; the renderer receives transferred `ImageBitmap`s, plain page geometry, text content and a resolved outline. A renderer-side `getDocument` opens only if the host is unavailable, or lazily for a page the host cannot draw (for example SVG-filter content, which throws `unsupported-worker-filter`), and it is destroyed with the document. `AppLayout` keeps one started spare host; closing a book terminates that book's host, which is the deterministic cleanup. Other `getDocument` callers are unrelated: the isolated cover frame and short-lived main-process inspections that destroy their own task.

**Kept unchanged:** `PDFDataRangeTransport` over `baglib-asset://`, the 2 GiB view cache and the `ImageBitmap` LRU.

**First paint:** the view cache stores a small WebP per `(path, mtime, size, page)` beside the derivatives (64 MiB LRU), returned with the first `viewSource` call.

**Late range failure:** a range error after opening reports `source-failed`; the view cache evicts the derivative (metadata first, so it stays invalid even if Windows holds the PDF open), blocks regeneration for the session, and the reader reopens the canonical file at the current page.

**Text layer:** `idlePdfTextStream` feeds PDF.js `TextLayer` 48 items per idle slice instead of one synchronous page build.

**Measured, 2026-10-31.** Native offscreen Electron fixture on the development machine, nothing else running, warmed host. Real 641-page, 45 MB linearized PDF (`.baglib-data/pdf-engine/diagnostic-large/`):

| Measurement | Result |
|---|---|
| Reopen, preview presented | 23–42 ms |
| Reopen, crisp page | 175–240 ms |
| First-ever open (no preview) | 914–1054 ms; the sub-100 ms target is **not met** here |
| Late range failure at page 400 | recovered from the original, later requests avoid the cache |
| Scroll, 60-page synthetic | 2 runs, 0 of 89 frames over 17 ms, 0 long tasks, max 5 canvases |
| Scroll, real book at 60 px/frame | 356 of 359 frames at 16.8 ms or less, 3 frames over 25 ms (max 50 ms), 0 long tasks |

**Limits of this evidence:** `requestAnimationFrame` deltas quantize to the 60 Hz grid, so "under 16.6 ms" reads as 16.6–16.8 ms. Switching into continuous mode can still drop frames (33–83 ms seen) before scrolling settles; the benchmarks start after a settle. The fixture is offscreen, and the original 86 MB unoptimized book was not available for this run.
