# PDF.js: complete-page PDF covers

Investigated 2026-10-24; installed `pdfjs-dist@4.10.38`. Scope: local PDF cover generation, not a replacement of the document reader or metadata parser.

## Evidence

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
