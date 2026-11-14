# Linked study notes and dashboard

Investigated and implemented from Baglib source on 2026-10-26 (Codex). This is an implementation reference, not external reverse-engineering research.

## User experience

- Home groups active reading/Khatmah and rapid capture/prayer times in two compact columns. The companion summary is optional rather than duplicating the prayer card by default. Navigation automatically uses icons at narrow widths while retaining localized accessible names.
- Rapid capture supports a title, aliases, tags, automatic Arabic/Latin direction, safe Markdown preview, optional book attachment, and a reference picker. `/notes`, `/books`, `/quran`, and `/sunnah` scope picker searches. The global command palette supports `/notes` and `/books`; Notes has its own search field.
- An ayah inspector action starts a note with a profile-bound Quran reference. Hadith actions start notes with collection/chapter/hadith IDs. The resulting Notes screen also lists existing notes referencing that anchor.
- Notes display outgoing references and incoming backlinks. Stable note IDs keep relationships intact when titles or aliases change. Aliases are alternative search names and link display text; they do not create duplicate notes.
- `![[note:ID|Label]]` embeds up to 1,200 characters of the current saved note. Embedded content is a single-level plain-text excerpt, so cycles cannot recursively expand. Missing targets remain readable and opening them reports an unavailable source.

## Storage and boundaries

The following settings-backed storage description records the original implementation. ADR-008 and migration 021 superseded it with canonical knowledge-owned study notes and recoverable history. Current `StudyNotesService` reads `knowledge` / `study_note_detail`, with settings retained for legacy conversion and the service's compatibility mode. See `docs/data-dictionary.md` and `docs/ADR-008-version-history-and-recovery.md` for the approved storage contracts.

`StudyNotesService` stores personal note documents in existing SQLite `app_settings` rows named `study.note.v1:<id>`. Each document contains its ID, title, content, aliases, tags, optional work attachment and timestamps. This introduces no SQL table, column, foreign key, canonical library entity or dependency. Each save updates one key rather than replacing a shared array. General, Quran and Sunnah notes do not require fabricated library works.

Book-attached captures also use existing `knowledge.save`/`note_detail` contracts so they remain available in the book reader. The settings document supplies aliases/link metadata. The Notes view merges those documents with existing work notes by stable ID. Cross-window refreshes use `study-notes:changed`; same-renderer book-note refreshes use `baglib:notes-changed`.

Dashboard and reader-initiated drafts use separate settings keys (`dashboard.scratchpad.draft.v1` and `study.capture.draft.v1`). Opening another reference preserves an existing capture draft and adds the requested reference. Failed saves retain the editor content. Book knowledge writes and settings metadata writes are separate operations; retry uses the same note ID so a partial failure does not generate duplicate notes.

Sacred corpora remain immutable and isolated as required by [ADR-004](../ADR-004-multivolume-works-and-sacred-corpus-partitioning.md) and [ADR-005](../ADR-005-unified-mushaf-reader-and-reading-profile-isolation.md). Quran links encode `hafs` or `warsh`, surah and local ayah number; they never infer global indices. Sunnah links encode the existing collection, chapter and source hadith ID. Source lookup fails explicitly if the corresponding corpus is unavailable.

## Link and search contracts

- `[[note:ID|Label]]`, `[[book:ID|Label]]`
- `[[quran:hafs:2:255|Label]]` or a Warsh reference with its own numbering
- `[[sunnah:Bukhari:1:SOURCE_ID|Label]]`

The parser rejects invalid target types/ranges and ignores links inside code examples. React renders text safely; external Markdown references accept only HTTP(S) URLs and open through the existing external-link API. The picker searches installed Quran scripts and installed Sunnah chapters, with stale searches cancelled and results bounded to twelve. Sunnah search is scoped to the selected collection and can be slower when scanning many chapters.

Arabic search uses the existing normalizer with tashkeel/alef handling while retaining the `ة`/`ه` distinction. Canonical titles, names and scripture text are never normalized in storage.

## Athan and hydration corrections

