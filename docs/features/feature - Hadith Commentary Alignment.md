# Hadith Commentary Alignment

Final integration checks: **971 application tests pass**, standalone TypeScript/full production build/diff pass, lint **0 errors** (369 non-blocking warnings). Native final evidence: `.baglib-data/sunnah-research-live/run-cSXHax/results.json` and captured screenshots; actual corpus, Arabic/English 480/1280, zero renderer errors. No commit/push/Jira authorization/actions.

## User-facing reader integration — 2026-10-27, Codex

The earlier pipeline-only statement that no app UI changed is historical. The master database is now connected to the actual Sunnah reader through `src/main/services/sunnah/research-corpus.ts`, `sunnah.service.ts`, `src/main/ipc/sunnah.ts`, preload and typed Sunnah contracts. No new database entities, schema migrations or dependencies were introduced. `better-sqlite3` opens the existing derived database with `readonly`, `fileMustExist` and `query_only` enabled; canonical/core stores are not modified.

### Access and behavior

- Development automatically discovers `tools/hadith-alignment/data/output/sunnah_kutub_tisah_itqan.sqlite`; installed copies may use `userData/sunnah/sunnah_kutub_tisah_itqan.sqlite`. **Choose Hadith source** accepts a master SQLite file or the existing six-book LK ZIP. Explicit selections persist in `userData/sunnah/research-source.json`; the database is attached in place, not copied into the core library. Keep a selected file available; close Baglib before replacing it on Windows. The 941 MB database is not bundled into installers by this change.
- All nine collections are available. `Tirmidhi`/`IbnMajah` map to existing UI IDs `Tirmizi`/`IbnMaja`; original six-book chapter/row IDs remain stable for saved notes/references. Chapter zero and repeated narration numbers remain distinct. Original text and missing translations are preserved.
- Each Hadith has a **Commentary & research** shortcut and an in-place research section. Single-Hadith mode loads its evidence; continuous mode loads an entry's research only when opened. Tabs show commentary with original title/author/volume/page/serial reference and source opening, narrator chain with matched/unresolved identities and linked-record lookup, root/ayah concordance, and text-similar Hadith targets.
- Scoped Arabic/English search uses FTS5, including commentary; narrator/root lookups use the existing junction indexes. Results are bounded (200 text hits; related panels display 30). The historical FTS normalization folds `ة/ه`; UI results are checked against preserved text using conservative normalization to avoid those false positives. This can reduce recall in the bounded candidate set; it does not rewrite source content.
- Corroboration targets resolve the pipeline's **global output row index**, checking book/reference before navigation; repeated numbering alone is insufficient. Hafs ayah links use the existing source-aware Quran navigation utility and report an unavailable source rather than borrowing a Warsh script.
- Metadata scores are explicitly labeled computational. The chain score uses graded positions; unresolved/ungraded positions are excluded from its minimum (0.50 default for entirely ungraded paths). The UI shows resolved-profile count and does not present a high partial score as evidence that the complete chain is reliable. Narrator tiers are localized; source judgments remain original data.

### Layout and localization

Compact source status and selectors, a bounded reading column, research shortcut on each card, expandable full commentary, narrator cards and wrapping root/ayah buttons. At narrow widths the Arabic and English passages stack vertically; desktop retains parallel columns. Arabic/Latin direction and typography are explicit; new controls/messages use centralized translations and logical spacing. Missing commentary and unresolved identities have visible empty states rather than implying complete coverage.

### Verification and limits

Portable adapter regression covers nine collections, chapter zero, duplicate numbers, legacy identity aliases, read-only byte preservation, persistence, Arabic/English/commentary/number search, root/narrator queries, invalid input and exact global cross-book targets. Existing six-book import, export and study-reference tests remain passing. Native Electron harness `scripts/sunnah-research-live/` uses the actual Sunnah IPC/preload/reader and 67,611-record database; tests Arabic RTL/English LTR at 480/1280, research panels, narrator/root results, all three added collections, indexed search and clicked related-Hadith navigation. Quran cross-links are checked through the actual navigation utility and installed Hafs packs/reader worker; the harness supplies read-only catalog/read IPC wrappers to avoid mutating the existing Quran catalog. This is not a new full Quran-reader runtime audit. Screenshots are captured for visual inspection. Native source opening is wired with a strict Shamela URL allowlist; no external browser was opened during automated verification.

