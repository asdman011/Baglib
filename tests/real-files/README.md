# Real test files

Real-world books and media for **live tests**. They have the limits that generated fixtures don't have: real layouts, broken Arabic text layers, image-only scans, huge EPUBs, long or awkward file names and old audio formats. The user set this rule on 2026-11-09: live checks run on these files from now on.

Only this README and `manifest.json` are in git. The files themselves are local only (see `.gitignore`), because they are large and are third-party works.

## Layout

```
tests/real-files/
  pdf/en/text-layer/           English PDFs with a text layer
  pdf/ar/text-layer/           Arabic PDF with a (defective) text layer
  pdf/ar/scanned-image-only/   Arabic scan, images only, no text layer
  epub/en/                     English EPUBs (one large, one small)
  audio/en/<album>/            English audiobook tracks (WMA)
  video/ar/, video/en/         Arabic and English lecture videos (MP4)
  manifest.json                path, size, SHA-256, language, text-layer state, notes
```

`manifest.json` is the source of truth for what each file is and what it is good for testing.

## Rules for every live test (agents and humans)

1. **Use the files directly.** The user keeps backups, so tests may import and open these files in place. Copying them first and checking hashes are not required (decided by the user, 2026-11-09).
   - The BagLib *profile* is still a throwaway one under `.baglib-data/`, never the user's real library.
   - If a test changes a file (for example by saving marks into a PDF), say so in your report. The SHA-256 values in `manifest.json` then no longer match, so the user can restore that file from a backup.
2. **Use both languages.** A live check that touches documents uses at least one Arabic and one English file for its format. Run the UI in Arabic (RTL) and English (LTR) as before.
3. **Don't OCR the scanned PDF unless the test is about OCR.**
   - `pdf/ar/scanned-image-only/` has no text layer on purpose. Non-OCR tests check how BagLib behaves with an image-only PDF: rendering, no text selection, search returning nothing, and the OCR offer.
   - Only OCR tests (for example KEY-275) may run OCR. Write the OCR output to a new file rather than over the scan, so the scan stays image-only for other tests.
   - Never OCR the files that already have a text layer.
4. **Don't "fix" the files.** The Arabic text-layer PDF has Private Use Area glyphs and broken ligatures (for example «االله»). The point is to see how BagLib copes.
5. **Don't commit them.** Never add these files, or copies or outputs made from them, to git. Keep evidence (screenshots, logs) in `.baglib-data/<key>-evidence/`.
6. **Keep paths short.** Watch the Windows 260-character path limit; keep the throwaway profile in a short folder such as `.baglib-data/rf-<id>/`. One EPUB was renamed for this reason; its manifest note explains.
7. **Use small samples when that's enough.** For speed, a test may use a page range or the first tracks of these files.

## Adding files

Put the file in the matching `<format>/<lang>/<state>/` folder, then regenerate `manifest.json` (path, bytes, sha256, lang, kind, textLayer, pages, notes) and commit only the manifest and this README.
