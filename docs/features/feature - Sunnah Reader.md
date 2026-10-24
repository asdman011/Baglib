# Dedicated Sunnah reader

Implemented: 2026-10-24. Research: [LK-Hadith-Corpus](LK-Hadith-Corpus.md), [RQHT paper review](RQHT.md).

## Experience

- **Sunnah** is the first item in the main navigation rail, above Library. The rail follows Baglib's direction setting: right in Arabic RTL, left in English LTR.
- The six collections have their own view, distinct from the library, PDF/EPUB reader, reading sessions and TTS.
- Select collection → numbered Kitab → hadith. A single-hadith view displays one record with section, source grade and expandable Arabic commentary. Previous/next continue across Kitab boundaries within the chosen collection.
- Whole-chapter view shows consecutive hadiths grouped by section. The initial 24 records are followed by automatic incremental append near the end, with an accessible “Show more” fallback.
- Arabic remains in the right column and English in the left, independently of interface language. Chapter headings, section headings, hadith passages and grades are paired at the row level. This is record alignment, not invented word-for-word alignment.
- Translation can be hidden to give Arabic the full width. Text size is adjustable; Arabic uses the existing Amiri reading font with generous line height. The matn is heavier than the isnad, and narrator-like isnad words use `rgb(96, 207, 208)`. Narrator names have no default background; contiguous name words share one subtle hover highlight, stopping at punctuation and transmission terms.
- Chapter-local search accepts Arabic, English and source numbers. Search normalization removes tashkeel/tatweel and folds alef variants without equating `ة` and `ه`. Canonical records are not rewritten.
- Collection, chapter, selected record, reading mode, text size and translation preference persist in local storage. Continuous-scroll pixel position is not persisted.
- No TTS controls, audio generation or book import flow are mounted in this reader.

## Data boundary and setup

The request explicitly establishes Sunnah as a separate form of data. Existing library DBML, data dictionary and ADR-002 were inspected. Work → Edition → Source and the library database remain unchanged. No new dependency was added.

`SunnahAPI` exposes three main-process operations through preload: `catalog`, `chapter`, `importCorpus`. Rendering never reads arbitrary files directly. The import dialog selects a local ZIP. Development builds also discover `repos/Hadith/LK-Hadith-Corpus-master.zip` (and the former `repos/` location) on first opening Sunnah.

The importer uses the existing `fflate` dependency, accepts only the six known collection folders and chapter CSV names, validates all 16 columns, handles CSV quoting/newlines, checks all six collections exist, and applies compressed/uncompressed size limits. ZIP entry paths are never used as filesystem destinations. Invalid imports leave the active catalog intact.

Files live under `<Electron userData>/sunnah/`:

- `catalog.json`: version, source SHA-256, actual record counts and chapter summaries.
- `<archive SHA-256>/<collection>-<chapter>.json`: immutable source records with separate Arabic/English passages and original metadata.

Import writes a staging directory before replacing the active catalog. Reimporting the same archive repairs chapter files. Failed-import staging is removed. Different previously imported archive snapshots are retained; automatic historical-cache pruning is not implemented.

Only the selected chapter crosses IPC; the service retains at most three recently read chapters. Reader request cancellation guards prevent a late chapter response from overwriting a newer selection. Errors and empty fields have localized recovery states.

Packaged applications use **Import LK-Hadith corpus** to provision the same local data. The corpus is not bundled or downloaded; reading is offline after provisioning. Restart the Electron application after updating main/preload code to register the new IPC handlers.

## Source preservation

Source numbers are not unique record keys. IDs use collection/chapter/row to preserve duplicates. Chapter zero is valid. Missing markers become absent values; missing section numbers, translations and grades are not inferred.

Original full text is retained. Isnad annotations are aligned against a display-only normalized prefix with an index map back to the original string; the rendered spans concatenate to the exact full original, including punctuation and diacritics. If alignment fails, the complete original is displayed with a notice. When full text is absent but annotated fields exist, those supplied fields are displayed.

Narrator coloring is a presentation heuristic over an annotated isnad, excluding common transmission terms. It is not an entity recognition dataset, narrator biography, or authentication engine. Corpus provenance and segmentation limitations are available under “About the corpus and its sources”.

The supplied screenshot informed the hierarchy and paired layout only. It is not shipped as an asset and missing screenshot content is not generated.

## Verification

