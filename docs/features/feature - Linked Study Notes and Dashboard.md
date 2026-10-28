# Linked study notes and dashboard

Investigated and implemented from Baglib source on 2026-10-26 (Codex). This is an implementation reference, not external reverse-engineering research.

## User experience

- Home groups active reading/Khatmah and rapid capture/prayer times in two compact columns. The companion summary is optional rather than duplicating the prayer card by default. Navigation automatically uses icons at narrow widths while retaining localized accessible names.
- Rapid capture supports a title, aliases, tags, automatic Arabic/Latin direction, safe Markdown preview, optional book attachment, and a reference picker. `/notes`, `/books`, `/quran`, and `/sunnah` scope picker searches. The global command palette supports `/notes` and `/books`; Notes has its own search field.
- An ayah inspector action starts a note with a profile-bound Quran reference. Hadith actions start notes with collection/chapter/hadith IDs. The resulting Notes screen also lists existing notes referencing that anchor.
- Notes display outgoing references and incoming backlinks. Stable note IDs keep relationships intact when titles or aliases change. Aliases are alternative search names and link display text; they do not create duplicate notes.
- `![[note:ID|Label]]` embeds up to 1,200 characters of the current saved note. Embedded content is a single-level plain-text excerpt, so cycles cannot recursively expand. Missing targets remain readable and opening them reports an unavailable source.

## Storage and boundaries

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
