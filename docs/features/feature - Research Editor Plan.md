# Research and book editor: build plan

- **First version:** 2026-11-14, Claude Code. Planning only. It builds on `feature - Rich Note Editor Library Research.md` (Parts 1–4, including the spike results). The user asked: "Yes, plan it".
- **Revision 2:** 2026-11-14, Claude Code. Adds an outside review the user supplied, after checking each point against the code. What changed and what was turned down is listed under "Revision 2: review outcome" at the end.
- **Revision 2.1 (gate approvals):** 2026-11-14, Claude Code. The user approved R1–R5 as written ("i approve 1-5 R decisions") and decided R6: "Keep both and link them for now with a follow up in the future before the first release to chose between keeping the board or suffice with the canvas". The user also moved the editor's entry point: "add a new tab 'Editor' in the side bar in the notes section above the 'Notes Log'". That replaces the separate "Research" nav entry (RE-2 and "Packaging and loading" updated).

## Goal

A research and book-writing editor inside BagLib with Word's depth and Notion's ease, built on AFFiNE's editor engine (BlockSuite, MIT). It covers:

- page and canvas (edgeless) views of the same document;
- kanban through database blocks;
- the BagLib sources as first-class blocks and citations: Quran, Sunnah, poetry and library books;
- footnotes at the bottom of the page, a bibliography and a table of contents;
- export to Markdown, HTML, DOCX and PDF;
- correct Arabic and English direction for each block.

Quick notes stay on the CodeMirror editor.

