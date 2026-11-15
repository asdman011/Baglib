# BlockSuite integration findings

## KEY-363 investigation on 2026-11-14

Codex inspected the locally vendored BlockSuite v0.27.4 source and the RE-1 shell. This extends the Research Editor Plan revision 2.1 and ADR-016. The user decided on 2026-11-14, "add a new tab 'Editor' in the side bar in the notes section above the 'Notes Log'".

### Verified source contracts

- `research-editor/vendor/blocksuite/framework/store/src/transformer/transformer.ts` provides `snapshotToDoc` and `docToSnapshot`. Import validates the envelope, creates the document through `docCRUD`, and imports blocks. The host loads RE-3's starter snapshots through this API. The wrapper restores `snapshot.meta` to workspace metadata because `createDoc` otherwise generates a fresh creation date and empty title.
- `framework/store/src/test/test-workspace.ts` accepts explicit document and blob peers. The existing RE-1 shell uses `TestWorkspace` with `NoopDocSource`, which keeps live Yjs state in memory. Hosted snapshots are persisted through BagLib's manuscript API. The shell installs the bridge-backed blob source as the only blob peer. Standalone RE-1 smoke tests retain the memory blob peer.
- `framework/store/src/test/test-doc.ts` owns a `spaceDoc` Yjs subdocument per chapter. Text updates emit on that subdocument. Observing only the workspace root misses ordinary typing. `research-editor/app/src/main.ts` observes the loaded store's `spaceDoc` and serializes changes through RE-3's persistence controller.
- `framework/sync/src/blob/source.ts` defines the public `BlobSource` interface, re-exported by `@blocksuite/affine/sync`. Its methods get, set, delete and list map to `research-editor/app/src/blob-source.ts` and the parent's typed blob API.
- `framework/sync/src/blob/engine.ts` awaits the primary blob peer before completing a set. `framework/global/src/utils/crypto.ts` hashes bytes into URL-safe Base64 with trailing padding. Valid blob IDs therefore include terminal `=` padding. Main rejects separators, traversal, drive names and invalid characters.
- `affine/shared/src/services/theme-service.ts` initializes from `documentElement.dataset.theme` and observes subsequent changes. The shared appearance helper writes theme, lang, dir and font-scale properties before mounting. The host hides the iframe until its bridge is connected and a chapter is open.
- `integration-test/src/editors/editor-container.ts` keys the rendered editor by root block and mode. Native verification waits until the paragraph's inline editor is bound to the loaded Yjs subdocument before sending CDP input.

All vendor source paths above are under `research-editor/vendor/blocksuite/`. KEY-363 changes the wrapper and BagLib host. Concurrent KEY-365 owns the later numbered RTL patches and their generated vendor output.

### Verified runtime evidence

The native harness uses BagLib's actual exported Next UI, production main and preload, native clipboard paste, and a fresh `.baglib-data/k363-*` profile. It exercises Arabic RTL and English LTR, real PDF text, a real PDF image, autosave, undo, explicit save, global Ctrl+Shift+N, appearance changes, restart and exact snapshot reimport. Evidence remains under `.baglib-data/KEY-363-evidence/`. The disposable profile is removed after each full harness run.

REA `list_browser_targets` and `inspect_web_page` observed Chrome 128 / Electron 32.2.0. Evidence `ev_434787a8a21ced8821db580e558a88c49901af8c07565df8dbb685e8694c3637` identifies the parent `http://localhost:3000/` and child `http://localhost:3000/research-editor/index.html` with the same origin. Its retained summary is `rea-page-summary.json`. The observer starts at attachment and filters some sections. Native assertions supply typing, saved bytes, image decoding and full-run error checks.

### BagLib implementation and trade-offs

