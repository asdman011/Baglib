# UI/UX Vision Program: from the FigJam board to a usable, polished BagLib

Date: 2026-11-10. Author: Claude Code (plan and dispatch). Implementers: Codex and Antigravity.

The user asked for a plan and tasks to improve the UI and UX of every part of the app, and to make their Figma vision a usable, polished program.

## 1. Sources

**The vision: the FigJam board `baglib`** (file `4TZ6QkfONsXCPwo4Jd4yrd`). It is the only Figma file the user has shared. Claude read it on 2026-11-10. The crops are saved in `docs/features/ui-vision/`, because the implementers cannot open Figma:

- **`library-shell-mockup.png`**: a Stitch mockup and the clearest UI target. Arabic RTL.
  - **Right-side nav:**
    - the brand "Baglib" with the subtitle "Local-first OS";
    - a dark **New Object +** button;
    - the items Library, Notes, Research and Islamic Studies;
    - Settings and Support at the bottom.
  - **Top bar:**
    - a breadcrumb (المكتبة › كل الكتب);
    - a centred library search with a `⌘K` hint;
    - Help, Language and the profile.
  - **Collection header:** the title (مجموعة الفلسفة الإسلامية), "28 volumes · updated recently", and a grid/list toggle.
  - **Filter rail:**
    - a filter search;
    - **Topics** as pill chips (الفقه selected, التاريخ, الفلسفة, اللغة العربية);
    - **Authors** as a checklist with counts.
  - **Cards:**
    - one wide **featured** card (موصى به): cover, title, author and date, a short blurb, and reading progress;
    - regular cover cards: title, author and a subject chip, with a "new" (جديد) badge on recent books;
    - a clean **no-cover placeholder** (بدون غلاف).
  - The user's own note on the mockup: **"add tag to each book physical or digital"**.
  - Look: cream parchment canvas, white cards, soft shadows, a dark evergreen primary colour, gold accents.
- **`library-sketches.png`**: hand sketches of a card grid, and a card that opens into a detail view with +/− zoom. Next to them is "combine [Research - Roadmap - Curriculum]", with the sticky note "already made templates and the option to create new personalized template".
- **`dashboard-wishlist.png`**: Daily reading goals, weekly statistics, books completed and in progress, knowledge growth, recent reflections and edits, reading streak, time invested, ideas captured, research progress, a **Gregorian and Hijri calendar**, prayer times, and **app snooze on prayer, zikr and wird**.
- **`reader-sketches.png`**: wireframes for a reader page (a large page, a header with controls, a panel with blocks), and a canvas with linked nodes.
- **`journey-map.png`**: user persona, empathy and journey templates (Awareness → Loyalty). They are empty templates, so the journeys below are Claude's, based on the features.
- **The board's mind map** (Quran, Sunnah, poetry, community, library, reader, notes, roadmap, research, version history, statistics, cards, OCR) became features in KEY-220–261. This program **does not add features**. It makes the existing ones look and behave as one designed product.

**Existing design and UX documents:**
- `docs/DesignSystem.md` ("Baghdad Library": parchment light, Scholar Night dark, Reem Kufi, Tajawal and Amiri);
- `docs/features/Usability Inspection.md` (findings U1–U6);
- `Remaining UI Audit.md`, `Minor Layout Audit.md`, `Shared Workspace Layout.md` and `UI Motion.md`.

## 2. Decisions Claude made (the user said to keep going and not wait)

- **D1. Where the Figma mockup and `DesignSystem.md` disagree, the Figma mockup wins.** The user asked for their Figma vision.
  - The parchment canvas, the typography tiers and Scholar Night dark mode stay as they are.
  - The **primary action colour becomes dark evergreen**, as in the mockup's New Object button and selected chips. Pale Sky stays for links and focus.
  - Gold or amber stays the accent.
  - U2 (KEY-296) updates `DesignSystem.md` to match.
- **D2. "Physical or digital" is shown from data BagLib already has:** `source.source_type` (`physical`, or one of `linked_file`/`managed_file`), plus `wishlist`. No schema change.
- **D3. "New Object" is a create menu over flows that already exist:** import a book, add a physical book, new note, new card, new task, new research space. It adds no new entities.
- **D4. "Islamic Studies" is a nav group** holding the Quran, Sunnah and poetry readers. Dashboard, Planner and Pathways stay reachable: Dashboard as the home, Pathways inside Research.
- **D5. No new dependencies.** Icons come from the icon set already installed. Any new font, icon library or UI kit is a hard gate: the agent stops, records the gate and moves to another task.

## 3. UX principles (every task is checked against these)

1. **One shell, one language of controls.** The same buttons, chips, cards, modals, toasts, empty states and focus rings everywhere.
2. **Arabic first, never broken.** RTL mirroring, no clipped tashkeel, Amiri for reading text, Tajawal for UI, localized digits.
3. **Calm and scholarly.** Parchment, generous spacing, few colours, no dense chrome. Tools appear when needed and are always reachable by keyboard and touch, never by hover alone.
4. **Always know where you are and what is happening.** A breadcrumb and title; loading, progress, empty and error states with a next step; undo for destructive actions.
5. **Keyboard complete.** Every action is reachable, modals trap focus, `Esc` closes, and there is a shortcut sheet.
6. **Fast-feeling.** Skeletons instead of blank panes; nothing jumps around as it loads.
7. **480 px works.** The narrow window gets a drawer nav and stacked panels, with no horizontal scroll.

