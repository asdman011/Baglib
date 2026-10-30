# Immersive reader acceptance audit

Audit date: 2026-10-29, Codex. Scope is the complete supplied immersive workstation specification, not just auto-hide. This document does not mark the objective complete.

## Evidence and remaining gates

| Requirement | Current evidence | Remaining work |
|---|---|---|
| Single reader/workstation chrome | Parent gates outer reader chrome; duplicate canvas stepper and header mode strip removed | Full parent runtime audit of search, theme, zoom, TOC, Knowledge, TTS, auto-scroll and bookmark actions |
| Five independent collapse/pin controls | Five independent pin/collapse controls; run-KFLZml tests all collapse/recovery DOM actions; run-TWtxne tests focused-summary Enter/Tab/Enter recovery while immersive in RTL/LTR | Complete initial Tab traversal into recovery, native tests of all five pins |
| Pure-page focus entry | Native run-ER6Wmf covers F11/Escape and focused-button entry | Actual full application integration, not just isolated panel |
| Four logical edge zones | Native mouse tests RTL/LTR, reduced motion | Normal-motion visual/200ms timing checks |
| Grace/focus protection | 400ms implementation, focus-within CSS | Native inputs/dropdowns and grace-duration assertions |
| Mutually exclusive drawers/popovers | Tool directory uses one configuration host | All Hub, version, knowledge and quick-tool overlay combinations |
| Dark/light/sepia | Scoped palettes/semantic aliases; native run-YYbPfS verifies input+directory heading contrast>=4.5across3themes/2directions | Other surfaces/statuses/icons, global dark variants and organizer sepia still need audit; actual-language rerun pending |
| Seven-color swatches | Shared text/redaction palette with selected ring/check | Highlight/underline/pen/shapes/stamps, native three-theme checks |
| Rounded geometry | Existing rounded controls plus immersive panels | Complete geometry audit including PDF canvas and Hub |
| Local PDF viewing | Native fixture verifies PAGE1/PAGE2 text and red/green pixels through local worker | Production protocol/range behavior, representative multi-megabyte books |
| First paint below150ms | No qualifying measurement | Instrument and measure cold/warm actual reader opening; optimize against evidence |
| Java25 health/lifecycle | Prior real Java verification, warm-up and cancellation tests | Requested cwd alignment, live app quit/start races, accurate status across all UI |
| Tier1 annotate/organize/undo | Native local organizer controls pass; live compound plan verifies reorder/rotation/blank/split parts and source hash | Native drag and UI→IPC→Apply/publication,split-history,annotations/version restore |
| Tier2 server operations | Live rotation/inspection/TOC/ink/compound organize/native split; missing Windows native dependency provisioned with SHA256 verification | Every other named operation through visible UI and independently verified output |
| TOC JSON import/export | Native run-j6YP66 verifies bilingual import/apply/download bytes; real JVM smoke independently verifies nested titles/page2destination/source hash | Append behavior and full native UI→IPC→JVM publication/undo acceptance |
| Pipelines/filter paths | Seven focused processor tests; live handleData full-path rotation independently verifies PDF output | Conditional filter execution, native Hub acceptance |
| Watched folders | Live collision-safe archive/keep checks; same-folder feedback/restart filesystem test; receipts/source-change/shared scans; focused cancellation and clock-driven lifecycle | Full-app shutdown race, multi-process coordination, crash-window duplicates |
| Processor telemetry | Removed backend fabricated235count/personal watches; fresh/stale-day regression and live real count pass | Existing historical count accuracy unknown; native refresh/error-state assertions |
| Four-zone exact layout | Named regions, rail, library,44px bar, directory/pill exist; run-yvi3uH verifies275px tools and6px PDF corners | True RECENT/TYPES/FILES data, all requested compact actions, narrow overflow |
| Standalone Hub | Existing code/entry points from collaborative work | Six-column/four-card responsive modes and every entry point/action verified |
| Bilingual localization | New strings centralized; native core tests RTL/LTR | Remaining hardcoded labels/placeholder text and whole-feature audit |
| Required build/tests |1040TS tests pass before final save guard;2Python provisioning tests pass; typecheck/lint/mainbuild pass | Latest save-guard full-suite result and final complete-goal diff review |
| Git safety | No commit/push performed for this scope | Preserve until explicitly authorized |

## Verification limits

