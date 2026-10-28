# Tesseract — local searchable PDF OCR

Investigated and exercised 2026-10-26. Baglib uses the Tesseract integration compiled into MuPDF through `Pixmap.pdfocr_tobytes`; it does not invoke a separately installed `tesseract.exe`. Arabic and English `tessdata_fast` traineddata were downloaded from the official Tesseract repository.

References: [Tesseract downloads](https://tesseract-ocr.github.io/tessdoc/Downloads.html), [official traineddata](https://github.com/tesseract-ocr/tessdata_fast). Evidence: `assets/pdf-editor/engine.py`, the isolated `.baglib-data/pdf-engine/tessdata` directory, and `scripts/verify-pdf-engine.py`.

Pages are rendered locally at 300 DPI, recognized with `ara+eng`, and assembled into an image-plus-searchable-text PDF. Progress is page-based and cancellation terminates the Python process tree. Raster dimensions are bounded. Output does not preserve editable source vectors/forms.

Verified: engine loads both traineddata files and recognizes the English text on the bilingual raster fixture into a searchable layer. On 2026-10-27 a dense academic Arabic/English raster fixture also produced searchable `البحث` and selectable `Research library`. Sparse large-font Arabic lines failed recognition in an exploratory fixture, including a disposable tessdata_best Arabic probe; the installed runtime remains tessdata_fast. No quantitative Arabic accuracy is asserted. Layout segmentation, page orientation, low-resolution scans and historical Arabic need proofreading. See the separately authored [OCR research comparison](feature%20-%20Local%20OCR%20and%20Scanned%20Manuscript%20Recognition.md); no alternate OCR model was installed as the production engine.

See [Document Workstation](feature%20-%20Document%20Workstation.md). No external OCR source/binary reverse engineering claimed.