- `AppLayout` reads companion mode through `useSyncExternalStore` with a consistent server snapshot. Both the main window and `?widget=companion` hydrate before selecting their layout.
- `useAthan` starts from a deterministic snapshot and hides live prayer content until current state is available. Countdown computation no longer depends on the clock during initial hydration.
- Only the main app window owns audio playback. Alert handling occurs outside React state updaters and deduplicates event IDs; the test action relies on the same broadcast instead of starting another player.
- Playback ends on actual audio completion, can be stopped globally and reports failures with a retry control. Cancellation never starts a synthetic fallback after stopping.
- Scheduled evaluation and countdowns use the configured prayer location's timezone. Audio can remain enabled when OS notifications are disabled.
- The built-in asset is explicitly identified as a short notification chime, not a voiced Athan recording. A local recording can be selected for a full Athan. Asset preparation runs before development/build copying so the chime is included in renderer assets.

## Verification and limits

Automated checks cover settings persistence, stable edits, backlinks, invalid/code links, mixed-script search, cancellation and single-owner audio playback, and countdown hydration. **945 full tests passed**, followed by nine focused tests after the final navigation correction; TypeScript, focused ESLint and the complete production build passed. ESLint retains the existing Next pages-directory configuration advisory.

`scripts/dashboard-live/run.mjs` exercises the actual app layout through SSR and native Electron hydration with an isolated SQLite database and controlled corpus responses. Final run `run-MpQoDd` verified Arabic/English at 480/1280 widths, dark/light note layouts, real muted audio playback, alias and command-palette search, transclusion insertion, general-note persistence, existing-book-note editing with the original CFI retained, SQLite close/reopen and companion mode. No hydration or renderer errors were observed. Screenshots/results are retained under ignored `.baglib-data/dashboard-live`; Arabic dark and English light notes were visually inspected. Sample corpus responses are controlled fixtures, not a claim of live corpus validation.

Live corpus searches and notification banners are not certified by controlled fixture responses. Physical loudspeaker output is not verified by muted audio playback. Athan requires Baglib to be running; no closed-app alarm service was added. Note transclusion is deliberately limited to note excerpts; Quran/hadith links open the canonical reader rather than embedding unverified copied scripture. Deleting a target leaves unresolved links visible rather than silently retargeting them.

Relevant implementation: `src/shared/study-notes.ts`, `src/main/services/study-notes.ts`, `src/main/ipc/study-notes.ts`, `QuickNoteScratchpad.tsx`, `NotesOverviewView.tsx`, `StudyLinkPicker.tsx`, `StudyNoteContent.tsx`, `useAthan.ts`, and `AppLayout.tsx`.

## KEY-277 external study links and card export — 2026-11-09, Codex

This is investigation of BagLib source and its running development build, not reverse engineering of an external application. Obsidian is an example link consumer; it was not installed, inspected or tested here.

- `src/shared/deep-link.ts` accepts the existing `validStudyTarget` grammar after removing `baglib:` or `baglib://` and decoding once. Input is limited to 4,096 characters; malformed escapes, control characters, foreign schemes, unknown kinds and invalid ranges are rejected. Arabic IDs survive decoding. Paragraph anchors retain the existing ASCII block-ID grammar; display labels belong to exported Markdown, not the navigation target.
- `src/main/index.ts` receives first-launch argv, real `second-instance` argv and macOS `open-url`. A bounded queue (32 targets, oldest dropped) waits for the main window's top-frame renderer to subscribe through `study:navigation-ready`. URLs are never opened externally or used as file paths. Existing file association routing excludes `baglib:` arguments.
- `protocolRegistrationArgs` implements the user's decision: packaged builds register `baglib` directly, normal unpackaged builds do not register, and explicit `BAGLIB_REGISTER_PROTOCOL=1` uses Electron's executable plus the resolved app entry point. `electron-builder.yml` declares the same scheme for installed builds.
- `StudyDeepLinkBridge` uses fresh saved data before calling `navigateStudyReference`, avoiding the initial workspace-load race. Deleted notes produce a localized alert. A book page also updates the already-mounted reader. Existing shared navigation handles Hafs/Warsh, Sunnah, poetry and lecture targets; this task adds no target kinds.
- Every Notes overview card has a native disclosure menu with localized Markdown/Word actions. They send `[note.id]` to the existing export IPCs and reuse folder/save dialogs and remembered Word layout options. Word options scroll into view when launched from a card. Buttons wrap at narrow widths and retain logical alignment, Arabic diacritics and mixed-script content.
- `exportableStudyNotes` gives both export formats the canonical content of ordinary reader notes, study notes and reading reflections already displayed in the overview, deduplicated by ID. This closes an existing omission in export selection without changing storage or schemas. Study-note aliases are preserved; canonical tags/content come from existing knowledge contracts.