## 4. Tasks (epic KEY-294)

Jira keys: U1 = KEY-295, U2 = KEY-296, U3 = KEY-297, U4 = KEY-298, U5 = KEY-299, U6 = KEY-300, U7 = KEY-301, U8 = KEY-302, U9 = KEY-303, U10 = KEY-304, U11 = KEY-305, U12 = KEY-306, U13 = KEY-307, U14 = KEY-308, U15 = KEY-309.

Each task below is one Jira task. Every task must:
- use the real files in `tests/real-files/`;
- run live in ar and en, at 1280 and 480 px, in light and dark;
- save its screenshots under `.baglib-data/<key>-evidence/`;
- add **no** schema change and **no** dependency.

| # | Task | Area | Blocked by |
|---|---|---|---|
| U1 | **UI baseline audit against the vision.** Screenshot every workspace and modal (ar/en, light/dark, 1280/480). Score each against §3 and the mockup. Output a ranked gap list per area, in §6 of this doc. Read-only; no code changes. | all | — |
| U2 | **Design tokens and primitives.** Apply D1 in `globals.css` and the Tailwind theme as one token set. Shared `Button`, `IconButton`, `Chip`, `Card`, `Modal` (with focus trap), `Toast`, `EmptyState`, `Skeleton`, `Tabs` and `Menu`. Replace ad-hoc colours in the shell. Update `DesignSystem.md`. | foundation | — |
| U3 | **App shell to the mockup.** Nav rail: brand, New Object menu (D3), Library / Notes / Research / Islamic Studies groups, Settings and Support at the bottom. Top bar: breadcrumb, central search with `Ctrl+K` (opens the existing command palette and search), Help, Language, profile. Narrow drawer at 480 px. Keep active-book shortcuts working. | shell | U2 |
| U4 | **Keyboard and accessibility foundations.** Focus trap in every modal (fixes U3 of the inspection), visible focus rings, a shortcut sheet (`?`) covering KEY-46, `prefers-reduced-motion`, ARIA landmarks, contrast AA in both themes. | foundation | U2 |
| U5 | **Library home to the mockup.** Collection header (title, count, updated), grid/list toggle, filter rail (topic chips, author checklist with counts, filter search), the featured card, cover cards with subject chip, "new" badge, **physical/digital badge** (D2) and no-cover placeholder. Keep bulk select, pagination and columns working. | library | U3 |
| U6 | **Book detail and import flows.** Book detail becomes a calm page or sheet with the +/− zoom from the sketch. Import wizard gets progress you can leave running in the background, a safe cancel or close (inspection U2), and clear results. Gather the metadata modals into one consistent pattern. | library | U5 |
| U7 | **Feedback states everywhere.** Toasts with undo for destructive actions; progress, empty and error states with a next step (inspection U5); search ignores stale results (U4); readiness reflects real health (U1). | all | U2 |
| U8 | **Dashboard to the wish-list.** Arrange the existing modules into a calm home: today panel, reading goals and streak, time invested, books in progress and completed, recent reflections and edits, research progress, a **Gregorian and Hijri calendar**, prayer times and the snooze entry. Reorderable and hideable, saved in settings. No module logic rewritten. | dashboard | U3 |
| U9 | **Reader chrome (PDF and EPUB).** One header (title, page, zoom, view mode, tools), a side panel with tabs (outline, marks, notes, search), focus mode, and consistent marks and toolbars in both readers. Follows KEY-291 and KEY-293. | reader | U3, KEY-271, KEY-291 |
| U10 | **Notes, cards and boards workspace.** Consistent list → editor → backlinks layout, card review screen, boards toolbar, empty states and error recovery. | notes | U3 |
| U11 | **Islamic Studies hub.** One entry page and shared headers for the Quran, Sunnah and poetry readers: surah/book pickers, the reading-profile switch, the same panel tabs, consistent ayah and hadith cards, and Amiri typography checks. | islamic | U3 |
| U12 | **Research, Roadmap and Curriculum as one space.** One workspace with templates plus "create a personal template" (board sticky note), pathways, curriculum and the research resource list sharing one layout. | research | U3 |
| U13 | **Settings and first run.** Settings as one searchable directory (inspection U6), a first-run guide (language, theme, library folder, packs), and an About and Support page. | shell | U3 |
| U14 | **Motion, dark mode and polish pass.** Consistent transitions under `prefers-reduced-motion`, a Scholar Night pass on every area, spacing and type-scale sweep, icon mirroring in RTL. | all | U5–U13 |
| U15 | **UX acceptance run.** Six end-to-end journeys on real files, ar and en, 1280 and 480 px, timed, with a fix list sent back as follow-ups. | all | U14 |

**The six journeys for U15** (also used in U1):
1. Import an Arabic PDF and an English EPUB; find them, filter by topic and author, and mark one as physical.
2. Read a PDF: mark it up, save it, and reopen it in another viewer.
3. Take a note from a passage, then make a card and review it.
4. Plan today from the dashboard, then snooze for prayer.
5. Open an ayah and a hadith, compare tafsir, and link them to a note.
6. Build a curriculum from a template and follow its first step.

## 5. Dispatch plan (best use of quota)