Compound organizer output now independently verified with actual Java25: PAGE2rotated90→part1,blank+PAGE1→part2,original unchanged. Direct native split also returns ordered parts after exact-version Windows native provisioning/PropertiesLauncher repair. DLL PATH workaround failed and verified duplicate exploded DLLs were removed; native-JAR-only rerun passes. Multi-output Quick Save now reveals copy choices rather than replacing source with first part; native save-dialog acceptance still pending. See JPDFium.md/Spring Boot.md for artifact/source/official evidence, license notes and scope limits.

Organizer run-j3Fi2E passed after fixing two real integration errors: mode-dependent count fallback reduced known2pages to1, and View launched Java preview because it checked current mode rather than available native URL. Page plans now start with an undo baseline and history updates avoid nested state updates. Organizer labels centralized; direction-dependent movement describes earlier/later positions, thumbnail zoom explicitly distinguished from document zoom. Sepia root/cards tested, not every icon/button contrast. Actions use DOM click/focus; no actual drag or published PDF plan is proven by this check.

Actual-language rerun completed: run-grhNu1 passes ar/RTL and en/LTR with3theme contrast assertions plus existing immersive checks. This supersedes the pending-language note below, not the outstanding all-surfaces audit.

Theme evidence correction: light directory heading measured2.457before scoped Tailwind alias rebinding; after fix native contrast assertions pass>=4.5for input/heading in dark/light/sepia. Earlier immersive direction tests switched dir, not language; source now switches actual ar/en too and is being rerun. Separate TOC import/export tests already switched actual languages. Do not treat a direction-only check as full bilingual text verification.

Geometry/localization update: run-yvi3uH asserts computed275px tools width,6px PDF page corners and localized total-pages badge. Header no longer repeats current-page navigation counter. Canvas matte colors match requested dark/light and sepia context; full contrast audit remains pending. Library and encryption/compliance labels now centralized; machine option values unchanged.

Direct-load regression corrected (2026-10-29): native viewer now passes normalized URL directly to PDF.js rather than whole-file fetch/ArrayBuffer/Base64 IPC. Native run-ETZG4R passes through `readerAssetUrl` and fixture custom protocol, including text/pixel/page navigation and bilingual immersive checks. Fixture protocol still does not prove production range-handler behavior. Native canvas now receives workstation theme; loading/error/fallback-page labels are centralized. No qualifying150ms first-paint evidence yet.

Unified reading actions update: compact localized Read Aloud/Auto-Scroll/Bookmark now call existing parent handlers; native run-1z7csh asserts callbacks, not audio/bookmark persistence. Removed tools view-pane duplicate layout/zoom and inert local auto-scroll toggle; bottom pill retains layout/zoom. TTS player/lyrics receive scoped higher layers for workstation PDFs; source proves ordering intent, not runtime pixel visibility. Full suite1035passed after control deduplication; final stack-change checks recorded in state files.

Updated evidence (2026-10-29): earlier pen gap below is superseded by real vector overlay transport/publication and matching preview/output color wiring; healthy Java25 live merge retained two pages/text/source hash and contained stroke operator. Rotated/nonzero-origin pages remain rejected; exact color pixels/native pen interaction unverified. Startup false-LIVE corrected; real-JVM503fault test observed16failed probes and no ready transition. Embedded parent selection/highlight/document/outline/page-count wiring added; native fixture callback assertions are being run, not yet full-app annotation acceptance.

Specific pen wiring gap found by source inspection: `PdfWorkstationTools.tsx` submits `edit-content` with `kind:'ink-signature'`/normalized strokes; searched active `src/main/services/pdf-editor` and found stroke handling only in reviews.ts persistence, not the rendering adapter. This is insufficient evidence of working PDF ink application. PdfInkPad renders its preview black unconditionally. Do not claim pen color/output support from palette appearance or review persistence; investigate and implement the actual rendering/publication boundary before acceptance.

The native fixture uses disposable data and a restricted fixture protocol, not production main registration. Reduced-motion emulation is explicit. DOM-triggered form/pin/theme clicks are distinguished from native mouse/key input. Screenshot capture uses Chromium because Electron capturePage returned stale frames. Corrupted fixture source was reconstructed with user authorization from a retained successful bundle; main.ts now loads recovered-main.mjs. The older full editing fixture still contains obsolete selectors and is not passing acceptance evidence.

## Next implementation priorities

1. Finish keyboard/immersive recovery verification and drawer exclusivity before adding peripheral features.
2. Verify full default-reader integration and all requested actions, not isolated DOM state alone.
3. Measure production first paint and verify representative files/worker/font assets.
4. Complete missing annotation palettes, localization and responsive/three-theme visuals.
5. Run live tool/pipeline/watcher roundtrips, then repeat the full acceptance audit.
# 2026-10-29 performance continuation — verified scope

