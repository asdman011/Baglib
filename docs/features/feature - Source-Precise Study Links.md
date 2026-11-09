# Source-Precise Study Links

## KEY-279 implementation, 2026-11-09

Study targets accept `book:<workId>@<sourceId>#p=N`. The source and page are independently optional. Existing `book:<workId>` and `book:<workId>#p=N` references retain default-source navigation. Each identifier has the existing 180-character limit and excludes the grammar delimiters. Pages remain positive, at most six decimal digits.

The source is the existing `source.id`, joined through `source.edition_id` and `edition.work_id`. The existing data dictionary sections 1.2–1.4 define that relationship. The implementation uses the existing schema and installed dependencies.

### Source identity and navigation

- `SqliteWorkRepository.mapRowToBookItem` retains the source and edition IDs selected with the file path. A derived `sourceCount` counts sources across all editions, including non-PDF sources, for the existing single-source OCR migration rule.
- `getById(workId, sourceId?)` constrains the source to the requested Work. A missing or foreign source returns null. `library:get-book-source` exposes this read-only lookup through `getBookSource`.
- `navigateStudyReference` uses the named source's BookItem and file path. A missing source opens the existing default BookItem and dispatches a localized notice. That notice expires after eight seconds.
- The reader consumes pending pages for same-Work navigation too. Saved-location requests are cancelled logically when a newer navigation supersedes them.
- The reader remounts its source-specific state when source identity changes. OCR results and workstation sessions follow that source. OCR settings use the real ID through `ocrCorrectionsKey` and `ocrAcceptedKey`. Unknown source counts do not authorize legacy book-key migration.

### Link creation and preservation

`bookStudyTarget` centralizes creation. Reader companion references, selection cards, note completion, the link picker, annotation-derived notes and assistant PDF citations include the available source identity. The assistant citation helper selects the ID from the same database row as the inspected PDF path.

`parseDeepLink` already delegates to `validStudyTarget`, so it accepts the new grammar through the centralized parser. Markdown export already retains the entire study target in `[label](<baglib:target>)`. Regression tests verify export-to-deep-link preservation through the existing one-way Markdown export.

Work-level backlinks aggregate references from all sources. Source-level backlinks retain their source boundary. Canonical titles and text stay as stored.

### Verification scope

Focused regression coverage includes old/new forms, invalid source IDs, encoded deep links, Markdown preservation, note completion, source selection across editions with duplicate basenames, missing-source fallback, derived source counts, OCR settings keys, annotation citations and backlinks.

The native harness is `scripts/study-source-live/`. It copies a real English PDF and a real Arabic PDF from `tests/real-files/` to separate throwaway directories under the same basename, attaches both to one Work across two editions, and opens links through the real app's deep-link dispatcher. Evidence and final results are recorded in the local KEY-279 report. Originals are read only and the throwaway profile is removed.

### Verification results

The KEY-279-only checkout passed TypeScript, ESLint (zero errors, 91 warnings in the initial run), and the main build. Its full suite passed 1,498 tests, with two environment-dependent skips, after the existing local fixtures were connected. The first isolated run identified missing local dictionary/PDF/model fixtures and byte-sensitive license files, which were supplied from this workspace. The final shared-workspace suite passed all 1,508 tests with zero skips.

Native runs verified all four language/width combinations and duplicate filenames. A native-observed Strict Mode effect replay initially overwrote a requested page with the stored Work location. Retaining the consumed request across effect replay fixed it. The committed harness exercises this regression with same-source and cross-source navigation.

The shared workspace's concurrent KEY-272 accessibility work produced TypeScript errors during verification. The exact task-only source patch was type-checked separately against HEAD. The local report records those boundaries and the final screenshot paths.