Verification is recorded in the KEY-277 handoff and local report. Actual installed OS association dispatch and macOS runtime behavior require platform/build checks beyond the Windows development harness; no registry association is written by the harness. Markdown import and new reference kinds remain out of scope.

## KEY-245 open note formats — 2026-11-12, Codex

The KEY-277 Markdown-import exclusion is superseded by this implementation. Investigation covered BagLib's own serializer, knowledge repository, ADR-008, data dictionary and running Electron app. External applications were outside this investigation.

The Notes export button, single-note context action and editor Markdown action now open the shared bilingual format dialog. The chosen note IDs stay fixed while the dialog is open. The overview exports its filtered results. Each export writes a fresh folder and offers Markdown, UTF-8 CSV or standalone LaTeX. The dialog explains each format's losses. The new Markdown import action uses a native multi-file picker.

- Markdown keeps readable folder wikilinks and Dataview relationship wrappers. JSON-compatible YAML `baglib_roundtrip` metadata carries canonical body, rendered body, original tags and optional work ID. When the readable body is unchanged, import restores exact canonical text, including tashkeel, excluded-note references and trailing whitespace. Edited bodies reverse folder wikilinks, paragraph anchors, embeds, relationship wrappers and BagLib reference links. Select related exported files together so their filenames can resolve to IDs. Legacy BagLib exports remain importable, with losses from their original link/tag rewriting. Removing round-trip metadata also loses exact whitespace and excluded references.
- CSV quotes every cell, doubles embedded quotes and uses CRLF rows plus a UTF-8 BOM. Columns carry ID, title, exact content, JSON aliases/tags, work ID and dates. Markdown and reference syntax stay literal. Spreadsheet consumers must import cells as text to retain exact values and avoid formula interpretation. CSV re-import is outside this implementation.
- LaTeX escapes special characters, preserves Arabic code points and wraps Arabic script runs, combining marks and Arabic-Indic digits in `\textarabic{…}`. Titles become unnumbered sections and body lines become literal paragraphs. Markdown formatting, interactive links, tags, aliases, machine identity and dates are omitted. LaTeX layout also collapses ordinary whitespace. LaTeX re-import is outside this implementation.
- All three formats omit attachments, comments, history, board layout, review scheduling and the underlying books/corpora. Book links require existing library works. Import into an existing reader note or reflection retains its type, location and reflection fields. New IDs become study notes. Missing works remain unlinked through the existing save contract.

### LaTeX preamble

The exported `.tex` includes this preamble. Compile with XeLaTeX or LuaLaTeX in an environment already providing these packages and the Amiri font.

```tex
\documentclass{article}
\usepackage{fontspec}
\usepackage{polyglossia}
\setdefaultlanguage{english}
\setotherlanguage{arabic}
\newfontfamily\arabicfont[Script=Arabic]{Amiri}
```

### Import consistency and evidence

`src/shared/note-open-formats.ts` accepts the bounded JSON-compatible YAML subset emitted by BagLib. `baglib_id` controls upsert identity. Identical duplicate inputs collapse, conflicting duplicate IDs fail, and collisions with trashed or unrelated knowledge fail. `StudyNotesService.importMarkdown()` runs a database batch transaction through existing repository/history contracts. Unchanged imports preserve dates and revisions. A failed batch rolls back earlier changes. Main IPC bounds import to 1,000 files, 2 MB each and 20 MB total, authorizes the app's top-level frame and accepts paths solely from the native picker.

All 18 focused regression tests pass and cover exact export/import equality, Arabic marks, excluded links, legacy and edited bodies, CSV quoting, LaTeX escaping, repeated import, update/create, batch rollback and reflection preservation. The live harness `scripts/note-formats-live/` passed all 12 ar/en × 1280/480 × format cases plus filtered exports, unchanged import and edited-body updates. It imported the real Arabic and English text-layer PDFs and attached a note to the real Arabic work. Twelve PNGs and `result.json` are retained locally at `.baglib-data/note-formats-evidence-ejuC5F/`, with three representative PNGs visually inspected. The profile was removed. Original PDFs received no Save or OCR.

LaTeX compilation remains unverified. The harness checks generated syntax and exact Arabic output. OneNote and iCloud importers remain outside the authorized dependency-free scope.


## KEY-349 caret dataset search (2026-11-14, Codex)

Historical implementation: the limits, cancellation and insertion behavior in this section are superseded by KEY-350 below.

