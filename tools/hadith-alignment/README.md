# Hadith commentary alignment

## QuranLab merge

`quranlab_download.py`, `quranlab_merge.py` and `verify_quranlab_merge.py` build `data/output/sunnah_merged_quranlab_v1.sqlite` and `data/output/quranlab-reports/`. The merge reads the existing database as input and never changes it. Commands, audit, rollback and limits are in [QuranLab Hadith](../../docs/features/QuranLab-Hadith.md). The glossary, grader mapping and match calibration are in `reference/`. No new dependency was added.

## 34-column Itqan master pipeline

The database is now available in Baglib's **Sunnah** view. Development discovers the generated file automatically. In an installed app, use **Choose Hadith source** to select `data/output/sunnah_kutub_tisah_itqan.sqlite` (or place it under `userData/sunnah/`). Selection persists; the file is read-only and stays separate from `baglib.db`. Restart Baglib after updating the main/preload code. The source picker still accepts the original six-book ZIP. Research tabs expose commentary/citations, narrator identities and lookup, roots/ayah navigation and similar-Hadith targets. This change does not bundle the large corpus into release installers or certify scholarly links. Close Baglib before regenerating an attached database on Windows.

The latest entry point is `master_main.py`. It builds 34-column CSVs/Parquet and a **standalone** five-table SQLite research database under `data/output/`, with exact source spans, grade proposals, narrator/root relations and a provenance audit.

From this directory using the existing isolated environment:

```powershell
& .venv/Scripts/python.exe -m pytest -q
& .venv/Scripts/python.exe master_main.py --grade-policy preserve
& .venv/Scripts/python.exe verify_master_outputs.py
```

This machine reuses the verified combined Shamela cache plus the targeted Zurqani extract. On a fresh checkout, clone `R3GENESI5/Itqan` to workspace-root `repos/Itqan`, configure `HF_TOKEN` in the process environment after accepting HF access conditions yourself, and run:

```powershell
& .venv/Scripts/python.exe fetch_master_pages.py
& .venv/Scripts/python.exe master_main.py --page-sources data/cache/primary-download/shamela_18books.parquet --grade-policy preserve
```

The historical cache filename says 18 books; the corrected master registry has **18 roles / 16 distinct IDs**, because Ahmad/Darimi's notes use their Matn editions. User-approved corrections: Zurqani **551** replaces incorrect **7252**; verified Nasa'i **829** replaces unavailable **5764**. No secondary book is substituted without identity checks. Shards are discovered dynamically; no outdated fixed range is assumed. Authentication reads only `HF_TOKEN` from the environment, never an implicit credential-store fallback.

Input overrides: `--itqan-dir`, `--lk-dir`, `--quran-roots`, `--cache-dir`, `--output-dir`, `--books`, `--reuse-shamela`. Reusing prior Matn decisions requires matching row identity and every source span. `--grade-policy preserve` retains all 545,408 original LK cells and records grade proposals in provenance JSONL. Optional `--grade-policy fill` changes only **empty** Arabic/English grade cells in Books 3–6 using uniquely text-verified Itqan identities; its audit reports those exceptions rather than claiming bit-for-bit preservation. Nonempty source grades are never overwritten.

Profiles are imported from manifest-checked prebuilt shards with source citations, original death strings and grade buckets. No upstream builder is executed. Ambiguous narrator IDs remain null; identity is never selected by choosing the best grade. Tahwil paths have distinct JSON path IDs and globally unique SQL chain positions. Calibration weights are computational metadata, **not an authenticity ruling**; ungraded paths remain explicit.

Roots use precomputed Itqan morphology, Wensinck forms, explicit lexical patches and conservative light stemming. Root extraction does not generally fold `ة` into `ه`. Output roots belong to the selected read-only Quran vocabulary; ayah links are Hafs/Kufi retrieval signals. Cross-book candidates use recomputed Matn similarity in bounded candidate sets; upstream theme scores are not converted into probabilities or authenticated Shawahid.

See [Itqan revalidation](../../docs/features/Itqan.md), [Shamela registry evidence](../../docs/features/Shamela.md), and `data/output/PROVENANCE_AUDIT.md` / `provenance_audit.json` / `verification_report.json` for actual counts and limits. Prior 28-column/OHD generations below remain historical comparisons.

