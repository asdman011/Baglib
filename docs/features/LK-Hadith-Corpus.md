# LK-Hadith-Corpus investigation

Investigated: 2026-10-24. This report describes the supplied archive, not an assertion that it matches the latest upstream release.

## Sources and evidence

- Local archive: `repos/Hadith/LK-Hadith-Corpus-master.zip` (14,334,547 bytes).
- SHA-256: `ca3397aacb9db80801d10f90e556433ab7e95c617c0d061aa7f0ce9815d53964`.
- Archive README and `starter.py` were read; the Python example was **not executed**.
- Configured REA MCP `open_binary` and `inspect_artifact(detail: summary)` inspected the ZIP. Inventory reported no integrity contradictions and no symlinks. This is static archive evidence, not application runtime evidence.
- REA inspection evidence: `ev_072b708dfa9008b1117eb3ee7554f200cf103e64f7a4c9b10df36cd32e21ce73`; inventory: `ev_386e41af66ae634f03251cb6cb06908da50ebfb4575ba95e6723b7c5db334e35`. The initially blocked `close_binary` succeeded after the user requested a retry.
- All CSVs were independently counted using PowerShell CSV parsing, then imported by Baglib's TypeScript parser. Counts agreed. Every imported Arabic and English passage was checked for display-text preservation.
- The supplied paper is reviewed separately in [RQHT](RQHT.md).

## Verified structure

Each collection has `Chapter<number>.csv` files. Here a **chapter is a Kitab (كتاب)** and a **section is a Bab (باب)**. The six collection folders are not PDF/EPUB books in Baglib's library model.

| Folder | Collection | CSV chapters | Records |
| --- | --- | ---: | ---: |
| Bukhari | Sahih al-Bukhari | 97 | 7,345 |
| Muslim | Sahih Muslim | 57 | 7,314 |
| AbuDaud | Sunan Abi Dawud | 43 | 5,138 |
| Tirmizi | Jami‘ at-Tirmidhi | 49 | 4,209 |
| Nesai | Sunan an-Nasa’i | 51 | 5,680 |
| IbnMaja | Sunan Ibn Majah | 38 | 4,402 |
| Total | | 335 | 34,088 |

All inspected CSV headers contain the same 16 columns:

`Chapter_Number`, `Chapter_English`, `Chapter_Arabic`, `Section_Number`, `Section_English`, `Section_Arabic`, `Hadith_number`, `English_Hadith`, `English_Isnad`, `English_Matn`, `Arabic_Hadith`, `Arabic_Isnad`, `Arabic_Matn`, `Arabic_Comment`, `English_Grade`, `Arabic_Grade`.

Fields contain quoted commas, escaped quotation marks, multiline text, vocalized Arabic, and literal `nan` missing-value markers. Numbers often use decimal notation such as `3.0`. Muslim and Ibn Majah include chapter zero. Hadith numbers must remain strings because reference suffixes are meaningful.

## Data limitations and reconciled claims

- The README and the supplied paper state **39,038** hadiths. The actual supplied files contain **34,088 rows**. The cause of the 4,950-row discrepancy is unverified. Baglib reports the actual imported count, without inventing or downloading missing records.
- Repeated hadith-number strings were observed within collections: 20 duplicate occurrences in Bukhari and four in Tirmizi. Rows are not deduplicated. Stable record IDs use collection, chapter, and original row order.
- There are 239 records without English content and four without Arabic content. Missing translations have a visible localized notice. Existing Arabic remains available when English is hidden or absent.
- 6,426 rows lack section numbers. Missing headings/numbers remain missing. In particular, `Bukhari/Chapter3.csv` begins with section 2, hadith 59. The screenshot's section 1 and its introductory paragraph are not present as corresponding records here and are not fabricated.
- README: Bukhari segmentation was checked manually; the other collections were segmented automatically with **reported** 92% accuracy. That is the authors' claim, not a fresh accuracy measurement by Baglib.
- A display audit of 68,176 language passages found five Arabic isnad annotations that did not align with the original full-text prefix. The reader shows the intact full original in those cases rather than dropping or substituting words. No English prefix alignment failures were found in this audit.
- Grades and Arabic commentary are source data, not Baglib authentication judgments. Membership in the six collections is not displayed as a blanket authenticity verdict.
- The corpus has isnad spans, not verified per-narrator entity IDs. Name-like words inside the isnad receive the requested cyan treatment while transmission words are muted. This is a display heuristic, not a narrator graph or scholarly verification.

## Provenance and distribution

The supplied README asks users to cite Altammami, Atwell and Alsalka, *The Arabic–English Parallel Corpus of Authentic Hadith* (IMAN 2019 / journal publication cited as 2020 in the supplied paper), and *Constructing a Bilingual Hadith Corpus Using a Segmentation Tool* (LREC 2020).

No explicit license file was found in the inspected archive. This investigation does not establish redistribution rights. The implementation imports a user's local ZIP into application data; the corpus itself is not committed or bundled into installers, and no network download is performed.

## Application to Baglib

The corpus's hierarchy maps directly to a dedicated read-only Sunnah module. After inspecting the existing DBML, data dictionary and ADR-002, no library database entity or relationship was added. The user's requested separate data experience is implemented using a typed, versioned file cache outside Work → Edition → Source.

- Import/parsing: `src/main/services/sunnah/lk-corpus.ts` and `sunnah.service.ts`.
- IPC/contracts: `src/main/ipc/sunnah.ts`, `src/shared/types/sunnah.ts`, `src/preload/index.ts`.
- Display-only alignment/search: `src/renderer/libs/sunnah/text.ts`.
- Reader: `src/renderer/components/sunnah/`.
- Architecture and verification: [Sunnah Reader](feature%20-%20Sunnah%20Reader.md).

Unresolved: the archive/README row discrepancy, source translation gaps, absent standalone section introductions, annotation correctness beyond the supplied labels, licensing for any future redistribution, and narrator identities. These do not authorize silently replacing the corpus or changing its canonical content.
