# QuranLab Hadith

Source audit for `quranlab/hadith`, revision `9e5d61d8cff3c3b95745e11f9d0fe2efccb6126d`, downloaded 2026-11-01: 146 files, 175,872,622 bytes, 140 Parquet configs, 72 languages. Hashes are in `tools/hadith-alignment/data/sources/quranlab-hadith/<revision>/download-manifest.json`.

## Verified findings

- Terms are per config, in `metadata/configs.csv`. No Parquet file has a license column, so "per row" in `LICENSES.md` is wrong.
- `LICENSES.md` calls the matn layer ungraded, but `-ar` configs of the Sunan and Muwatta carry `grades`. Bukhari, Muslim, the forty collections, Ahmad and Darimi carry none.
- Every language config repeats the same `grades` array: 0 differences across 36,490 keys. They are one judgment, not several.
- Grades have 9 named graders. Sampled `fawazahmed0/hadith-api` files use the same values, so they are repackaged, not independent.
- HadeethEnc grades come from an editorial board, not an individual muhaddith. Its English `grade` translates the Arabic.
- Hadith numbers are poor identity: among verified Abu Dawud links only about 14% of numbers agree with the corpus.
- LK English is misaligned with its Arabic on about 233 Abu Dawud rows. QuranLab's English fits the Arabic there. Nothing was overwritten; see `english_misalignment_candidates.csv`.
- REA could not inspect the 941 MB database (256 MB snapshot limit), so read-only Python was used. REA did not verify these findings.

- LK's unnamed grade labels largely repeat named gradings. In Abu Dawud they match Muhyi al-Din Abdul Hamid on 99.56% of 4,351 compared rows and al-Albani on 98.53% of 4,415. This is a lineage hint, not an attribution: the LK field stays unattributed, and 16,616 rows record the match so the reader can say it may not be independent.
- Ahmad and Darimi are confirmed Open-Hadith-Data text: 99.9% and 100% of normalized records appear there. Malik is 21%, which fits its different upstream.
- QuranLab's text has `U+FFFD` replacement characters: 156 in 77 records across 8 configs, mostly `-ar`. These records still match by similarity. The damaged wording is kept verbatim as a source variant, and the corpus Arabic stays the canonical text.

## Result of generation v1

| Measure | Count |
|---|---|
| Source records verified / review / conflict / source-only | 65,076 / 1,792 / 702 / 1,865 |
| Verified links (HadeethEnc can link to several books) | 65,191 |
| Corpus rows linked to a collection record | 62,857 of 67,611 |
| Named-grader judgments, unique | 67,342, from about 446,500 repeated language copies |
| Named judgments linked to rows / staged | 66,599 / 743 |
| HadeethEnc judgments linked / staged | 2,195 / 1,494 |
| Rows with a named or institutional ruling | 22,262 |
| Rows that had no grade before | 2,209 |
| Rows where rulings accept and reject the report in one scope | 2,269 |
| Rows where wording differs in one scope | 6,726 |
| Rows gaining English / explanations | 1,738 / 2,164 |
| Possible LK English misalignments | 275, of which 233 in Abu Dawud |
| Named graders | 8 verified Arabic, 1 unresolved, plus 1 institution |
| QuranLab judgments with glossary Arabic / source Arabic / unresolved | 67,258 / 3,689 / 84 (35 are `-` placeholders) |
| Judgments still `needs_review` | 49 English and 32 Arabic from QuranLab, 379 from the base corpus |
| New records added to the reader | 5,714, in six separate books |

Unmatched records: Abu Dawud 129, Muslim 112, Malik 18, Bukhari 9, Nasa'i 7, Ibn Majah 3, Tirmidhi 2, Ahmad 23, Darimi 4. Most of Abu Dawud's (89) and Muslim's (99) sit in runs of consecutive numbers, which suggests gaps in LK; this was not checked against printed editions. `review_queue.csv` holds every unresolved record.

## Source books in the reader

At the user's request these records are readable as separate books, appended after the last base row. The first 67,611 rows and their IDs are unchanged, and the appended rows have no crosswalk link, so they never enrich another row.

