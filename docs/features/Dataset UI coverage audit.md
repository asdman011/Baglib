# Dataset and UI coverage audit

Date: 2026-11-01. Agent: Claude Code. Scope: datasets behind Quran, Sunnah and Al-Bayan poetry, plus translation use across `src/renderer/translations.ts`.

Method: every table and column of the real databases was profiled for fill rate (`sunnah_kutub_tisah_itqan.sqlite`, the installed `bayan_poetry.sqlite`, every QUL file under `repos/Quran/QUL Developer Resources` and `.baglib-data/qul-phase1`), then traced to a query, an IPC handler, a preload method and a mounted component. Fixes were checked through the app's real IPC and by driving the running app on a throwaway profile in Arabic and English.

## Verified gaps, all fixed

### Quran

| Gap | Evidence | Fix |
| --- | --- | --- |
| Word meanings could not be read | `selection.meanings` had a selector, but no mounted code read it. `QuranPassageView`, the only renderer of meanings, is not mounted since ADR-005. The 77,429-row `translation/92` dataset was unreachable. | New Word meanings study tool: rail, context menu, Explore panel |
| Arabic metadata never reached the UI | `surah-info-ar.db`, `topics-ar.db` and `ayah-themes-ar.db` (114 surahs, 2,512 topics, 2,098 themes) had no preset, so the Arabic interface showed English | Three import-only presets. Arabic interface uses them, English keeps the source. A disclosure is shown |
| Topic and similar-ayah drawers were not mounted | `QuranTopicDrawer` and `QuranSimilarAyahsDrawer` were only imported by tests. `searchTopics` had no caller, so topic search, topic ayah lists, wiki links, thematic and ontology flags, parents, related topics, coverage and word ranges were unreachable | Both drawers mounted inside the reader. Topic parents, related topics and wiki links added. Hardcoded `Thematic` and `Ontology` moved to i18n |
| Raw HTML shown as text | Surah introductions and topic descriptions rendered literal `<h2>` and `<b>` | `richText` now keeps headings; intro renders rich text; topics use plain text |
| Structure metadata unused | Juz, hizb, rub, ruku, manzil and sajda packs had no preset or query. 30, 60, 240, 558, 7 and 15 rows | Six presets, `quran:structure`, Juz and Hizb navigation, current quarter, manzil and ruku, sajda marker on its page |
| Surah facts unused | `revelation_place`, `revelation_order` never selected | Shown on the surah card |
| Theme keywords and spans unused | Margin labels showed the theme text only | New Themes tool with range and keywords |
| Al-Mukhtasar tafsir unreachable | `tafsir/251` existed locally with no preset | Added as a second tafsir source |
| Whole-ayah transliteration unused | `en-transliteration-rtf.db` (6,236 rows) had no preset | Added, with its own selector, shown above word transliteration |
| Mutashabihat references were plain text | `references` rendered as a string | Each reference now jumps to its ayah |

### Sunnah

| Gap | Evidence | Fix |
| --- | --- | --- |
| `rijal_narrators` never queried | 115,735 rows and no query in `src`. Only `hadith_narrators` was used | `sunnah:narrator` and a narrator profile: names, kunya, lineage, generation, death, grade, per-dictionary grades, teachers, students |
| Chain fields dropped | `grade_tier`, `death_ah`, `candidate_count` were in every node and unused | Shown per narrator. Unresolved narrators show their candidate count |
| Matn source unreachable | `Matn_Shamela_URL` filled on 100% of rows, never read | Open hadith book button. `sunnah:source` takes a kind, keeps its URL check |
| Match method hidden | `method` was returned but never shown, including the approximate `tfidf_window` matches | Shown beside the score |
| Matched root words unused | `matched_words_json` never selected | Shown when a root is opened |
| Text similarity unused | `similarity` on 16,775 corroboration links | Shown on related hadiths |
| No path from Quran roots to hadith | `quran_hadith_root_bridge` was reachable only from a hadith. 1,535 of 1,642 QUL roots match it exactly once spaces are removed | Morphology roots list sharing hadiths and open them |
| Blank grade rows | 412 `English_Grade` values are a single space, which rendered an empty row | `value()` treats whitespace as empty |

