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

(The U15 implementer fills this in.)
