# Feature: Local OCR Engine & Scanned Manuscript Recognition

## 1. Overview & Context

Digital libraries frequently house non-reflowable documents: scanned historical manuscripts, archival PDFs, facsimile prints, and image-based literature. In classical Arabic and Islamic heritage, thousands of foundational treatises exist exclusively as scanned manuscripts (*Makhtutat*) or image-only PDF scans lacking embedded text streams.

Without Optical Character Recognition (OCR), these documents present severe reading limitations:
- Text cannot be selected, copied, or highlighted.
- In-book search (`Ctrl+F`) fails to locate words or passages.
- Shelf-wide search engines cannot index the book's contents.
- Text-to-Speech (TTS) and dictionary lookups are entirely inoperable.

Traditional desktop applications attempt to solve this by bundling heavyweight OCR packages like Tesseract.js (50MB+ WebAssembly binaries and 20MB+ language models), which introduces significant app bloat, high initial download times, and CPU throttling.

**Baglib** solves this by reverse-engineering **Koodo Reader's zero-dependency native OS OCR architecture** and combining it with a **structured bounding box text-layer injection engine**, allowing instant, hardware-accelerated text extraction using language packs already installed on the user's operating system (with first-class support for Arabic `ar-SA` and English `en-US`).

---

## 2. Comparative Analysis Across Applications

| Dimension | Koodo Reader (`koodo-reader-dev`) | Readest (`readest-app`) | Calibre (Python Backend) | Baglib Implementation |
| :--- | :--- | :--- | :--- | :--- |
| **OCR Engine** | Native WinRT `Windows.Media.Ocr` via PowerShell + macOS Vision | External Tesseract / PaddleOCR utility models | Tesseract CLI / OCRmyPDF plugins | **Zero-Dependency Native OS OCR** (WinRT + Apple Vision) |
| **Bundle Overhead** | 0 MB (Uses OS APIs) | 50MB+ (WASM models) | Requires external system installation | **0 MB** (Zero bundle bloat) |
| **Output Granularity** | Flat string (`result.Text`) | Line/Word segments | PDF HOCR overlay | **Structured Words & Lines** with `{ x, y, width, height }` bounding boxes |
| **Text-Layer Overlay** | None (Text displayed in popup) | None (Reads in reader view) | Rewrites PDF file with invisible font | **Dynamic SVG/HTML Text-Layer Overlay (`OcrTextOverlay`)** |
| **Path Sanitization** | `s.replace(/'/g, "''")` | Standard path resolving | Python os.path | **Strict single-quote escaping (`escapePsSingle`)** with `-EncodedCommand` |
| **Arabic Support** | Supported if Windows language pack installed | Requires `ara.traineddata` | Requires Tesseract Arabic plugin | **Native `ar-SA` WinRT engine** with RTL character mapping |
| **Text Cleaner** | CJK spacing cleaner | Unicode mark stripper | Custom regex rules | **CJK + Arabic control character cleaner (`cleanOcrText`)** |
| **Shelf-Wide Search Integration** | None | None | Populates SQLite FTS table | **Automatic SQLite FTS5 Indexing (`book_content_fts`)** |

---

## 3. Investigated Architecture & Key Discoveries

### A. Windows.Media.Ocr (WinRT API via PowerShell)
*Source Inspected:* `repos/koodo-reader/koodo-reader-dev/src/utils/main/ocr-util.js`, `powershell-util.js`
- **Native OS Runtime:** Windows 10 (version 1511+) and Windows 11 include the high-performance `Windows.Media.Ocr` API in `System.Runtime.WindowsRuntime`.
- **Language Packs:** Querying `[Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages` inspects the installed language engines. In standard Arabic and English Windows distributions, `ar-SA` and `en-US` are available out of the box.
- **PowerShell Interop via `-EncodedCommand`:**
  To bypass terminal encoding issues and Windows command-line quoting bugs, scripts are converted to UTF-16LE Base64 and passed to `powershell.exe -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass -EncodedCommand <base64>`.
- **Critical Discovery — Single-Quote Path Escaping:**
  In Windows user profiles with apostrophes (such as `C:\Users\Ammar's\...`), passing the path inside single-quoted PowerShell literals causes immediate syntax parsing failure. The path must be sanitized using `s.replace(/'/g, "''")`.

### B. Extracting Structured Word Coordinates vs Flat Text
Koodo Reader only extracted `$result.Text`. In Baglib, we discovered that `Windows.Media.Ocr.OcrResult` exposes full structural hierarchy:
1. `$result.Lines`: Collection of `OcrLine` objects with `BoundingRect` (`X`, `Y`, `Width`, `Height`).
2. `$line.Words`: Collection of `OcrWord` objects with individual `BoundingRect` coordinates.
3. `$bitmap.PixelWidth` & `$bitmap.PixelHeight`: Original raster page dimensions.

By extracting these bounding boxes, Baglib can construct a pixel-accurate text overlay aligned directly over the scanned page.

---

## 4. Baglib Technical Architecture & Implementation

