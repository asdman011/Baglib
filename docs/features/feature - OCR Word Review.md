# Feature: Review Uncertain OCR Words (Capture Suspects)

## Investigation Findings (Step 0) — 2026-11-09, Antigravity

Investigation for **KEY-275: Reader Task 8.3 (Wave 13.3)**: Stepping through uncertain OCR words ("capture suspects" in Acrobat terminology), viewing word crops beside recognized text, accepting, correcting, or skipping in reading order for Arabic and English.

---

### 1. Verified Engine Findings: Confidence & Bounding Box Availability

#### A. OCRmyPDF / Tesseract 5 (`assets/ocr/ocrmypdf_worker.py`)
- **Per-Word Confidence (`x_wconf`)**: **VERIFIED PRESENT**.
  - Tesseract generates standard hOCR markup containing word elements: `<span class="ocrx_word" id="word_1_1" title="bbox 2090 287 2200 346; x_wconf 93">وكان</span>`.
  - `ocrmypdf_worker.py` parses `x_wconf` from the element's `title` attribute:
    ```python
    if "x_wconf" in fields:
        word["confidence"] = int(fields["x_wconf"][0]) / 100
    ```
  - Real confidence values range from `0.0` to `1.0` (integer `0` to `100` in hOCR).
  - On benchmark page `prose-arial-scan.png` (Arabic):
    - Total words: `148`.
    - Suspect words (confidence `< 0.60`): `5` words (e.g., `أصحابه` conf `0.42`, `النار»` conf `0.33`, `الحياة؛` conf `0.53`, `السيل.` conf `0.16`, `عمرو` conf `0.37`).
    - Every word has `{ x, y, width, height }` bounding boxes matching the raster page image.
  - On English benchmark test:
    - Words also carry real `x_wconf` scores (e.g. `Al` conf `0.60`, `Sli` conf `0.15`, `ales` conf `0.44`).
- **Reading Order Alignment**:
  - Tesseract outputs hOCR lines and words in physical reading order.
  - In Arabic (`ara`), lines proceed from top to bottom, and words within each line are ordered right-to-left (`x` coordinates descending, from right margin to left margin).
  - In English (`eng`), lines proceed top to bottom, and words are left-to-right (`x` coordinates ascending).
  - When reviewing suspects, words follow this natural reading order.

#### B. PaddleOCR-VL-1.6 (`assets/ocr/paddle_vl_worker.py`)
- **Per-Word Confidence**: **VERIFIED ABSENT**.
  - The model is a 0.9B Vision-Language Model (`PaddleOCR-VL-1.6`) executed via HuggingFace `transformers`.
  - The model outputs plain token text strings per cropped row/block; it does not return per-word probabilities or logits.
  - `paddle_vl_worker.py` estimates word bounding boxes proportionally by splitting line text across row slice bounding boxes (`estimate_lines`), but sets no `confidence` field (`word.confidence === undefined`).
- **Review Strategy**:
  - Must use **clearly labelled Heuristic Suspect Detection** (`heuristic: true`), never claiming model confidence.

#### C. Windows WinRT OCR (`Windows.Media.Ocr.OcrEngine`)
- **Per-Word Confidence**: **VERIFIED ABSENT**.
  - Inspected `Windows.Media.Ocr.OcrWord` via PowerShell runtime reflection:
    - Properties exposed: `BoundingRect` (`Windows.Foundation.Rect`), `Text` (`System.String`).
    - No confidence property exists on WinRT's `OcrWord` or `OcrLine`.
- **Review Strategy**:
  - Must use **clearly labelled Heuristic Suspect Detection** (`heuristic: true`).

---

### 2. Heuristic Suspect Detection Strategy (When Confidence is Absent)

When `confidence` is undefined (or for supplementary checks), suspect words are detected via clearly labelled heuristics:
1. **Mixed Scripts**: Tokens containing mixed Latin and Arabic alphabets (e.g., `Bookكتاب` or OCR misread digits mixed with letters).
2. **Outside Expected Character Sets**: Words containing unassigned symbols, broken Unicode replacement marks (`\uFFFD`), or unusual control characters.
3. **Isolated Arabic Fragments**: Standalone Arabic letters or single-letter tokens that are not valid standalone conjunctions/prepositions (valid standalone in Arabic: `و`, `ف`, `ب`, `ل`, `ك`). Isolated letters like `ج`, `س`, `م`, `ة` indicate segmentation or OCR errors.
4. **Dictionary Lookup Absence**: Tokens missing from the local dictionary database (`dictionary:lookup`), with Arabic normalized for search only (strip tashkeel, normalize alefs, while preserving canonical text).

---

### 3. Review Mode & Correction Storage Architecture

1. **Suspect Selection**:
   - Words with `confidence < threshold` (default `0.60`, adjustable).
   - Words flagged by heuristics when confidence is absent.
   - Ordered strictly by page reading order (RTL for Arabic, LTR for English).
2. **Review UI (`OcrInspectorDrawer.tsx`)**:
   - Dedicated "Review Suspects" tab or mode in the inspector.
   - Counter: `Suspect X of Y`.
   - Bounding box crop coordinates to display a zoomed visual snippet of the word image alongside recognized text.
   - Actions: **Accept** (keeps text, advances), **Edit** (modifies word text in OCR text layer), **Skip** (leaves as suspect, advances).
   - Navigation: Next (`Enter` / `j`), Previous (`k`), Accept (`a`), Skip (`s`), respecting typing guards when editing.
3. **Storage & Persistence**:
   - Reuses `window.electronAPI.settings` under `ocr.corrections.v1:<bookId>:<pageNumber>`: `{ [wordIndex: number]: { original: string, corrected: string, accepted?: boolean } }`.
   - No new database tables or columns are introduced.
   - When saving or exporting in workstation, corrections update the page's OCR text layer and FTS index.
   - Follows ADR-012 Safe Save: original PDF remains untouched until user explicitly saves.
