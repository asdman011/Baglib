# Feature: EPUB Markup and Marks List

## Purpose & Architectural Boundaries

This document records the inventory of existing EPUB reader behaviors and the design of study markup tools, Marks list, and undo/redo for reflowable EPUB publications in BagLib.

### Non-Destructive Storage & ADR-012 Safe Save Compliance
Per **ADR-012 (Unified Saving and Emergency Recovery)**:
> *"EPUB and other formats are not written (they are never described as editable)."*

- **EPUB files on disk are strictly read-only.** They are never written to, rewritten, modified, or repackaged when the user annotates, highlights, comments, or bookmarks text.
- The SHA-256 hash of the EPUB file remains **100% byte-identical** before and after all reading and markup sessions.
- All study markup—highlights, underlines, strikethroughs, margin notes, research questions, scholarly quotes, bookmarks, and comment threads—persists exclusively in BagLib's SQLite database via the polymorphic `knowledge` table (`SqliteKnowledgeRepository`) and the `comment` table (`CommentThreadService`).
- Because EPUB files are never written to disk, the "Save" button and write-back save policy are hidden in EPUB mode, replaced by a clear localized indicator: *"Marks are kept in BagLib"* / *"العلامات محفوظة في باجليب"*.

---

## 1. Inventory of Existing EPUB Reader Behaviors

### 1.1 Document Loading & Foliate-js Engine
- BagLib loads EPUBs via `src/renderer/libs/reader/document-loader.ts`.
- Container archives (`.epub` zip files) are unpacked in-memory using `fflate`.
- Section documents and spines are initialized using `foliate-js/epub.js` (`const { EPUB } = await import('foliate-js/epub.js')`).
- Internal resources (stylesheets, embedded images, SVG assets) are mapped to in-memory blob URLs (`blobUrls.set(...)`).

### 1.2 Pagination & Chapter Chunking
- EPUBs are paginated into discrete screen-sized pages using `src/renderer/libs/reader/epub-paginator.ts`.
- `paginateBookSections` breaks long HTML sections into `FormattedPage` chunks:
  - `pageNumber`: 1-indexed overall book page number
  - `sectionIndex`: index into the EPUB spine
  - `sectionId`: manifest ID / href of the chapter section (e.g. `chapter_1.xhtml`)
  - `chapterLabel`: human-readable chapter title resolved from Table of Contents (`toc.ncx` / `nav.xhtml`)
  - `html`: cleanly sanitized section chunk HTML
  - `text`: plain text content of the chunk

### 1.3 Highlighting Mechanics: W3C CSS Highlight API
- Highlighting reflowable text is implemented in `src/renderer/libs/reader/highlight-manager.ts` using the **W3C CSS Custom Highlight API** (`CSS.highlights.set()`).
- Crucial for Arabic typography: does **not** wrap text nodes in intrusive `<span>` elements, completely preventing ligature breakage, letter disconnection, and diacritic (tashkeel) clipping.
- Dynamic style rules (`::highlight(baglib-highlight-amber)`, `::highlight(baglib-underline)`, etc.) are injected into the active document.
- Fallback DOM marks (`<mark class="baglib-highlight ...">`) are applied when DOM click interaction or hover popovers are required.

### 1.4 Knowledge Model Alignment
In BagLib's Work → Edition → Source architecture:
- A work holds study records in `knowledge`:
  - `highlight`: text highlights with style (`highlight`, `underline`, `strike`), color (`amber`, `emerald`, `rose`, `sky`, `violet`), and quoted text.
  - `note`: margin notes, reflections, or pins.
  - `question`: research inquiries attached to text passages.
  - `quote`: scholarly excerpts and citations.
  - `bookmark`: page or chapter bookmarks.
- Each user action produces **exactly one** canonical `knowledge.save` entry (with `actor: 'reader'`).
- Legacy duplicate page notes are skipped.

---

## 2. Location Adapter: PDF vs EPUB

### 2.1 PDF Location Shape
PDF documents have rigid, static coordinate systems:
- Direct page numbers: `"12"`
- Normalized rect JSON:
  ```json
  {
    "page": 12,
    "rects": [{ "x1": 10.5, "y1": 20.2, "x2": 45.0, "y2": 23.5 }],
    "text": "Selected passage",
    "color": "amber",
    "style": "highlight"
  }
  ```
- Shape mark JSON:
  ```json
  {
    "page": 12,
    "shape": "rect",
    "color": "emerald",
    "box": { "x": 10.0, "y": 20.0, "width": 30.0, "height": 15.0 }
  }
  ```