This is an implementation inspection of Baglib source, with no external reverse-engineering claim. The main notes pane and dashboard scratchpad use the shared CodeMirror editor. Typing `/` now opens six localized dataset choices at the caret: Quran, Sunnah, Al-Bayan, notes, books and lectures. English scope names and Arabic aliases work in either interface language. A recognized scope limits search; free text searches all six sources and groups up to three results per source. Scoped search shows at most eight results (the existing corpus helper supplies at most six). Titles/names stay canonical.

`src/shared/slash-command.ts` supplies parsing, aliases, grouping and selection movement (parser: DeepSeek via OpenCode, reviewed by Claude). `src/renderer/utils/slash-search.ts` applies existing conservative Arabic note matching, ranks title matches ahead of body-only matches, filters lecture/podcast/video Works into lectures and all remaining library Work types into books, and preserves Source identity through `bookStudyTarget`. Notes and Works reuse the data already loaded by existing IPC/hooks. The corpus helper `src/renderer/utils/corpus-lookup.ts` reuses Quran catalog/read/search, Sunnah indexed search and poetry search IPC. Quran text queries include installed translations from the same reading profile; numeric and Arabic-Indic references use reader lookup. The inline menu currently uses the helper's default Hafs profile; the separate picker retains its explicit Hafs/Warsh control.

`src/renderer/components/notes/slash-search-extension.ts` owns the tooltip, 240ms debounce and revision invalidation. Edits, caret moves, focus loss, Escape and destruction invalidate previous work; non-abortable corpus IPC can finish in the main process, but stale responses never update the menu. Scope selection replaces the token with `/scope ` and continues searching. Result selection replaces only the command before the caret using the picker's shared `studyLinkText` formatter. Mouse hover/click, wrapped Up/Down, Enter, Escape and deletion past `/` are supported. CodeMirror positions the tooltip at the caret, falls above it if necessary, and constrains it to the viewport. Styling uses logical start alignment, inherited Arabic/Latin fonts, generous line height and isolated result labels. Existing formatting/quote commands remain accessible by their typed prefixes (for example `/heading`, `/card`, `/hadith`, `/poem`); bare `/` prioritizes the six datasets.

No schema, entity, persisted field, dependency or download was added. Work -> Edition -> Source and isolated immutable corpora remain unchanged. Missing corpora contribute no results; other datasets remain usable. Queries are bounded to 200 characters. Runtime validation and test evidence are recorded in the KEY-349 local agent report.


## KEY-350 responsive slash search and passages (2026-11-14, Codex)

This is inspection and measurement of Baglib's own source/installed datasets, not external reverse engineering. No source from another product was investigated. Qualified Sunnah pagination continues bounded candidate batches after conservative checks; transcript paging remains available beyond100 passages. The passage helper was absent when needed; `src/shared/passage-extract.ts` and its tests were authored by Codex. The existing parser attribution remains unchanged.

### Verified cause and process boundaries

The previous popup combined `SunnahService.search` / `SunnahResearchCorpus.search` on Electron's main thread with post-response slicing. Opening the full installed 1,629,495,296-byte corpus synchronously builds chapter summaries; each search hydrated up to 201 hadiths, including ordinal counts and merged-source lookups. Direct measurements recorded a 6,678.94 ms constructor and warm search times of 410.99–621.21 ms. Production IPC measurement reproduced an 8,348.16 ms maximum main-loop gap on cold search. Quran already used `QuranReaderProcess` (utility process); poetry already used `PoetryQueryProcess` (worker thread). Neither was a main-thread whole-dataset search. Renderer note/book matching also repeatedly normalized and scanned all supplied objects.

The slash path now uses an isolated `SunnahSearchProcess`, a separate cancellable Quran reader and a separate poetry worker. `slash-search-jobs.ts` registers request IDs and terminates only the dedicated slash workers when editing, moving the caret, losing focus, Escape or unmount invalidates a request. Cancellation tombstones reject late registration; Quran checks cancellation after asynchronous initialization. Normal reader requests and typed relationship data remain independent. Sunnah accepts one in-flight request, times out after 30 seconds and releases its worker after 60 idle seconds. Killing obsolete work stops SQLite/initialization as well as suppressing the response; it does not enqueue one full search per keystroke. A later request may pay worker startup again, which trades a small result delay for cancellation and UI responsiveness.

