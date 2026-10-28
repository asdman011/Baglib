# Open-Hadith-Data investigation

Investigated 2026-10-27 by Codex for the requested standalone Tafseel alignment pipeline.

## Sources and evidence

- Upstream clone: `Open-Hadith-Data/`, repository `https://github.com/mhashim6/Open-Hadith-Data`, revision `1515f6cba21efed20d8916bf55acef1dffa0d2d5`.
- Supplied archive: `repos/Sunnah/Open-Hadith-Data-master.zip`, SHA-256 `ef57c9ed193386bc338bfa66975adbe0edce557b5c1c3c766e997cac3ba28e35`.
- REA `open_binary` / `inspect_artifact(detail: summary)` / `close_binary` succeeded. Inspection evidence `ev_2cd77580f08d7f78cd0177aeacd60d3ffeeaf1745e0d5be8e07f1ee3efcfc6f0`; inventory `ev_2af6cb9c823dee4be56c219d281679cc2addc2c884b590d36f7ec898c901bb5a`. 33 occurrences, 22 files, 11 directories, zero symlinks/integrity contradictions. Static archive inventory does not establish CSV semantics.
- REA process capture was attempted and returned `capability_unavailable`: native Windows PTY cleanup is unsupported. No process-capture success is claimed. Python CSV inspection and SHA-256 comparisons were performed separately with terminal tools.
- All 18 archive CSVs equal the checkout after CRLF/LF normalization; raw hashes differ because of checkout line endings. The alignment manifest fingerprints the actual checkout bytes consumed.
- Read upstream README and LICENSE; no upstream scripts executed.

## Verified data structure

The six vocalized commentary files are headerless, consistently three-column CSVs: source ID, Arabic hadith, commentary. CSV-aware parsing preserves embedded commas, quoted/multiline passages and bidi characters. The pipeline also supports the specified two-column and wider schemas by selecting the last two fields.

| Collection | OHD folder | Rows |
| --- | --- | ---: |
| Bukhari | Sahih_Al-Bukhari | 7,008 |
| Muslim | Sahih_Muslim | 5,362 |
| AbuDaud | Sunan_Abu-Dawud | 4,590 |
| Tirmidhi | Sunan_Al-Tirmidhi | 3,891 |
| Nesai | Sunan_Al-Nasai | 5,662 |
| IbnMajah | Sunan_Ibn-Maja | 4,332 |

Each selected filename contains `mushakkala_mufassala`; original file paths/hashes/counts are recorded in the output JSON. Source IDs are retained in audit samples, never used as a cross-corpus join key. OHD row indexes are zero-based parsed-record positions, not physical line numbers or source IDs.

## Provenance and limitations

README identifies `ceefour/hadith-islamware` as the original CSV source and notes bidi controls used around words/narrators. LICENSE declares ODbL 1.0 for the database and Database Contents License for individual contents. No legal interpretation or redistribution authorization is inferred.

The user's specification names Fath al-Bari, Al-Minhaj, Awn al-Mabud, Tuhfat al-Ahwadhi and Hashiyat al-Sindi. These attributions were supplied context, not independently authenticated for every record. The pipeline copies the exact commentary field and does not add invented author/edition labels.

## Application to Baglib

The tool is isolated under `tools/hadith-alignment/`; generated `hadiths` SQLite is a research export, not a migration to Baglib's library schema. Existing Work → Edition → Source and file-backed Sunnah reader remain intact. See [Hadith Commentary Alignment](feature%20-%20Hadith%20Commentary%20Alignment.md) for comparison, actual coverage and limitations.