The 380 Zurqani prefix boundaries, missing commentary, unresolved identities and source/model limitations remain review work. UI integration does not certify scholarly accuracy, exhaustive narration recovery, semantic root relevance or Hadith authenticity. See CURRENT_TASK.md for final run evidence and checks.

## Verified master generation — 2026-10-27, Codex

The corrected 34-column generation contains **67,611 records**, **27,709 source-reconstructable commentary/note records**, **115,735 narrator profiles**, **325,841 chain junctions** and **844,117 Quran-root junctions**. Independent `verify_master_outputs.py` passed CSV/Parquet/SQLite parity, all exact commentary/source spans, foreign keys, integrity, search and **545,408/545,408 unchanged original LK cells**. All **82 Python tests** pass, including English search, Arabic diacritic-insensitive search, contextual narrator cases and both grade policies. Compile/dependency checks pass. Current artifacts use **preserve**; empty original grade cells remain unchanged, with derived proposals in provenance. Optional fill is tested but was not selected for this generation.

Actual Zurqani 551 pages use quoted Matn followed by long tatweel separators and optional dual numbers, not generic line-start numbering. The first real build was interrupted after detecting a wrongly merged 3.3-million-character candidate. The dedicated `src/zurqani_parser.py` now extracts **1,958 separator units**, including **1,674 dual-number anchors**; maximum **41,643 characters / 13 source rows**. **380 quote-prefix boundaries remain flagged for review**. A 250,000-character guard rejects future volume-sized candidates. These structural checks do not certify individual link accuracy.

The final generation was recovered by recomputing Muwatta with the corrected adapter, retaining the other eight completed enrichment exports, and reusing cross-book candidates only after checking identical ordered references/Matn. It was then independently verified in full. This is an accepted recovered generation, **not a claim that a fresh uninterrupted nine-book CLI run completed**. Recovery details are recorded in `data/output/provenance_audit.json`; the interrupted SQLite is not the delivered database. The corrected public CLI is exercised by the nine-book end-to-end regression.

Research experience: nine consistent 34-column exports now support local Arabic/English search, narrator-to-hadith lookup, Quran-root concordance, and inspectable commentary/identity evidence. No Baglib reader layout or core database changes. Low commentary coverage in some books, numbering gaps/repeats, unresolved narrator IDs and lexical/corroboration heuristics remain explicit; scholarly certification and exhaustive narration recovery are not claimed.

## 34-column Itqan master extension — 2026-10-27

The new request extends the standalone output to narrator chains, profile references, computational calibration, Quran-root/ayah retrieval links and cross-book Matn candidates. The master registry now selects verified Zurqani **551** for Muwatta and critical-edition notes for Ahmad/Darimi. Requested 7252 was wrong, and requested Nasa'i 5764 was absent; the user approved verified corrections. The earlier 28-column registry and coverage below are historical, not the new master source selection.

Compared with plain OHD commentary strings and the prior page-oriented Shamela export, the Itqan extension adds explicit relational narrator/root indexes and preserves candidate-resolution evidence. Itqan's profile/morphology data reduces reconstruction work but adds entity ambiguity, lexical model errors and source-version mismatches. The implementation therefore matches Itqan hadith identities by text rather than borrowing an edition's numbers; keeps ambiguous narrator IDs null; maps only into the selected Quran vocabulary; and recomputes text similarity rather than treating Itqan thematic scores as verified Shawahid. The source-grade/preservation policy is explicit and documented.

See [Itqan](Itqan.md) for current Git/Zenodo evidence and corrections to earlier reference-code claims, and [Shamela](Shamela.md) for registry/source validation. Actual tests/results are maintained in CURRENT_TASK.md and the generated master audit. No library schema or canonical source file changes are authorized or performed by this derived corpus workflow.

## Shamela nine-book extension — 2026-10-27

The user expanded the target to nine Matn/Sharh pairs and a 28-column schema. The original OHD implementation/results below remain historical comparison evidence; they are not the new source selection. Implementation lives alongside it as `shamela_main.py` and modular Shamela loader/parser/aligner/indexer modules.