- **Antigravity (Gemini 3.8 Flash, cheaper):** the read-heavy and broad tasks. U1 audit first, then U7, U13 and U15.
- **Codex (Sol 6.1):** the foundations and the design-heavy rebuilds. U2 → U3 → U5 → U6, then U9 and U12.
- **Remaining tasks:** U4, U8, U10 and U11 go to whichever agent is free, as long as the files don't overlap.
- **Never at the same time:**
  - U2 and U3 with anything else that touches the shell (`AppLayout`, `NavigationRail`, `Titlebar`, `globals.css`);
  - U5 with U6, because both touch library components;
  - U9 with KEY-271, KEY-291 or KEY-293.
- **Claude** reviews each push against §3, its acceptance criteria and the screenshots, and only reads diffs.

## 6. U1 audit results (KEY-295)

Conducted on 2026-11-10 by Antigravity using live Electron harness (`scripts/ui-audit-live/`) against disposable profile `.baglib-data/key295-profile/` seeded with real Arabic & English PDFs, EPUBs, WMA audio, Quran/Sunnah/Poetry copies, notes, cards, and physical records. 177 evidence screenshots captured in `.baglib-data/KEY-295-evidence/` across `ar`/`en`, `light`/`dark`, and `1280`/`480` px viewports.

### 6.0 Claude's review corrections (2026-11-10, from `library_grid_ar_light_1280.png`)

Some of the gaps reported below are already partly met. Later tasks must build on what exists rather than redo it:
- **The nav is already grouped.** It has three groups: Daily study (الدراسة اليومية), Reading sources (مصادر القراءة) and Search and knowledge (البحث والمعرفة). Settings is already pinned at the bottom. What U3 actually has to do:
  - regroup the nav to the mockup's Library, Notes, Research and Islamic Studies;
  - add the New Object button and the brand subtitle;
  - add the breadcrumb;
  - add the drawer for narrow windows.
- **The top bar already has a central search with a `Ctrl+K` hint**, plus Quran and Sunnah shortcuts. U3 keeps the search and adds the breadcrumb.
- **Cards already show a physical-copy badge (نسخة ورقية) and a format badge (WMA).** U5 standardizes them into one physical/digital/wishlist badge, adds "new", and replaces the generic placeholder.
- **Two items in 6.11 are already Jira tasks:**
  - the prayer, zikr and wird snooze is KEY-239, in progress;
  - side-by-side tafsir comparison is KEY-170.
- **Barcode or ISBN scanning is a new feature**, outside this UI program. Nothing is filed for it.

### 6.1 Shell and Global Navigation

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Sidebar is an unsegmented 12-item list rather than the FigJam mockup's clean grouped rail (Library, Notes, Research, Islamic Studies) | High | `dashboard_ar_light_1280.png`, `library_grid_ar_light_1280.png` | U3 (KEY-297) |
| Missing prominent dark "New Object +" button in the navigation rail | High | `library_grid_ar_light_1280.png`, `library_shell-mockup.png` | U3 (KEY-297) |
| Top bar lacks breadcrumb navigation (`المكتبة › كل الكتب`) and centralized `Ctrl+K` search bar | High | `library_grid_ar_light_1280.png`, `dashboard_ar_light_1280.png` | U3 (KEY-297) |
| Settings and Support are not pinned at the bottom of the navigation rail | Med | `settings_ar_light_1280.png`, `library_grid_ar_light_1280.png` | U3 (KEY-297) |
| 480px viewport collapses sidebar icons but lacks a dedicated responsive slide-out drawer navigation | High | `library_grid_ar_light_480.png`, `dashboard_ar_light_480.png` | U3 (KEY-297) |
| Primary action color is Pale Sky blue / amber instead of dark evergreen specified in vision mockup | Med | `library_grid_ar_light_1280.png`, `dashboard_ar_light_1280.png` | U2 (KEY-296) |

### 6.2 Library Home

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Missing Collection header with volume count and last updated timestamp (`28 volumes · updated recently`) | Med | `library_grid_ar_light_1280.png`, `library_list_ar_light_1280.png` | U5 (KEY-299) |
| Filter panel is an overlay drawer with form selects instead of the mockup's persistent side rail with topic pill chips and author checklist counts | High | `library_filters_ar_light_1280.png` | U5 (KEY-299) |
| Missing featured hero card (`موصى به`) displaying reading progress and summary | Med | `library_grid_ar_light_1280.png` | U5 (KEY-299) |
| Regular cards lack explicit "Physical / Digital" badge (user note: "add tag to each book physical or digital") | High | `library_grid_ar_light_1280.png`, `library_list_ar_light_1280.png` | U5 (KEY-299) |
| Regular cards lack "New" (`جديد`) badge for recently added or unread books | Low | `library_grid_ar_light_1280.png` | U5 (KEY-299) |
| No-cover placeholder uses generic fallback icon rather than clean styled parchment placeholder (`بدون غلاف`) | Low | `library_grid_ar_light_1280.png` | U5 (KEY-299) |
| Dense ribbon bar with 10+ disjoint utility buttons clashes with calm scholarly aesthetic | Med | `library_grid_ar_light_1280.png` | U5 (KEY-299) |

### 6.3 Book Detail and Import

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Book Detail is a 4-tab dense metadata form modal rather than the calm reading sheet with `+/−` zoom from `library-sketches.png` | High | `book_detail_ar_light_1280.png`, `book_detail_en_dark_1280.png` | U6 (KEY-300) |
| Import Wizard is an intrusive modal that traps user attention and cannot be safely minimized or backgrounded during batch processing | High | `import_wizard_ar_light_1280.png`, `import_wizard_en_dark_480.png` | U6 (KEY-300) |
| Disjoint metadata dialogs (OnlineHub, StorageManager, OPDS, WebClipper) lack unified modal visual hierarchy | Med | `library_grid_ar_light_1280.png` | U6 (KEY-300) |
| 480px modal content experiences vertical scrolling friction without sticky save/close actions | Med | `book_detail_ar_light_480.png`, `import_wizard_ar_light_480.png` | U6 (KEY-300) |