##500MiB and actual-book validation

`writeSparsePagePdf` constructs valid xref offsets around an unreferenced padding stream using small buffers and positioned writes. A real-parser test verifies page text/count around1MiB padding. Native500MiB source524288996bytes required132068served bytes in two206GETs and observed raster completion144.8ms. The generated source is removed after child exit under a verified fixture-directory guard. This validates byte-range scaling, not the complexity of a500MiB scanned encyclopedia.

A readonly existing86MB library book was then tested: checksums before/after match, but it needed729range requests and47660543served bytes, with observed raster completion2.3–5s. Filesystem cache is warmed by the checksum pre-read; worker is fresh. Document-ready timing dominated the slowest run(4829ms of4999.7ms); no xref-recovery warnings were observed. Readonly inspection traversed643classic xref sections through `/Prev` to the chain end. Thus fast sparse-fixture results cannot stand in for real-book acceptance.

Viewer outline extraction now waits for the first bitmap completion and300ms idle; unrequested outlines are skipped. This removes unnecessary startup contention but did not solve this book's long index chain. A bounded temporary optimized viewing-cache option was proposed to the user; approval is pending and no source rewrite/cache transform has been implemented. Native timing instrumentation measures canvas raster completion, not compositor presentation or full-app click-to-paint. Actual-book sub100ms/worker rendering and original workstation acceptance remain unmet.

## Correcting custom-scheme range loading

Earlier claims that range flags alone ensured partial loading were incorrect. Inspection of installed PDF.js `validateRangeRequestCapabilities` shows it returns before range support when isHttp is false. The actual32MiB valid synthetic PDF native baseline served33555542bytes in one200GET, with331.6ms mount-to-paint observation despite disableAutoFetch:true.

The viewer now supplies explicit `PDFDataRangeTransport` for baglib-asset/local-pdf URLs, using HEAD metadata, initial64KiB and only requested subsequent ranges. `openPdfByteSource` validates206/Content-Range/exact size, caps stream accumulation at requested bytes, cancels unexpected full-file responses and forwards cancellation. Range failures reject loading or surface an existing localized error rather than leave pending reads indefinitely. `streamAssetResponse` is the production handler's shared async-stat/createReadStream response core, reused by native fixture (fixture has its own restricted path/origin authorization, so this does not prove the entire production origin gate). Unit tests cover range/HEAD/full GET/pre-abort and transport range bounds/metadata/truncation/oversize/cancellation.

Final bounded-body native comparison after transport:66646bytes served via HEAD+two206GETs,131.5ms mount-to-paint; later-range fault injection Xp85gc surfaces error without hanging.1055tests/typecheck/main+rendererbuild and native English dTsBfs/Arabic TQLqB0 mutation/theme/annotation regressions pass; lint0errors/4existing dependency warnings. These are synthetic32MiB unused-stream PDFs, not representative500MiB scans or sub100ms/cold-open guarantees. Earlier range-configuration rows must be read in light of this correction; native custom-scheme partial loading was not actually proven until now.

## Compact annotations restoration

Verification: full1050tests/tsc/mainbuild pass; targeted lint0errors with25existing warnings. Native compact scenarios English3zYO84/ArabicOO4lAc pass same viewport width, single embedded annotation panel, tools excluded while it is open/restored on close, no horizontal category overflow, conservative Arabic/English search and JSON page2 callback. Earlier visual review found the old full-label tab row crowded the275px pane; embedded mode now uses a five-column icon/count grid with accessible labels/tooltips, while legacy standalone drawer labels remain unchanged. English screenshot reviewed after correction; Arabic screenshot reviewed before this tab refinement and native overflow checks cover the final Arabic grid. Final renderer build pending. Tests do not newly prove production delete/export persistence, which uses existing callbacks.

The prior `AnnotationsDrawer` is reused as embedded content in the existing275px logical-end tools sidebar. A counted MessageSquare toolbar button switches this one area between annotations and tools; opening annotations does not allocate another sidebar or reduce the document viewport further. The original floating PDF annotation drawer is suppressed when the unified workstation is active. Parent reader single-active-panel state is reused; workstation overlays close the annotation panel rather than stack over it. Existing search/category/current-page/color filters, jump/delete/export callbacks remain available, with inline logical layout and localized type labels.