| Aspect | Earlier OHD alignment | Shamela extension | Trade-off |
| --- | --- | --- | --- |
| Grain | One Arabic hadith/commentary CSV row | Source records by book/volume/page/serial, sometimes multiple narrations per row | Shamela has stronger edition/citation metadata but needs structural parsing |
| Scope | Six LK collections with commentary strings | Six preserved LK collections plus three constructed Arabic collections | New Matn segmentation/hierarchy/grades require review |
| Commentary | Pre-associated CSV Tafseel | Explicit paired Sharh edition, separate footnotes and exact spans | More transparent provenance; source presence does not prove link correctness |
| Identity | OHD row index | Edition IDs, title, publisher/edition, start citation and every source span | Audit can reconstruct the exact passages behind each proposed link |
| Storage | 20-column CSV + SQLite | 28-column CSV + Zstandard Parquet + separate SQLite/normalized FTS5 | More complete research/export/search tooling; no app schema change |
| Numbering | Avoided direct number equality | Selected Matn edition first, then number candidates with textual support | Introductory/prose numbering can still be wrong without source-specific guards |

All 18 primary IDs/categories/title keys were independently confirmed in the live dataset at revision `ca46969f02a2e310d50f486472e47504f1d49b89`. Cache: 118,403 selected records, 73,980,452 bytes. The live repository has 97 shards, superseding the supplied fixed 64-shard offsets. See [Shamela](Shamela.md) for exact source counts, actual samples inspected, parser corrections, access and limitations.

Important correction: a preliminary high-coverage build linked Bukhari Hadith 1 to an introductory numbered list. Manual spot-check caught it; the run was interrupted, Fath's introductory volume was excluded from running-commentary candidates, and a regression test was added. This demonstrates why coverage and dataset reputation cannot establish scholarly alignment accuracy. Al-Muntaqa currently uses page-level lemma candidates, not verified full commentary boundaries. Darimi's source 912 is a 2021 commentary, so calling all nine Shuruh classical is inaccurate.

The workflow retains every original LK field; constructed books leave unavailable English fields empty. It preserves original vocalization, title/edition strings and source spans, separates ambiguous notes, and never applies source grade heuristics to unrelated narrations merely sharing a page. The nine-book audit records Matn versus Sharh coverage separately from tahqiq-only availability and source grades. No native Baglib UI change is part of this standalone task.

Final run: **67,611 parsed records**, **29,940 Sharh-linked** plus **7,590 tahqiq-only** records; 30,081 unmatched. **60 tests pass**; independent verification passed all 545,408 original LK fields, exact source-span reconstruction and CSV/Parquet/SQLite parity/index/search checks. Per-book results, labels/duplicates and real source limitations are detailed in [Shamela](Shamela.md) and the generated corpus audit. This is a verified mechanical research export, **not a scholarly-certified or proven exhaustive corpus**; Al-Muntaqa's full boundaries and automated link accuracy still require review. The earlier OHD 80.58% coverage is not directly comparable to nine-book Shamela Sharh coverage: different source grain, scope, extraction boundaries and tahqiq treatment materially change the denominator and meaning.

Implemented and verified 2026-10-27, Codex. The first supplied attachment is the governing specification; the second was reviewed as reference code, not trusted as a complete implementation.

## Compared sources and design

| Aspect | LK-Hadith-Corpus | Open-Hadith-Data | Implemented decision |
| --- | --- | --- | --- |
| Structure | 335 chapter CSVs, named 16-field headers | One headerless three-field commentary CSV per book | Natural chapter sort, canonicalized headers, strict field counts |
| Identity | Edition-specific string IDs; decimal notation and duplicates | Independent source IDs and row order | No direct ID join; retain original fields and OHD row provenance |
| Arabic | Full hadith, separate isnad/matn, missing-value strings | Vocalized hadith/commentary and bidi controls | Temporary normalized matching keys; exact original display strings |
| Coverage | 34,088 records across six books | Different record totals/order | Positional window plus exact/substrings, then word TF-IDF |
| Commentary | Existing Arabic_Comment remains original | Classical commentary text | Append Arabic_Tafseel rather than replacing source comments |

