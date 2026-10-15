# Reverse-Engineered Feature: Extract ISBN (Calibre Plugin)

## 1. Tool Overview & Investigation Scope

- **Tool Name**: Extract ISBN Calibre Plugin
- **Author**: Grant Drake (KiwiDude)
- **Source Inspected**: `repos/extract_isbn/`
  - `scan.py` (Core Regex, Normalization, and Checksum Validation)
  - `pdf.py` (PDF Page Budgeting & Two-Pass Scanning)
  - `nonpdf.py` (EPUB Spine Manifest Iteration)
- **Date Investigated**: October 2026
- **Purpose for Baglib**: Automatically discover, extract, and populate book ISBN identifiers from internal file content (PDF/EPUB/TXT/HTML) when internal document header tags (`/Info`, XMP, `dc:identifier`) or filenames lack an ISBN.

---

## 2. Core Architecture & Reverse-Engineered Patterns

### 2.1 Text Scanner & Regex (`scan.py`)
1. **HTML & Tag Stripping**:
   - Strips `<style>` and `<script>` blocks completely.
   - Replaces HTML tags `<[^>]+>` with delimiter boundaries (`!`) rather than empty strings, ensuring adjacent numbers across tags (e.g. table cells or `<span>` blocks) do not concatenate into false-positive 10- or 13-digit numbers.
2. **Unicode Normalization & Unwrapping**:
   - Normalizes non-standard Unicode dashes (en-dash `\u2013`, em-dash `\u2014`, soft hyphen `\u00ad`, horizontal bar `\u2015`) to ASCII hyphens.
   - Unwraps multiline breaks within numbers (e.g., `978-\n0-13-235088-4` and `978\n0132350884`) frequently created by PDF text column wrapping.
3. **Regex Pattern & Prefix Artifact Stripping**:
   - `RE_ISBN = re.compile(u'\\s*([0-9\\-\\.–­―—\\^ ]{9,22}[0-9xX])', re.UNICODE)`
   - Strips `-10 ` and `-13 ` leading artifact prefixes if matched from `ISBN-10 xxx` or `ISBN-13 xxx`.
4. **Validation Pipeline**:
   - Rejects repeating dummy digits: `re.match(r'(\d)\1{9,12}$', txt)` (e.g., `0000000000`, `1111111111111`).
   - Length 10 digits: Modulo 11 checksum validation. Automatically calculates derived ISBN-13 (`978` + 9 digits + Modulo 10 check digit).
   - Length 13 digits: Bookland prefix check (`978`, `979`, `977`) + Modulo 10 checksum validation.
   - **Priority**: ISBN-13 is strongly prioritized over ISBN-10.

### 2.2 PDF Page Budgeting (`pdf.py`)
- Scanning multi-hundred-page textbooks end-to-end is slow and increases false-positive risk.
- **Budgeting**:
  - `FRONT_PAGES = 10`
  - `BACK_PAGES = 5`
- Scans the first 10 pages forward (where title, verso, and Library of Congress / Cataloging-in-Publication data are printed).
- If no ISBN is found, scans the last 5 pages backwards (where colophons and back matter appear).

### 2.3 EPUB Spine Manifest Iteration (`nonpdf.py`)
- Iterates OPF manifest spine items according to publication structure:
  - First few files in spine (cover, half-title, title, copyright verso).
  - Last few files in reverse (colophon, back matter).
  - Middle content files only if needed.

---

## 3. Baglib Adaptation & Bilingual Enhancements

Baglib adapts these techniques in `src/main/services/metadata/text-isbn-scanner.service.ts` with the following enhancements:

1. **First-Class Bilingual Arabic Support**:
   - Regex matches English labels (`ISBN`, `ISBN-10`, `ISBN-13`) and Arabic labels:
     - `ردمك` (RDMK)
     - `ر.د.م.ك`
     - `الترقيم الدولي`
     - `الرقم الدولي` / `الرقم الدولي المعياري`
   - Normalizes Eastern Arabic numerals (`٠١٢٣٤٥٦٧٨٩`) and Persian numerals (`۰۱۲۳۴۵۶۷۸۹`) to standard Latin digits (`0-9`), enabling automatic ISBN detection in Arabic publications.
   - Supports Egyptian and North African serial publication prefix `977` alongside standard `978` and `979`.
2. **Buffer Slab Isolation**:
   - In Node.js, `pdf-parse` can encounter memory issues if buffer pool slabs are shared across parsing instances. Baglib passes `new Uint8Array(buffer)` to guarantee clean memory isolation.
3. **Pipeline Integration**:
   - Wired directly into:
     - `EmbeddedMetadataExtractor` (`src/main/services/metadata/embedded-metadata.extractor.ts`): Fallback for both PDF and EPUB during offline file inspection.
     - `EbookMetadataExtractorService` (`src/main/services/digital/ebook-metadata-extractor.service.ts`): Fallback for PDF, EPUB, TXT, and HTML.
     - `BibliographicMetadataService` (`src/main/services/metadata/bibliographic-metadata.service.ts`): In `discoverBook`, automatically populates `isbn`, `isbn10`, `isbn13`, and `provenance.isbnDiscovered`.
     - `BookDetailModal` & `LibraryGridView`: Automatically maps `discovery.isbn` into the form state and book entity upon file selection or drop.
