# PyMuPDF / MuPDF — local PDF workstation

> [!WARNING] **DEPRECATED & PURGED (2026-10-28)**
> PyMuPDF has been 100% purged from Baglib (zero active code, UI, worker, or dependency traces remain). Stirling-PDF v3.2.2 is now the sole primary default PDF engine across the application. The notes below are preserved solely for historical reverse-engineering and research reference.

Investigated and exercised 2026-10-26 using installed PyMuPDF 2.0 / MuPDF 1.28.5. The user explicitly approved the AGPL-compatible local Python toolchain. This records public API documentation and runtime experiments; no external binary reverse engineering or complete source audit is claimed.

Primary references: [page operations](https://pymupdf.readthedocs.io/en/latest/page.html), [licensing](https://pymupdf.io/licensing).

`assets/pdf-editor/engine.py` uses real page parsing, raster previews, `insert_htmlbox` for shaped Arabic/Latin text, image insertion, `insert_pdf` for page plans, and full garbage-collected saves. Text replacement removes the selected original text before inserting the replacement. Fonts and wrapping are reconstructed, not guaranteed identical. Image replacement uses pixel redaction inside the selection; clipping can remove content intersecting the rectangle.

Redaction applies `images=2, graphics=2, text=0`, scrubs attachments/annotations/metadata, and performs a full save with garbage collection. It does not sanitize old source files, backups, screenshots or external indexes. The app invalidates its source's work-level FTS entries on Safe Save. `scripts/verify-pdf-engine.py` independently opens output with pikepdf and checks decoded streams/metadata; it also checks altered image pixels and removal of intersecting vector drawings. These are synthetic fixtures, not a universal forensic certification.

Office export is reconstruction using python-docx, openpyxl and python-pptx, not a proprietary fidelity-preserving conversion SDK. Tables must be detected for XLSX; extracted cell values are stored as strings to prevent formula execution. OCR rasterizes pages before adding text and therefore flattens forms/vectors. Signed sources are guarded using actual signed widgets, not merely the existence of signature fields.

See [workstation comparison and boundaries](feature%20-%20Document%20Workstation.md). Redistribution of engines and the complete application requires applicable licensing/notice review; local approval does not establish distribution compliance or change the project's license automatically.

## Generated Arabic interoperability — 2026-10-27

Independent PDF.js roundtrip testing exposed incorrect extraction from MuPDF's automatic Arabic fallback: presentation forms, incorrect Latin mappings and spaces inserted between individual glyph items. Font probes compared locally available Arial/Times/Tahoma, a disposable Noto Naskh variable font and DejaVu Sans. These were actual synthetic experiments, not audits of those font implementations.

The worker now explicitly wraps generated Arabic runs with bundled DejaVu Sans 2.37 (`assets/pdf-editor/fonts/DejaVuSans.ttf`) and rewrites only freshly inserted font ToUnicode Arabic presentation-form entries to logical Unicode. Existing source font maps/canonical content are unchanged. `inspection.ts` joins glyph items using measured geometry instead of adding spaces indiscriminately. `tests/services/pdf-engine-roundtrip.test.ts` verifies mixed Latin text and exact `البحث العلمي` using independent PDF.js; a generated mixed-script page was visually inspected for shaping/diacritics.

Font source: [official 2.37 release](https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37). Original copyright/license shipped in `assets/pdf-editor/fonts/LICENSE-DejaVu.txt`: Bitstream Vera license with DejaVu changes in the public domain, not OFL. Font bytes are unmodified. This corrects generated-text interoperability, not arbitrary preexisting PDF encoding defects.