### 6.4 Reader Chrome (PDF and EPUB)

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| PDF Reader top bar is overly cluttered with 15+ tool icons that wrap and break calm reading layout | High | `reader_pdf_ar_light_1280.png`, `reader_pdf_tools_ar_light_1280.png` | U9 (KEY-303) |
| Inconsistent chrome and navigation patterns between PDF and EPUB readers | High | `reader_pdf_ar_light_1280.png`, `reader_epub_ar_light_1280.png` | U9 (KEY-303) |
| Side panels for Outline, Marks, Notes, and Search are scattered across separate drawers instead of a single tabbed side panel | High | `reader_pdf_tools_ar_light_1280.png` | U9 (KEY-303) |
| Focus / Zen mode lacks intuitive 1-click toggle and keyboard shortcut discoverability in top bar | Med | `reader_pdf_ar_light_1280.png`, `reader_epub_en_light_1280.png` | U9 (KEY-303) |
| Narrow 480px viewport collapses reader controls into multi-row stacked bars obscuring reading content | High | `reader_pdf_ar_light_480.png`, `reader_epub_ar_light_480.png` | U9 (KEY-303) |

### 6.5 Notes, Cards and Boards

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Notes overview vertically piles note list, markdown editor, assistant button, boards button, SRS review panel, and saved cards into one single scrolling page | High | `notes_overview_ar_light_1280.png`, `notes_cards_review_ar_light_1280.png` | U10 (KEY-304) |
| Spaced Repetition (SRS) card review lacks a dedicated focused review screen; buried below note items | High | `notes_cards_review_ar_light_1280.png` | U10 (KEY-304) |
| Creating a knowledge card from an existing note requires multi-step action menu navigation | Med | `notes_overview_ar_light_1280.png` | U10 (KEY-304) |
| Boards workspace is rendered as an overlay modal rather than a first-class spatial research canvas | Med | `notes_boards_ar_light_1280.png` | U10 (KEY-304) |
| 480px layout on Notes workspace truncates editor actions and causes heavy vertical scrolling | Med | `notes_overview_ar_light_480.png`, `notes_cards_review_ar_light_480.png` | U10 (KEY-304) |

### 6.6 Dashboard, Planner and Pathways

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| FigJam wishlist items missing: combined Gregorian and Hijri calendar, prayer times snooze on prayer/zikr/wird | High | `dashboard_ar_light_1280.png`, `dashboard-wishlist.png` | U8 (KEY-302) |
| Dashboard modules (Today panel, wird, reading progress, stats) lack custom reordering, collapse, and hide preferences | Med | `dashboard_ar_light_1280.png`, `dashboard_en_dark_1280.png` | U8 (KEY-302) |
| Knowledge growth, reading streak visual chart, and ideas captured metrics are fragmented across dialogs | Med | `dashboard_ar_light_1280.png` | U8 (KEY-302) |
| Planner timeline and calendar grid lack clear visual hierarchy on narrow 480px viewports | Med | `planner_ar_light_480.png`, `planner_en_light_480.png` | U8 (KEY-302) |
| Pathways template selection is an unstyled form select rather than the template gallery sketched on the FigJam board | Med | `pathways_ar_light_1280.png`, `library-sketches.png` | U12 (KEY-306) |

### 6.7 Islamic Studies Hub (Quran, Sunnah, Poetry)

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Quran, Sunnah, and Poetry (Bayan) are isolated top-level sidebar items rather than unified under one "Islamic Studies" hub | High | `quran_ar_light_1280.png`, `sunnah_ar_light_1280.png`, `poetry_ar_light_1280.png` | U11 (KEY-305) |
| No side-by-side or comparative Tafsir viewing capabilities (single drawer only) | Med | `quran_ar_light_1280.png` | U11 (KEY-305) |
| Typography mismatch: Hadith and poetry cards intermittently use Tajawal sans-serif for classical body text rather than Amiri Naskh | Med | `sunnah_ar_light_1280.png`, `poetry_ar_light_1280.png` | U11 (KEY-305) |
| Lack of 1-click action to link an Ayah or Hadith citation directly into an active Study Note | Med | `quran_ar_light_1280.png`, `sunnah_ar_light_1280.png` | U11 (KEY-305) |

### 6.8 Research, Roadmap and Curriculum

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Lectures/Research and Pathways are disconnected views; "combine [Research - Roadmap - Curriculum]" from FigJam sketch is not realized | High | `research_ar_light_1280.png`, `pathways_ar_light_1280.png`, `library-sketches.png` | U12 (KEY-306) |
| Research workspace lacks integrated resource binder linking books, notes, and citations to research topics | Med | `research_ar_light_1280.png` | U12 (KEY-306) |
| Pathways curriculum steps lack inline progress tracking and direct resource launching from the card | Med | `pathways_ar_light_1280.png` | U12 (KEY-306) |