- `src/main/services/research-editor-serving.ts` resolves the optional editor folder separately from exported renderer routes. Main owns the `app` handler and preserves the renderer's HTML route fallback. The development HTTP handler intercepts only `/research-editor` on the two approved port-3000 loopback origins. Other HTTP requests use `net.fetch` with `bypassCustomProtocolHandlers`. This serves current build output under the renderer origin without copying assets into Next public output.
- `src/shared/research-editor.ts` defines the parent bridge, appearance and asset contracts. Lit, Yjs and BlockSuite remain inside the iframe bundle. The renderer build was scanned for engine markers, with the result in `bundle-isolation.json`.
- `src/main/services/research-editor-assets.ts` publishes immutable per-ID directories containing `data` and `type` under `data/manuscript-assets/` next to `baglib.db`. Temporary directories prevent partial writes from becoming visible. Concurrent identical writes converge. Conflicting content for one ID is rejected. MIME and bytes survive reopening the store. Export consumption belongs to RE-8.
- `editor-host.ts` serializes document switches, flushes the iframe, awaits the previous controller, and refetches the next snapshot after saving. This also preserves edits when reopening the same chapter. Rename flushes first and reloads the renamed snapshot. Tree deletion flushes and closes the chapter before applying the existing trash API.
- The native close guard can hold the existing five-second fallback while a responsive renderer saves its manuscript. A save failure keeps the editor open for retry. Existing non-editor close guards retain their fallback.

### Boundaries and outstanding scope

RE-10 owns the installer checkbox, packaged installer verification and the absent-editor manuscript preview. The development-origin smoke uses the production Next export served on localhost, so Next development HMR has no separate verification claim. The bundle scan establishes engine isolation, without a quantified before/after startup-time benchmark. RE-4 and later editor tasks own additional BlockSuite behavior and source blocks. Work, Edition and Source schema and contracts retain their approved roles.

Related references are [Research Editor Plan](feature%20-%20Research%20Editor%20Plan.md) and [ADR-016](../ADR-016-manuscripts.md).

## KEY-366 source-block investigation, 2026-11-14–15 (Codex)

### Evidence and boundaries

REA `analyze_javascript_application` inspected the two supplied spike files `ayah-block.ts` and `sample-ayahs.ts` under `D:/Ammar/Projects/Baglib/spike/affine-src/AFFiNE-0.27.4/blocksuite/playground/apps/baglib/baglib/`. Retained evidence: `ev_a73a213aeb8caafb7339adeb63c8607cc76e8693bc16f6da9c6234dffd63857e`; artifact SHA-256 `2f44f5f75f3d8eba5181ecb0176421a22207900968b6e5c46410982727ce7d90`. Both files parsed (10,357 text bytes); source analysis was static, with 230 unresolved semantic relationships. It establishes syntax and extension patterns, not execution or runtime equivalence.

Verified spike patterns: `defineBlockSchema` + `BlockSchemaExtension`, `CaptionedBlockComponent` + `BlockViewExtension`, configured slash commands, a separate insertion search field, and a Markdown adapter. The spike searches a sample array; it does **not** establish a real BagLib IPC integration. No Maktabook source or runtime was inspected in this task; “Maktabook-style” describes the requested authoring flow.

### Public contracts inspected in the vendored v0.27.4 source

- `framework/store/src/model/block/zod.ts` exposes schema/model metadata, with content blocks parented by `affine:note`.
- `affine/shared/src/adapters/{markdown,html}/block-adapter.ts` registers flavour matchers; `markdown.ts` and `html.ts` walk serialized snapshots. Export ASTs use text nodes for canonical content and link nodes for references; HTML poetry uses ordered table rows and two cells per bayt.
- `affine/widgets/slash-menu/src/{widget,slash-menu-popover,extensions}.ts`: the widget recognizes input of the slash, but the popover refreshes its query through a keydown/composition observer. Native CDP `Input.insertText` updated Arabic paragraph text while the original menu remained in query state `off` during the live investigation. This corrects the earlier assumption that English-only default aliases alone explained the RE-1 observation.
- `framework/std/src/extension/widget-view-map.ts` and `identifier.ts` expose widget registration/override. KEY-366 uses this public extension boundary for an input-aware menu; vendor files and patches remain unchanged by this task.
- `affine/rich-text` exports `getInlineEditorByModel`; its public range and text APIs preserve the author’s prefix/suffix when inserting a source at the caret.
- `framework/store/src/reactive/text/text.ts` exposes `Text.split` with formatting-preserving deltas.
- Cross-frame result objects need a deep copy in the iframe before BlockSuite stores arrays of poetry halves. The first native insertion attempt exposed a Yjs “Unexpected content type in insert operation” for foreign-realm arrays. The insertion boundary now copies the JSON-compatible props into the editor realm.

