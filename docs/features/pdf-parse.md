# pdf-parse diagnostics investigation

Date: 2026-10-24. Installed package: `pdf-parse@1.1.1`, default bundled PDF.js `v1.10.100`. This investigation concerns metadata extraction, not a replacement of the reader's PDF.js renderer.

## Evidence and coverage

- REA `analyze_javascript_application` inspected the installed package with analysis restricted to `lib/pdf-parse.js`. Summary evidence: `ev_81511be8e7c57a62febe904f94ddf160bb18edb0de7cab778579bf46a122e6cc`; parent: `ev_bd25a1eda1c16ade3cfc5b52195219504202f72e8343c90a6e0b3c5b2088f7e9`. The remaining 41 inventoried files were outside that REA source-analysis scope. Static inspection is not proof of runtime rendering fidelity.
- Direct source inspection of `node_modules/pdf-parse/lib/pdf-parse.js` confirmed the default PDF.js version, `getDocument`, metadata/text extraction, and document destruction on successful parsing.
- Direct inspection of bundled `lib/pdf.js/v1.10.100/build/pdf.worker.js` around line 36487 found the font warning in glyph-code remapping when the next private-use Unicode slot exceeds its range. This is **not** an OS disk-space or RAM-exhaustion message. The code logs and continues; the warning alone does not prove text/glyph correctness.
- In the same file around line 4780, `Parser_makeFilter` logs `Empty "<filter>" stream.` for a zero-length stream and returns `NullStream`. This is a recoverable parser branch, not an exception at that call site.
- Baglib's main entry already filtered these notices, but `metadata-worker.ts` is a separate entry with its own console and did not install that filter. This explains why these messages can appear from background imports after worker isolation.

## Baglib change

`services/digital/pdf-diagnostics.ts` centralizes the existing three-notice policy and is installed in both the main entry and metadata worker. It matches only complete, single-string messages (with optional `Warning:` prefix), unlike the former substring filter. Unrelated warnings, contextual multi-argument diagnostics and **all console errors** remain visible. No PDF file, dependency, schema or renderer behavior is modified.

A log filter does not repair malformed fonts or streams. The user's particular source PDFs were not supplied, so their rendering/searchability and the exact original runtime source cannot be certified from these two log lines alone. If content is missing or the app exits, that separate symptom needs the affected file and actual error/stack trace.

Verification: 12 focused diagnostic/import tests passed, including a bundle of the actual metadata-worker entry that emits both notices, an unrelated message and a console error; only the known notices were filtered. TypeScript, main/preload/worker build, focused new-source ESLint and whitespace checks passed. No actual reproduction using the user's affected PDFs was performed.

See [Built-in Document Reader](feature%20-%20Built-in%20Document%20Reader.md) and [Digital Library Import](feature%20-%20Digital%20Library%20Import%20and%20Deduplication.md).

## PDF cover policy clarification — 2026-10-24

PDF metadata parsing remains in place, but PDF cover generation no longer uses the raw embedded-image helpers. Those helpers remain available to existing OCR consumers; image-resource order is not page order. Automatic covers now render page 1 with the installed modern PDF.js package, and manual choices render pages 1–5. See [PDF.js](PDF.js.md) and [Cover Retrieval](feature%20-%20Cover%20Retrieval.md) for the actual investigation, isolation, tests and limits. The diagnostic-filter-only scope described above applies to that earlier change, not this later cover implementation.