### 6.9 Settings and First-Run

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Settings lacks a searchable single-page master directory; links to separate modals instead | Med | `settings_ar_light_1280.png`, `settings_en_dark_1280.png` | U13 (KEY-307) |
| Missing an onboarding/first-run walkthrough (language, theme, library root folder, corpus pack selection) | Med | `settings_ar_light_1280.png` | U13 (KEY-307) |
| No dedicated About and Support page providing versioning, local data statistics, and developer diagnostics | Low | `settings_ar_light_1280.png` | U13 (KEY-307) |

### 6.10 Design Tokens, Polish and Accessibility

| Gap | Severity | Evidence | Fixed by |
|---|---|---|---|
| Inconsistent button shapes, padding, borders, and hover states across views (ribbon vs topbar vs modals) | High | `library_grid_ar_light_1280.png`, `notes_overview_ar_light_1280.png` | U2 (KEY-296) |
| Modals lack universal keyboard focus trapping (`Tab` escapes in some dialogs) and accessible focus rings | High | `book_detail_ar_light_1280.png`, `import_wizard_ar_light_1280.png` | U4 (KEY-298) |
| Missing global keyboard shortcuts sheet (`?`) displaying navigation and reader hotkeys | Med | `command_palette_ar_light_1280.png` | U4 (KEY-298) |
| In dark mode ("Scholar Night"), borders in some panels have excessive contrast or lack subtle slate dividers | Med | `library_grid_ar_dark_1280.png`, `reader_pdf_ar_dark_1280.png` | U14 (KEY-308) |

### 6.11 Not covered by any U-task

The following gaps identified in the audit require backend logic or capabilities outside the existing U-task definitions and should be scheduled as follow-up tasks:
1. **Prayer & Athan Snooze Engine**: Backend timer service in the main process to handle snoozing active prayers, zikr intervals, and wird reminders as requested in `dashboard-wishlist.png`.
2. **Side-by-Side Multi-Tafsir Comparison**: Data fetching and split-column layout for comparing two Tafsir works (e.g. Ibn Kathir and Al-Tabari) for a single Ayah simultaneously.
3. **Physical Book Barcode / ISBN Scanner Integration**: Hardware or camera-based ISBN barcode scanning to instantly fetch metadata when adding a physical book.

## 7. U15 acceptance results (KEY-309)