### BagLib application and trade-offs

`research-editor/app/src/blocks/` adds four content flavours (`baglib:ayah`, `baglib:hadith`, `baglib:verse`, `baglib:book-quote`) and Markdown/HTML adapters. Props contain canonical source text, provenance and a single canonical scheme URL. Ordered poetry pairs come from `poetryBayts()`; free verse keeps a separate row per original line. Quran ranges preserve their complete range target and read successive IPC pages. Searches return at most eight results; Quran ranges are limited to fifty ayahs per insertion.

The host’s `source-search.ts` calls existing Quran/Sunnah/poetry/library IPCs through the typed parent bridge. Request IDs reuse `cancelSlashSearch`; per-request stale checks also reject late noncancellable reads. Library FTS requests use `scope:'books'`; quotes come from canonical page content, not highlighted snippets. Explicitly selected unindexed PDFs can use their existing text layer; no OCR or original-file mutation is introduced. PDF extraction already running in the existing IPC cannot be preempted by this bridge, but its stale results are discarded.

The local Hafs font preset is QPC V4 Tajweed (`quran-resource-presets.ts`), consumed by BagLib’s page-glyph renderer. The research-editor assets contain no standalone Unicode Quran font; these canonical word-string cards use the editor’s already bundled Noto Naskh Arabic face with generous line height. No font download or dependency was added.

RE-3’s `deriveManuscriptSnapshot` already recognizes the blocks’ `url` and `verses` props. Focused repository tests verify four link rows on save and removal of the matching row after deleting a block; no storage-schema or derivation-code change is needed. Reader opening awaits the manuscript save, then uses the existing `navigateStudyReference` path.

See [Research Editor Plan](feature%20-%20Research%20Editor%20Plan.md), the KEY-366 handoff and local report for final verification results. Final native verification passed in both languages (eight insertions, zero renderer errors), including exact reload/export/link deletion and all four reader locations. The disposable profile was deleted. Evidence is retained under `.baglib-data/KEY-366-evidence/`.

The real Arabic PDF in this matrix has the intentionally defective PUA text layer described by tests/real-files/README.md. Its exact extracted bytes remain in the quote and can appear as missing glyphs; no substitute canonical text or OCR was introduced. Final focused106/full2435/native2 passed, with full-suite compatibility repairs documented in the KEY-366 handoff.

## RE-6 scholarly apparatus investigation — 2026-11-15, Agent: Codex

Target: the pinned BlockSuite v0.27.4 footnote inline and paragraph adapters already present in BagLib. REA `analyze_javascript_application` inspected the footnote directory with the exact selected files `src/footnote-node/{footnote-config,footnote-node,footnote-popup}.ts`. Parent evidence: `ev_ddcb07e5f50fb24ffe74fd9a8be0f1784e0b145db40160d059fc600e7dc816f5`; summary: `ev_819eeafb56f42b7c02de9f25f9cd5ee13a695efe35ba3b766d5f6f408efd3feb`. Directory digest: `bf86d8dd8c245c94ebc6ef188489f5ef4aab1de0c4593a6c6ff460e714f0ae90`.

This is bounded static evidence, not observed execution: fourteen files were unselected and the analyzer reported two parse failures for TypeScript/decorator syntax. Its graph is partial. The contracts below were additionally read directly from the supplied source. Native BagLib verification is recorded separately in the KEY-367 report; REA did not execute those tests.

Verified source contracts:

