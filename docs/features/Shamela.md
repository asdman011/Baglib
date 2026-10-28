# Shamela Hadith corpus and commentary investigation

Final integration checks: **971 application tests pass**, standalone TypeScript/full production build/diff pass, lint **0 errors** (369 non-blocking warnings). Native final evidence: `.baglib-data/sunnah-research-live/run-cSXHax/results.json` and captured screenshots; actual corpus, Arabic/English 480/1280, zero renderer errors. No commit/push/Jira authorization/actions.

## Visible commentary integration — 2026-10-27, Codex

Shamela-linked commentary now appears in Baglib's Sunnah reader, with original book title/author, volume/page/serial reference, a Shamela source button, automated text-match score and an explicit missing-commentary state. Single-Hadith mode exposes an expanded research section; continuous reading fetches evidence when an entry is opened. Long commentary has a bounded reading area and a full-text expansion control. Native Electron checks exercise actual corpus/IPC/preload/rendering in Arabic and English at 480/1280; the external website button was wired/allowlisted but no browser was opened by the harness.

The adapter uses the existing standalone master database read-only. It preserves the verified 551/829 registry corrections and the Ahmad/Darimi editorial-note distinction; linking a reviewed edition still does not establish alignment accuracy. The 380 Zurqani prefix-boundary review flags and missing coverage remain. See [Hadith Commentary Alignment](feature%20-%20Hadith%20Commentary%20Alignment.md) for full access instructions, layout changes, source-selection persistence and test evidence. Earlier “no app UI changes” statements describe the historical export-only phase.

## Verified master generation — 2026-10-27, Codex

The corrected 34-column generation contains **67,611 records**, **27,709 source-reconstructable commentary/note records**, **115,735 narrator profiles**, **325,841 chain junctions** and **844,117 Quran-root junctions**. Independent `verify_master_outputs.py` passed CSV/Parquet/SQLite parity, all exact commentary/source spans, foreign keys, integrity, search and **545,408/545,408 unchanged original LK cells**. All **82 Python tests** pass, including English search, Arabic diacritic-insensitive search, contextual narrator cases and both grade policies. Compile/dependency checks pass. Current artifacts use **preserve**; empty original grade cells remain unchanged, with derived proposals in provenance. Optional fill is tested but was not selected for this generation.

Actual Zurqani 551 pages use quoted Matn followed by long tatweel separators and optional dual numbers, not generic line-start numbering. The first real build was interrupted after detecting a wrongly merged 3.3-million-character candidate. The dedicated `src/zurqani_parser.py` now extracts **1,958 separator units**, including **1,674 dual-number anchors**; maximum **41,643 characters / 13 source rows**. **380 quote-prefix boundaries remain flagged for review**. A 250,000-character guard rejects future volume-sized candidates. These structural checks do not certify individual link accuracy.

The final generation was recovered by recomputing Muwatta with the corrected adapter, retaining the other eight completed enrichment exports, and reusing cross-book candidates only after checking identical ordered references/Matn. It was then independently verified in full. This is an accepted recovered generation, **not a claim that a fresh uninterrupted nine-book CLI run completed**. Recovery details are recorded in `data/output/provenance_audit.json`; the interrupted SQLite is not the delivered database. The corrected public CLI is exercised by the nine-book end-to-end regression.

Research experience: nine consistent 34-column exports now support local Arabic/English search, narrator-to-hadith lookup, Quran-root concordance, and inspectable commentary/identity evidence. No Baglib reader layout or core database changes. Low commentary coverage in some books, numbering gaps/repeats, unresolved narrator IDs and lexical/corroboration heuristics remain explicit; scholarly certification and exhaustive narration recovery are not claimed.

## 34-column master-specification registry correction — 2026-10-27

The next master specification changed the proposed Muwatta commentary to ID 7252 and Nasa'i Matn to 5764. Catalogue inspection identifies **7252 as منهج القرآن الكريم في دعوة المشركين إلى الإسلام**, not a Hadith commentary. [Shamela 551](https://shamela.ws/book/551) identifies **شرح الزرقاني على موطأ الإمام مالك** by Muhammad ibn Abd al-Baqi al-Zurqani; a targeted pinned-HF scan independently extracted **4,167 rows** under ID 551/category 7 with that title. The same scan found **no 5764**. User explicitly authorized verified corrections, so the master registry uses 551 and the previously validated Nasa'i 829, recording both corrections.