- `npm test -- tests/services/sunnah.test.ts tests/ui/sunnah.test.ts`: ten tests passed for CSV fidelity, missing metadata, duplicate IDs, chapter zero, source-text preservation, conservative Arabic search, transactional import/recovery, both UI languages, translation hiding, safe literal text and key parity.
- Real-archive import independently matched **34,088 rows across 335 chapters and six collections**. A full display audit checked **68,176 passages** with no change to any available original full text. Five Arabic annotations required the unaligned fallback; four Arabic and 239 English passages were absent.
- `node scripts/sunnah-live/run.mjs`: hidden Electron window with the real preload, Sunnah IPC, actual corpus and isolated profile. Verifies all six collections, translation toggling, continuous append, previous/next across chapter boundaries, Arabic search with and without tashkeel, English search, no-match recovery, reading-position restoration and network-free operation. The run finished with zero external network requests and zero renderer console errors.
- Runtime layout checks: Arabic/English × dark/light × 480/768/1280 pixels, with appropriate rail collapse: no tested control overlap, no reader horizontal overflow, aligned paragraph starts and Arabic always on the right. Arabic-dark and English-light screenshots were visually reviewed using the project's locally cached fonts.
- Real-corpus setup in isolated Electron runs took approximately 7–9 seconds on this machine. This is a development-test observation, not a performance guarantee. Subsequent navigation reads cached chapter JSON.
- TypeScript and focused new-source ESLint checks passed. ESLint emits the repository's existing custom Next pages-directory configuration warning.
- The main/preload production build passed. The final combined Sunnah and existing TTS regression run passed all 14 tests. No full renderer production build was performed.

Generated test caches and screenshots live in ignored `.baglib-data/sunnah-live/`. The live fixture contains no mock hadiths; it only stubs unrelated library list handlers. Its external network requests are blocked and counted. Full application end-user acceptance and proofreading every source annotation remain outside these automated checks.

## Deliberate limits

No automated authenticity judgments, Quran cross-links, narrator biographies, corpus-wide semantic search, annotations/bookmarks integrated with the library schema, new database entities or language generation were added. The supplied corpus's missing records/fields and licensing uncertainty are documented in the research report. Git commit, push and Jira completion remain separate approval stages.

## Reader refinements — 2026-10-24

- Missing section titles stay empty, preserving just the supplied section number. Bukhari and Muslim grades are hidden in the reader; source values remain intact.
- Each hadith has Copy and Share buttons with a small, accessible settings icon immediately beside them. English follows the reader translation toggle unless explicitly overridden; isnad and trailing references are included by default. Reset restores these defaults. Share opens the Windows native menu through Electron IPC rather than silently copying; see [Windows Share](Windows-Share.md). Personal notes are never included in exported text.
- Personal comments/reflections are always visible under each record in a two-row, vertically resizable textarea, saved locally by stable corpus record ID. Save failures are shown. These notes are separate from corpus commentary and the library knowledge schema; no cloud sync or library annotation integration is implied.
- The main titlebar has a Sunnah search entry beside the existing library search. Its modal searches all six collections and opens matching records. The reader search offers all collections, the complete selected collection (e.g. all of Bukhari), or the current Kitab/chapter.
- Broader searches are debounced, stop scanning after cancellation, use conservative Arabic normalization, and display at most 200 matches with a refinement notice. This is literal token matching, not semantic search. Chapter search retains the existing continuous-results behavior.
- Additional tests cover full narrator-name grouping, export language/isnad/reference choices, empty numbered headings, and grading suppression. Fourteen focused tests pass, including the supplied Umar chain and always-visible two-row reflections. TypeScript and focused ESLint pass (the existing repository pages-directory warning remains). The Windows DataRequested callback was verified through real Electron IPC; no message was sent to a destination app.

### Reference-off export behavior

As explicitly requested, unchecking **Include reference** now also shortens Arabic exports to `عن ` plus the last identifiable narrator and every following original character. This applies when **Include isnad** remains checked. Unchecking isnad still exports matn only. English retains its existing independent isnad/matn choice; canonical source text and reader display are untouched.

`shortenArabicChain` uses the aligned corpus isnad boundary and the last recognized transmission verb, preserving diacritics and following words. The intentions hadith retains Umar, his honorific, the minbar context and the full matn. This is conservative text segmentation, not verified companion identification: unmatched annotations, absent chains and ambiguous relative names such as `أبيه` retain the original text rather than inventing an identity. Corpus annotations can be inaccurate; exhaustive narrator-identity validation is not claimed.

Final refinement validation: all 14 focused tests, TypeScript, focused ESLint and main/preload build passed. The live reader suite passed Arabic/English, dark/light and 480/768/1280-pixel checks with zero detected overlap, overflow, external requests or renderer errors. The compact options disclosure was opened/closed and reflections saved through the live UI. Arabic-dark and English-light footer screenshots were inspected: icon next to Copy/Share, correct directionality and always-visible two-row reflection field.