- `affine/model/src/consts/doc.ts`: `FootNoteSchema` contains `label` and a `reference` with `type:'url'`, URL, title and description. Existing fields carry BagLib reference labels and source text; no schema fork or database field is needed.
- `affine/inlines/footnote/src/footnote-node/footnote-config.ts`: `FootNoteNodeConfigExtension` accepts custom node and popup renderers. `footnote-node.ts` supplies the existing hover controller, inline range and default document/URL opening. The registered element is `affine-footnote-node` (verified in `effects.ts`).
- The native hover intentionally suppresses previews during a noncollapsed text selection or block selection. Native tests must establish a collapsed text selection before claiming a hover failure.
- `affine/components/src/portal/helper.ts` mounts hover content in an open shadow root by default. Native CDP confirmed the citation hover controller was active; the initial document-level popup selector was looking outside this shadow boundary. The live harness now inspects the portal shadow root and the popup's rendered section, rather than assuming `ShadowRoot.innerText` exists.
- Native Markdown `adapters/markdown/inline-delta.ts` serializes the reference as encoded JSON into `FOOTNOTE_DEFINITION_PREFIX + label`. BagLib registers a later, scheme-specific inline matcher to replace only BagLib definitions with readable title plus canonical URL. Other reference types keep their native representation.
- `affine/shared/src/adapters/{html,markdown}/delta-converter.ts` applies all matching inline matchers in registration order. BagLib's store extensions are appended after the engine extensions. HTML receives a scheme-specific superscript link matcher.
- `affine/blocks/paragraph/src/adapters/{html,markdown}.ts` originally emits heading text without a stable ID. Numbered patch `0008-heading-export-anchors.patch` adds matching `baglib-heading-<encoded block id>` HTML IDs and explicit Markdown anchors. It is applied by the vendor rebuild script; no vendor file is edited by hand.
- Native visual review found that the default footnote portal mounted inside `std.host` could be clipped by the editor viewport and BagLib's chapter-end notes panel. Numbered patch `0009-footnote-portal-clipping.patch` mounts that portal in the same iframe's `document.body`; the existing hover controller still owns its lifetime and positioning. The native test checks that the popup's reader button is actually hit-testable above the clipping boundary.

BagLib decisions and limitations:

- `src/shared/research-editor-apparatus.ts` derives numbering, heading hierarchy and deduplicated bibliography from the current document's ordered page blocks and rich-text deltas. It excludes the canvas surface, retains original source/heading text and uses UTF-16 offsets compatible with Y.Text. Bibliographies and contents blocks store their identity, not stale generated entries.
- `research-editor/app/src/apparatus.ts` uses public store/view/slash extensions for citation insertion, generated blocks, source previews and settings. Source text remains in the existing footnote description field. It reuses RE-5's bounded real source search and awaited existing-reader navigation.
- Bibliographies cover citations in the current document/chapter. Arabic, Chicago and APA use the available title/URL metadata. Missing dates use localized undated notation for APA; unavailable authors, publishers, editions and dates are never fabricated. Full external CSL processing is outside this dependency-free implementation.
- Settings persist in the approved `manuscript.settings_json`, preserving unrelated settings keys. No database entity, column, migration, dependency or download is added; Work → Edition → Source remains unchanged.
- Heading numbers are display projections. Export works on a cloned snapshot, assigns sequential citation labels, materializes generated entries and appends HTML endnotes. Canonical snapshots and undo history retain the author's original content.
- Per-page numbering is a saved preference for RE-8's paginated PDF path. The editor currently numbers per chapter and explicitly explains the pending pagination dependency. This does not claim page-bottom footnotes or completed Paged.js support.
- Physical keyboard/IME composition remains outside native CDP coverage. The deliberately broken Arabic PDF text layer is retained verbatim.
- Readable Markdown definitions are an export representation. The native JSON-oriented Markdown importer does not yet reconstruct these readable definitions; RE-8 must handle that representation when implementing manuscript import. RE-6 does not claim Markdown round-trip import.

Only BlockSuite was investigated for this implementation; no new comparison with another application was performed. This section and the [Research Editor Plan](feature%20-%20Research%20Editor%20Plan.md) extend the existing cross-feature research rather than inventing an unrelated comparison report.
