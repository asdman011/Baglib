# Feature: Arabic Quran Metadata Copies

## Authorized scope — 2026-10-26

The user authorized separate Arabic SQLite copies of three supplied QUL datasets and explicitly approved parallel translation agents for the large corpus. Original SQLite files/ZIPs, identifiers, schema, source Arabic and app behavior must remain unchanged. No translated copy is installed automatically or represented as an official QUL Arabic edition.

Sources contain 114 surah introductions (917,630 characters of full HTML text plus 18,270 characters of summaries), 2,512 topics (287 nonempty descriptions; 992 existing Arabic names), and 2,098 ayah themes with 1,722 nonempty keyword strings. These are measured from the supplied files, not catalog estimates. Technical URLs/IDs and structural references are not linguistic translation targets.

## Source evidence

REA inspected the extracted, read-only copies in `.baglib-data/quran-arabic-translation`:

- `surah-info-en.db`: `surah_infos(surah_number, surah_name, text, short_text)`; evidence `ev_c57dfc5499038774331516aa04fc59077f7c6bd4f8941e7d71e6d44e18b55bee`.
- `topics.db`: 12-column `topics` schema; initial inventory evidence `ev_2dbdd6b833409f43521c6a5c2af9051aaf2908609a61682351abe1869f6ee8ea`, followed by explicit field/sample inspection.
- `ayah-themes.db`: 6-column `themes` schema; initial inventory `ev_661a032a6d24dded4ddd037bb11a2232a10d6ff26ca6cf916745d2cb9c3a5d7b`, followed by explicit field/sample inspection.

Full source hashes and exact SQLite DDL are recorded in local `audit.json`. REA establishes stored structure/sample content, not scholarly authentication of every historical/theological claim in the supplied metadata.

## Processing and safeguards

`scripts/quran-metadata-arabic/prepare.mjs` exports bounded immutable work batches; `references.mjs` derives 6,236 exact Hafs ayahs and 114 Arabic surah names from supplied QPC script 312 and surah metadata 70. Only trailing Arabic numeral verse ornaments are removed from quote-reference strings; source words/diacritics remain untouched. Neither source dataset is rewritten.

Translations are human-language model work, not an unreviewed external translation API or mechanical prose word substitution. Existing nonempty topic `arabic_name` values are reused verbatim for translated names while the original column remains unchanged. Existing Arabic-only values and Arabic HTML segments remain byte-for-byte intact. All HTML tag/attribute tokens, numeric IDs, links, relation fields and keyword delimiters are preserved. Quran quotations must match the canonical supplied text exactly; ambiguous Quran/Hadith references are flagged for review, never reconstructed as invented Arabic scripture. Source claims are translated, not silently corrected or newly authenticated.

`validate.mjs` rejects schema/key changes, untranslated Latin prose, missing values, changed original Arabic/markup, malformed keyword delimiters and unverified canonical quotations. `build.mjs` publishes no database for a dataset with incomplete/invalid rows. Completed copies retain exact SQLite DDL, rows, IDs and all nontranslated columns, pass `integrity_check`, and are emitted with provenance hashes. This modifies no approved library/Quran schema, app source selection or installed canonical resources.

## Status and verification — Completed Delivery (2026-10-26)

All three datasets have been translated, reviewed, verified against canonical scripture, and published as immutable SQLite databases:
1. **Surah Information:** `surah-info-ar.db` (114 surahs, SHA-256 `70caf11eb209580f00fa4056e0d1105b05bbc2068689ef36c365ea5c10f05232`). Full Arabic introductions and summaries.
2. **Quranic Topics:** `topics-ar.db` (2,512 topics, SHA-256 `d5bb4de1a2c0decbb3e32126c47dada5406e470a5d21834cdc5e9a793d9602d6`). Resolves anomalies (including Topic 2314 `Job the Baptist` -> `يحيى (يوحنا المعمدان) (ﷺ)` and Topic 2315 `يونس (ﷺ)`).
3. **Ayah Themes:** `ayah-themes-ar.db` (2,098 themes, SHA-256 `58347430bfd1f78270a99ea74bddaece0e952a6d467c06fc36a646ceb718dfcc`). Fully verified against Uthmanic verse boundaries.

Published release ZIP package:
`repos/Quran/QUL Developer Resources/Arabic metadata - Baglib/baglib-quran-arabic-metadata.zip` with complete `manifest.json` and Arabic `README.md`.
Pipeline verification: All 6 automated pipeline tests pass (`validate.test.mjs`, `build.test.mjs`). See [QUL](QUL.md) and [Quran Resource Contracts](Quran%20Resource%20Contracts.md).