Text-selection annotation locations are JSON, not always numeric page strings: a shared parser now supports those page links and current-page filtering. Arabic query normalization is non-destructive and explicitly disables ة/ه folding. A parser regression and native mixed-script search/jump/exclusive-pane/unchanged viewport-width checks are being run in English and Arabic. Fixture navigation checks prove callback page2, not full production page navigation; the production callback uses the existing reader page setter. Visual screenshots are collected where available. No database fields or dependencies were added.

## Profile-guided React isolation

Final state additionally uses reactive measured page geometry instead of render-time ref reads, avoids redundant effect-based visible-page seeding and resets geometry when asynchronous document loading completes. Lint0errors/4existing dependency warnings and tsc/main+renderer builds pass. Full1049tests and native English LwRUiB/Arabic ZV6mxg mutation/theme checks pass. Final60page native CF8BZe again reports max16.8ms,zero>25ms/observed long tasks,max5canvases and~0.1ms cached draw. These remain synthetic fixture measurements, not large-book cold-open evidence.

Inspected saved native CPU profile IDlOgT rather than attributing all jank to text layers. Its60page scroll showed substantial React JSX/style processing, PDF.js resetCtxToDefault and garbage collection; its long-task observer reported none and one frame was33.3ms. Added memo boundaries around individual pages and complete continuous-page holder/placeholder shells, grouped highlights by page once and stabilized empty highlight arrays. This avoids invalidating every page's shallow props with fresh filtered arrays as current-page/viewport state changes.

Native rerun Td2cWU passes preload/return cache hits, source integrity/final-page text and max5mounted canvases. Its maximum sampled rAF interval16.8ms,zero intervals>25ms,zero observed long tasks and cached draw~0.1ms. CPU samples attributed to exports.jsx were44ms versus96ms in the earlier run. These are two synthetic offscreen development runs, not repeated controlled production or representative-book benchmarks; do not infer universal locked60FPS or sub100ms startup. Full/native bilingual regressions are running.

## Active-source coherence after staged results

Final follow-up checks:1049tests/typecheck/mainbuild/diff-check pass. Native English nUNjy8 and Arabic FEfuwD pass chained Organizer→FindReplace with rendered staged results and unchanged original source hash. The additional restored-input regression passes; native version-history restore remains a distinct unverified scenario.

Session metadata now provides a hash-versioned preview URL for the authorized source. Explicit source switches use this URL rather than the parent reader's original file. Version restore/undo reset the engine's staged working document and clear stale renderer job/output/inspection/thumbnails before showing the restored source. Overwrite-save rebasing does not reset working state; only explicit restore/undo request it. The preview itself never publishes or overwrites files.

A new real-parser regression verifies2page staged output is used by subsequent inspection, then3page restored source becomes the active processing input after reset, its preview version changes, and another owner cannot rebase the session.5focused PDF tests pass; full and native regressions are running. Actual native version-history UI restore is not proven by this service test.

## Original PDF colors and explicit dark-page choice

Verification checkpoint: native English run-Ips0xv and Arabic run-WSi2KH pass default-original colors, app-theme following without tint, explicit tint on/off, organizer rotation followed by displayed replacement and unchanged original source hash. Latest tsc passes;1048full tests/mainbuild pass. These prove the specific UI/staged-output behavior, not overall timing or every PDF tool.

PDF page colors no longer inherit workstation/app theme. `PdfNativeViewer.tintPages` defaults false in all modes and renders paper/original colors; a dedicated bilingual aria-pressed Moon button enables dark page filtering explicitly and restores originals on a second click. The app theme still controls reader chrome, which now inherits the actual Workspace theme instead of starting hardcoded dark (manual workstation theme override remains available). Bitmap cache content stays unfiltered; toggling the page option changes CSS, not source bytes or the PDF raster task. No measured opening-speed improvement is claimed from removing the filter. Native assertions check no filter by default/across app theme switches, nonempty filter only after explicit toggle, and restoration after toggle off; bilingual mutation reruns are underway.

Idle preloading now waits750ms of scroll inactivity and rasterizes only the next off-screen page for single/spread mode into the existing bitmap cache, with cancellation on page/scale/mode/document changes and no speculative text spans. Spread preloads the page after the visible pair. Continuous-mode render-time visible-range accumulation was also replaced with bounded effect-based seeding.

