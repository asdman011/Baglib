# PDF and Notes Experience Plan

### Replacement and source recovery — 2026-11-08, Codex

The native replacement timeout was initially a fixture-readiness problem: only the rotated stage existed, and replacement had not been submitted. The fixture now waits for an enabled form/Apply and exact field values, traces native start requests and captures staged PDF inspection on failure. Successful replacement then reached an obsolete expectation of accumulating restore points; ADR012 explicitly uses one emergency copy for full-file writes too. Verification now checks that copy's count/hash and invokes actual backend emergency recovery.

Recovery exposed a real issue: the workstation retained a staged URL after the canonical file was restored. Source-change handling now clears staged output/preview state and opens the canonical source afresh; stale/unmounted replies are ignored/closed and new sessions tracked for teardown. Native arMpaY1w/engT3sM8 pass rotated staged preview, PAGE1→EDIT1 replacement, unchanged original before Save, explicit Save, exactly one previous-hash emergency copy, backend restore and original text/portrait/hash in the viewer. This is not recovery-button UI or arbitrary Arabic PDF editing certification.

Final1415/1415tests, tsc and lint0errors/16existingwarnings pass. No devserver, schema/dependency/download/Git/Jira/user-library changes. User requested finishing this batch and ending automatic goal work; other backlog remains documented rather than claimed complete.

### Real organizer file outputs — 2026-11-08, Codex

Native `ivqORs` runs real IPC/engine jobs in ar/en, saves copies and inspects their actual pages: Apply gives original page2 rotated90°, page1 and a blank; Extract gives page2; Split gives page2 then page1; grouped Split gives two files with2+1pages in edited order, including blank. Original file hashes remain unchanged for every operation. This found a real adapter bug: Split ignored the supplied organizer plan and group size. It now organizes that plan first and uses existing range-splitting machinery; non-plan split requests are unchanged. Empty plans and invalid group sizes reject explicitly.

Verification:1415/1415 full suite, tsc;12targeted regression tests including invalid split requests and scopedlint0errors/0warnings. The first grouped output attempt exceeded the fixture's10sec poll budget; bounded output-mode polling now allows60sec, successful terminal run retained. Separate native UI mutation OQnoAU passed rotated staged preview but timed out at replacement text rendering; its Save/restore assertions were not reached. File outputs here are IPC-driven, not a claim of complete Apply/extract/split button/save-dialog UX or functioning find/replace. No user files/downloads/schema changes/Git/Jira actions; no devserver started/3000free.

### Organizer draft navigation — 2026-11-08, Codex

The editor was conditionally mounted only in organize mode, discarding order/merges/selection/history when previewing a page. It now mounts lazily on first organizer use and remains mounted for that session while hidden (`display:none`, `aria-hidden`) in other modes. This does not eagerly create all page cards during ordinary reading. Changed session/page-count keys still isolate changed sources. Busy merge append rejects rather than silently dropping the imported pages.

Final1415/1415 tests, tsc, lint0errors/16existingwarnings and diff-check pass. Native lpKYtm verifies RTL/LTR merged4pages→reading→organizer(still4) and undo2/redo4 after returning. Earlier fixture clicked Merge before ready; readiness/enabled waits added before passing. No server started/3000free. Drafts are not persisted across closing the book/app; no actual Apply/extract/split file outputs certified here. Those remain separate verification work. No schema/dependency/Git/Jira changes.

### Unified organizer controls — 2026-11-08, Codex

The sidebar and central organizer owned independent page plans. When the central editor is active, duplicate sidebar selection/rotation/deletion/grid/apply controls are now omitted. Odd/even selection and extract-selected remain available centrally; merge and advanced transforms remain in the sidebar. Merged source pages append to the central plan as an undoable action; split-by-count obtains that same current plan. A session-checked handle prevents appending into a different document. Standalone tool fallback remains. Failed source inspection now uses the existing localized error instead of a silent no-op.

Verified1415/1415 tests, finaltsc, scopedlint0errors/34existingwarnings and diff-check. NativeF01Y7V checks reordered selection and real source merge/undo/redo in RTL/LTR; duplicate apply is absent and Arabic screenshot inspected. Initial fixture undo targeted the file-level button rather than editor undo, corrected before passing run. File outputs for Apply/extract/split, narrow-screen layout and preserving a draft across view/tool navigation were not certified here. Those remain next work, not a claim that every PDF tool is complete. No new schema/dependency or Git/Jira actions.

### Page organizer selection — 2026-11-08, Codex

`PdfPageEditor` range selection previously matched displayed positions OR original page numbers, so a moved page could make a single-number selection include two cards. Selection now follows displayed positions only, including inserted blanks and pages merged from other sessions. Arabic/Persian digits, Arabic separators, Arabic all/odd/even aliases and common range dashes are accepted. The range field/apply button have localized accessible names; hover help explains displayed order. No canonical content or PDF save policy changed.

Verified1415/1415 tests, tsc and scopedlint0errors/0warnings. Native standalone-workstation Uxac6C checks RTL/LTR with reordered two-page fixture/input١; screenshot inspected. Unit tests cover blank/merged positions and unchanged plan input. No actual file save or live merged/blank selection was exercised here. The fixture's missing ui-motion.css, app alias and screenshot timing were repaired before final successful run. Inspector and central organizer still duplicate controls; broader requested tools/UI improvements remain pending.

### Reader save reliability checkpoint — 2026-11-07, Codex

**Follow-up correction:** diagnostic gpNTdm showed the test opened a different seeded book, because it matched the recent-book sidebar title instead of the fixture card. Corrected heading/card selection; no viewer code changed. Full native UD27MP now passes same-book reopen, all save modes, persistent undo/redo, one emergency copy, Cancel/discard preservation, clean/selective exports retaining foreign annotations without changing the working PDF, ar/en controls and final Save5marks. Arabic export screenshot inspected; zero renderer errors. This supersedes the incomplete-live-flow limitation below. Harness lint/diff-check pass; earlier1408tests/type/build results were not rerun for this harness-only change.

New highlights and explicit notes now use the existing atomic canonical knowledge save once, instead of creating a second annotation and an independent quote note. Correct quotedText/contextNote payloads preserve selected content; failures keep drafts. Existing records remain untouched. Undo ordering is deterministic for same-time actions and redo invalidation is scoped to the current material. No schema or dependency changes.

Verified: 1408/1408 tests, tsc/main build, lint with no errors (59 existing reader warnings). Native disposable profile save-live-58VTJm passes Manual/CtrlS, one hash-verified previous-file emergency copy, automatic after-change save, undo twice, redo after restart, one-minute interval, Cancel and Close without writing. Same-session reopen then shows a blank canvas; export/Arabic stages were not reached, so the complete flow is not certified. Investigate document reopen next. See ADR-012 for evidence and limits.

Date: 2026-11-05. Agent: Claude Code. Status: **approved by the user "as recommended" on 2026-11-05 (D1 to D7).** Wave 8 slice implemented; see "Progress" at the end.

User's request: bring most of Adobe Acrobat Pro's PDF experience into BagLib, tailored to BagLib, and build the most natural note-taking experience by learning from Obsidian, Maktabook, Zotero, Logseq, OneNote, NotebookLM and Figma, for BagLib's notes, spaced repetition (SRS), PDF notes and annotations, and comments.

Research behind this plan (verified findings are separated from hypotheses in each file):

- [Adobe Acrobat Pro](Adobe%20Acrobat%20Pro.md) — REA on the installed copy: 46 tool manifests, themes, plug-ins, the shipped web UI strings.
- [OneNote](OneNote.md) — REA on the installed language DLL.
- [Obsidian](Obsidian.md), [Zotero](Zotero.md), [Logseq](Logseq.md), [NotebookLM](NotebookLM.md), [Figma](Figma.md), [Maktabook](Maktabook.md) — public documentation only. Obsidian's install folder is empty and the others are not installed; nothing was downloaded.

## 1. What BagLib already has (checked in the code)

| Area | Present today | Where |
|---|---|---|
| PDF viewing and workstation | PDF.js reader; workstation modes view, organize, edit, redact, convert, security, sign, OCR; 60+ Stirling-PDF tools in the Hub; safe save with backup; versions; text, Office and HTML export | `FullPageBookReader`, `PdfWorkstationPanel`, `PdfWorkstationTools`, `StirlingToolsHub`, `services/pdf-editor/*` |
| Study annotations | highlight, underline, note, bookmark, ink in BagLib's own database; the file is never touched | `annotations` (migration 010), `AnnotationsDrawer`, `HighlightActionPopover`, `InkCanvasOverlay` |
| PDF review comments | sticky, callout and ink comments with replies and status open, resolved, accepted, rejected; author and page filters; written into a working copy on request | `PdfReviewPanel`, `services/pdf-editor/reviews.ts` |
| Cited PDF AI | summary, chapters, takeaways, arguments, actions, Q&A with exact page-quote checks | `cited-answer.ts` |
| Notes | plain text with light Markdown rendering; `[[target|label]]` and `![[…]]` for `note:`, `book:`, `quran:`, `sunnah:`, `poetry:`, `media:`; aliases, tags, backlinks; history, trash and comments | `study-notes.ts`, `StudyNoteContent`, `NotesOverviewView`, `NoteHistory`, migration 021 |
| Split reading | reader with a note pane beside it | `SplitPaneReader`, `canvas/NoteEditorPane` |
| SRS | FSRS (ts-fsrs 5.3.1), review panel, decks, Anki export, cards from notes, highlights, quotes, ayahs, hadith, poetry | `srs.ts`, `SrsReviewPanel`, `card-decks.ts`, migration 018 |
| Comments | `comment` table with `parent_comment_id` (threads possible) | migration 001; UI is a flat list in `NoteHistory` |
| Personal commentary | on ayahs and hadith | `PersonalCommentary` |

## 2. Main gaps

1. **PDF layout.** Tools are panels inside one drawer, not Acrobat's model of a tool that owns a contextual bar above the page. No left navigation rail with thumbnails, outline, annotations and search together; no quick bar on text selection with colours; no keep-tool-selected; no compact versus expanded markup bar.
2. **Two annotation worlds.** Study annotations and PDF review comments are separate lists with different filters. Study annotations lack strike-out, text box, shapes and area (image) selection.
3. **Comments.** No comment mode, no pins, no resolve on note or ayah comments, no filter by status, colour, type or date.
4. **Writing notes.** A textarea. No autocomplete when typing `[[`, no search-and-insert for ayahs or hadith, no slash commands, no hover preview, no heading or block anchors, no link to a PDF page or annotation, no rename that rewrites links, no unlinked mentions.
5. **Notes from reading.** No drag of an annotation into a note, no "notes from all annotations", no per-paragraph location capture beside the reader (OneNote Linked Notes).
6. **SRS where you read.** Cards need a separate step. No cloze, no "review only this book or tag", no showing the card's source page during review.
7. **AI scope.** The PDF AI answers about one document; it cannot be scoped to chosen books, ayahs, hadith and the user's own notes, and an answer cannot be saved to a note with live citations.