**It is an optional component** (the user's requirement): it can be left out at install time, and BagLib works without it.

## Decisions needed before building (gates)

**Status (2026-11-14):** R1–R5 approved by the user as written below; R6 decided as option (a) with a follow-up before the first release. Work may start.

| # | Decision | Proposal | Why it needs approval |
|---|---|---|---|
| **R1** ✅ approved 2026-11-14 | Keep a copy of BlockSuite inside BagLib | Copy `blocksuite/` from AFFiNE tag **v0.27.4** (MIT, about 18 MB and 3,135 files) into `research-editor/vendor/blocksuite`, keeping its LICENSE. Put BagLib changes in `research-editor/patches/` as numbered diffs (the first is PR #15215). Updates are manual, tag to tag. Search, lint and IDE tools ignore the vendor tree (see "Vendor guardrails"). | Major dependency and architecture change |
| **R2** ✅ approved 2026-11-14 | Separate build toolchain | `research-editor/` is its own package with its own lockfile and the bundled Yarn 4 (as in AFFiNE), outside the root `package.json`. `npm run build:research-editor` produces `research-editor/dist`. The spike build was about 27 MB; the target is 12 MB or less (see "Bundle size"). The root app gets **no** new runtime dependencies. | New build toolchain and packages (559 packages, about 86 MB download, about 316 MB installed) |
| **R3** ✅ approved 2026-11-14 | New storage | ADR-016 with three new tables (`manuscript`, `manuscript_document`, `manuscript_link`), an FTS index over manuscript text, and a folder for manuscript images and attachments. History goes through the existing `entity_version` (ADR-008), at checkpoints only. Details below | New entities and fields |
| **R4** ✅ approved 2026-11-14 | Installer component | A checkbox on the existing options page, "Install the research and book editor", with the measured size, **ticked by default**. Unticked, it is removed after copying, using the same pattern as OCR (`SkipResearchEditor` in the registry). | Installer behaviour |
| **R5** ✅ approved 2026-11-14 | Export libraries | The `docx` npm package (MIT) for DOCX and `pagedjs` (MIT) for page-bottom footnotes in PDF. Both live only inside `research-editor/`. | New dependencies (later tasks) |
| **R6** ✅ decided 2026-11-14: (a) | Study boards and the research canvas (KEY-244) | Decide **before migration 029**. Study boards already ship as JSON files through `BoardStore` (`src/main/services/boards.ts`, IPC in `src/main/ipc/boards.ts`). Options: (a) keep both, and link a board to a manuscript; (b) move boards into `manuscript_document` with `primary_mode='edgeless'` and migrate the JSON files. Proposal: **(a) for now**, because (b) means converting a shipped feature's data. Revisit after RE-7 has been used. **Decision (user, 2026-11-14):** "Keep both and link them for now with a follow up in the future before the first release to chose between keeping the board or suffice with the canvas". RE-3 keeps the schema as written (no board migration); RE-7 links a study board to a manuscript. Follow-up **KEY-376** decides before the first release whether to keep boards or rely on the canvas only. | Changes the schema in RE-3 if (b) is chosen |

## Architecture

### Packaging and loading
- **Build output:** `research-editor/dist/` holds a static Vite build: `index.html` plus assets, with fonts bundled locally and no CDN.
- **Packaging:** electron-builder `extraResources` copies `research-editor/dist` to `resources/research-editor`.
- **Serving:** the existing `app://` protocol handler serves `app://-/research-editor/*` from `resources/research-editor` (in development, from `research-editor/dist`).
- **Entry point (user, 2026-11-14):** an **"Editor"** tab in the sidebar's Notes section, directly above "Notes Log", with an ar/en label through `translations.ts`. There is no separate "Research" nav entry.
- **Same origin:** the editor runs in an **iframe** inside the Editor view. Because it shares the main renderer's origin, it calls BagLib through a small typed bridge on `window.parent.electronAPI`. It never gets its own IPC.
- **Availability:**
  - Main reports `researchEditor.available` (whether the files exist).
  - When the editor is missing, the Editor tab and every "Open in research editor" entry are hidden, and nothing else changes.
  - Manuscripts already in the database (from a backup or another install) still show in the list. Opening one shows a read-only preview built from `plain_text`, with a note that the editor is not installed.
- **Isolation:** Lit and Yjs never load in the main Next.js bundle, so the app's startup is unchanged.

### Iframe host behaviour (RE-2)
- **Shortcuts:** a focused iframe keeps keyboard events from the host. Because the iframe is same-origin, the host listens on `iframe.contentWindow` directly; no `postMessage` needed. BagLib's global shortcuts are forwarded to the host's handlers when BlockSuite did not handle them (event not `defaultPrevented`). Editor keys (undo, bold, slash menu) stay in the editor.
- **Theme, language and font scale:** the host writes `theme`, `lang`, `dir` and font scale to the iframe's `document.documentElement` before the editor mounts, and again on every change. The iframe never flashes the wrong theme or direction.
- **Images and attachments:** BlockSuite keeps pasted images and attachments in its blob storage, which defaults to IndexedDB or memory inside the iframe. That data would be missed by BagLib's backups and exports. RE-2 adds a BlockSuite blob source that reads and writes through the bridge into a `manuscript-assets/<blobId>` folder next to the database (content-addressed by BlockSuite's blob id). Exporters read images from that folder.

### Vendor guardrails (RE-1)
- Add `research-editor/vendor/**` to a new `.ignore` file (read by ripgrep and most agent search tools), to `eslint.config.mjs` `ignores`, to the TypeScript `exclude` lists, and to a new `.gitattributes` as `linguist-vendored`.
- A `check:vendor` script rebuilds `vendor/` from the pinned tag plus `patches/` and fails if the result differs from the committed tree. This catches direct edits to vendor source; changes must go into a new numbered patch. (Read-only file permissions were considered and dropped: Windows and git do not keep them reliably.)
- Rule in AGENTS.md: never edit `research-editor/vendor/` directly.

### Bundle size (RE-1)
- Production build with `build.sourcemap: false`.
- Leave out the playground, AFFiNE cloud and collaboration modules, and any presets BagLib does not mount.
- Subset bundled fonts to the Arabic and Latin ranges BagLib uses. The Quran font stays complete, because its marks are needed.
- Measure after each step and record it. Target: `dist` at 12 MB or less. The installer text in R4 shows the measured size, not an estimate.

### Storage (ADR-016, needs R3 approval)

`manuscript`: a research project or book.

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT NOT NULL | Canonical, as typed |
| `kind` | TEXT NOT NULL CHECK(kind IN ('research','book')) | |
| `settings_json` | TEXT NOT NULL DEFAULT '{}' | Citation style, page size and margins, heading numbering, footnote numbering (per page or per chapter), citation placement (Quran inline or in footnotes) |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |
| `deleted_at` | TEXT | Recoverable trash, as with knowledge |

`manuscript_document`: a part, chapter, section or canvas of a manuscript.

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Same as the BlockSuite doc id |
| `manuscript_id` | TEXT NOT NULL FK → manuscript ON DELETE CASCADE | |
| `parent_id` | TEXT FK → manuscript_document ON DELETE CASCADE | Null for top level. Allows Part → Chapter → Section |
| `title` | TEXT NOT NULL | Kept in step with the doc's title block |
| `position` | INTEGER NOT NULL | Order among siblings with the same `parent_id` |
| `snapshot` | TEXT NOT NULL | BlockSuite `DocSnapshot` JSON. The spike proved an exact round trip; a sample doc was about 1.8 KB |
| `plain_text` | TEXT NOT NULL DEFAULT '' | Derived from the snapshot on save. Feeds the FTS index and the read-only preview. Never edited directly |
| `primary_mode` | TEXT NOT NULL DEFAULT 'page' CHECK(primary_mode IN ('page','edgeless')) | |
| `updated_at` | TEXT NOT NULL | |
| `deleted_at` | TEXT | Chapter-level trash and restore |

`manuscript_link`: a derived index of what each document cites or embeds. It is rebuilt from the snapshot on every save and is never the source of truth.

| Field | Type | Notes |
|---|---|---|
| `document_id` | TEXT NOT NULL FK → manuscript_document ON DELETE CASCADE | |
| `target_scheme` | TEXT NOT NULL CHECK(target_scheme IN ('quran','sunnah','poetry','book','note')) | |
| `target_id` | TEXT NOT NULL | For example `hafs:2:255`, or a note id |
| `block_id` | TEXT NOT NULL | The BlockSuite block that holds the reference, to jump back to it |
| | | PRIMARY KEY (`document_id`, `block_id`, `target_scheme`, `target_id`); index on (`target_scheme`, `target_id`) |

`manuscript_document_fts`: an FTS5 table over `title` and `plain_text`, with Arabic normalised in the index the same way as the existing book content FTS (migration 011). Stored text is never changed.

- **Saving and history:**
  - Autosave writes `snapshot`, `plain_text` and the `manuscript_link` rows in place, in one transaction, debounced at about 1.5 seconds. Autosave does **not** write history.
  - An `entity_version` (entity_type `manuscript_document`) is written at checkpoints only: Ctrl+S, switching chapter, closing the editor, and a 10-minute timer. Each checkpoint is skipped when the content hash matches the last version.
  - This keeps version history and restore from the existing history service without a row every few seconds.
- **Not added:**
  - no column per BagLib reference (references live in `manuscript_link`);
  - no duplicated bilingual columns;
  - no link to Work → Edition → Source for now.
- **Later, separate decisions:** publishing a finished book into the library as a Work.

### BagLib blocks and inline elements (all through BlockSuite's public extension points)
- **Blocks:**
  - `baglib:ayah`: an ayah or ayah range, shown in the bundled Quran font;
  - `baglib:hadith`: text, collection and number, grade;
  - `baglib:verse`: one or more verses from a poem, stored as an ordered list of `{ sadr, ajuz }` pairs (`ajuz` may be empty), plus poet and poem. This matches `poetryBayts()` in `src/shared/poetry.ts`, so a passage inserted from the poetry reader keeps its halves;
  - `baglib:book-quote`: a quote from a library book with Work/Edition/Source and page.
- **Citations:** the existing footnote inline with `type:'url'` and a BagLib scheme (`quran:`, `sunnah:`, `poetry:`, `book:`). Clicking opens BagLib's reader. The spike showed this needs no schema fork.
- **Search:** slash items backed by BagLib's real search IPC: Quran (references, ranges, words without diacritics), Sunnah, poetry and library.
- **Exporters:** every BagLib block gets Markdown and HTML exporters, plus a readable footnote format: "البقرة ٢٥٥ — quran:hafs:2:255" instead of raw JSON.

### Export details (RE-8)
- **PDF footnotes:** Chromium's print engine has no support for page-bottom footnotes (`float: footnote`). With plain `printToPDF`, footnotes would land at the end of the document, which is wrong for Arabic books and tahqiq. RE-8 lays out the export HTML with **Paged.js** in a hidden window first, then calls `webContents.printToPDF()`. Paged.js also gives running headers and footers and page numbers.
  - **Spike first:** confirm that Paged.js handles RTL pages, Arabic shaping across page breaks, and a long footnote that continues on the next page. If it fails, fall back to footnotes at the end of each chapter and record that.
  - Per-page footnote numbering (a `settings_json` option) depends on this.
- **Poetry in DOCX:** `baglib:verse` exports as a borderless two-column table with right-to-left layout, so sadr and ajuz stay aligned in Word.
- **Quran text in DOCX and PDF:** ayah runs set the bundled Quran font (`rFonts` in `docx`). The DOCX embeds the font if the `docx` version in use supports embedding and the font's licence allows it; otherwise the export says which font to install. Check this in RE-8.

## Tasks (Jira epic KEY-361 "Research Epic 3: Research & Book Editor", label Research, linked to KEY-243)

Every task follows AGENTS.md:

- all UI strings in ar and en through `translations.ts`;
- logical CSS;
- live checks in both languages with the real files in `tests/real-files/`, on a throwaway `.baglib-data` profile;
- one commit per task.

| # | Task | Depends on | Gate | Suggested agent |
|---|---|---|---|---|
| RE-1 (KEY-362) | Copy BlockSuite v0.27.4 into `research-editor/` and set up the patch system (PR #15215 first). Vendor guardrails (`.ignore`, ESLint and TypeScript excludes, `.gitattributes`, `check:vendor`). Offline build with bundled, subset fonts and no sourcemaps; record the size at each step. A CDP `Input.insertText` test helper for Arabic typing. Build test plus an offline-mount smoke test in Electron | – | R1, R2 | Codex: large mechanical setup with build tooling |
| RE-2 (KEY-363) | Editor view: `app://-/research-editor` serving, iframe host, typed bridge, availability check. Entry point: an "Editor" tab in the sidebar's Notes section directly above "Notes Log" (ar/en label via `translations.ts`), hidden when the editor is not installed. Shortcut forwarding, theme/language/direction/font-scale sync, and the blob source that stores images in `manuscript-assets/`. ar/en | RE-1 | – | Codex: main/renderer integration |
| RE-3 (KEY-364) | ADR-016 and migration 029: `manuscript`, `manuscript_document` (with `parent_id`, `plain_text`, `deleted_at`), `manuscript_link`, the FTS table, repository, IPC, debounced autosave, checkpoint history (`entity_version`), trash and restore for manuscripts and chapters, and a manuscripts list with a chapter tree in the Editor view | – (parallel with RE-1) | R3, R6 | Codex: schema and history paths need care |
| RE-4 (KEY-365) | RTL completion: saved per-block direction override (Ctrl+Shift), `dir` in HTML export, frame titles, slash-menu position, heading collapse icon, auto-scroll. Also cursor movement through mixed text around inline citations, and column order in RTL tables and database blocks | RE-1 | – | Antigravity: visual RTL work with screenshots |
| RE-5 (KEY-366) | BagLib source blocks and slash search: ayah (ranges, real Quran IPC), hadith (Sunnah IPC with grade), poetry passage (`{ sadr, ajuz }` list), book quote. Maktabook-style insertion while typing. The save path fills `manuscript_link` from the blocks and citations. Arabic slash queries tested with the RE-1 helper | RE-2, RE-3 | – | Codex: four blocks over real IPC |
| RE-6 (KEY-367) | Citations, bibliography and table of contents: footnote citations for every BagLib scheme, readable footnote export, a bibliography block generated from the citations (Arabic convention plus Chicago/APA), a table-of-contents block, heading numbering. Settings for citation placement (Quran inline or in footnotes) and footnote numbering | RE-5 | – | Codex: citation formatting logic |
| RE-7 (KEY-368) | Canvas research board: auto-arrange by source type (Sunnah, poetry, Quran, books), kanban from database blocks, frames. Applies the R6 decision on study boards | RE-5 | R6 | Antigravity: canvas UX |
| RE-8 (KEY-369) | Export and import: Markdown, HTML, PDF (Paged.js spike, then Paged.js plus `printToPDF` with page setup, headers and footers, page numbers and page-bottom footnotes), DOCX (`docx`, with poetry tables and the Quran font), images from `manuscript-assets/`, and importing a quick note or Markdown into a manuscript | RE-6 | R5 | Codex: exporters and formats |
| RE-9 (KEY-370) | Reader to manuscript: "Send to manuscript" from the PDF/EPUB, Quran, Sunnah and poetry readers, with a manuscript and chapter picker (default: the last one used), and dragging highlights in with a link back | RE-5, RE-3 | – | Codex: cross-reader actions |
| RE-10 (KEY-371) | Optional installer component: options-page checkbox (ar/en) with the measured size, remove after copy, registry choice kept across updates. The read-only `plain_text` preview when manuscripts exist but the editor is not installed. A packaged install test with the box ticked and unticked | RE-2, RE-3 | R4 | Claude Code: installer and packaged testing (done KEY-264 to 267) |
| RE-11 (KEY-372) | Notes and manuscripts: insert or embed a quick note in a manuscript, and backlinks both ways, read from `manuscript_link` (no snapshot parsing at read time). Manuscripts show in BagLib's global search through the FTS table | RE-3, RE-5 | – | DeepSeek (free worker) for the pure link logic; Codex for the UI |
| RE-12 (KEY-373) | Research AI panel: summarise, rewrite, answer from BagLib sources with citations, using the user's own key. Context limited to the current chapter plus the sources it cites (from `manuscript_link`) | BYOK AI feature, RE-6 | Depends on the BYOK plan | Later; decide after BYOK lands |

**Order:**
1. ~~Before any work: approve R1–R3 and decide R6.~~ Done 2026-11-14: R1–R5 approved, R6 decided (a).
2. Wave 1: RE-1 and RE-3 in parallel (no shared files).
3. Wave 2: RE-2 and RE-4.
4. Wave 3: RE-5, then RE-6 and RE-10.
5. Wave 4: RE-7, RE-8, RE-9 and RE-11.
6. Last: RE-12.

## Risks
- **Unpublished, fast-moving engine.** BlockSuite isn't published to npm and changes quickly. Mitigation: pin a tag, keep changes as small numbered patches, and update deliberately.
- **Repository size.** The copied source adds about 18 MB of source plus a lockfile. A git subtree is an alternative if history matters. The vendor guardrails keep it out of searches and lint.
- **Arabic typing in automated tests.** Faked Arabic `keydown` events do not reach BlockSuite. The plan is to type through CDP `Input.insertText` (BagLib's live scripts already use `webContents.debugger`) or a `beforeinput` event. **Not yet proven:** confirm in RE-1 that this triggers the slash menu and Arabic search. Keep a short manual check on a real keyboard for IME composition, which neither method covers.
- **Paged.js and Arabic.** Page-bottom footnotes depend on Paged.js handling RTL and long footnotes. The RE-8 spike decides; the fallback is chapter-end notes.
- **Images outside backups.** Until RE-2's blob source is in place, pasted images would sit in the iframe's IndexedDB. No manuscript work should be treated as real before RE-2 lands.
- **Two canvases (KEY-244).** Decided at R6 (2026-11-14): keep both and link them; a follow-up task decides before the first release.

## Spike assets to start from (local, not committed)
- `D:\Ammar\Projects\Baglib\spike\affine-src\AFFiNE-0.27.4\blocksuite\playground\apps\baglib\`: BagLib ayah block, slash search, citation footnote and Markdown exporter.
- `D:\Ammar\Projects\Baglib\spike\runner\`: the Electron offline runner and six scenario scripts.
- `D:\Ammar\Projects\Baglib\spike\pr15215.diff`: the per-block direction patch.

## Revision 2: review outcome

Each point from the outside review was checked against the code before it was taken in.

**Taken in:**
- Vendor tree hidden from search, lint and IDE tools (RE-1). No `.ignore`, `.rgignore` or `.gitattributes` exists yet; ESLint uses flat config `ignores`.
- Sourcemaps off, fonts subset, unused modules removed, with a 12 MB target to measure against.
- History at checkpoints instead of on every autosave.
- A blob source so images live next to the database, not in IndexedDB.
- `plain_text`, `manuscript_link` and an FTS table. The first version listed "a derived reference index" as a later decision, yet RE-11 needed backlinks; this settles that.
- `parent_id` and `deleted_at` on chapters.
- Paged.js for page-bottom footnotes, now under gate R5, with a spike first.
- Poetry as `{ sadr, ajuz }` pairs. This matches the existing `poetryBayts()`.
- The Quran font in DOCX and PDF.
- Shortcut forwarding and theme sync across the iframe.
- CDP `Input.insertText` for Arabic test typing, marked as unproven until RE-1.
- The KEY-244 decision moved before the schema (new gate R6). Study boards already ship as JSON files, so this matters now.
- RE-5 now depends on RE-3; a chapter picker in RE-9; the not-installed preview in RE-10; AI context in RE-12.

**Changed from the review's proposal:**
- **Read-only vendor files** were replaced by a `check:vendor` script, because file permissions don't survive git on Windows.
- **The 8–12 MB size** is a target to measure, not a promise.
- **RE-5 does not wait for RE-4.** The blocks don't need the RTL fixes to be built, and waiting would make Wave 3 longer for nothing.
- **Shortcut forwarding** listens directly on the same-origin iframe instead of relaying messages.
- **Embedding the Quran font in DOCX** is a check in RE-8, not a promise. Support in `docx` and the font's licence both need confirming.


## RE-2 implementation evidence, KEY-363, 2026-11-14

The user decision is "add a new tab 'Editor' in the side bar in the notes section above the 'Notes Log'". The availability-gated `notes-editor` item is first in the Notes group and also appears in the command palette when available. Arabic and English labels use `translations.ts`.

Main now owns `app://` serving for the renderer and optional editor. Editor requests resolve to `research-editor/dist` during development and `resources/research-editor` in packaged mode. On the development renderer's HTTP origin, Electron intercepts the `/research-editor/` path and fetches its local files. Remaining HTTP traffic bypasses the custom handler. This preserves same-origin access without a static asset copy or a Next server route. `electron-builder.yml` copies the optional dist directory into resources. Installed file-matcher code skips an absent source with a warning.

The same-origin parent object is `window.parent.__baglibResearchEditorBridge`, backed by the parent's `electronAPI`. The iframe has no preload or IPC channel. Shared types live in `src/shared/research-editor.ts`. The host includes RE-3's manuscripts tree, one persistence controller per open chapter, serialized switches, pending-edit-safe rename, guarded trash and native close. Appearance is written before mount and on changes. Only unhandled global shortcuts leave the iframe. Images use the sole bridge-backed BlockSuite BlobSource and immutable `manuscript-assets/<blobId>/{data,type}` directories beside the database.

The native matrix covers the real BagLib UI in Arabic and English, app and development HTTP origins, exact snapshot restart/reimport, a pasted image extracted from the real Arabic scanned PDF, empty IndexedDB, undo, a global shortcut, theme/language/font-scale changes, optional-component absence and a close held beyond five seconds. Full and focused test counts and final publication evidence are in the KEY-363 handoff and local agent report. The renderer bundle scan covers 56 JavaScript module files and finds no Lit/Yjs/BlockSuite markers. REA independently observed the same-origin HTTP frames. Details and inspected source paths are in [BlockSuite findings](BlockSuite.md).

RE-10 remains responsible for the installer checkbox and absent-editor manuscript preview. The HTTP-origin smoke serves the production export, and no Next HMR or packaged installer execution is claimed by RE-2. Canonical manuscript content retains the original text supplied to the editor. The Arabic live sample decodes presentation forms with NFKC and omits undecodable Private Use Area glyphs from the copied fixture text. The original corpus files are read only.