`QuranSearchQuery`, `SunnahResearchQuery` and `PoetryQuery` carry transient search bounds/cancellation metadata, never persisted fields. Quran's existing normalized FTS applies LIMIT/OFFSET across selected source databases; Sunnah's existing base/variant FTS supplies relevance-ranked bounded candidates; poetry uses title-weighted BM25 before bounded batches and resumes via a ranked cursor. Its historical taa marbuta/haa fold is checked against canonical title/poet/verse text in bounded batches, avoiding false positives and avoiding normalization of every matching poem. Existing regular poetry keyset paging remains unchanged. No database, index, entity, schema, dependency or download is added.

### Current popup behavior

- Free queries show up to eight matches per source; scoped searches show up to twenty. Each full batch has a keyboard/mouse Show more row that requests only that source's next bounded batch. Services receive the limit instead of returning full result sets for renderer slicing. A final full batch can have a harmless last Show more request that discovers exhaustion.
- Debounce is 280 ms; text queries require three characters (numeric Quran references remain supported). Local normalized note/title data is cached by object identity. Searches keep bounded ranked buffers, yield every 32 objects and stop on invalidation. Loaded canonical records are untouched.
- Quran, Sunnah and Al-Bayan reuse `CorpusOption.quote`: complete verse/matn/matched poetry lines appear as a Markdown quote, with the exact existing study link underneath. The block starts on its own line. Note title choices insert links. Material title choices offer Insert link or Search inside.
- `slashInsertion` suppresses the automatic relationship tooltip only on slash insertion. Existing typed links, relationship editing, keyboard relation cycling and graph data remain supported.
- Scopes, Arabic aliases, wrapped arrows, Enter, Escape, hover/click, logical start alignment, viewport-aware tooltip placement, generous line height and mixed-script isolation remain shared by notes and dashboard scratchpad. New interface strings use centralized Arabic/English translations.

### Search inside the selected material

`slash-material.ts` keeps the selected material visible in the popup and searches only that selection. Indexed documents use `searchLibraryFullText` with an explicit Work ID, LIMIT and OFFSET, then `getPageContent` to extract canonical whole paragraphs/sentences rather than clipped FTS snippets. `bookStudyTarget` preserves Work/Source/page identity; existing EPUB CFI targets are preserved where provided. An unindexed PDF uses the existing PDF extraction worker once when selected; physical empty pages are retained so links are not shifted. No indexing schema or library-wide contents search is introduced.

Lectures use the existing `lectures.subtitles` API and join adjacent cues for complete sentences, linking the sentence's first cue through `lectureTarget`. Missing transcripts and image-only PDFs show the localized no-searchable-text message. There is no OCR or automatic transcription. Other document formats use their existing content index. Text extraction failures currently use the same unavailable-text message.

`extractPassages(text, query, {limit,maxLength})` preserves exact source offsets and original spelling/diacritics, uses conservative Arabic matching and returns whole short paragraphs or whole matching sentences from long paragraphs. `maxLength` is a preference for sentence selection, not permission to clip a sentence. Very long sentences can therefore exceed it.

### Verification and limitations

The production Electron harness `scripts/slash-search-live/` uses a throwaway profile, copies of the real Arabic/English text PDFs and MP4s plus the real scanned Arabic PDF, all 15 installed Quran sources, the full 1,609,805,824-byte poetry database and the full Sunnah database. A small generated subtitle sidecar supplements the real Arabic video; no claim is made that its transcript came from the audio. Both UI languages pass corpus quote/link insertion, no relationship popup, 8/20 limits, scoped corpus and local Show more, selected-material indexed passages, real PDF text-layer fallback, transcript and absent-transcript cases, scanned no-text behavior, narrow bounds, fast typing/deleting/retyping and scratchpad insertion. Original hashes are unchanged, the profile is removed and no other app was closed. No screen-reader speech or all possible malformed/very large documents were tested.

Final production timings use a 1 ms main heartbeat (Windows scheduling has roughly 16 ms granularity): Quran maximum main gap 16.25 → 16.30 ms, Sunnah 8,348.16 → 16.42 ms, poetry 16.42 → 16.46 ms. These are main-loop gaps, not search wall time: corresponding after wall times are 332.00, 1,439.21 and 286.20 ms. During rapid edits the worst main gap is 18.09 ms and worst renderer gap 76.10 ms, with zero renderer errors. Focused/service tests, final suite totals and publication details are in `docs/agent-ops/reports/KEY-350.md`; raw timing JSON, logs and screenshots are local under `.baglib-data/KEY-350-evidence/`.