Verified master generation (2026-10-27): **82 tests pass**. The full independent verifier confirms **67,611 records**, **115,735 profiles**, **27,709 commentary/note rows**, **325,841 chain junctions**, **844,117 root junctions**, export parity and all **545,408 unchanged LK cells**. Final grade policy is `preserve`. The delivered generation was recovered after repairing Zurqani's source-specific separator/dual-number parser: Muwatta was recomputed, the other eight completed book enrichments were reused, and all final outputs were verified. This is not a fresh uninterrupted full real CLI run. Zurqani has 1,958 structural units (1,674 dual-number anchors), maximum 41,643 characters; 380 quote-prefix boundaries still require review. Parser audits and the generation's recovery metadata preserve these limitations.

## Nine-book Shamela pipeline

The new `shamela_main.py` implements the supplied 28-column nine-book target. Use the same isolated environment with the updated requirements lock:

```powershell
& .venv/Scripts/python.exe -m pip install -r requirements-lock.txt
& .venv/Scripts/python.exe shamela_main.py --ingest-only
& .venv/Scripts/python.exe shamela_main.py
& .venv/Scripts/python.exe verify_shamela_outputs.py
& .venv/Scripts/python.exe shamela_main.py --search 'إنما الأعمال بالنيات'
```

Set `HF_TOKEN` securely in the local process environment after accepting the dataset's gated-access conditions yourself. Never add a token to this project or command history. The loader does not login, accept conditions or save credentials. `--shamela-parquet PATH` supports local page data with no network; `--cache-dir`, `--refresh-cache`, `--revision`, `--books`, `--lk-dir`, `--output-dir`, `--min-score`, and `--window-pct` are available. Cache manifests pin the resolved dataset commit and data hash. All requested IDs must be present; missing/incorrect primary editions fail explicitly.

Defaults: selected 18-book cache under `data/cache/`; derived artifacts under `output-shamela/`. The new output includes 28-column BOM CSVs, Zstandard Parquet, `sunnah_9books_shamela_corpus.db`, `corpus_9books_audit.md/.json`, exact per-row provenance JSONL and parser audits preserving unresolved notes. Original six-book LK fields remain unchanged. Books 7–9 are constructed in the same schema; English translations are left absent. Segmentation and source grade extraction are heuristic, and a source grade's qualifiers remain in Arabic. `verify_shamela_outputs.py` independently validates every exported original LK field, CSV/Parquet/SQLite parity, source spans and search behavior; this verifies data integrity, not the scholarly correctness of candidate links.

Numeric commentary links require textual containment; duplicate/ambiguous numbering is not enough. Fuzzy matching combines word/character unigrams/bigrams in bounded batches. Inheritance requires an actual follow-up indication within the same chapter/section. Page-wide footnotes with ambiguous ownership are retained for review rather than assigned to unrelated narrations. The FTS artifact indexes normalized copies, returns original strings, and must be rebuilt after content changes. Its standard index-only integrity check is supported; external-content rank=1 byte comparison would differ intentionally because Arabic index text is normalized.

The constructed Matn editions use source profiles for inline numbers and reading/abbreviated-chain variants. Actual subreferences such as `11073/أ` and combined references such as `9936 و 9937` remain strings. Repeated labels are retained; the generated SQLite row ID is the unique row identity. A missing integer in a numbering range alone does not prove a missing narration, and no absent number/text is fabricated. Source-specific caveats include Fath's excluded Hady al-Sari introductory lists and al-Muntaqa's page-level lemma fragments; these are documented in the source report.

No scholarly certification follows from automated matching or from the corpus hosting site. See [Shamela findings](../../docs/features/Shamela.md) for observed source metadata and actual validation limits. The old six-book OHD pipeline below is retained for comparison.

Verified real run (2026-10-27): 60 tests pass; 67,611 parsed rows across nine collections, 29,940 Sharh links and 7,590 tahqiq-only records. Independent final verification passed all 545,408 original LK fields, source-span reconstruction, export parity and database/search checks; the saved result is `output-shamela/verification_report.json`. Remaining numbering gaps, repeated references, low Nesai/Ahmad Sharh coverage and al-Muntaqa's fragment boundaries are documented. This does not certify exhaustive narration recovery or scholarly link accuracy.

Standalone Python pipeline implementing the supplied six-book specification. It produces research CSV/SQLite artifacts; it does not change Baglib's canonical database or automatically display commentary in the Sunnah reader.

## Run on Windows

From this directory (Python 3.14 was verified):