Evidence: [LK investigation](LK-Hadith-Corpus.md), [OHD investigation](Open-Hadith-Data.md). Existing Sunnah architecture, shared contracts, service and data dictionary were read before implementation. Work → Edition → Source and the file-backed Sunnah cache are preserved; the user-requested output database is standalone, with no app migration/import or UI modification.

Implementation: `tools/hadith-alignment/main.py`, `src/normalizer.py`, `src/loaders.py`, `src/aligner.py`, `src/exporter.py`. Verification: `tests/test_pipeline.py`, `verify_outputs.py`. Isolated Python environment and requirements lock; no Electron runtime dependency added. The CLI supports every requested flag and all six output keys. Case/punctuation differences resolve explicitly; ambiguity/malformed rows fail rather than silently dropping data.

The reference response advertised exact matching and forward-fill but its code lacked them, used a batch-wide rather than per-row search window, selected the first three rather than last two OHD fields, skipped malformed rows, and exported fewer than the required 20 columns. Those differences were corrected. The specification's 7,563 LK Bukhari estimate is superseded by 7,345 observed rows. Actual Muslim has no letter-suffixed IDs, so Stage C adds no Muslim matches in this run.

## Actual results

| Collection | LK | OHD | Linked | Coverage | Exact | TF-IDF | Inherited | Unmatched |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bukhari | 7,345 | 7,008 | 6,492 | 88.39% | 4,851 | 1,639 | 2 | 853 |
| Muslim | 7,314 | 5,362 | 4,449 | 60.83% | 3,493 | 956 | 0 | 2,865 |
| AbuDaud | 5,138 | 4,590 | 5,015 | 97.61% | 3,982 | 1,033 | 0 | 123 |
| Tirmidhi | 4,209 | 3,891 | 4,065 | 96.58% | 2,636 | 1,429 | 0 | 144 |
| Nesai | 5,680 | 5,662 | 3,649 | 64.24% | 3,024 | 625 | 0 | 2,031 |
| IbnMajah | 4,402 | 4,332 | 3,799 | 86.30% | 3,084 | 715 | 0 | 603 |

27,469 / 34,088 linked (80.58%); 6,619 explicitly unmatched. Full Markdown/JSON audit, six 20-column BOM CSVs and indexed SQLite generated under `tools/hadith-alignment/output/`. Audit JSON includes every input hash, source revision, parameters, runtime versions and five low-confidence examples per book. Full Markdown report was printed to the console.

## Verification and uncertainty

29 pytest cases pass: normalization, fallback, natural order/header mapping, two/three/five-field OHD input, malformed CSV rejection, folder aliases, exact/substrings, short/empty-key guards, similarity thresholds, per-row window boundaries, repeated matn position, scoped forward-fill/no-backfill, empty vocabulary, parameter validation, quoted Arabic/English multiline roundtrip, SQLite indexes and failure-safe output replacement. Initial two test failures were fixture mistakes (reused same ID inadvertently enabled legitimate inheritance; repeated text IDF reduced synthetic score); corrected fixtures then passed.

Full independent output validation passed: 34,088 rows, 545,408 untouched original fields, exact attached commentary from indexed OHD row, all direct-match window bounds, SQL/CSV parity, counts, indexes and SQLite integrity. No new app code was changed or app-wide test/build run claimed. No layout changes; generated Arabic/English content preservation is tested, not native UI rendering.

REA archive inspection succeeded; attempted REA Windows process capture was unsupported. Runtime CSV inspection used ordinary Python separately. Archive/clone comparisons establish the data relationship, not execution of upstream applications. See source reports for precise evidence IDs and line-ending differences.

The requested aggressive normalization, 40-character substring rule, .45 cosine threshold and proportional windows are heuristics. A score of 1 is not guaranteed correct; repeats/shared chains/folding can misalign. Inherited scores belong to donors, not recipients. Lower Muslim/Nesai coverage is reported honestly; no global fallback or threshold lowering was added to inflate it. Manual scholarly validation, commentary author authentication and improved alignment using additional anchors remain separate possible follow-ups. Original sources are never mutated. No commits, pushes, Jira changes or corpus redistribution performed.