2026-11-12, Claude Code (Codex queue 4 taken over after Codex's weekly limit).

**How it was run.** `scripts/ux-journeys-live` drives the six journeys through the real UI, one user action per step. It uses the real files from `tests/real-files/`: the Arabic text-layer PDF and the smallest English EPUB, copied into a throwaway profile so that saving marks never touches the originals. Installed Quran, Sunnah and poetry packs are reached through `setupThrowawayCorpus` copies. Every journey runs in Arabic and English, at 1280 and 480 px, in light and dark: 48 runs. Each run records its steps, time, notes and screenshots. Evidence: `.baglib-data/KEY-309-evidence/journeys-NjF0jp/` (result.json and PNGs, including the pdfium render of the saved PDF). A full-page sweep (`scripts/ux-sweep-live`, 20 pages × 8 configurations) also passed 160/160, with no document overflow, no off-screen controls, no raw translation keys and 0 renderer errors (`.baglib-data/ux-sweep-evidence-JqHIn1`).

**What each journey does.**
- J1: import both files; search the Arabic title; filter by topic, then by the English author; open the PDF's menu, choose *Physical copy*, enter a shelf room and save.
- J2: open the PDF, pick the highlighter, select a line, then *Save into the PDF*. The saved file is reopened in a different engine (pdfium, with pikepdf counting the annotations).
- J3: in the EPUB, turn past the cover, select a passage, *Add note*, write and save it. Select the passage again, *Review* to make a card. Then Notes → Cards → *Review due*, choose a confidence, reveal and rate.
- J4: on the dashboard, *Prayer snooze* → *Configure*. Turn on the study rhythm and set a pause time to the current minute, because a real prayer time cannot be waited for and the zikr pause uses the same pause screen. Save, see the pause screen, resume.
- J5: in Quran, ayah menu → *Tafsir*, then Reading options → a second tafsir, and check the text changes. Ayah menu → *New note*, title it and save. In Sunnah, right-click a hadith → *Link to an existing note* → pick that note.
- J6: Pathways → *Templates* → *Use* the first template, then follow its first step.

**Result.** All six journeys complete in every combination: 48 of 48 runs, 0 renderer errors. Steps per journey: J1 13, J2 7, J3 15, J4 7, J5 14, J6 4. The times in the table are the harness's wall-clock times. They include rendering waits but not a person's reading or typing time.

**Fixed in this task** (each under about 20 lines):
1. *Prayer snooze → Configure* did nothing on a default dashboard, because it scrolled to the study-rhythm module, which is hidden by default. It now opens the study-rhythm settings in a dialog when the module is hidden, or scrolls to it and expands it when it is shown (`HomeDashboardView.tsx`, `StudyRhythm.tsx`).
2. Entering a shelf location through *Physical copy* left a digital-only book marked digital, so it never counted as physical. Giving a location now marks a digital-only book as *both* (hybrid); the Holding type select still overrides it (`BookDetailModal.tsx`).
3. The reader's selection boxes for note, quote and question had hardcoded Arabic placeholders and buttons ("إلغاء", "حفظ الملاحظة"…), an English "p." and an Arabic-only citation format. These now use translations in ar and en (`ZenSelectionMenu.tsx`, ten `zen*` keys, guarded by `tests/ui/reader-selection-i18n.test.ts`).
4. Earlier in this task: the Notes editor header, the Library list, the planner month grid and the Quran study panel at 480 px; the Quran study panel no longer opens by itself when the saved reading position is restored; the Library sort tooltips are localized (commits 3a2e6f0, 4cdd66b, 4fbf9ab, 895e0ff).

**Friction recorded, not fixed here.**
- Tafsir comparison means switching the tafsir in Reading options and reading again. There is no side-by-side view; this stays with KEY-170.
- Steps from a pathway template have no linked source, so *Continue* is not offered for them; the first step can only be ticked. Filed as KEY-327 and fixed the same day: the Next-step card now offers *Add a source for this step*, and after a book is picked, *Continue* opens it (J6 re-run in ar-light-1280 and en-dark-480, 7 steps).
- Topic filtering lists the whole taxonomy, while a freshly imported book carries no topic, so filtering by topic finds the new book only after it is classified. Filed as KEY-328.
- The English EPUB's own metadata gives the author as `Leah Cowan;`, with a trailing semicolon. BagLib keeps the stored name as given (canonical names are preserved).
- Importing goes through the native file picker, which a test cannot drive. The harness calls the same import IPC, and that one step is counted as "choose the files".

**Results table.**

| Journey | Language | Width | Theme | Result | Steps | Time (s) | Issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| J1 Import, find, filter, mark physical | ar | 1280 | light | Pass | 13 | 6.3 | — |
| J2 Mark up a PDF, save, reopen elsewhere | ar | 1280 | light | Pass | 7 | 3.6 | — |
| J3 Note from a passage, card, review | ar | 1280 | light | Pass | 15 | 5.7 | — |
| J4 Plan today, snooze for prayer | ar | 1280 | light | Pass | 7 | 1.6 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | ar | 1280 | light | Pass | 14 | 4.3 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | ar | 1280 | light | Pass | 4 | 1.4 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | ar | 480 | light | Pass | 13 | 5.7 | — |
| J2 Mark up a PDF, save, reopen elsewhere | ar | 480 | light | Pass | 7 | 3.5 | — |
| J3 Note from a passage, card, review | ar | 480 | light | Pass | 15 | 5.8 | — |
| J4 Plan today, snooze for prayer | ar | 480 | light | Pass | 7 | 1.6 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | ar | 480 | light | Pass | 14 | 3.9 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | ar | 480 | light | Pass | 4 | 1.2 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | ar | 1280 | dark | Pass | 13 | 5.6 | — |
| J2 Mark up a PDF, save, reopen elsewhere | ar | 1280 | dark | Pass | 7 | 3.5 | — |
| J3 Note from a passage, card, review | ar | 1280 | dark | Pass | 15 | 5.8 | — |
| J4 Plan today, snooze for prayer | ar | 1280 | dark | Pass | 7 | 1.6 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | ar | 1280 | dark | Pass | 14 | 3.9 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | ar | 1280 | dark | Pass | 4 | 1.4 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | ar | 480 | dark | Pass | 13 | 5.6 | — |
| J2 Mark up a PDF, save, reopen elsewhere | ar | 480 | dark | Pass | 7 | 3.3 | — |
| J3 Note from a passage, card, review | ar | 480 | dark | Pass | 15 | 5.7 | — |
| J4 Plan today, snooze for prayer | ar | 480 | dark | Pass | 7 | 1.5 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | ar | 480 | dark | Pass | 14 | 3.8 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | ar | 480 | dark | Pass | 4 | 1.2 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | en | 1280 | light | Pass | 13 | 5.6 | — |
| J2 Mark up a PDF, save, reopen elsewhere | en | 1280 | light | Pass | 7 | 3.4 | — |
| J3 Note from a passage, card, review | en | 1280 | light | Pass | 15 | 5.8 | — |
| J4 Plan today, snooze for prayer | en | 1280 | light | Pass | 7 | 1.6 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | en | 1280 | light | Pass | 14 | 3.8 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | en | 1280 | light | Pass | 4 | 1.2 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | en | 480 | light | Pass | 13 | 5.5 | — |
| J2 Mark up a PDF, save, reopen elsewhere | en | 480 | light | Pass | 7 | 3.3 | — |
| J3 Note from a passage, card, review | en | 480 | light | Pass | 15 | 5.7 | — |
| J4 Plan today, snooze for prayer | en | 480 | light | Pass | 7 | 1.5 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | en | 480 | light | Pass | 14 | 3.8 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | en | 480 | light | Pass | 4 | 1.2 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | en | 1280 | dark | Pass | 13 | 5.6 | — |
| J2 Mark up a PDF, save, reopen elsewhere | en | 1280 | dark | Pass | 7 | 3.5 | — |
| J3 Note from a passage, card, review | en | 1280 | dark | Pass | 15 | 5.7 | — |
| J4 Plan today, snooze for prayer | en | 1280 | dark | Pass | 7 | 1.6 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | en | 1280 | dark | Pass | 14 | 3.9 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | en | 1280 | dark | Pass | 4 | 1.2 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |
| J1 Import, find, filter, mark physical | en | 480 | dark | Pass | 13 | 5.5 | — |
| J2 Mark up a PDF, save, reopen elsewhere | en | 480 | dark | Pass | 7 | 3.3 | — |
| J3 Note from a passage, card, review | en | 480 | dark | Pass | 15 | 5.8 | — |
| J4 Plan today, snooze for prayer | en | 480 | dark | Pass | 7 | 1.6 | — |
| J5 Ayah and hadith, compare tafsir, link to a note | en | 480 | dark | Pass | 14 | 3.8 | Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170). |
| J6 Curriculum from a template, first step | en | 480 | dark | Pass | 4 | 1.2 | The template steps have no linked source, so "Continue" is not offered; the first step can only be ticked. |