```powershell
python -m venv .venv
& .venv/Scripts/python.exe -m pip install -r requirements-lock.txt
& .venv/Scripts/python.exe -m pytest -q
& .venv/Scripts/python.exe main.py
& .venv/Scripts/python.exe verify_outputs.py
```

Source defaults are the workspace-root `LK-Hadith-Corpus` and `Open-Hadith-Data` clones. They were cloned during implementation. For a fresh workspace, clone `https://github.com/ShathaTm/LK-Hadith-Corpus.git` and `https://github.com/mhashim6/Open-Hadith-Data.git` there first. The pipeline itself performs no network access and never executes source-repository scripts.

```powershell
& .venv/Scripts/python.exe main.py --lk-dir C:/data/LK-Hadith-Corpus --ohd-dir C:/data/Open-Hadith-Data --output-dir C:/data/aligned --books Bukhari Muslim --min-score 0.45 --window-pct 0.08
```

`--books` accepts `all` (default) or space-separated `Bukhari Muslim AbuDaud Tirmidhi Nesai IbnMajah`. Missing/ambiguous sources fail explicitly. Actual LK folder aliases `Tirmizi` and `IbnMaja` resolve to the requested output collection keys. OHD filenames are discovered using case/punctuation-insensitive folder mapping and vocalized/commentary filename markers.

## Outputs

- `output/csv/<Book>_LK_with_Tafseel.csv`: UTF-8 BOM, 16 original string fields in canonical order plus the four requested alignment fields. Blank appended commentary denotes missing; original `nan` strings stay unchanged.
- `output/sunnah_lk_tafseel.db`: separate 21-column `hadiths` table (Collection plus the 20 CSV fields), reference and score indexes, original columns stored as TEXT so IDs and decimal formatting survive.
- `output/alignment_audit_report.md` and `.json`: counts, scores, method breakdowns, five low-score samples per collection when available, parameters, library versions, repository revisions and every CSV's SHA-256. The Markdown report is printed after completion.

A new run builds in a private sibling staging directory. Failed runs do not replace existing outputs. Successful replacement preserves the prior generation in `output.previous-<unique ID>`; remove/archive those generations yourself when no longer needed. Output directories containing unexpected files are refused. Input/output paths cannot overlap. Temporary cleanup is restricted to the generated task staging path.

## Matching semantics and limitations

Normalization applies only to temporary keys: marks/tatweel removed; Alef, Maksura, ta marbuta and hamza carriers folded as requested. This aggressive folding can conflate different Arabic words. Original Arabic/English content and commentary remain untouched, including vocalization, bidi controls, quotation marks and line breaks.

Each row uses its own half-open proportional window, minimum half-width 350. Full normalized equality precedes matn substring matching (at least 40 normalized characters). Duplicate candidates resolve by nearest proportional position, then lowest source row. TF-IDF uses word unigrams/bigrams and sublinear term frequency over both corpora; normalized sparse dot products provide cosine similarity. Dense similarity buffers contain at most 500 LK rows, never the entire all-pairs corpus matrix. Per-row bounds are enforced inside every batch.

Empty normalized text/commentary cannot be an accepted direct match. Below-threshold rows remain unmatched, with their best candidate score for diagnostics. Stage C only inherits an earlier matched commentary within the same original chapter string/leading integer ID group, copying its score and source row and explicitly labeling inheritance. It does not backfill or infer a missing ID. Inherited links need not satisfy the recipient's direct-match window; their provenance is the donor's link.

Scores are not correctness probabilities. `exact_window=1.0` includes substring matches and is not scholarly certification. Similarity/shared chains/repeated matn can produce wrong candidates, even above threshold. Low-confidence samples and inherited links require review before publication. Corpus coverage is not accuracy. No manual corpus-wide review is claimed.

## Verified run — 2026-10-27

29 pytest cases passed; all six books processed successfully. 27,469 / 34,088 rows linked (80.58%); 6,619 unmatched. Independent export verification checked all 545,408 original fields, exact source commentary references, direct-match windows, CSV/SQL parity, counts, indexes and SQLite integrity. Arabic/Latin mixed text and quoted multiline fields are covered by roundtrip tests. No application UI/layout changed, so no new RTL/LTR screen testing is claimed.

See [comparative findings](../../docs/features/feature%20-%20Hadith%20Commentary%20Alignment.md) and the generated audit for per-book results. The raw corpora/generated databases stay ignored by Git. Review upstream attribution/distribution terms before redistributing; no corpus redistribution was performed.
