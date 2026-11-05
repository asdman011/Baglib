# PDF and Notes Experience Plan

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
| 13.2 | Custom stamps, including study stamps such as "checked", "to revise", and grading stamps | Acrobat Stamp tool; stamp images ship with the app |
| 13.3 | Scan and OCR "review suspects": step through low-confidence words | Acrobat `ShowCaptureSuspects`; reuses OCR confidence |
| 13.4 | Accessibility check and reading order view | Depends on what the open engine supports; the proprietary Stirling module stays excluded |
| 13.5 | Read aloud and reflow for the PDF view | Reuses existing TTS and text layer |
| 13.6 | Saved tool sequences shown as "actions" | The existing pipelines, renamed and surfaced in the Tools home |
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