### 2.2 EPUB Location Shape (CFI + Chapter Metadata)
Reflowable text has fluid dimensions that change when the window resizes or font size alters. Therefore, positions must be anchored using **EPUB Canonical Fragment Identifiers (CFI)**:
- Standard CFI string: `epubcfi(/6/4[chapter1]!/4/2/10/1:0,/4/2/10/1:25)`
- Serialized EPUB Location JSON:
  ```json
  {
    "cfi": "epubcfi(/6/4[chapter1]!/4/2/10/1:0,/4/2/10/1:25)",
    "chapter": "Chapter 1: The Foundations",
    "sectionIndex": 0,
    "sectionId": "chapter1.xhtml",
    "page": 3,
    "text": "The selected quotation",
    "color": "amber",
    "style": "highlight"
  }
  ```
- Location Adapter API (`src/shared/epub-marks.ts`):
  - `parseEpubLocation(location)`: extracts CFI, chapter, page, style, and color.
  - `serializeEpubLocation(data)`: safely serializes location into JSON.
  - `extractMarkChapter(item)`: returns chapter title for grouping.
  - `extractMarkPage(item)`: extracts page number for both PDF and EPUB.
  - `groupMarksByChapter(marks)`: groups marks into chapter buckets for EPUB.
  - `groupMarksByPage(marks)`: groups marks into page buckets for PDF.
  - `compareCfi(a, b)`: compares CFIs in document reading sequence.

---

## 3. Marks List Grouping & UI Integration

- **PDF Mode**: Groups by page number (`Page 1`, `Page 2`, ...), sorted by page or newest.
- **EPUB Mode**: Groups by chapter (`Chapter 1: The Foundations`, `Chapter 2: Analysis`, ...), sorted by chapter sequence or newest.
- **Filtering**: Identical across PDF and EPUB:
  - Layer (All, Study, Review)
  - Mark Kind (Highlight, Underline, Strike, Note, Question, Quote, Bookmark, Review)
  - Color (Amber, Emerald, Rose, Sky, Violet)
  - Date (All, Today, Past Week)
  - Status (All, Open, Resolved)
  - Search (normalized Arabic text search + Latin case-insensitive search)
- **Jumping**: Clicking an EPUB mark navigates immediately to its target page and chapter.

---

## 4. Undo / Redo via MarkHistoryService

- Handled by `src/main/services/mark-history.ts` and `src/renderer/libs/reader/reader-shortcuts.ts`.
- `MarkHistoryService` is keyed by `workId`, not file format.
- Every EPUB markup operation calls `saveReaderKnowledge` with `actor: 'reader'`, recording history versions with `entity_type = 'knowledge'`.
- Pressing `Ctrl+Z` (Undo) or `Ctrl+Shift+Z` / `Ctrl+Y` (Redo) walks the history stack and rolls back / re-applies changes.
- Undoing a mark trashes the item in SQLite; redoing restores it. Survives full app restarts.

---

## 5. Reflow & Re-anchoring Guarantee

- When font size changes or the window is resized, screen layout reflows and pagination recalculates.
- Marks do not rely on fragile pixel coordinates.
- CFIs point to exact DOM structural paths (`/4/2/10/1:0`).
- Text ranges are reconstructed and W3C CSS Highlights are refreshed without losing precision.
- Arabic text maintains right-to-left visual flow and diacritic integrity.


## 6. Keyboard and touch access, KEY-291, 2026-11-10

`ZenTopBar.tsx` reveals its existing header on descendant focus and holds it open while focus stays inside. A persistent, centrally localized 44px-high reading-tools button near the bottom of the page pins the header for touch use. The header keeps its existing top position and mouse-hover callbacks. Its transition respects reduced-motion preferences. `aria-controls` and `aria-expanded` connect the button to the header, which stays in the accessibility tree.

`ReaderMarkupBar.tsx` handles Alt+M using physical `KeyM` as well as the Latin key value, including Arabic keyboard layouts. It focuses the first markup button in both the EPUB reader and the native PDF workstation. Inputs, editable content, dialog targets, IME composition and other modifiers are excluded. The shortcut sheet lists the combination. The PDF workstation adds the persistent control when its top ribbon is hidden by page-only mode or explicitly collapsed, reusing its existing pin state and focus-within CSS.

`ZenSelectionMenu.tsx` uses the visible header's measured bottom edge and available viewport height, keeping KEY-280 actions below the wrapped toolbar. Header resize observation updates this spacing at narrow widths. Verification evidence and available real-document coverage are recorded in `docs/agent-ops/reports/KEY-291.md`.

This change follows BagLib's existing reader components. No external application investigation was performed for KEY-291.