## 3. Target layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Title · Home · Tools · tabs                       search  ⌘K   theme  lang │
├────┬──────────────────────────────────────────────────────────────┬───────┤
│rail│  Contextual tool bar (only the active tool's commands)        │ right │
│ ▣  │  e.g. Comment: Note Highlight Underline Strike Replace │ ⋯ │ 🔒 │🎨│ pane  │
│ ☰  ├──────────────────────────────────────────────────────────────┤       │
│ ✎  │                                                              │ Notes │
│ 🔍 │                    page view                                 │ Comm. │
│ 📎 │     selection → quick bar: colours · note · card · ask · copy│ AI    │
│    │     comment pins on the page                                 │ Cards │
│    │                                                              │ ──    │
│    │                                                              │ icons │
└────┴──────────────────────────────────────────────────────────────┴───────┘
```

- **Left rail** (inline-start, so it moves to the right in Arabic): Thumbnails, Outline (bookmarks and the PDF table of contents), Annotations (study and review in one list), Search, Attachments. One panel open at a time, resizable, collapsible.
- **Tools home**: a grid of tools grouped by task, as in Acrobat's "Common Tools": Read and study, Comment, Edit, Organize pages, Scan and OCR, Convert and export, Protect and redact, Compare, Forms and sign, Accessibility. Each opens as a mode.
- **Contextual tool bar**: one row under the title bar; compact by default, "more" expands drawing tools; the last used drawing tool stays visible; a lock button keeps the tool armed; `Esc` returns to selection.
- **Right pane**: tabs Notes, Comments, AI, Cards; collapses to an icon strip like Acrobat's `appSwitcherOnly`.
- **Selection quick bar**: five colours, Underline, Note, Make card, Ask AI, Copy with reference, Look up. One click acts (Zotero's unlocked mode).
- Applies to PDFs first, then reuses the same rail, bar and right pane in the EPUB, Quran, Sunnah and poetry readers where the actions make sense.

## 4. Feature list by wave

Priorities: P1 now, P2 next, P3 later. Each wave is usable on its own.

### Wave 8 — PDF shell in Acrobat's shape (P1, no schema change)

| # | Feature | Learned from | Notes |
|---|---|---|---|
| 8.1 | Left navigation rail with Thumbnails, Outline, Annotations, Search, Attachments | Acrobat viewer | Reuses `PdfPageThumbnail`, `ZenTocDrawer`, `InBookSearchDrawer`, `AnnotationsDrawer` |
| 8.2 | Tools home grid grouped by task, with one-line help per tool | Acrobat AppCenter and "Common Tools" | Lists existing workstation and Hub tools only; unavailable tools show why |
| 8.3 | Tool modes with a contextual bar; compact and expanded; keep tool selected; `Esc` | Acrobat `TopBar` layouts | Wraps the existing workstation operations |
| 8.4 | Right pane with tabs and an icon-strip collapsed state | Acrobat RHP | Notes, Comments, AI, Cards |
| 8.5 | Selection quick bar | Zotero, Acrobat | Replaces the scattered popovers for PDFs |
| 8.6 | Keyboard map: `C` comment, `H` highlight, `U` underline, `N` note, `Ctrl+F` find, `Ctrl+Shift+F` search the library, `Ctrl+K` command palette | Acrobat, Figma, Obsidian | Shown in a help sheet in both languages |
| 8.7 | Theme tokens for the reader chrome with states (normal, hover, active, checked, disabled) | Acrobat `.acrotheme` | Matches the existing light and dark themes |

### Wave 9 — One annotation and comment system (P1)

| # | Feature | Learned from | Notes |
|---|---|---|---|
| 9.1 | Study annotation types: add strike-out, text box, rectangle, oval, arrow, area (image) capture | Acrobat Comment tool, Zotero image annotations | `annotations.type` is free text, so no migration; shapes reuse `stroke_data` |
| 9.2 | One Annotations list for study annotations and PDF review comments, labelled by layer | Zotero sidebar, Acrobat comment list | Study layer stays in the database; review layer stays bound to the file |
| 9.3 | Filters and sort: date (today, 7 days, range), type, colour, tag, status, checkmark, hide resolved, page | Acrobat `annotsfilter` strings | Arabic search uses existing normalisation |
| 9.4 | Comment mode `C`: click anywhere on a page, ayah, hadith or note paragraph to start a thread; pins show on the page | Figma, Acrobat | |
| 9.5 | Threads with reply, edit, resolve and reopen, and a checkmark for "done reviewing" | Figma, Acrobat | **Needs decision D3** for note and ayah comments |
| 9.6 | Write study annotations into an exported PDF copy (never the original) | Zotero export, existing review embedding | Reuses the working-copy path |

### Wave 10 — Writing notes naturally (P1)

| # | Feature | Learned from | Notes |
|---|---|---|---|
| 10.1 | Live-preview editor: Markdown hidden except on the line being edited, RTL and LTR per paragraph, Arabic diacritics not clipped | Obsidian | **Needs decision D1** |
| 10.2 | Type `[[` to search notes, books, ayahs, hadith, poetry and lectures together; select text then `[[` to link it | Obsidian, Maktabook | Uses existing local search |
| 10.3 | Slash commands: `/ayah`, `/hadith`, `/verse`, `/page`, `/card`, `/question`, `/callout`, `/date` that insert the text with its reference | Maktabook, Logseq | |
| 10.4 | Ayah ranges `quran:hafs:2:255-257` and whole surah | Maktabook | Extends `validStudyTarget`; no schema |
| 10.5 | New link targets: a PDF page `book:<id>#p=12`, an annotation `annot:<id>`, a note heading `note:<id>#heading`, a note paragraph `note:<id>#^anchor` | Obsidian block links, Zotero "Show on Page" | Parser change only; **decision D4** on syntax |
| 10.6 | Hover preview of any link; click opens beside, Ctrl-click opens in place | Obsidian | |
| 10.7 | Honorific expansion (for example ﷺ, رضي الله عنه) from short typed triggers, user-editable, off by default | Maktabook | Strings in `translations.ts`; user list in app_settings |
| 10.8 | Linked notes beside the reader: each new paragraph quietly records the page, ayah, hadith or lecture second; a small marker jumps back | OneNote Linked Notes | Stored as the link from 10.5 at the paragraph end, so no schema |
| 10.9 | Drag an annotation or selected text into a note: inserts the quote, colour and a back-link | Zotero | |
| 10.10 | "Note from annotations" for a book, chapter or filter, with a user template | Zotero templates | |
| 10.11 | Rename updates links; unlinked mentions under backlinks | Obsidian | |
| 10.12 | Command palette and quick switcher (`Ctrl+K`, `Ctrl+O`) | Obsidian | |
| 10.13 | Note tags as quick toggles (question, important, to review, definition) with a summary view | OneNote tags | Reuses tags and question status |
| 10.14 | Export a note or notebook as Markdown, and as PDF through the existing WeasyPrint path | Maktabook | DOCX later |

### Wave 11 — SRS where you read and write (P1–P2)

| # | Feature | Learned from | Notes |
|---|---|---|---|
| 11.1 | "Make card" in the selection quick bar, on any annotation, and on any note paragraph; front prefilled, back is the selection or the next line | Logseq `#card` | Existing `card_detail` |
| 11.2 | Cloze cards: `{{c1::…}}` inside the text, one card per cloze number, compatible with the existing Anki export | Logseq, Anki | Stored in `front`/`back`; **decision D5** |
| 11.3 | Scoped review: this book, deck, tag, surah or collection | Logseq `{{cards …}}` | Filter on the existing queue |
| 11.4 | Review with context: show the source page, ayah or hadith beside the answer, with "open source" | Zotero "Show on Page" | |
| 11.5 | Due-card badge in the right pane while reading that book | — | |

### Wave 12 — Grounded study assistant (P2, AI stays opt-in)

| # | Feature | Learned from | Notes |
|---|---|---|---|
| 12.1 | Source checklist: ask across chosen books, ayahs, hadith and the user's own notes | NotebookLM Sources | Same quote checks and remote-consent rule as today |
| 12.2 | Save answer to note, citations kept as live study links and editable | NotebookLM "Save to note" | |
| 12.3 | Study prompts: study guide, practice questions, key terms, organise my notes | Acrobat's student prompts | |
| 12.4 | Draft flashcards from a source; each card shown for approval before it enters the queue | NotebookLM flashcards | Nothing is added silently |

### Wave 13 — Remaining Acrobat tools worth having (P2–P3)

| # | Feature | Notes |
|---|---|---|
| 13.1 | Compare two editions: side by side and overlay with previous and next difference | Useful for two printings of the same book; check existing workstation compare first |
| 13.2 | Custom stamps, including study stamps such as "checked", "to revise", and grading stamps | KEY-271 uses ten bilingual vector stamps with embedded shaped text and no image assets |
| 13.3 | Scan and OCR "review suspects": step through low-confidence words | Acrobat `ShowCaptureSuspects`; reuses OCR confidence |
| 13.4 | Accessibility check and reading order view | Depends on what the open engine supports; the proprietary Stirling module stays excluded |
| 13.5 | Read aloud and reflow for the PDF view | Reuses existing TTS and text layer |
| 13.6 | Saved tool sequences shown as "actions" | KEY-271 settings-backed action sequences invoke existing tools in one staged job from the Tools home |
| 13.7 | Measure (distance, area) | P3, low value for study |

Left out on purpose: e-signature requests, bulk send, payments, web forms, rich media, JavaScript, print production, cloud storage, generated images.

## 5. Decisions that need the user's approval

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Note editor | (a) keep the textarea and add a preview overlay; (b) add **CodeMirror 6** (`@codemirror/*`, MIT; download size not yet checked and will be stated before any download); (c) a rich-text editor such as TipTap | (b): Markdown stays the stored format, good RTL and bidi handling, autocomplete and decorations built in. **New dependency and a download: needs approval.** |
| D2 | Annotation types | (a) extend `annotations.type` with new values (no migration); (b) a separate shape table | (a) |
| D3 | Comment resolve and anchors | (a) migration 023: add `comment.resolved_at` and `comment.anchor_json` (page, rect, paragraph), with an ADR; (b) keep resolve only in history events, no schema | (a); it keeps filtering simple. **Schema change: needs approval and ADR-010.** |
| D4 | Link syntax for pages, annotations, headings and paragraphs | `book:<id>#p=12`, `annot:<id>`, `note:<id>#Heading`, `note:<id>#^anchor`, `quran:hafs:2:255-257` | As listed; parser change only, existing links keep working |
| D5 | Cloze syntax | Anki-style `{{c1::text::hint}}` | Anki style, so export keeps working |
| D6 | Where the new shell applies first | PDF only, or PDF plus EPUB | PDF first, then the other readers |
| D7 | Jira | New epic or the existing reader and notes epics; labels must already exist | Decide after approval; no Jira writes until then |

## 6. Testing approach for each wave

- Unit tests for parsers (links, cloze, honorifics), filters and any migration.
- Live checks on a throwaway profile (`BAGLIB_DATA_DIR` plus `--user-data-dir`) in Arabic RTL and English LTR at 480 and 1280 widths, with mixed Arabic and Latin notes and diacritics.
- Arabic search checks with and without tashkeel.
- Never the user's real library or original files.

## 7. Open questions and limits of the research

- Acrobat was not launched, so its live layout, shortcuts and pane sizes are hypotheses from manifests and public material. A short observed session needs the user's permission.
- Obsidian, Zotero and Logseq were not inspected as binaries; installing them would be a download and needs approval with the size stated.
- Maktabook was read from its landing page only.
- Workstation compare was not examined in depth; 13.1 starts with that check.

## Progress

### 2026-11-07, Codex — save startup, shutdown and Manual Only safety

The prior save-service missing-table/closed-connection errors are resolved for core PDF/save IPC: recovery starts after migrations, a task gate drains admitted work before SQLite closes, and app-Quit first allows the existing reader Cancel/Save choice. Maintenance timers and cached services are stopped/reset. No schema/storage-policy changes were made.

The expanded native check uncovered an unintended Manual Only write on reader reopen while the policy read was pending. `useMaterialSave` now gates auto-writes on known policy, rejects obsolete policy replies and cancels queued writes on mode/book changes.

Final1406/1406 tests, tsc/build:main and lint pass (4 existing warnings). Compare-live-90szyi proves delayed admitted settings writes finish before shutdown and late IPC is busy; no save startup/shutdown errors remain in final logs. Save-live-MYaqV0 uses explicit page notes to verify real Ctrl+S, en Quit-Cancel, ar Quit-Save, foreign-annotation preservation and one hash-verified prior-save emergency copy. Owned server stopped,3000free. No real library/Git/Jira changes.

Separate open finding: the original full save/undo fixture fails its old mark-count assumption because highlighting also inserts a separate legacy quote note. Its later undo/restart assertions were not reached. Preserve those records; review duplicate creation and action grouping next rather than claiming the entire save feature is certified. Non-PDF before-quit hooks still require a separate Cancel-safety review.

### 2026-11-07, Codex — PDF comparison attribution and keyboard reliability

- Source review found that selecting a new edition/options while a compare request was pending could display old results under the newly selected title. The renderer now immediately invalidates results on edition/options/work changes and ignores outdated/unmounted responses. Physical requests are deduplicated until completion; no cancellation capability is invented and backend comparison/text normalization is unchanged.
- Comparison uses shared modal focus/return. N/P/F3 are limited to the focused comparison, exclude editable controls and modifiers, and Shift+F3 moves backward. Difference scrolling is scoped to this dialog.
- Controlled Arabic/English delayed-response regressions cover selection, options, work changes, duplicate requests, modified/background/input keys and unmount. Actual compare-live-PoD4FI generates two disposable PDFs using the already installed local tool, finds three differences/four including tashkeel, verifies previous/next/page2,40 forward/reverse Tabs and opener return in ar/en. Neither source file is changed. Cleanup verifies temporary paths before recursive deletion.
- Final combined suite1402/1402, tsc/lint and diff-check pass. Owned dev server stopped,3000free. No schema/dependency/commit/push/Jira changes.
- Separate pending evidence: the save service logs missing app_settings before initialization and a closed-DB status query after successful app shutdown. These are startup/shutdown lifecycle errors, not proof of comparison failure or corruption; investigate next under the user’s library/PDF priority, preserving the other agent’s save work.

### 2026-11-05, Claude Code — approval and Wave 8 slice

- Approval: the user approved the plan with the recommended answers. ADR-010 (`docs/ADR-010-comment-threads-resolve-and-anchors.md`) records D3; migration 023 waits for Wave 9. D1 (CodeMirror 6) is approved in principle; the download still needs the user to confirm the stated size (22 packages, about 4.5 MB unpacked per npm registry metadata). Nothing was downloaded.
- Correction after reading the workstation code: much of Wave 8 already existed. `PdfWorkstationPanel` already has a four-zone layout (activity rail with view, organize and security modes, a library panel with thumbnails, bookmarks and comments tabs, a tools panel with a grouped directory, a bottom page bar), a tools hub with pipelines, and the selection menu already offers five colours, note, quote, question, knowledge card, dictionary, AI, read aloud and copy citation. A "keep highlighter on" mode existed in code (`isInstantHighlightMode`) but nothing could turn it on, and it did not work for PDFs.
- Added:
  - `ReaderMarkupBar` in the PDF workstation header: highlight colour, a lock that keeps the highlighter on (Acrobat's keep-tool-selected, Zotero's locked mode), and a shortcuts button. Below the md width only the current colour shows.
  - Keep-highlighter-on for PDFs: with the lock on, a text selection is saved at once in the chosen colour and the selection menu does not open.
  - Single-key shortcuts in the PDF workstation (`readerShortcut`, `src/renderer/libs/reader/reader-shortcuts.ts`): `H` lock, `1`–`5` colour (Arabic-Indic digits too), `Esc` stops the lock, `?` opens `ReaderShortcutSheet`. Ignored while typing in a field, an editable area or a dialog, and with Ctrl, Cmd or Alt.
  - The save toast said "bookmark added" for every saved item; it now names highlights and other knowledge correctly.
  - 20 new strings per language in `translations.ts`.
- Not changed: schema, dependencies, the selection menu, the tools directory.
- Verified: full npm test 1302/1302; `tests/reader/reader-shortcuts.test.ts` 5/5; tsc; eslint on new files; live `scripts/pdf-markup-live` (real built main, dev renderer, throwaway BAGLIB_DATA_DIR and --user-data-dir, generated Arabic and English PDF) passed in ar and en: colour keys, no save without the lock, one save with the lock in the chosen colour, correct toast, typing does not toggle, Esc turns it off, the sheet lists 7 rows. Screenshots at 1280 and 480 inspected.
- Limits: at 480 px the existing header still clips its last buttons (it did before this change) and the tools panel covers the page; the bar is not shown for EPUB or the Quran and Sunnah readers yet; remaining Wave 8 items (Acrobat-style tool modes with contextual bars, annotations tab in the left panel, expanded drawing tools) are not done.

### 2026-11-05, Claude Code — D1: CodeMirror note editor (Wave 10.1 and 10.2, first slice)

- User approved the download ("Yes, download it"). Installed with exact versions: `@codemirror/state` 6.7.6, `view` 6.43.15, `commands` 6.11.1, `language` 6.13.1, `lang-markdown` 6.5.2, `autocomplete` 6.20.4, plus `@lezer/highlight` 1.2.5 listed directly (already pulled in, nothing extra downloaded). 22 packages added to the lock file, all MIT, as stated before the download.
- `StudyNoteEditor` (`src/renderer/components/notes/StudyNoteEditor.tsx`) replaces the textarea in `QuickNoteScratchpad`, which is the dashboard note box and the Notes editor:
  - Markdown highlighting (headings, bold, italic, quotes, code, links); text stays plain Markdown, so storage is unchanged.
  - Each line gets `dir="auto"` and CodeMirror's per-line direction, so Arabic and English paragraphs mix, and Home, End and arrows move the way the line reads. A first version used CSS only and the live check caught Home selecting the wrong way on English lines.
  - Line height 2 so tashkeel is not clipped (checked live).
  - `[[` suggests notes (title or alias, diacritics ignored), books, and an ayah from `2:255` or `٢:٢٥٥` (`studyLinkOptions` in `src/shared/study-link-completion.ts`); Enter inserts a valid `[[target|label]]`; `![[` keeps the embed.
  - Ctrl+B and Ctrl+I wrap the selection, Ctrl+S saves; the existing toolbar buttons insert through the editor.
  - Without a real DOM (unit tests on linkedom) it falls back to the old textarea.
  - Save reads the editor's latest text directly, so a change made just before Save is never lost.
- Live scripts `dashboard-live` and `poetry-live` set note text through the editor's `value` property now.
- Verified: npm test 1307/1307 (5 new completion tests); tsc; eslint on changed files; main build; git diff --check. Live `scripts/note-editor-live` (real built main, dev renderer, throwaway profile) passed in ar and en: note, ayah and book suggestions and inserted links, Ctrl+B, per-line direction, unclipped tashkeel, Ctrl+S save and clear; screenshots at 1280 and 480 inspected.
- Limits and findings: `scripts/dashboard-live` fails at its book-note edit check, and fails the same way with the old textarea forced back on, so this predates today: the renderer sends the new text but the fixture's database keeps the old note. Not investigated further. `poetry-live` was updated but not run (needs installed poetry data). Link lines show their raw target, so a link-only line reads left to right. Still to do from Wave 10: hidden-syntax live preview, slash commands, ayah ranges, page and annotation links, hover preview, rename that updates links, honorifics, linked notes beside the reader.

### 2026-11-05, Claude Code — Wave 9 first slice: comment threads (9.5)

- Migration 023 (ADR-010): `comment.resolved_at`, `comment.anchor_json`, partial index `idx_comment_open`. Down migration drops them. Data dictionary and DBML updated.
- `CommentThreadService` (`src/main/services/comment-threads.ts`): list threads, open counts, add (root with an optional validated anchor, or reply), edit, resolve and reopen (through any comment in the thread, applied to the root), delete (root deletes its replies). A reply reopens a resolved thread. Every write goes through the item's version history. Shared types, anchor validation and thread building in `src/shared/comment-threads.ts`. IPC actions `comments`, `comment` (now with `parentId` and `anchor`), `comment-counts`, `comment-edit`, `comment-resolve`, `comment-remove`.
- `CommentThreads` (`src/renderer/components/notes/CommentThreads.tsx`) replaces the flat comment list in `NoteHistory`, so notes, saved cards and ayah and hadith commentary all get threads: reply, resolve, reopen, edit, delete with confirmation, Open / Resolved / All filter, open count, page or paragraph label when an anchor is set, resolved threads dimmed. Notes list: an open-comment badge per note and an "Only notes with open comments" filter. 21 new strings per language; the unused `waveComment` string removed.
- Verified: npm test 1311/1311 (4 new: migration up and down, threads with history restore, input rejection, anchor validation and grouping); tsc; eslint on changed files; main build. Live `scripts/comments-live` (real built main, dev renderer, throwaway profile) passed in ar and en: new thread, reply, open badges in the thread and the list, resolve hides it and clears the list badge, Resolved filter shows it, reopen, list filter, exactly 4 history versions, delete; no console errors. Screenshots at 1280 and 480 inspected.
- Not yet in Wave 9: comment mode `C` with pins on PDF pages, ayahs and paragraphs (anchors are stored but nothing creates them from the UI yet), one Annotations list for study and PDF review layers, the full filter set (date, type, colour), new study annotation types, writing study annotations into an exported PDF.

### 2026-11-05, Claude Code — Wave 10 second slice: ranges, page links, slash commands, link preview

- D4 link format, parser only, no schema: ayah ranges `quran:hafs:2:255-257` (`parseQuranTarget`) and book pages `book:<id>#p=12` (`parseBookTarget`) in `src/shared/study-notes.ts`. Existing links keep working; a page link counts as a backlink of its book; the planner's surah scope handles ranges. Book ids can no longer contain `#` (none do; ids are generated).
- Navigation: a range opens its first ayah; a page link opens the book at that page (`consumePendingPage` in `study-navigation.ts`, read once by the reader in place of the last saved position).
- `[[` suggestions: `2:255-257` and `٢:٢٥٥–٢٥٧` give a range; `title#12` or `title #١٢` gives a page of matching books.
- Slash commands (`src/shared/note-slash-commands.ts`): `/` at a line start or after a space offers link (opens the `[[` suggestions), heading, quote, list, today's date (Gregorian and Hijri, in the interface language), and honorifics ﷺ, عز وجل, سبحانه وتعالى, رضي الله عنه, رضي الله عنها, رحمه الله. Matching uses English and Arabic keywords in either language, ignoring diacritics and hamza forms. This covers plan item 10.7 without automatic expansion while typing, so nothing changes text unasked.
- Link preview: on lines without the cursor, `[[target|label]]` shows only its label, styled as a link; the raw text returns when the cursor enters the line. Lines with no letters (such as `2:255-257`) keep the note's direction instead of falling back to left-to-right.
- Verified: npm test 1318/1318 (7 new); tsc; eslint; live `scripts/note-editor-live` passed in ar and en (`.baglib-data/note-editor-live-N8nSyt`): range and page suggestions, slash honorific and date (showed 25 Jumada al-Ula 1448), link labels on other lines, per-line direction, and the page link from the Notes view opened the PDF on page 3. Screenshots inspected.
- Limits: the Hijri date uses no user adjustment (the athan settings' adjustment is not read); ﷺ renders small in the app font; a theme rule for dark mode had to be dropped (CodeMirror rejects `&dark` outside base themes), so links use one emerald colour in both themes. Still to do in Wave 10: hover preview, heading and paragraph links, rename that updates links, linked notes beside the reader, drag an annotation into a note, notes from annotations, command palette, note tags, export.

### 2026-11-05, Claude Code — Wave 10 third slice: note from annotations (10.10)

- `annotationsToNote` (`src/shared/annotation-note.ts`) and a button in the annotations panel: builds a Markdown note from the annotations currently shown (after the panel's tab, colour, page and search filters), in page order: each quote as a `>` block, the user's own note text, and a `[[book:<id>#p=N|Title (N)]]` link back to the page. Text the reader stores on its own ("Highlight on Page N", "Selected Quote: …") and ink are left out. Opens in the Notes editor for review before saving; nothing is saved automatically.
- Verified: unit test (exact output and valid links), translation key test, tsc. Not yet verified live; hover preview (10.6) was not started because the user sent the spec below.

## Spec v2 mapping (user's pasted design, 2026-11-05)

The user pasted a longer design for a unified note-taking engine. This section maps each part onto what exists and what the approved plan already covers, and lists what would need new approval. Nothing below is approved by this mapping.

| Spec item | Status in BagLib | Needs |
|---|---|---|
| Per-paragraph Arabic/English direction | Done (editor, Wave 10) | — |
| Honorifics ﷺ, رضي الله عنه … | Done as `/` commands; no auto-expansion while typing | Decision S1: add auto-expansion of `(ص)`, `PBUH`, `SWT` (off by default) |
| `[[` search across notes, books, ayahs | Done for notes, books, ayahs, ranges, pages | Add Sunnah, poetry, lectures to the same list (no schema) |
| `/quran`, `/hadith`, `/poem`, `/book` inserting the text with a citation | Not done; data exists locally | No schema; fits Wave 10 |
| Hover peek preview | Not done (10.6) | No schema |
| PDF highlight to note with page link | Done: note from annotations, page links open the PDF at the page | Drag-and-drop single highlight (10.9) and flash on arrival: no schema |
| Timestamped lecture notes, snapshot to note | Exists (Wave 6, `media:` links) | Auto-stamp each new line while playing: no schema |
| Dashboard quick note | Exists | Global `Ctrl+Shift+N`: no schema |
| SRS with FSRS, Anki export, `#card` | FSRS, decks, Anki export exist; cards from notes exist | Cloze and `#card` in note text (Wave 11): no schema |
| Open questions registry | Exists (`question_detail.status` open, answered, dismissed, migration 021) | "Investigating" status needs a migration (decision S2) |
| Comment threads | Done (Wave 9, migration 023) | — |
| Callouts `> [!ayah]` etc., footnotes `[^1]`, hierarchical tags, tables, code | Markdown is stored; rendering of these is not done | No schema; tables with sort and CSV export are larger |
| Block references and transclusion `((id))`, `![[Note#^block]]` | Note embeds exist; block level not done | Recommended: `^anchor` in the note text (D4, no schema). The spec's `knowledge_blocks` table would be new schema (decision S3) |
| Typed relations (supports, refutes, explains …) | Not present | New table or link syntax (decision S4) |
| Knowledge graph | Not present | Rendering library or hand-written SVG; large (decision S5) |
| Infinite canvas, mind, concept and argument maps, flowcharts | Not present; earlier waves left the canvas phase unapproved | New storage and a dependency (decision S6). Note: tldraw's licence is not open source; Excalidraw is MIT |
| Markdown mirror of every note on disk, LaTeX and CSV | Not present | One-way Markdown export first (10.14). A two-way live mirror risks edit conflicts (decision S7). LaTeX/KaTeX is a dependency |
| Word and LaTeX manuscript export | PDF export path exists (WeasyPrint) | DOCX needs a dependency (decision S8) |
| NotebookLM-style source basket | Wave 12 | — |
| Importers: OneNote, iCloud Notes, course sites (Coursera, البناء المنهجي) | Coursera progress exists (Wave 6) | Needs sample exports from the user; site scraping needs terms checked (decision S9) |
| Companion note pane that stays open while switching Quran, Sunnah, poetry, PDF, lectures | Split reader exists for books only | Layout change across views (decision S10) |

Conflicts with the approved architecture: the spec names new tables (`knowledge_notes`, `knowledge_blocks`, `knowledge_links`, `knowledge_questions`, `srs_cards`). BagLib already stores these as `knowledge` with `study_note_detail`, `question_detail`, `card_detail`, `srs_state` and `comment` under Work → Edition → Source. The recommendation is to keep those and add only what a decision above approves. The spec's `.baglib-data/notes-vault/` path is the developer data folder; a user vault would live under the user's data directory or a folder the user picks.

### 2026-11-05, Claude Code — Wave 10 fourth slice: corpus in notes, hover preview, callouts and footnotes

- User approved the no-schema next steps from the spec v2 mapping ("Yes, do those next").
- `searchCorpus` and `previewStudyTarget` (`src/renderer/utils/corpus-lookup.ts`) read the installed Quran (`2:255`, `2:255-257` or words), Sunnah and poetry through existing APIs; missing data gives no results, not errors.
- Editor:
  - `[[` now also lists Quran, Sunnah and poetry results from three letters on. They come from a second completion source, so local suggestions (notes, books, typed `2:255`) appear at once and stay on top. A first version mixed both in one source and Enter sometimes inserted a new line while results were arriving; the live check caught it.
  - `/quran`, `/hadith`, `/poem` (Arabic keywords too) open the same search limited to that source and insert the text itself as a quote with its link: `> ﴿…﴾` plus `[[quran:hafs:2:255|2:255]]`, or the hadith matn plus its link.
- Rendered notes: hovering or focusing a link shows a card with the ayah text, hadith matn and grade, poem lines, note text or book author and page (`StudyNoteContent`). Callout headers `> [!ayah] Title` (ayah, hadith, poem, question, note, warning, summary, tip) and footnotes `[^1]` / `[^1]: text` render.
- Note from annotations: the page link now ends the quote's last line and the user's comment is its own paragraph, so Markdown no longer folds them into the quote.
- Verified: npm test 1319/1319; tsc; eslint (one existing `<img>` warning); main build. Live `scripts/note-editor-live` passed in ar and en (`.baglib-data/note-editor-live-bL8uZH`) on a disposable copy of the installed Quran packs (removed afterwards; originals only read) and the read-only Sunnah corpus: `/quran 2:255` inserted the full ayah, `/hadith` found Bukhari 1 for إنما الأعمال بالنيات, `[[` word search, hover card with the ayah text, callout and footnotes in preview, note from two annotations, page link to page 3, no uncaught errors. Screenshots inspected.
- Not checked live: poetry (no installed poetry data in any profile).
- Finding outside this work: the Quran search index drops the small alif (ٰ), so words typed with a full alif, such as العالمين, do not match ٱلۡعَٰلَمِينَ. This affects every Quran search in BagLib. Fixing it means changing how the index is normalised and rebuilding it.
- Still to do from the no-schema list: dragging one highlight into a note, flashing the highlight on arrival, timestamp per line while a lecture plays, `Ctrl+Shift+N` quick note, cloze and `#card`, Sunnah and poetry in the plain `[[` local list for typed references.

### 2026-11-05, Claude Code — Wave 10 fifth slice: quick note shortcut and cards from note lines

- `Ctrl+Shift+N` anywhere (registered beside `Ctrl+K` in `WorkspaceContext`) opens a new note in Notes with the cursor in the editor. The editor focuses once it becomes editable, since a new note is disabled while its saved draft loads.
- `/card` (also بطاقة, مراجعة, cloze, srs) turns the line it is typed on into review cards (`cardsFromLine`, `src/shared/note-cards.ts`): `{{c1::answer}}` or `{{c1::answer::hint}}` gives one card per number (front with `[…]` or the hint, back with the answer in bold, other blanks shown); `question :: answer`; or a line ending in ? or ؟ with the answer on the next line. Cards go through the existing `knowledgeCards.save` and are queued for FSRS review, linked to the note when it is already saved. The line gets a `#card` tag at once. A line in no card format shows a short explanation instead. Messages use the language's plural forms.
- Not done: a timestamp on every line while a lecture plays. Lecture notes open in Notes rather than beside the player, so this waits for the companion pane (decision S10).
- Verified: npm test 1327/1327; tsc; eslint; main build; live `scripts/note-cards-live` in ar and en (`.baglib-data/note-cards-live-W2c4AD` and a rerun after the plural fix): the shortcut opens a focused editor, a two-blank cloze gives two cards with the right fronts, `question :: answer` gives one, a plain line explains the formats, tags land on the right lines.
- Bugs found and fixed while testing: the tag was first added after the save finished and could land on the next line; a `\b` in a regex had been turned into a control character by an edit script. Behaviour noted: End on a mixed Arabic/English line goes to the visual end of the line (CodeMirror's bidi handling), not always the logical end.

### 2026-11-05 — Decision S5 (user)

- Knowledge graph layout: **d3-force**, chosen by the user for scalability and the long term. npm registry metadata: `d3-force` 3.0.1 with `d3-dispatch` 3.0.2, `d3-quadtree` 3.0.2 and `d3-timer` 3.0.2, 4 packages, about 117 KB unpacked, ISC licence. Not installed yet; the download waits for the user's confirmation of this size. Drawing (SVG, RTL labels, colours per kind, relation labels from S4) stays BagLib's own code.

## Decisions S1 to S10 — answered by the user on 2026-11-05

| ID | Decision |
|---|---|
| S1 | Honorifics expand automatically while typing (`(ص)`, `PBUH`, `SWT`, `(رض)` …), **on by default**, with a setting to turn it off. The `/` menu stays. |
| S2 | Add an **Investigating** status to open questions (open → investigating → answered, plus dismissed). Approved schema change: migration 024 widening the `question_detail.status` check, with the usual pre-migration backup; ADR to be written. |
| S3 | Paragraph links, as the user specified: `[[` and `/notes` also list matching paragraphs from saved notes (title and body, `matchesStudyQuery`), below note-title matches. Picking one inserts `[[note:<id>#^<anchor>|<first words>]]`; a missing anchor (`^a1b2c3`) is appended to that paragraph in the target note through the existing save path with `expectedRevision` and history, never changing the paragraph text. Anchors are hidden in the rendered view, faint in the editor, and skipped by the cursor. Clicking opens the note scrolled to and briefly highlighting the paragraph; hover and `![[…]]` show only that paragraph; a missing anchor falls back to the whole note. `validStudyTarget` and `studyLinks` accept `note:<id>#^<anchor>` (anchor `[A-Za-z0-9-]{1,64}`). No database change. Unit tests for parsing, anchor generation and paragraph search; live check in ar and en. |
| S4 | Typed relationships (supports, refutes, explains, answers …) are written **inside the link text**; no database change. |
| S5 | Knowledge graph with **d3-force** (ISC licence; 4 packages, about 117 KB unpacked). Two views: **Local** — a small button on the note being read or edited, greyed out when the note has no links, showing only the dots around it; **Global** — opened from the local view's popup, the whole library for seeing clusters, off by default. Download needs the user's go-ahead with the stated size. |
| S6 | Canvas: BagLib's **own simple board** (cards, sticky notes, labelled arrows, pan and zoom, mind-map and argument-map presets), boards stored as JSON. No dependency. Storage location to be confirmed in the design (JSON file per board in the user data folder, not `baglib.db`). |
| S7 | **One-way Markdown export** of notes to a folder the user picks, with front matter; BagLib's database stays the source of truth. |
| S8 | Word export with the **docx** library (MIT). Measured size: `docx` 9.15.2 is about 20.5 MB unpacked and also brings its own `@types/node` 26 (about 2.6 MB) and `nanoid` 6; about 23 MB in total. Download needs the user's go-ahead with this size. |
| S9 | Importers first for **OneNote** and **iCloud Notes** exports. Needs sample exports from the user to build against. Course-site importers not now. |
| S10 | **Companion note pane in all views** (PDF/EPUB, Quran, Sunnah, poetry, lectures), staying on the same note across views; enables per-line lecture timestamps. |

### 2026-11-05, Claude Code — poetry in notes, and the two editor bugs (follow-up)

- Correction: earlier entries said there was no installed poetry data. That was wrong. Al-Bayan is installed at `%APPDATA%\baglib\partitions\bayan_poetry.sqlite` (1.6 GB), where `openPoetryPartition` looks; the earlier check looked for a `poetry` folder. The throwaway test profiles simply had no copy, so poems never appeared there.
- Poetry in notes: `/poem` (شعر) and `[[` search use the same poetry search as the Bayan reader. Its results come in storage order, so poems that quote a phrase came before the poem itself; note search now asks for 30, puts poems whose title matches first, and shows 6. «قفا نبك» now lists Imru' al-Qays's poem first.
- Bug "Enter added a new line instead of the link": fixed earlier today by splitting local and corpus suggestions into two sources (local ones appear at once and stay first). Kept, and covered by the live check.
- Bug "comment and link in quote style" (note from highlights): fixed earlier today; the link ends the quote line and the comment is its own paragraph. Kept, and covered by the live check.
- New defensive fix in the editor: `StudyNoteEditor` no longer applies a `value` it emitted itself when React passes it back a render late, which could undo a keystroke typed in between. External text (a loaded draft, Clear) still replaces the document.
- Test harness findings: an intermittent "lost Enter" in the live check was the harness, not the app (Chromium queues `sendInputEvent` keys while `insertText` applies at once, so typed text could overtake a key press; caught with a key-event probe on the 8th repeat). The harness now waits before typing, and retries hover moves. Each run copied the 1.6 GB poetry partition and never deleted it, filling 35 GB; those copies were removed and the script now deletes its copy on exit.
- Verified: npm test 1327/1327; tsc; eslint; live `scripts/note-editor-live` passed three times in a row in ar and en on copies of the installed Quran packs and poetry partition (originals only read; copies deleted) plus the read-only Sunnah corpus: `/poem قفا نبك` inserts the verses with poet and link, `[[قفا نبك` lists poems, poem hover shows verses and meter, and the Enter and quote-style checks pass.

- 2026-11-05: S5 and S8 dependencies installed after the user's go-ahead: `d3-force` 3.0.1 (ISC, about 180 KB with its three helpers) and `docx` 9.15.2 (MIT, 23 MB on disk), plus dev-only `@types/d3-force` 3.0.10.

### 2026-11-05, Claude Code — S3 paragraph links

- As the user specified. `src/shared/note-paragraphs.ts`: paragraphs are runs of non-blank lines (fenced code kept whole); an anchor is ` ^id` at the end of a paragraph's last line (`[A-Za-z0-9-]{1,64}`); `anchorParagraph` appends one without changing the text; `paragraphOptions` searches paragraph text with `matchesStudyQuery`; `parseNoteTarget` and `validStudyTarget` accept `note:<id>#^<anchor>`; a paragraph link counts as a backlink of its note. Note headings and `/card` text ignore anchors.
- Editor: `[[words` (and `/notes`, `/link`, `/فقرة`) lists matching paragraphs of other saved notes below note-title matches, labelled with their first eight words and the note title. Picking one inserts `[[note:<id>#^<anchor>|first words]]`; a paragraph without an anchor gets a new unique one saved into its note through `studyNotes.save` with `expectedRevision` (one history version; a concurrent edit is refused and a message says the link will open the whole note). Anchors in the editor are faint and atomic (the cursor steps over them, Backspace removes one whole). `/card` puts `#card` before an anchor.
- Reading: anchors are hidden; each anchored paragraph is wrapped so a link scrolls it into view and highlights it for about two seconds; hover cards and `![[note:x#^a]]` embeds show only that paragraph; a missing anchor opens the whole note with nothing highlighted.
- Fixed while testing: a highlight stayed on permanently when another navigation started (the cleanup cancelled its timer but left the class); **the reported "Enter added a new line instead of the link" was still possible**: CodeMirror ignores Enter for 75 ms after the list changes, so a press that coincided with late Quran, Sunnah or poetry results fell through to a new line. `interactionDelay` is now 0 (local matches appear at once and stay on top, so Enter takes the highlighted item).
- Housekeeping: each live run's throwaway profile holds about 630 MB because the app installs its bundled Quran packs into a new profile; 81 test folders from today were trimmed to their screenshots and results (D: back to 50 GB free) and the five live scripts now trim their profile on exit. Harness fixes: wait before typing (queued keys versus immediate text), retry the `Ctrl+Shift+N` press.
- Verified: npm test 1333/1333 (6 new); tsc; eslint (one existing `<img>` warning); main build. Live `scripts/note-paragraphs-live` passed three times in a row in ar and en; `scripts/note-editor-live` passed twice with Quran, Sunnah and poetry copies (deleted); `scripts/note-cards-live` passed twice.

### 2026-11-05, Claude Code — S1 honorifics and S2 Investigating status

- S1: `src/shared/honorifics.ts` expands `(ص)` → ﷺ, `(ج)` → ﷻ, `(رض)` / `(رضها)` / `(رضهم)` → رضي الله عنه / عنها / عنهم, `(رح)` → رحمه الله as soon as the bracket closes, and `PBUH` / `SAW` → ﷺ, `SWT` → سبحانه وتعالى when followed by a space or punctuation and only as whole upper-case words. In the editor the typed character goes in first and the expansion is a separate undo step, so one Ctrl+Z gives back exactly what was typed. On by default; a ﷺ toggle in the note toolbar turns it off, saved in app_settings `notes.honorifics.autoExpand.v1` and kept across restarts.
- S2: ADR-011 and migration 024 add `investigating` to `question_detail.status` (table rebuilt with the same columns, data and unique index; down migration maps investigating back to open). The questions list in Notes shows a status label and offers Start investigating, Mark answered, Reopen and Dismiss as fits each status. Data dictionary and DBML updated.
- Verified: npm test 1335/1335 (2 new: migration up and down with data, index and foreign key; honorific rules); tsc; eslint; main build. Live `scripts/honorifics-questions-live` passed twice in ar and en: expansions while typing, one-step undo, toggle off leaves triggers as typed and survives a reload, a captured question goes Open → Investigating → Answered in the UI and in storage. Screenshots inspected; the toggle glyph was enlarged after the first look.

### 2026-11-05, Claude Code — S10 companion note pane

- `CompanionNotePane` (`src/renderer/components/notes/CompanionNotePane.tsx`), mounted by `AppLayout` for the book reader, Quran, Sunnah, Al-Bayan and Lectures. Open with the edge tab or `Ctrl+Shift+M`; it stays open, on the same note, as you move between those views (open state, chosen note and stamp choice in localStorage `baglib.companion.v1`; its draft in app_settings `companion.draft.v1`, apart from the dashboard draft). It hosts the normal note editor, so search, slash commands, cards, honorifics and saving all work there; after a save it keeps editing that note with its fresh revision.
- Each view tells the pane where you are (`useCompanionContext(view, getter)` in `src/renderer/utils/companion-context.ts`): the book page (`book:<id>#p=N`), the selected ayah, the hadith on screen, the open poem and verses, the lecture moment. Getters are read at the moment of use, and keyed by view so a view that is leaving can never answer for the one on screen (an early version keyed by registration order inserted a stale lecture link in Sunnah; the live check caught it).
- Buttons: **Insert selection** quotes the text selected in the view with a link back to its place; **Link to here** inserts a link to the current place; inserted text never glues to the previous word. In Lectures, **Start each new line with the lecture time** (on by default) makes Enter open each new line with a link at the current playback time.
- The book reader is a full-window layer, so there the pane sits fixed at the end edge above it and the reader narrows by the pane's width (a CSS variable); the edge tab is fixed so it is reachable over the reader. An early run showed the pane hidden behind the reader; the live check now asserts the pane is the element at its own centre.
- Also: my Wave 8 instant-highlight effect now saves on the next tick (lint: no synchronous state updates in an effect).
- Verified: npm test 1335/1335; tsc; eslint (one existing `<img>` warning); main build. Live `scripts/companion-live` passed three times in ar and en (PDF reader, Lectures with a generated silent WAV, Sunnah from the profile's bundled corpus): pane visible over the reader, selection quoted with its page link, same note across views, lecture lines stamped 0:12, link to the hadith on screen, save and second save, close and reopen on the saved note, 800 px width. `scripts/pdf-markup-live` rerun after the reader change: passed. Screenshots inspected.
- Not checked live: Quran (an ayah has to be selected in the mushaf) and Al-Bayan contexts; both are covered by the same registry. At 800 px the pane takes 45% of the width.

### 2026-11-05, Claude Code — S5 knowledge graph

- `buildKnowledgeGraph`, `localGraph` and `connectionCount` (`src/shared/knowledge-graph.ts`): every note, everything its links point to (books, ayahs and ranges, hadith, poems, lectures, other notes) and its tags. Book pages fold into their book, note paragraphs into their note, lecture moments into their lecture, so the graph shows how sources connect rather than every page. A book node takes its library title; a note keeps its own title.
- `KnowledgeGraphButton` (`src/renderer/components/notes/KnowledgeGraph.tsx`), as the user asked: a small button on each note card in Notes and in the editor toolbar when editing a saved note, greyed out when the note has no links, tags or backlinks. It opens the **local** view (the note and its neighbours); the popup's **Whole library** option, off by default, shows the global graph for seeing clusters. Layout by d3-force, computed once and drawn still; colours by kind with a legend; wheel to zoom, drag to pan; labels hide on very large graphs except on hover; clicking a dot opens that note, book, ayah, hadith, poem or lecture moment; a text list of the direct links serves keyboards and screen readers.
- Verified: npm test 1338/1338 (3 new); tsc; eslint; main build. Live `scripts/graph-live` passed in ar and en: greyed button for an unlinked note, local view with exactly the expected 5 dots and 4 direct links (opened in under 60 ms), whole library adds unlinked notes and other books, clicking a dot opens that note, the editor's button turns on. Screenshots at 1280 and 800 inspected.
- Not yet: typed relationships inside link text (S4) are not drawn as labelled edges, since no syntax for them exists yet.

### 2026-11-05, Claude Code — S7 one-way Markdown export

- `exportNotesAsMarkdown` (`src/shared/markdown-export.ts`): each note becomes a `.md` file with YAML front matter (`baglib_id`, `title`, `aliases`, `tags` with spaces joined by `_`, `book` when the note belongs to a book, `created`, `updated`). Links between exported notes become Obsidian wikilinks to the other file (`[[Gratitude|label]]`), paragraph links keep the block syntax (`[[file#^p1|label]]`, and the ` ^p1` anchor stays on the paragraph), embeds stay embeds. A link to a note left out of the export keeps only its words. Links to books, ayahs, hadith, poems and lectures become `[label](<baglib:target>)`, so the reference survives; BagLib does not yet open `baglib:` links from outside (the protocol is registered, but no deep-link routing exists), so clicking one in Obsidian only brings BagLib forward at most.
- File names: unsafe characters removed (Windows, macOS, Linux and Obsidian link characters `# ^ [ ] |`), at most 80 characters cut on whole characters, reserved Windows names avoided, repeated titles numbered case-insensitively (`Gratitude`, `Gratitude (2)`).
- Writing never overwrites: the files go into a new folder `BagLib notes YYYY-MM-DD` (then ` (2)`, ` (3)`) inside the folder the user picks, created with exclusive flags. BagLib's database stays the source of truth; nothing is read back.
- UI: an **Export Markdown (N)** button in the Notes header exports the notes shown now, all of them or the current search or filter result; a status line names the folder. IPC `study-notes:export-markdown` accepts only the app's own top-level page.
- Verified: npm test 1343/1343 (5 new); tsc; eslint; main build. Live `scripts/export-live` (folder picker answered by the script inside a throwaway profile) passed in ar and en: three files with the expected names, front matter, wikilink to the renamed duplicate, paragraph link, `baglib:` links for the ayah and book page; a search narrowed the export to one file; each export used a new folder; no horizontal scroll at 420 px. Screenshots inspected; the Arabic button label was reordered so the count does not sit between Arabic and Latin words.
- Not yet: exporting a single note from its card, Markdown re-import, and opening `baglib:` links from other apps (deep-link routing).

### 2026-11-05, Claude Code — S6 simple boards

- Storage, as decided: one JSON file per board in `<user data>/boards/<id>.json`, not in `baglib.db`, so no schema change and no dependency. Saves are written to a temporary file and renamed over, carry a revision (a stale save from another window is refused with `board-conflict` and the window reloads the board), and deleting moves the file to `boards/deleted/` so it can be recovered by hand. `validateBoardInput` (`src/shared/boards.ts`) checks every save: ids, colours, sizes, coordinates, arrows that point at existing boxes, and card links that are valid study targets. IPC `boards:list|get|save|remove` accepts only the app's own top-level page.
- UI (`src/renderer/components/notes/BoardsWorkspace.tsx`), opened from a **Boards** button in the Notes header: a list of boards, and three ways to start one: blank, **mind map** (a main idea with four branches) and **argument map** (a claim, a reason that supports it and an objection that opposes it, joined by labelled arrows). The starting words come from the user's language when the board is made. On the board: cards and sticky notes with free text (each box's text takes its own direction), six colours, drag by the top strip, resize from the corner, labelled arrows (Arrow, then the start box, then the end box; the label is edited in the selection bar), a card for a note chosen from a list or for any pasted `[[link]]` (ayah, hadith, book page, poem, lecture moment) with an Open button that goes there, pan by dragging the background, wheel zoom around the pointer, a fit button, and double-click for a sticky note. Keyboard: Delete removes the selection, arrow keys nudge a box (Shift for bigger steps), Escape cancels arrow drawing or closes. Changes save half a second after the last edit, with a status line.
- Board space is physical (x grows to the right) in both languages; the toolbar and list follow the interface direction. New boxes from the toolbar go to the nearest free spot near the middle of the view instead of covering a box.
- Verified: npm test 1348/1348 (5 new); tsc; eslint; main build. Live `scripts/boards-live` passed in ar and en: the mind map is saved to its own file with five boxes and four arrows in that language; rename, sticky note with typed text, a real mouse drag (moved exactly 120 by -140 px), an arrow drawn and labelled, a note card, all saved to disk at revision 2; reopened from the list as saved; the card's Open button goes to the note; the argument map's arrow labels are in that language; deleting moved its file to `boards/deleted`; no horizontal scroll at 1280 or 420 px. Screenshots inspected; this found and fixed a board that did not centre its content on opening, see-through boxes in dark mode, and an Arabic placeholder shown left to right.
- Not yet: multi-select, undo, snapping, auto-layout, curved arrows, export of a board as an image, and turning a board into a note.

### 2026-11-05, Claude Code — S4 typed relationships inside link text

- Syntax, as decided (inside the link text, no database change): `[[supports::note:abc|label]]`, for any study target (`[[explains::quran:hafs:2:153|…]]`, `![[example::note:x|…]]`). Seven known relationships: supports, refutes, explains, answers, example, contrasts, questions. Arabic names are accepted as well (يؤيد, يدعم, يرد, ينقض, يشرح, يفسر, يجيب, مثال, يخالف, يسأل), matched like note search (case, tashkeel and hamza forms ignored), and map to the same key. Any other single word is kept as written, so a reader can coin a relationship (`[[شاهد::book:…]]`). A relationship of more than one word is not read as one, and an invalid target is still not a link. `studyLinks` returns `relation`; everything that uses `target` is unchanged.
- Editor: after `[[`, typing the start of a relationship name (`[[sup`, `[[يؤ`) offers it in the interface language below matching notes; choosing it writes `[[supports::` and the search goes on for the target; whatever target is chosen (note, book, ayah, paragraph, hadith or poem from the corpus) keeps the relationship. With an empty `[[`, the relationships are listed last. On lines without the cursor the relationship shows as a small green chip before the link label.
- Read view: the same chip before the link. Knowledge graph: a typed link is drawn as a green arrow from the note to what it supports, refutes, explains … with the relationship's name at its middle (hidden on very large graphs except around the hovered dot); the text list shows it, and on the target's own map the line reads "(supports this note)". When two notes link both ways, one line is drawn, named by the first typed relationship found.
- Markdown export (S7) writes a relationship as a Dataview inline field around the link: `[supports:: [[file|label]]]`.
- Fixes found on the way: paragraph search after `[[` matched hidden link text (a relationship name or target); it now matches what the reader sees. In the graph, d3's centring force dragged every dot onto the pinned centre note, so small maps were unreadable; it is replaced by a gentle pull to the middle, and small graphs keep at least a 560 × 380 view.
- Verified: npm test 1354/1354 (6 new); tsc; eslint (one existing `<img>` warning); main build. Live `scripts/relations-live` passed in ar and en, typing in the real editor: `[[يؤ` / `[[sup` offered يؤيد / supports, choosing it and then the note wrote `[[supports::note:claim-note|الصبر واجب]]`, the chip showed in the editor and in Notes, the graph drew the named arrow, and the claim's own map listed it as incoming. Reran `scripts/graph-live`, `scripts/note-paragraphs-live` and `scripts/export-live`: passed. `scripts/note-editor-live` was not rerun: it needs a disposable Quran copy that this profile does not have. Screenshots inspected.
- Not yet: relationship filters in the graph.

### 2026-11-05, Claude Code — relationship menu for written links (S4)

- With the cursor on a link, or just after one (so it appears right after a link is chosen), a small bar above the link lists the relationships in the interface language, the current one marked, plus "none". A click rewrites the link (`withLinkRelation` in `src/shared/study-notes.ts`), keeping its target, paragraph anchor, label and embed mark. Ctrl+Alt+R (Cmd+Alt+R) steps through none → supports → … → questions from the keyboard. The bar hides while suggestions are open, and uses the app's surface and ink colours so it reads in both themes.
- Verified: unit test for setting, changing and removing a relationship; live `scripts/relations-live` (extended) in ar and en: the menu lists 8 choices with the current one pressed, a click changed supports to refutes, Ctrl+Alt+R changed refutes to explains. Screenshots inspected; the first run showed CodeMirror's light tooltip in dark mode, fixed.

### 2026-11-05, Claude Code — S8 Word export

- `notesToDocx` (`src/main/services/notes-docx.ts`, `docx` 9.15.2 as approved): the notes shown in Notes become one `.docx` at a path the user picks (save dialog; default name «ملاحظات بغلب YYYY-MM-DD.docx» / "BagLib notes YYYY-MM-DD.docx"). A title and date, then per note: its title as Heading 1 with a bookmark, a grey line with book, tags, other names and last update, and the body. Markdown headings, bullets, quotes (italic), fenced code (Consolas), bold, italic and inline code are kept; paragraph anchors and link targets are not printed. Links to another exported note are internal hyperlinks to its bookmark; other links keep their label in green; a typed relationship is printed before the link as `[يؤيد]` / `[supports]`.
- Direction: a paragraph is right to left when its first shown letter is Arabic. In a right-to-left paragraph only Latin words and Western digits are left-to-right runs, so spaces stay where they were typed and `2:153` or a date prints as typed (Word shows digits inside a right-to-left run as Arabic-Indic). In a left-to-right paragraph, Arabic stretches are right-to-left runs. Fonts: Calibri for Latin, Traditional Arabic (two points larger) for Arabic.
- IPC `study-notes:export-word` (only the app's own page; headings from the central translations in the interface language). Button **Export Word (N)** in the Notes header.
- Verified: unit test that builds a document and reads `word/document.xml` back (with Node's zlib; no extra dependency): texts, bookmarks, internal links, `w:bidi` on Arabic paragraphs only, no anchors or targets printed. Live `scripts/word-live` in ar and en (save dialog answered by the script): file name, title, relationship names, 2 internal links, 2 bookmarks, right-to-left paragraphs, nothing leaked. Both files were opened read-only in the installed Microsoft Word through automation and saved as PDF to check the rendering; this found misplaced spaces and Arabic-Indic digits in Arabic lines, both fixed and checked again. The automation's Word process was closed afterwards; the user's open document was not touched.
- Not yet: images from lecture screenshots.

### 2026-11-05, Claude Code — graph filter, Word layout, PDF tools, marks list, pins, study assistant, compare

User request: graph filter by relationship; Word table of contents, page size and margins; the remaining PDF waves (tool bars per markup mode, one list of all annotations, comment mode with pins, more annotation types, AI and compare from Waves 12 and 13). S9 left for later. No schema change and no new dependency in any of this.

**Graph filter by relationship (S4/S5).** A row of chips above the map, one per relationship present with its count, plus "All links". Choosing one or more keeps only those lines and the dots they join; the note the map is about always stays (`graphRelations`, `filterByRelations` in `src/shared/knowledge-graph.ts`).

**Word layout (S8).** Before the save dialog, a small form: table of contents (on by default), page size (A4, Letter, A5) and margins (Word's Normal, Narrow, Wide), remembered on this device. The contents list each note's title as an internal link, built from the notes rather than as a Word field, so it is complete on opening in any program. The footer carries page numbers (a PAGE field). Checked by opening the export in the installed Word (read-only) and saving it as PDF: A5, wide margins, linked contents, numbered pages.

**Markup tool modes (8.3) and more annotation types (9.1).** The markup bar has tool modes: Select, Highlight, Underline, Strike out, Comment pin in the compact bar; Rectangle, Oval, Arrow, Text box and Area behind "Drawing tools", with the last drawing tool kept visible (Acrobat's compact and expanded bars). A tool is armed for one use and returns to Select; the lock keeps it armed. H still toggles the highlighter lock exactly as before; U arms Underline, C arms Comment, Esc returns to Select. Text marks stay `highlight` knowledge items with `style` in their location JSON; shapes, text boxes, areas and pins are `note` items whose location JSON holds `shape`, a box in page percent (and two points for an arrow) and the colour (`src/shared/pdf-markup.ts`). Drawing happens on a surface over the page only while a shape tool is armed, so text selection is untouched otherwise; outlines take clicks on their edges only. Clicking a mark opens it: colour, delete, and its note text (a text box shows its text on the page).

**Comment mode with pins (9.4).** With Comment armed, a click on the page places a pin and opens its thread (the comment threads of ADR-010, so reply, edit, resolve and reopen work as for notes). A pin turns grey when all its threads are resolved and shows a count when several are open. Thread counts come from a new `comment-totals` action (open and total per item; no schema change).

**One annotations list (9.2, 9.3).** A "Marks" tab in the PDF side panel lists the book's study marks and the file's review comments together, labelled by layer, with filters for layer, type, colour, date (today, last 7 days), status (open, resolved) and search (Arabic normalised), sorted by page or newest; a row opens its page. The four side-panel tabs now show the active tab's name and icons for the others, so they fit.

**Grounded study assistant (Wave 12).** "Study assistant" in Notes: tick notes and/or up to 50 pages of a PDF book, choose question and answer, study guide, practice questions, key terms, organise my notes, or draft review cards. Sources go to the model as S1, S2 … with their study link; every quote in the reply must be found in its source (spacing aside) or the whole answer is refused rather than shown. The consent rule is the PDF assistant's: AI must be on in Settings; a local Ollama on 127.0.0.1 needs no tick; any other provider needs the "allow sending" tick, checked before anything leaves the computer. An answer can be saved as an editable note with its sources as live `[[…]]` links and quotes; drafted cards are added only one by one on approval (`src/shared/study-assistant.ts`, `src/main/ipc/study-assistant.ts`, `StudyAssistant.tsx`). Ayahs and hadith as sources are not offered yet (only through notes that quote them).

**Compare two editions (13.1).** A compare button beside the markup bar compares this PDF with another PDF in the library, word by word (Myers' algorithm with a cap, so unrelated books stop early), with "ignore differences in tashkeel" on by default. Differences show removed and added words with context and both editions' pages, with previous and next (buttons, N and P) and "go to page". PDF text extraction can split a lone mark (a damma) off its word; such marks are joined back. The reader's text extraction reads at most 200 pages, so longer books are compared on their first 200 pages and the result says so. Neither file is changed. Visual overlay comparison is not done.

**Verified.** npm test 1373/1373 (new: markup model and list filter, graph filter, Word layout, assistant, compare, link-relation rewrite); tsc; eslint; main build. Live checks in ar and en on throwaway profiles: `scripts/pdf-tools-live` (underline, strike-out, rectangle and arrow dragged with real mouse input, text box with typed text, C then a pin with a comment, resolve turns it grey, marks list filters by type, status and search), `scripts/assistant-live` (with a fake Ollama on 127.0.0.1 inside the test: refused when AI is off and when remote without consent with nothing sent, quoted answer with its source link, save as note, cards: only the approved one added), `scripts/compare-live` (two generated editions: three word differences found, tashkeel ignored or counted, previous and next, go to page), `scripts/word-live` and `scripts/relations-live` (extended for the new options and the graph filter); reran `pdf-markup-live`, `export-live` and `boards-live`. Screenshots inspected; fixes from them: the side panel's fourth tab was cut off, a resolved pin stayed coloured, the Arabic compare summary had awkward number agreement.

**Limits.** At 480 px the PDF header still clips its last buttons (as before). The PDF tools are for the PDF workstation only, not EPUB or the Quran and Sunnah readers. Study marks are not yet written into an exported PDF copy (9.6). Stamps, OCR suspects, accessibility check, read-aloud reflow, actions and measure (13.2–13.7) are not done.

### 2026-11-09, Antigravity — KEY-278: Repair dashboard-live and make note-editor-live / poetry-live self-contained

- **Root Cause of `dashboard-live` Failures (3 distinct causes identified and resolved)**:
  1. *Book-note edit persistence in SQLite vs AppSettings*: In `scripts/dashboard-live/main.ts` lines 24 and 155, the live test fixture instantiated `new StudyNotesService(settings)` without passing the SQLite `db` handle (`new StudyNotesService(settings, db)` / `new StudyNotesService(settings, reopened)`). In production (`src/main/ipc/study-notes.ts`), `new StudyNotesService(settingsRepository, getDatabase())` is always provided with the database. When `StudyNotesService.save` received the note edit for `'book-note-test'` (seeded into `knowledge` via `knowledge.saveKnowledge`), omitting `db` caused `save` to fall back to `app_settings` key `study.note.v1:book-note-test` instead of updating the `knowledge` / `study_note_detail` row in SQLite. Consequently, when `main.ts` queried `knowledge.getKnowledgeByWork('study-book')[0].noteContent`, it returned the unmodified seeded value `'Book note — ملاحظة كتاب'` rather than the updated note, causing the assertion failure. Fixed by passing `db` and `reopened` to `StudyNotesService`.
  2. *Missing `knowledgeHistory` IPC in fixture preload*: Wave 9 integrated `<CommentThreads>` inside `<NoteHistory>` on every note card rendered by `NotesOverviewView`. On mount, `<CommentThreads>` calls `window.electronAPI.knowledgeHistory.comments(id)`. Because `scripts/dashboard-live/fixture.tsx` lacked a `knowledgeHistory` mock on `window.electronAPI`, the notes view threw `Uncaught TypeError: Cannot read properties of undefined (reading 'comments')`. Fixed by providing `knowledgeHistory: { comments: async () => [], commentCounts: async () => ({}) }` in `fixture.tsx`.
  3. *PostCSS missing `ui-motion.css` & `StartupSplash` overlay*: `src/renderer/app/globals.css` references `@import "./ui-motion.css";`. When building styles into the fixture's temporary folder, PostCSS failed unless `ui-motion.css` was present in the build directory. Additionally, the first screenshot (`dashboard-ar-480.png`) captured the `StartupSplash` overlay (`[aria-label="Baglib Startup Screen"]`) before it unmounted; fixed by copying `ui-motion.css` in `run.mjs` and adding an explicit wait for splash unmount in `main.ts`.

- **Self-contained Corpus Copying (`scripts/lib/corpus-copy.mjs`)**:
  - **2026-11-09 Codex review fix:** Before any destination creation/copy/cleanup, require a strict child of the repo `.baglib-data/` and refuse resolved paths equal to, inside, or containing the source profile. Two refusal regressions cover overlap, outside/prefix lookalikes and parent traversal, checking no mutation; corpus unit tests now pass 5/5. Existing three tests use synthetic profiles under `.baglib-data/`. Changed-script/test eslint and diff check pass; no live rerun or interface/layout change in this review session.
  - Created shared utility `setupThrowawayCorpus` with strict read-only guarantees:
    - Locates installed Quran packs (`%APPDATA%/baglib/quran`) and Bayan poetry partitions (`%APPDATA%/baglib/partitions`).
    - Copies SQLite databases, font files, and manifests into isolated throwaway run directories, leaving original files strictly intact.
    - Computes read-only (`O_RDONLY`) SHA-256 hashes of original files before any test execution.
    - Upon test completion or failure (`try/finally`), securely deletes all throwaway copies and verifies that original files match their initial hashes bit-for-bit (`originalsUnchanged: true`).
    - Reports explicit `SKIPPED: no installed Quran pack` or `SKIPPED: no installed poetry partition` when corpora are absent, and ensures skips result in non-zero exit code (`exit 2`, `passed: false`), never falsely passing.
  - Applied to `scripts/note-editor-live/run.mjs`, `scripts/note-editor-live/main.cjs`, `scripts/poetry-live/run.mjs`, and `scripts/poetry-live/main.ts`.

- **Verification**:
  - `corpus-copy.test.ts`: 3 unit tests passing (read-only hash checking, skip reporting, manifest handling).
  - `npm test`: 1418/1418 passing (3 new tests added vs 1415 baseline).
  - `npx tsc --noEmit`: 0 errors.
  - `npx eslint`: 0 errors across all modified script and test files.
  - `npx tsup`: Clean build.
  - `git diff --check`: Clean.
  - `scripts/dashboard-live`: Passed 2 consecutive runs (`run-qE0GRB`, `run-u1qfa1`); verified all 25 migrations applied, Arabic & English screenshots inspected at 1280px and 480px, `dashboard-ar-480.png` displays real dashboard content.
  - `scripts/note-editor-live`: Passed with installed packs (`run-4R18Pk`) with zero manual steps, verifying Quran, Hadith, poetry, PDF page jumps, hover cards, annotations-to-note; verified without packs (`run-7RPTZa`) printing explicit `SKIPPED:` notices and exiting with code 2.
  - `scripts/poetry-live`: Passed native live run (`run-jVRgod`) using throwaway copy with full cleanup and hash verification.


### 2026-11-05, Claude Code — narrow PDF header; ayahs and hadith as assistant sources

User request: "The narrow-window PDF header: at 480 px it cuts off its last buttons. Ayahs and hadith as direct study assistant sources." No schema change and no new dependency.

**Narrow PDF header.** Measured first: the header row needed about 794 px, so it clipped not only at 480 px but already at 900 px with the side panels open (the file name was squeezed to nothing). A fixed breakpoint cannot fix this because the side panels change the room the header has, so the header now measures itself (a ResizeObserver on the row and its parts) and steps through compact levels only when its row overflows, stepping back once the wider row, whose width was recorded when it overflowed, fits again (no oscillation):
1. Compare, read aloud, auto-scroll, bookmark, undo, version history, page only, pin and hide the top bar move into a "More" (⋯) menu (checkbox items show their state; arrow keys move, Esc closes, a choice closes it).
2. The markup bar shows only the current tool and a palette button; the palette holds all ten tools with their names, the five colours, the lock and the shortcut sheet. Before this, colours could not be chosen at all below 768 px (only keys 1–5).
3. The PDF tools and Marks buttons move into More too, and the saved pill keeps only its icon (its text stays for screen readers).
The file name keeps at least 4 rem (2.5 rem at level 3) and its full name is the tooltip. The compare button moved from the markup bar into the header's own actions so it can join the menu.

**Ayahs and hadith as assistant sources (Wave 12).** The study assistant has an "Ayahs and hadith" box: find an ayah by `2:255`, a range or words, or a hadith by words (the same lookup as `[[` in notes), add it as a removable chip (up to 20; an ayah range at most 50 ayahs). The renderer sends only the study link target and a display label; the main process reads the text itself from the installed Hafs script and Sunnah corpus (`readAyahTexts` in `src/main/ipc/quran.ts`, `readHadithText` in `src/main/ipc/sunnah.ts`), so every quote is checked against the real text and text supplied by a page is never sent. Ayahs go to the model with their numbers, a hadith with its full text (isnad and matn); a citation opens the ayah or hadith, and a drafted card keeps `quran` or `hadith` as its source kind.

**Verified.** npm test 1374/1374 (new: passage requests, `passageKind`, `cardSourceKind`); tsc; eslint (0 errors in changed files; the 5 errors in `highlight-manager.ts` predate this work). Live on throwaway profiles in ar and en: new `scripts/pdf-header-live` (at 1280, 900, 640, 480 and 380 px no header control lies outside the window and the row does not overflow; no More menu at 1280; at 480 the menu lists its items, stays in the window, closes on Esc and after a choice, its bookmark item toggles the bookmark; the compact palette has all ten tools, stays in the window, picks a colour and a tool); `scripts/assistant-live` extended (2:153 and Bukhari 1 found from the panel and added; the text sent is the installed ayah with its number and Bukhari's text; the citation is the ayah; a request carrying its own `text` is answered from the installed text, never the supplied one; the box stays in its column). Reran `pdf-tools-live`, `compare-live`, `pdf-markup-live`. Screenshots inspected; fixes from them: palette tool names were cut off, a menu label was cut off, the passage search pushed out of its column (a fieldset's minimum width).

**Floating OCR bar (follow-up, same day).** At 380 px the OCR bar at the bottom of the PDF view ran past both edges: it was centred with `left: 50%` but could not be wider than its content. The measuring logic moved into a shared hook, `useOverflowLevel` (`src/renderer/hooks/useOverflowLevel.ts`), now used by the header and the OCR bar. The bar is centred on its real width, capped at the view's width less 8 px a side, and measured against the view it floats over: level 1 shows the run button as an icon (its name stays as label and tooltip) and the page chip without its status (kept in the chip's tooltip); level 2 shrinks the engine box to its status dot (the engine is still chosen in the OCR inspector); level 3 hides the page chip. The layout choice (lines or columns), which exists only on this bar, always stays. With room, the chip now shows "not recognized yet" at any width instead of only from 768 px. `scripts/pdf-header-live` now also checks that every OCR bar control lies inside the window and the view at 1280, 900, 640, 480 and 380 px, that the run button keeps its name and that the layout choice stays (ar and en pass; the bar reaches level 2 at 380 px).

**Limits.** Ayah text is the Hafs script only (Warsh targets are not offered by the search). Tafsir and translations are not sent with an ayah.

## KEY-270 — Arabic and English PDF FreeText appearances, 2026-11-09

Saved text boxes now carry an embedded appearance visible to PDFium while preserving the original annotation text and editability. Arabic uses Noto Naskh Arabic v2.021, with joined letters, positioned tashkeel and coverage of Quranic U+06E1. Latin uses the existing DejaVu Sans, which also supplies fallback glyphs. The writer wraps paragraphs, respects the text box RTL/LTR flag and page CropBox/rotation, and embeds shared subsets with Identity-H, CIDToGIDMap, widths and ToUnicode. Unicode cluster carriers and logical text operators retain the original source sequence. Font subsets are recreated once per save and old owned annotations/resources disappear during the full rewrite. Foreign annotations remain intact. A missing shaping import emits a writer JSON warning and allows the previous FreeText behavior to save successfully. `TextAppearances.appearance()` plus `finish()` is the reusable entry point for KEY-271 stamps.

The approved official archive `NotoNaskhArabic-v2.021.zip` is 2,922,060 bytes, SHA-256 `6c050ab9bd087d69b733c505a7576e60c528c2f33cd7b91005a5bd7da4514032`, stored and unpacked only under `.baglib-data/downloads/noto-naskh/`. The packaged additions are only the regular full TTF (291,980 bytes) and SIL OFL 1.1 licence (4,381 bytes). Existing electron-builder `assets/pdf-editor` resource filters ship both. The two approved shaping libraries use the same pinned wheel/hash lines as `requirements-ocr.txt` in a separate `requirements-shaping.txt`. Setup installs it with `--require-hashes` immediately after each base install for both the venv and embedded target, with explicit failure checks. The existing packaging wildcard ships the new requirements file. The base `requirements.txt` stays byte-for-byte equal to HEAD so its legacy dependencies retain their existing installation behavior. Font provenance is the [official Noto Naskh Arabic release](https://github.com/notofonts/arabic/releases/tag/NotoNaskhArabic-v2.021).

Six focused tests pass. They exercise the Python writer, inspect embedded font programs, reconstruct all three acceptance strings exactly through ToUnicode, compare repeat-save font counts and PDFium pixels, preserve a foreign annotation, simulate each missing import and check packaging, wrapping and four cropped-page rotations. Visually inspected PDFium 2x evidence is under `.baglib-data/key270-render/`, including Arabic tashkeel, English, the mixed `سورة 2:255 Al-Baqarah` reference and RTL/LTR rotation montages. Direct ToUnicode reconstruction and annotation Contents are exact. PDFium/PDF.js geometric extraction from a synthetic page projection reorders some Arabic combining sequences, so broader viewer-specific copying remains a verification limit. Explicit bidi embedding/isolate controls are not interpreted by this ordinary Arabic/Latin resolver. Acrobat and live BagLib harnesses were not run in this session under the assigned isolation rules. See ADR-012 and `docs/agent-ops/reports/KEY-270.md` for detailed results and install dry-run evidence.


## KEY-271 PDF study tools implementation - 2026-11-10, Codex

The Wave 13.2, 13.6 and 13.7 entries now have an implementation. This section supersedes the earlier historical statement that stamps, actions and measurement were pending. Its evidence is local BagLib source inspection and the tests below. No external application was reverse-engineered during KEY-271.

### Stamps and measurements

`src/shared/pdf-study-tools.ts` defines the ten approved stamps, four distinct grade colours, physical unit conversions and locale-aware value formatting. User-facing labels live in `src/renderer/translations.ts`. The PDF-only stamp selector defaults to the interface language and offers a placement-language choice. `PdfMarkupLayer.tsx` provides selectors and a per-page calibration line, known length, unit, distance and rectangular area controls. PDF coordinates remain independent of RTL/LTR. Native page dimensions are taken before zoom and device-pixel scaling.

Both additions use existing `note` knowledge records and their shape-location JSON. Each measurement records its geometry, physical page dimensions, calibration ratio, units and placement locale. Stamp labels and saved PDF contents retain their placement language. Measurement labels in the page, Marks list and popover are reformatted for the current interface language from the stored geometry. Calibration controls start with the default PDF scale on a newly mounted page. Stored measurements retain their own scale. Existing reader-origin history provides restart-safe undo and redo. Existing EPUB tool restrictions continue to expose its supported text and comment tools.

`assets/pdf-editor/baglib_marks.py` emits owned `/Stamp` appearances through the KEY-270 `TextAppearances` shaping and embedding helper. Rounded vector borders have a white background so the page text stays behind a legible label. Measurements become `/Line` with `/IT /LineDimension`, or a rectangular `/Polygon`, with the value in `/Contents`. `base()` supplies the existing ownership metadata. Save removes/recreates owned annotations without duplicating them and preserves foreign annotations. `material-save.ts` adds the independent `stamps` export category. Measurements belong to `shapes`.

### Saved actions

The shared `PdfSavedActions.tsx` authoring surface is mounted in the Tools home and the workstation directory. It stores up to 50 named sequences in `pdf.actions.v1`, each with 2-12 ordered steps. Available single-PDF tools are compression, page numbers, watermark, OCR and repair. Options are bounded JSON fields of those existing operations. The page-number default uses numeric position `8`, matching `stirling-tool-options.ts`. OCR delegates the existing skip-text implementation. The live checks did not OCR either real text-layer PDF.

`PdfEditorJobs.start()` validates sequences in main before execution. Each step invokes the existing runner with the preceding staged file and its verified digest, in a separate step directory. Only a fully successful sequence becomes the session's working output. A failed or cancelled sequence leaves the original file and earlier working output intact. Progress and the localized failed-step message appear above the reader page, including when side panes are closed. Save uses the existing ADR-012 publication and emergency-copy path.

### Verification checkpoint

Seven focused TypeScript tests pass, including catalogue/key parity, Arabic digits, calibration, area, invalid payloads, action validation, exact ordering and failure rollback. The Python writer regression verifies embedded-appearance ownership, stable rewrite, dimension annotation subtypes and foreign preservation. The initial full suite passed 1611 tests. The resumed shared workspace passes 1670 tests after the other tasks landed. Final checks and native evidence are recorded in the KEY-271 handoff and local report.

Native profile `key271-live-1pgyFP` verified both copied real PDFs, all ten labels in each language, ten-centimetre calibration, two measurements per PDF, undo/redo, restart, repeat Save, selective export and two-step compression-to-numbering actions. Each action produced one staged PDF and Save retained one emergency copy per source. Fresh final profile `key271-live-ChjNym` passes the same two-launch bilingual workflow with opaque stamp appearances. PDFium 2x renders of both saved pages have been inspected, including correctly joined Arabic labels and all four grade colours. The generated raster worker was rebuilt with `npm run copy:pdfjs` so owned Stamp and Polygon annotations are hidden under the editable reader overlays. A targeted resumed run verifies opposite-language book reopening and locale-specific digits. The real corpus files remain unchanged. No schema, dependency or download was added.


## KEY-293 live FreeText Save follow-up — 2026-11-10, Codex

This supersedes the KEY-270 section's deferred BagLib live-check limitation. `BAGLIB_SAVE_APPEARANCE_ONLY=1 node scripts/save-live/run.mjs` now drives the real reader Text tool, native drag/input, popover Save and two Ctrl+S file saves. `appearance-stage.cjs` checks pending writes and prior-file emergency hashes. `appearance_pdf.py` independently snapshots owned APs and foreign annotation graphs with pikepdf, counts all font objects, and renders the actual saved page with PDFium at 2x. A companion render isolates the same APs against white in memory for visual inspection over original cover artwork. The runner uses copies of both real Arabic and English PDFs from the manifest.

All four UI/document-language combinations passed. Each has three owned FreeText APs, exact Arabic including U+06E1, English and mixed-reference Contents, unchanged foreign annotation values/streams, persistent unique names, and one emergency copy. Repeat Save retains font counts25/25 on the Arabic PDF and10/10 on the English PDF. Both original input hashes match. Sixteen PNGs under `.baglib-data/key270-save-live-evidence/2026-11-10T04-04-57-602Z/` were inspected, including actual1280/480RTL/LTR reader captures and full/isolated PDFium2x pages. Naskh joins and diacritics render, English is readable, and the mixed reference has the observed RTL visual order. The existing480px side panes obstruct part of the page and remain a separate reader-layout limitation. Acrobat and viewer-specific copy order remain unverified. Application feature code and PDF writing semantics are outside this harness-only follow-up. See the local `docs/agent-ops/reports/KEY-293.md` for exact tests, shared-suite failures, profile paths and evidence.