48 of 48 journey runs passed; 0 renderer errors.

## 8. Follow-ups collected for U14 (KEY-308)

- KEY-297: the "+" in New Object appears twice (once as the icon, once in the text).
- KEY-299: the en 480 library evidence shows the drawer. Re-check the single-column grid at 480.
- KEY-302: exam entries show raw curriculum UUIDs instead of names. "1 tasks" needs plural forms in ar and en. Check the default module order on a fresh profile.
- KEY-296: one harness screenshot was named for the wrong language.
- KEY-315: the side-note edge tip sits close to the reader panel. Check that it never overlaps the panel's edge controls.
- KEY-313: the poem page's top toolbar is still a long row of text buttons. Group copy, share and recitation into icons or a settings popover, matching the KEY-305 shared header.
- KEY-316: every library-card menu item shows the same placeholder ⓘ icon. Give each action its own icon, as the hadith menu already does.
- KEY-316: in the reader, the floating selection toolbar and the right-click menu can be open together. Opening one should close the other.
- KEY-305: the mushaf page renders small, with wide empty margins at 1280 px. Consider a fit-to-height default zoom.
- KEY-306: the display font (`font-display`) squeezes word spaces in Arabic headings, for example «لا ملاحظات ولا روابط» and «لا توجد مسارات بعد». The text is correct. Fix the font stack or the letter and word spacing for Arabic headings app-wide.
- KEY-306: the "Draft with AI" button is cramped beside the subject field in the Pathways customize panel.

**Status at 23:20 on 2026-11-10 (Claude, KEY-308 parts 1–3):**
- **Fixed (8ecde07):**
  - New Object's double "+";
  - card menu icons;
  - placeholder icons on every context surface;
  - the selection toolbar and menu overlap;
  - Arabic display-heading word spacing;
  - the exam UUID;
  - "1 tasks";
  - the cramped AI draft row.
- **Fixed (9ff9739):** the mushaf gutters, so the page renders larger.
- **Already done by KEY-305:** the poetry toolbar is grouped into the shared header and settings popover.
- **Fixed (part 3):**
  - 18 uses of `inset-inline-start-N` / `inset-inline-end-N`, which Tailwind never generated, now use `start-N` / `end-N`. Those drawers, search icons and corner hotspots had no horizontal position.
  - The remaining physical classes became logical where direction matters.
- **Fixed in part 5 (e6fd4b2), found in part 3:** when the reader's reading panel is open on the PDF workstation, the end of the reader header is hidden in ar (left end) and en (right end). The hidden controls are save, full screen and ⋯.
  - **Diagnosis so far:** the band is exactly the panel's width and spans y 0–56 at the end edge. `ReaderSidePanel`'s `<aside>` itself starts at `top-14`, so the cover is another element, or the header is narrowed to the viewport minus the panel and overflows (`flex-nowrap`, no overflow handling).
  - **Next step:** probe in a live run with `document.elementFromPoint` at the header's end while the panel is open.
  - **Fix options:** reserve the panel width in the header and let its middle group shrink, or move the overflowing items into ⋯.
  - Evidence: `.baglib-data/KEY-303-evidence/2026-11-10T21-18-05-176Z/pdf-{ar-ar,en-en}-dark-1280-panel.png`. The same appears in the 12:08 run, so it is not a part 3 regression.
- **Closed on 2026-11-11 (KEY-308 is Done):**
  - plural forms (c377c11);
  - the reader header with the panel open (e6fd4b2);
  - dashboard containers and a contrast probe over 10 areas in both themes, with dark clean and 4 light failures fixed (7d64902);
  - the side-note tip guard (c4560a3);
  - 38 hard-coded strings (a7a2e3b);
  - the Arabic type floor (d661a8f);
  - the motion set, whose entry classes had never been defined (62f489f);
  - all 10 ui-live scripts passing (ab78379).
  - The Zen drawers were checked by reading the code and through reader-chrome-live.

**Update at 18:00 on 2026-11-11 (Claude):**
- KEY-298 is Done (e465ac1; 576/576 accessibility checks).
- KEY-44 is Done, including the bulk shelf action (73a68b2).
- KEY-312 now ships two licensed recorded adhans with a sound picker (25ecd99). Dhikr times and the notification service are still open.
- KEY-234: confidence is required before Reveal (ba4ecfb).
- KEY-239 is Done after a live reading-progress check.
- KEY-300 started on Codex at 17:54.

**Program status at 14:00 on 2026-11-11 (Claude):**
- **Done:** KEY-295 to KEY-297, KEY-299, KEY-301 to KEY-308, KEY-310, KEY-311 and KEY-313 to KEY-316.
- **In progress:**
  - KEY-298: part 1 is b36ce02; Codex is on part 2, which also includes KEY-44's selection accessibility fixes.
  - KEY-312: research done (see the adhan recordings note); downloads wait for the user.
- **To do:**
  - KEY-300 (book detail and import), next for Codex; its brief carries the library i18n debt and Arabic plurals.
  - KEY-309 (the acceptance run); its Jira comment collects the inputs from the In Review pass.
  - KEY-317 (older live scripts).
  - KEY-318 (ayah-range decks).