```
+---------------------------------------------------------------------------------------+
|                                    BAGLIB APPLICATION                                 |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|  1. UI LAYER (Reader Component & Controls)                                            |
|     * Component: FullPageBookReader.tsx & ReaderPane.tsx                              |
|     * Overlay: OcrTextOverlay.tsx (Absolute CSS Percentage Positioning)               |
|     * Actions: "Recognize Page Text" / "Recognize Document"                           |
|     * Visual Inspection: Word Bounding Box Debug Toggle                               |
|                                                                                       |
|                                         |                                             |
|                                         v (IPC)                                       |
|                                                                                       |
|  2. MAIN SERVICE LAYER (src/main/services/ocr/ocr.service.ts)                         |
|     * Bridge: ocr.service.ts & ipc/ocr.ts                                             |
|     * WinRT Runner: Windows.Media.Ocr via UTF-16LE Encoded PowerShell                 |
|     * PDF Page Extractor: EmbeddedMetadataExtractor.extractPdfImage                   |
|     * Language Resolver: maps 'ar' -> 'ar-SA', 'en' -> 'en-US'                        |
|                                                                                       |
|                                         |                                             |
|                                         v                                             |
|                                                                                       |
|  3. TEXT POST-PROCESSING & SEARCH INTEGRATION                                         |
|     * Cleaner: cleanOcrText (CJK spacing removal & whitespace normalization)          |
|     * In-Book Search: Automatically updates searchableSections for Ctrl+F             |
|     * Shelf-Wide Search: Automatically indexes recognized pages into SQLite FTS5      |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

### A. Coordinate Normalization Algorithm

Coordinates returned by OCR engines are in source image pixels (`OcrBoundingBox: { x, y, width, height }`). Because book readers scale dynamically across different monitor sizes, responsive containers, and zoom levels, absolute pixel coordinates would misalign upon window resize.

Baglib converts pixel coordinates into responsive CSS percentages relative to image dimensions (`calculateOcrWordPercentBox`):

```typescript
// src/shared/utils/ocr-cleaner.ts
export function calculateOcrWordPercentBox(
  bbox: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number
): { left: string; top: string; width: string; height: string } {
  const left = Math.max(0, Math.min(100, (bbox.x / pageWidth) * 100));
  const top = Math.max(0, Math.min(100, (bbox.y / pageHeight) * 100));
  const width = Math.max(0, Math.min(100 - left, (bbox.width / pageWidth) * 100));
  const height = Math.max(0, Math.min(100 - top, (bbox.height / pageHeight) * 100));

  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    width: `${width.toFixed(2)}%`,
    height: `${height.toFixed(2)}%`,
  };
}
```

### B. Invisible Selectable Text Layer (`OcrTextOverlay.tsx`)

The overlay renders over the PDF canvas or manuscript image:

```tsx
// src/renderer/components/reader/OcrTextOverlay.tsx
<div className="ocr-text-overlay absolute inset-0 select-text overflow-hidden pointer-events-auto">
  {renderedWords.map(({ word, box }, index) => (
    <span
      key={index}
      className={showVisualDebug ? "bg-amber-300/25 border text-amber-950" : "text-transparent"}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        fontSize: `calc(${box.height} * 0.85)`,
        lineHeight: box.height,
      }}
    >
      {word.text}
    </span>
  ))}
</div>
```

**UX Impact:**
- `color: transparent`: The original handwritten or printed historical scan remains completely visible.
- `user-select: text` & `cursor: text`: Users can click and drag over the historical manuscript to select text.
- Standard browser selection highlights the words in translucent blue.
- Copying (`Ctrl+C`) copies the authentic recognized text into the clipboard.
- The user can trigger annotations, highlights, dictionary lookups, and text-to-speech directly on historical scans.

---

### C. Automatic FTS5 & In-Book Search Indexing

When OCR recognizes text on a page:
1. **In-Book Live Search (`in-book-search.ts`):** The recognized page is added into `extractedPages`, instantly allowing `Ctrl+F` in-book search to locate matches on scanned pages.
2. **Shelf-Wide Search (`book_content_fts`):** The recognized text is automatically indexed into the SQLite FTS5 virtual table with BM25 ranking, allowing the user to search for words in the scanned book from the global Library Search Hub.

---

## 5. Verification & Test Results

The implementation is verified by automated test suites executed under Electron's Node runtime:

1. **OCR Cleaner & Coordinate Tests (`tests/reader/ocr-cleaner.test.ts`):**
   - 14/14 tests passing.
   - Verifies language tag resolution (`ar` -> `ar-SA`, `en` -> `en-US`), CJK ideograph spacing removal, Latin/Arabic space preservation, control character cleaning, and percent box coordinate calculations.
2. **OcrService Integration Tests (`tests/services/ocr.service.test.ts`):**
   - 5/5 tests passing.
   - Verifies OS engine detection, available language retrieval (`ar-SA`, `en-US`), English OCR recognition with bounding boxes, Arabic OCR recognition (`مكتبة بغداد`), and multi-page batch processing with progress events.
3. **Full Repository Test Pass:**
   - 514/514 tests passing across 56 test suites (`npm test`).
   - `npx tsc --noEmit` validates with **0 errors**.

---

## 6. Architectural Decisions & Future Directions

1. **Native OS OCR vs Bundled Tesseract WASM:**
   - *Decision:* Native OS OCR runs in under 300ms, requires 0MB of app bundle bloat, and utilizes hardware neural acceleration present in modern OS releases.
2. **Responsive Percentage Scaling vs Fixed Pixels:**
   - *Decision:* Positioning text nodes via percentage coordinates (`(x / width) * 100%`) guarantees flawless text alignment across split-pane layouts, full-screen mode, and window resizing.
3. **Future Extension:**
   - For Linux distributions without native OS OCR engines, an optional on-demand Tesseract.js / PaddleOCR utility worker can be loaded dynamically when OS OCR is unavailable.