| Book | `book_key` | Records | Chapters |
|---|---|---:|---|
| Forty Hadith of al-Nawawi | `Nawawi40` | 42 | One |
| Forty Hadith Qudsi | `Qudsi40` | 40 | One |
| Forty Hadith of al-Dihlawi | `Dehlawi40` | 40 | One |
| HadeethEnc, whole collection | `HadeethEnc` | 3,574 | One; each title is the source's own |
| Unmatched records | `SourceOnly` | 307 | By original collection |
| Records under review | `ReviewQueue` | 1,711 | By original collection |

HadeethEnc appears whole, so it repeats 2,195 linked reports that also stay attached to their corpus rows, and its 81 review records are read there rather than in the review book. A record's own rulings show on its own row, and the staged rows stay as they were. Review records carry a visible notice and list their candidate rows under similar hadiths. **They can duplicate a hadith in their original book, and nothing has confirmed them as new.** Text has no isnad and matn split because the source has none. The 702 conflicting-identity records were not requested and stay out of the reader.

Bukhari's 425 and Muslim's 131 conflicts are mostly identical text repeated in QuranLab where the corpus has one row. No grade is affected, because neither collection carries grades here.

Provenance: 1,749,437 field values across 73,325 rows resolve to a source with a matching hash, and none needed the unresolved fallback. Computed fields (narrators, roots, similarity) point to the pipeline generation and its row ledger, not to one upstream record. Inherited values rely on the base generation's ledgers in `_archive_datasets`. Upstream rows inside hadith-api remain unlocated because QuranLab pinned no commit.

## Verification

- `verify_quranlab_merge.py`: exit 0. All 146 inputs, the base hash, 67,611 rows, all junction tables, 67,342 judgments back to Parquet, 359,019 stored texts, every added provenance hash and 27 reviewed calibration pairs.
- `tests/test_quranlab.py`: 62 tests, part of 144 Python tests passing. They cover byte-identical reruns and interrupted builds.
- `scripts/sunnah-merged-live/run.mjs`: real Sunnah IPC, preload and `SunnahView` in a hidden window with a throwaway profile, against the real database. All six source books open and search; rulings and sources in Arabic and English at 480 and 1280 px, no overflow or renderer errors, 6,685 record IDs equal to the old database, copy formatting, reflection save, navigation, English search, Bukhari suppression. Screenshots were read.
- Manual review: samples from each collection, grader and scope, near-threshold pairs, prefix and inner-report rules, HadeethEnc links and Muwatta English. No wrong link was found in these samples. This is a text check, not scholarly review.
- Not tested: the packaged app, the OS clipboard and the share sheet.

## Licensing

Arabic configs state public domain, but that does not cover the grades inside them. Translation configs are `reference-only` with `commercial_ok=False`, and gradings are stated as © their authors. `hadith-api` is Unlicense at repository level, which does not establish rights over that content. Local research use only: do not bundle in installers or commit to Git.

## Commands

From `tools/hadith-alignment`:

```bash
.venv/Scripts/python.exe quranlab_download.py
```

```bash
.venv/Scripts/python.exe quranlab_merge.py
```

```bash
.venv/Scripts/python.exe verify_quranlab_merge.py
```

Rebuilds need `_archive_datasets` (LK corpus and `provenance/`). Reports go to `data/output/quranlab-reports/`.

## Attachment and rollback

The merged file is `data/output/sunnah_merged_quranlab_v1.sqlite`; development prefers it automatically. To roll back, use **Choose Hadith source** and pick `sunnah_kutub_tisah_itqan.sqlite`, or remove the merged file. The old file and all row IDs are unchanged, so saved notes keep working.

## Limits

The glossary and grader mapping were checked by Claude Code against references. No scholar reviewed them. Salim al-Hilali has no verified Arabic form. Upstream attributions to editors (Abd al-Baqi, Abu Ghuddah, Muhyi al-Din) and Shakir's coverage of Tirmidhi were not checked against printed editions. The 702 conflicting records have no reader entry.
