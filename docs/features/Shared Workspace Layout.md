# Shared workspace layout

## Scope — 2026-11-06, Codex

This pass improves the shell shared by BagLib workspaces, not the content layout of every individual reader or tool. It does not alter storage, source text, save behavior, or dependencies. Existing unfinished PDF and notes changes are preserved.

## Navigation and connections

- Daily study: Dashboard, Planner, Pathways.
- Reading sources: Quran, Sunnah, Al-Bayan, Library, Lectures, Categories, and the active Reader. Quran remains above Sunnah.
- Research and knowledge: Notes and Search.
- Settings stays outside the scrolling navigation so it remains reachable on short windows.
- The active-book card returns to the open reader through the existing workspace state; it does not reopen a file or reset its position.
- The brand opens Dashboard. Footer notes open Notes; the search and focus shortcuts are also clickable.

The shell uses existing navigation handlers rather than introducing separate routing or another selection state. Existing unsaved-change behavior remains unchanged; this work does not certify that behavior.

## Visual and accessibility behavior

- Quiet active-item background and border, explicit `aria-current`, and keyboard focus indicators.
- Three labeled navigation regions, localized in Arabic and English.
- Sidebar uses a bounded scrolling region and a pinned settings row; narrow windows retain icon navigation.
- Current book title and author keep original text and use automatic text direction.
- Header search contracts without forcing its shortcut badge past the viewport. Footer secondary text hides at small widths.
- Logical borders/alignment, mirrored collapse arrows, localized counts, relaxed text line height, and reduced-motion sidebar transition.
- Arabic dashboard and active-reading headings use the readable UI font instead of the tightly packed display face, with additional line height.

## Verification

The repeatable real-Electron check is `scripts/layout-live/main.cjs`. It requires `BAGLIB_DATA_DIR` pointing to a disposable `layout-live-*` directory and a matching `--user-data-dir` argument; never use a real library. It uses the installed main bundle and development renderer. Results and screenshots are written to that disposable directory. Actual results and limitations are recorded in CURRENT_TASK.md.

## Remaining scope

Individual Quran, Sunnah, PDF, library, notes, and planner content panels have not been comprehensively redesigned by this pass. The active-book shortcut has a component regression check for preserving the book and page; live shell checks do not verify actual PDF reloading. Cross-workspace history/back navigation and new window-management behavior are not introduced.