The new Ahmad/Darimi commentary roles are their Matn editions' own notes (25794/21795, category 6), not independent category-7 Sharh books. Thus the corrected master registry has 18 roles / 16 distinct sources. A per-book cache of **110,665 source records** was created by reusing hash-recorded prior extracts plus the new 551 extraction, with category/title validation and deterministic volume/page/serial sorting. The previous 28-column registry/results below describe the earlier task, not the new source selection.

The master build remains isolated under `tools/hadith-alignment/`; it never updates the application reader cache or source databases. See [Itqan](Itqan.md) for actual source revalidation, new enrichment evidence and limitations.

Investigation started 2026-10-27, Codex. This records actual observations separately from the user's supplied edition/coverage claims. See [Hadith Commentary Alignment](feature%20-%20Hadith%20Commentary%20Alignment.md) for the preceding OHD comparison.

## Verified public metadata and access

- Dataset: [mhaamh19/shamela_books_text_full](https://huggingface.co/datasets/mhaamh19/shamela_books_text_full). Public card says 7,552,019 page records, 8,538 books and 40 categories, exported from Shamela software synced in June 2025. These totals are publisher metadata, not independently recounted in this investigation.
- Card describes 11 page fields: serial_number, category_id, category, book_title, book_id, edition, publisher, page_number, volume_number, text, foot_note. Book IDs join the companion metadata dataset. A page is not a hadith or commentary unit.
- Live repository API revision: `ca46969f02a2e310d50f486472e47504f1d49b89`. Discovered **97** `data/train-*-of-00097.parquet` files; the supplied fixed 64-shard/range assumption is outdated. The pipeline enumerates actual shards and applies category/book predicates, using bounded Arrow batches and a revision-pinned HF filesystem.
- Anonymous dataset-server splits returned HTTP 401; file access is gated. After explicit user authorization to use the supplied credential, an authenticated Parquet HEAD returned HTTP 200. Token is read only into process memory, never written to source, manifests or logs, and conditions are not accepted on behalf of the user.
- Dataset card declares Apache-2.0, but this is not an investigation into the independent rights of every underlying edition or permission to redistribute its contents. Raw data/generated corpora remain ignored locally.

## Checked Shamela edition descriptions

The following live catalogue pages were read; HTTP success/catalogue identity does not verify dataset presence, text correctness or alignment accuracy:

- [Bukhari 1681](https://shamela.ws/book/1681): Sultani edition, nine parts; scholarly editing/edition information recorded on the page.
- [Fath al-Bari 1673](https://shamela.ws/book/1673): Ibn Hajar, Salafiyya edition, numbered by Muhammad Fuad Abd al-Baqi, 13 parts plus introductory Hady al-Sari.
- [Al-Fath al-Rabbani 124910](https://shamela.ws/book/124910): Ahmad al-Banna al-Saati, rearrangement of Musnad Ahmad with Bulugh al-Amani, 24 parts, second edition. The thematic rearrangement makes proportional order matching especially uncertain.
- [Sharh Musnad al-Darimi 912](https://shamela.ws/book/912): Marzuq ibn Hayyas al-Zahrani, first edition 1442/2021, five parts. It is a modern commentary; describing all nine commentaries as classical would be inaccurate.

The user's statement that all 18 IDs/categories/titles were verified was initially an input claim. The live extraction now independently confirms presence of all 18 IDs in the requested categories; ID/category/title-key validation passes. This does not certify scholarly correctness or exact edition equivalence with LK. Optional alternative editions are not substituted silently.

## Actual selected data

Successfully scanned the discovered 97 shards with ID/category predicates and cached **118,403 selected source rows** in 73,980,452 bytes of Zstandard Parquet. Cache SHA-256: `aab911d9183ab9addd47ce26da46cc8d2d13f2dcf0be12bd92dc236662aaa722`. The exact source revision, row counts, observed titles/categories/editions/publishers are recorded in `tools/hadith-alignment/data/cache/shamela_18books.manifest.json`.

| Collection | Matn ID | Selected Matn rows | Sharh ID | Selected Sharh rows |
| --- | --- | ---: | --- | ---: |
| Bukhari | 1681 | 11,218 | 1673 | 8,010 |
| Muslim | 1727 | 7,499 | 1711 | 4,104 |
| AbuDaud | 1726 | 7,211 | 5760 | 4,679 |
| Tirmidhi | 1435 | 6,468 | 21662 | 4,884 |
| Nesai | 829 | 8,323 | 522 | 2,111 |
| IbnMajah | 1198 | 5,912 | 9810 | 5,206 |
| MuwattaMalik | 1699 | 2,645 | 6684 | 2,243 |
| MusnadAhmad | 25794 | 23,384 | 124910 | 7,044 |
| SunanDarimi | 21795 | 4,844 | 912 | 2,618 |

These are source-record counts, not hadith counts or distinct physical-page counts: several source rows share the same volume/page and differ by serial. The specification/card's page terminology must not be used to equate one row with one narration.

## Real-text parser corrections

Inspected first/middle page samples and first units for all 18 books; examined inline numbering and selected long spans separately. Inspection previews are local ignored QA files, not a redistribution package. Observed:

- Literal `"None"` occurs in page numbers and footnotes. It sorts as missing page 0 but remains original in citations; missing note markers are never appended as commentary.
- Text often flattens several numbered narrations/headings into one paragraph. Line-only regexes undercount substantially. Anchors now use an offset-mapped marks-free matching view while copying exact original substrings.
- Zero-width format markers surround headings; bare-number/transmission, bracket-number and parenthesized-commentary formats differ by source. Ahmad's introductory parenthesized scholarly/prose lists must not become canonical hadiths; inspected primary Matn editions use bare-number/transmission anchors.
- Bukhari Hadith 1 initially matched a numbered Hady al-Sari introductory list. The actual first staged output was checked, this error was caught, and introductory volume 0 is now excluded from Fath al-Bari running-commentary matching. A regression test covers it. The interrupted preliminary outputs are not accepted results.
- Al-Muntaqa does not expose a reliable canonical numbered commentary sequence in the inspected text. Isolated prose-list ordinals previously absorbed later text. This source now uses explicitly labeled, page-row-level lemma candidates; full multi-page commentary boundary reconstruction is **not certified** for this book.
- `قَوْلُهُ` is usually vocalized. Lemma extraction must run on temporary marks-free keys; matching raw `قوله` misses those anchors.
- Darimi has editorial rulings inline under `[تعليق المحقق]`. Constructed Matn separates that tail into Arabic_Comment, extracts grades there, and appends it as tahqiq with explicit provenance. The original full source unit remains reconstructable.
- The selected Ahmad data has volumes 1–45 only; the >45 index filter is implemented/tested but excludes no real cached rows in this extraction. It would be false to claim that five index volumes were downloaded and removed.
- A first completed generation passed integrity checks but a separate numbering audit found parser gaps. Raw-text inspection identified additional narration openings (`قرأت`, `قرئ`, compiler additions in brackets, abbreviated chains), numbers without hyphens, footnote markers between number/hyphen, prefix stars/quotation marks, split references (`8571/1`, `11073/أ`) and combined references (`9936 و 9937`). The three constructed Matn adapters now enter at the observed canonical Hadith 1 and preserve these original reference forms. Compound/subreferences stay strings rather than being invented as extra independent integer records. Duplicate labels are retained and need edition-aware review; monotonicity is not used to silently discard source passages.

## Implemented source processing

- `tools/hadith-alignment/src/shamela_registry.py`: requested primary Matn/Sharh pairs and exact 28-field export contract.
- `shamela_loader.py`: discovered-shard/category/book pushdown, selected-page Zstandard cache, manifest with revision and SHA-256, cache reuse validation and explicit missing-book diagnostics. Reads one book at a time from the selected cache. It does not load the full HF corpus into RAM or execute dataset scripts.
- `shamela_parser.py` / `sharh_parser.py`: original-text spans, explicit numbering/Kitab/Bab anchors, page stitching and unnumbered lemma-page candidates; sorted volumes/pages/serials, excludes Ahmad volumes >45. Unknown volume labels and duplicate serials fail for review. Mixed volume subparts are kept distinct.
- `isnad_matn_splitter.py`: conservative attribution/final punctuation boundary, preserves every original character; ambiguous chains remain unsplit. Grade clauses retain qualifiers. A narrator-only ruling (`رجاله`) is not converted into a blanket hadith grade.
- `shamela_aligner.py`: text-verified number candidates, exact/lemma window, word+character TF-IDF, scoped and explicitly identified follow-up inheritance. The LK number is first mapped to the selected Shamela Matn edition; it is not joined directly to the Sharh numbering.
- `indexer.py`: 28-column CSV and Zstandard Parquet; separate indexed SQLite with normalized external-content FTS5. Arabic marks/orthography are normalized before indexing since SQLite's Latin-oriented diacritic option does not perform that Arabic folding. Source strings remain untouched.
- `verify_shamela_outputs.py`: CSV/Parquet/SQL equality, all original LK fields, exact source-span reconstruction, provenance and normalized Arabic queries.

## Deliberate safeguards and unresolved investigation

The dataset is page-granular. A whole-page footnote is attached to a unit only when exactly one unit uses that page; ambiguous ownership is retained with exact text in parser audit JSON. Repeating the entire page footnote across every hadith would make unsupported grade/tahqiq assertions. A page can have many hadiths and a hadith can span pages.

The supplied broad `باب`/number conventions were checked against extracts and required the source-specific corrections above. Regex boundaries and narrator segmentation remain heuristics rather than scholarly annotation. High cosine similarity/shared chains and folded Arabic can create false positives; coverage must not be reported as accuracy.

## Final mechanical verification — 2026-10-27

The final nine-book run exited successfully and printed `output-shamela/corpus_9books_audit.md`. **67,611 parsed records**: original LK 34,088; Muwatta 1,832; Ahmad 28,129; Darimi 3,562. These are parsed rows, not a certified count of unique canonical narrations. **67,304 Matn links**, **29,940 Sharh links**, and **7,590 tahqiq-only records**, with **30,081 unmatched**. Full per-book coverage/method/grade/sample details are in the Markdown/JSON audit.

**60 pytest cases passed**, including a nine-book synthetic end-to-end roundtrip and real-format regression cases. Independent final `verify_shamela_outputs.py` verified all 545,408 original LK field values, every commentary/source span, CSV/Parquet/SQLite parity, 28-column schemas, Zstandard compression, source citations, indexes/integrity and representative normalized Arabic search. Arabic/Latin mixed text, vocalization and quoted/multiline content are covered. The verification result is saved as `output-shamela/verification_report.json`, with a separate numbering review included. Compile/dependency checks and diff checks passed; no native app/UI test or app-wide build is claimed.

The initial output check compared a vocalized word by its raw spelling and failed despite the correct passage; it was corrected to compare normalized text and passed. An accidental root-directory pytest collection encountered unrelated vendored pocket-tts dependencies; rerunning with the tool's configured test directory passed. No unrelated dependencies were installed to satisfy that accidental collection.

### Remaining data/review limits

- Al-Muntaqa coverage is 61.14% using page-row lemma fragments; full commentary-unit boundaries remain unverified there.
- Sharh coverage is 14.33% for Nesai and 15.03% for Ahmad under the requested guarded heuristics; tahqiq alone is counted separately. These are not claims that the source books contain no other relevant discussion.
- After accounting for slash/combined references, six Ahmad base labels remain absent from parsed anchors: 9126, 13549, 16662, 22670, 22793, 25754. Eleven Darimi labels remain: 589, 667, 688, 699, 954, 959, 1696, 1707, 1868, 2088, 2149. The inspected source text did not provide those narration anchors; some numbers occur as physical-page references instead. This alone does not establish whether narration text is missing. No placeholder text or invented numbers were inserted.
- Repeated references (including Muwatta's chapter/section resets) and subnarrations are retained. Ahmad has 459 repeated exact reference occurrences and Darimi 27 in the extracted units; no silent deduplication/scholarly interpretation is applied.
- Source identity/metadata and mechanical data integrity are verified; exhaustive recovery, correct narration segmentation, grade interpretation and scholarly alignment accuracy are **not certified**. The source's edited/reviewed status cannot certify newly generated automated links.

All selected raw data, prior generations, staging directories and generated corpora are ignored by Git. No credentials were persisted in generated/source files; a source credential-pattern check returned false. No commit, push or Jira action occurred.

The REA skill distinguishes ordinary available-source/data processing from shipped application reverse engineering. Existing REA archive investigation of OHD is documented in its source report; no new REA application/runtime investigation is claimed for the HF data scan. No Baglib schema migration, source text mutation or reader/UI change is part of this tool work.