### Poetry

| Gap | Evidence | Fix |
| --- | --- | --- |
| `language_variant` not filterable | 72% filled, 4 real values, display only | Filter added, `-` excluded. Loaded when the panel opens: it scans every poem, 3.4s cold and 0.7s warm, and has no index |
| `location` not filterable | 22 values, display only | Filter on poems and the poet browser |
| Poet browser dropped location | Not selected. Null eras printed a stray separator | Selected and shown |
| `verseCount` returned, never shown | | Shown on result cards |
| Reader printed stray separators | Null meter left a trailing dot; `-` shown as a language type | Guarded |

## Translation keys

- 3,151 keys per language before this work, 2,913 now, after 69 added. Arabic and English match.
- 314 keys were removed. Each had no quoted or `.key` reference in `src`, `tests` or `scripts`, and each was checked again as a bare word. No `hub*` key was removed.
- Connected instead of removed, because the same text was hardcoded: `newMaterialDefaultAuthor`, `workTypeLabel`, `providerStatusRunning`, `speedReaderBtn`, `quotaWarningDefault`, `quotaDepletedDefault`, `quranThemes`, `quranThemeAyahs`, `quranNoThemes`, `quranViewSimilarAyahs`, `quranAlignmentNotice`.
- `tests/ui/translation-keys.test.ts` now fails on an unreferenced key or a language mismatch.

## Left as they are, with reasons

| Item | Reason |
| --- | --- |
| 49 keys referenced only by tests | Existing suites assert them, though no screen shows them. Removing them means rewriting tests in other features. Listed for a later decision: audio strings such as `quranAudioStop`, reader aids such as `readingRulerBtn`, `tagSaved` and others |
| `QuranPassageView` | Not mounted, but `tests/ui/quran-reader.test.ts` renders it, so its keys stay in use |
| `sunnahUntitledSection` | Removed. A test requires numbered empty section titles to stay blank |
| Bukhari and Muslim grades hidden | Verified uniform: every row says `صحيح`. Deliberate, and a test covers it |
| `colored-english-wbw-translation` | The same text as `translation/92` with colour markup |
| `ayah-root`, `ayah-lemma`, `ayah-stem` | Per-ayah rollups of the word-level data already shown |
| `quran-metadata-ayah`, `qpc-warsh-script-ayah` | Repeat text the reader already has |
| `wensinck_ref` | A key built from root and book, with nothing further to show |
| `resolution_method` | 24 internal pipeline labels. The candidate count and resolved count carry what a reader needs |
| Duplicate poets | Up to 4 rows share a name because sources differ. Merging them is a data decision, not a UI gap |
| English poems | The corpus has none, so the English tab keeps its existing empty state |

## Assumptions

- `tabaqat` and `tarikh` in `sources_json` are shown as plain titles, Al-Tabaqat and Al-Tarikh, because the data does not name the author.
- `quran-metadata/*` download through QUL's public sqlite exports, as the catalog lists. Installs here came from local files; a live QUL download was not run.
- Sajda `required` and `optional` are QUL's classification, and the tooltip says so. It is not a ruling.
- The Arabic copies are machine translations with no specialist review, per their README. An earlier note kept them out of automatic install. This work follows the user's newer request, keeps them import-only for packaged builds and shows a disclosure. In development they install automatically from the repository, like other presets.

## Limits

- A rare poetry filter value can take seconds on a cold start, because `language_variant` has no index. An index would change the partition schema, so it was not added.
- `searchTopics` is not diacritic-normalized. Unchanged by this work.
- Teacher and student lists show the first 40 and say so.
- The `Sunnah` narrator data quality is the source's: 73% of chain mentions are unresolved, and some resolved names cover many people.
