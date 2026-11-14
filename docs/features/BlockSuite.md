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