New `BAGLIB_TEST_PERFORMANCE=1` native scenario uses a synthetic60page PDF and the actual viewer. Run-rUZHP9 verifies next-page preload and return-page cache hits, traversal through all60page shells, eventual text hydration on page60, immutable source and no console errors. Max mounted canvases5; measured cached draw approximately0.1ms. Most rAF intervals approximately16.7ms but one83.3ms stall occurred: this contradicts a locked60FPS claim. This offscreen tiny synthetic source is not an actual large-book/cold-open benchmark; transport uses fixture protocol, not production range byte accounting. Initial timestamp sampling was adjusted to omit the mismatched initial performance.now/rAF interval; rerun pending. Main-thread vector drawing remains a likely profiling target, not an established universal cause.

Canvas pooling continuation: `PdfCanvasPool` retains at most4idle surfaces/32MiB idle backing stores per document. Leased canvases cannot be reused until PDF.js cancellation promises settle; off-screen nodes detach immediately. Document disposal releases idle backing stores, and late active returns release their stores after rendering stops. Same-size leases preserve backing allocation; differing sizes resize normally. This bounds retained idle surfaces, not total active surfaces (still governed by viewport residency); it is not yet a hard tiled surface budget. Two pure pool lifecycle/budget tests and native bilingual run-nRrH05 pass before the final same-size allocation guard. Native observation1119ms under concurrent checks is not a qualifying startup benchmark. Off-main-thread rasterization and preload remain unimplemented.

Subsequent pass preserves measured native page width/height in continuous-mode placeholders, avoiding a switch to an A4 aspect ratio after eviction. Unvisited page dimensions still use A4 estimates; complete scrollbar accuracy for mixed-size documents is not yet established. Heading discovery now waits1500ms for scroll inactivity, then yields150ms between scans; cancellation removes timers/listeners. Existing embedded outlines remain immediate. Stable callbacks in `PdfWorkstationPanel` stop its own edge/tool-state changes invalidating the viewer's shallow memo boundary. Other parent prop identities still require profiling.

Java launch now requests BELOW_NORMAL priority, lazy Spring initialization and tier1 compilation. Priority failure is logged without blocking startup. AutoCreateSharedArchive was not added blindly: archive-path/lifecycle support remains unverified. The real JVM smoke passes after these changes, including native split/compound organizer/ink/TOC/pipeline/watcher checks (19108ms total suite, not Java startup-only timing). Full1045tests/typecheck/mainbuild and bilingual immersive native run-cIwNA0 pass. No sub100ms/60FPS/<1ms-cache benchmark is proven.

Further implementation adds a per-document `PdfBitmapCache` with25-entry and128MiB decoded-memory ceilings, explicit bitmap.close on eviction/replacement/disposal, and stale-snapshot cancellation cleanup. Exact cache hits skip PDF.js rasterization; other-scale same-page entries provide previews. Page and text containment isolate layout, and a memo boundary surrounds the viewer. LRU/resource-lifetime regressions pass; full1043tests/typecheck/mainbuild pass. Bilingual immersive run-j4Uljr passes with the cache; it measures mount-to-paint observation764ms on a tiny fixture, not a sub100ms opening claim. Canvas pooling/off-main-thread rasterization and idle preloading remain pending.

Range configuration uses64KiB chunks, disableAutoFetch:true and disableStream:true. The latter intentionally corrects the proposal's contradictory false value: the installed `node_modules/pdfjs-dist/types/src/display/api.d.ts` explicitly says disabling streaming is necessary for disabling prefetch. Existing `src/main/index.ts::handleAssetProtocolRequest` provides206/Content-Range/Accept-Ranges with bounded createReadStream. Native rerun after these flags is underway; complete byte-accounting and cold/warm large-file benchmarks are still required.

The updated objective additionally requests bounded bitmap caching, canvas reuse, range-only loading and measured fast rendering. These are not established by earlier tool smoke checks.

Source inspection found `PdfNativeViewer` retained every intersected page in its visible-page set and never evicted departed pages. The viewport now derives residency from current observer intersections plus adjacent pages, with 75% vertical margin. Navigation reporting runs outside the React state updater. Text hydration waits 150ms after scroll settles, cancels stale asynchronous work and does not delay completion of bitmap paint. Existing hydrated text remains available while scrolling.

The pure residency regression passes, as do TypeScript and main build. Native scrolling, selection responsiveness and timing remain unverified. A real 24MB PDF rotation and existing JVM smoke pass; the reported general invalid-output failure remains unreproduced. Production logs contain password-removal errors and a disabled conversion endpoint, not proof of a universal failure.