## 9. Added on 2026-11-10 at the user's request: U16 (KEY-310)

The user said the library is too cluttered, and asked for three changes:
1. The library header and ribbon hide when you scroll down and come back when you scroll up.
2. The side menu works as **pin-or-peek**, like Codex, Antigravity and Claude Code. A menu button pins it or unpins it. While it is unpinned, hovering over the edge shows it as an overlay.
3. One simple search with sorting, plus an "Advanced filters" panel that keeps every existing filter.

## 10. Added on 2026-11-10 at the user's request: U17–U23 (KEY-311 to KEY-316)

| U | Key | What the user asked for |
|---|---|---|
| U17 | KEY-311 | The dashboard keeps only the essential stats (at most 4 tiles). A separate Statistics view has rich visuals. |
| U18 | KEY-312 | Settings for the adhan, prayer and dhikr. A real notification system. Muezzin adhan recordings: research first, and **download only after the user approves**. |
| U19 | KEY-313 | Al-Bayan poems laid out as centred, aligned hemistichs, with compact actions on hover or right-click. |
| U20 | KEY-314 | The reader's tools/edit panel redesigned, with an icon and a one-line explanation for each tool. |
| U21 | KEY-315 | Themed, rounded scrollbars across the app. The side-note tab collapses to a small edge tip. |
| U22 | KEY-305 (comment) | The controls around the Quran reader feel off: one calm header, an action menu, and a tabbed panel. |
| U23 | KEY-316 | Context-aware right-click menus everywhere, plus a single shortcut registry (taken over from KEY-298). |

## U17 implementation checkpoint — KEY-311, Codex, 2026-11-10

Fresh dashboard defaults enable Today, calendar and prayer times. Four compact summary tiles show the current reading streak, reading minutes over the latest seven civil days, books currently being read and cards due. The dashboard link and the Home navigation group open the Statistics workspace. Existing `dashboard.layout.v1` rows retain their module order and visibility. All ten original modules remain available in Customize.

The workspace has Reading, Books, Knowledge, Study and Quran sections. Token-based handwritten SVG bars, an area chart, a weekday-aligned heatmap, subject donut and progress rings include text summaries and expandable series values. Arabic uses explicit Arabic-Indic digits and Saturday-first weekday rows. English uses Latin digits and Sunday-first rows. Time axes mirror in RTL. Progress fractions use localized words to keep their meaning clear in mixed-script layouts.

The read-only `statistics:workspace` IPC projection is implemented in `src/main/services/statistics/workspace-statistics.service.ts`. It reads `reading_page_stat`, `knowledge`, `srs_review_log`, `srs_state`, `work`, `category` and the existing `reading.log.completed:*` settings. Existing pathway/exam APIs and the khatmah/wird APIs supply the other sections. Current book counts exclude trash. No schema, dependency, download or canonical-text change was introduced.

Date controls use rolling seven-day, thirty-day and 365-day windows, plus all recorded history. Dated reading, creation, reviews, completions and khatmah page events follow the selected window. Current book/subject/pathway/khatmah/wird snapshots and the forward seven-day review schedule are explicitly labelled separately. Long bar series aggregate chronological buckets. The heatmap displays the latest 366 days and explains that limit when applicable.

Data limitations are explicit. Older completed books can lack a recorded completion date. Historical in-progress status transitions are unavailable, so the view pairs the current count with dated book-reading activity in book-reading days. SRS recall success is the observed share of Hard/Good/Easy ratings, while the forecast uses current due dates and includes overdue cards today. Reading, step completion and memorization remain separate measures. No independent memorized-ayah total is supplied by the inspected APIs.

Fourteen new tests cover defaults and saved layout preservation, timeline ranges, gaps, duplicates and future exclusion, aggregation, ring/donut bounds, forecast, countdowns, weekday placement, area mirroring, read-only SQL behavior, legacy completions and trash exclusion. Native evidence and the publication gate are recorded in the local `docs/agent-ops/reports/KEY-311.md`. Reviewer-authorized updates align the three older dashboard/navigation test files with the new defaults while preserving all optional-module behavior assertions. The combined focused and updated tests pass 28/28. Scoped eslint and diff checks pass. Unfinished KEY-304 failures are recorded separately and explicitly excluded from this publication.

## U20 implementation — KEY-314, Codex continuing Antigravity, 2026-11-10

The PDF tools directory now has seven icon-led sections with localized descriptions and result hints. Search covers names, descriptions and section titles in English and normalized Arabic. Disabled rows explain their blocker and remain keyboard-readable. Shared buttons, chips, subtool tabs and semantic color tokens connect the options forms to the rest of BagLib.

OCR actions, engine choice, page layout, uncertain-word review and bounding-box controls live in OCR & text. A keyboard-accessible header chip opens and focuses that section. It reports text-layer detection, no text, running/progress and completion with measured confidence. Narrow screens use a compact visible icon with a screen-reader label. The duplicate floating OCR/navigation bars are removed, and unique reading/navigation commands are in header overflow. The touch reveal handle is at the top.

Evidence is produced by `scripts/reader-tools-live/` using the real Arabic and English text PDFs and the image-only Arabic PDF. The scanned document alone receives single-page OCR, with JSON output kept separately. New catalogue/chip tests are in `tests/ui/pdf-tool-catalogue.test.ts`. Final verification results are recorded in the KEY-314 handoff. Antigravity supplied the initial uncommitted implementation, and Codex continued and verified it.
