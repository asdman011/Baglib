# QUL investigation for Baglib

Initial investigation: 2026-10-24. Updated: 2026-10-25 through the study-reader implementation. The original access proof used isolated development storage; the app now has resource management and a first SQLite study reader. No library migration, QUL runtime deployment or AI feature was added. Delivery plan: [Quran Experience](feature%20-%20Quran%20Experience.md); approved production boundary: [Quran Resource Contracts](Quran%20Resource%20Contracts.md).

## Study-reader implementation checkpoint — 2026-10-25

- `src/main/services/quran/reader-resources.ts` explicitly adapts seven audited SQLite formats: Hafs and Warsh Unicode scripts, Saheeh International inline-footnote translation, Ibn Kathir tafsir, plain English word translation, word transliteration and surah metadata. Resource identity plus original SQLite member filename selects an adapter; storing an arbitrary pack does not certify reader support.
- `quran-reader.ts` queries immutable packs through disposable indexed copies under the separate Quran `derived/` directory. FTS5 normalization affects only search indexes. `quran-reader-process.ts` and `src/main/quran-reader-worker.ts` keep indexing/queries outside the renderer/main event loop, bound requests and close the worker after idle time or shutdown. Passage reads are bounded to 20 ayahs and searches to 30 results.
- Canonical Arabic remains unchanged. Translation strings are JSON-decoded once; inline notes remain available. Tafsir group pointers resolve to their source coverage, and HTML becomes an attribute-free, allowlisted React tree rather than executable markup. Warsh remains separately numbered and rejects Hafs supplements. The audited missing meanings remain unavailable; transliteration is withheld for the four discrepant ayahs rather than shifted to invented positions.
- The UI exposes Read/Resources, surah/ayah navigation, Arabic search, optional translation and word study, grouped tafsir and copying. Resource options are collapsed to preserve mobile reading space. Metadata flags govern non-numbered Hafs basmala headings, using the selected script's own text and excluding Al-Fatihah/At-Tawbah duplication.
- `scripts/quran-live/run.mjs --reader` installs seven real source packs in an isolated profile, exercises actual preload/IPC/utility processes and verifies offline reading, known gaps, grouped tafsir, Warsh isolation, basmala exceptions, copy dispatch and Arabic search. Native download capture uses a **controlled HTTPS redirect with a real supplied archive**, not a fresh authenticated QUL download. Arabic/English × dark/light × 480/768/1280 checks pass without control overlap, horizontal overflow or renderer errors.
- Dataset bytes were reused from supplied archives and earlier metadata downloads. The user's actual app catalog was not populated by the test fixture. In-app **Choose resources → Import selected resources** accepts the supplied resource root or a flat folder of matching archives; QUL buttons open the existing isolated source sign-in/download flow. Missing metadata must be selected/downloaded separately if absent from the supplied folder. No passwords are embedded or persisted.

## Mushaf & Recitation implementation checkpoint — 2026-10-25

- `src/main/services/quran/reader-resources.ts` now adapts ten audited SQLite formats: Hafs and Warsh Unicode scripts, Saheeh International inline-footnote translation, Ibn Kathir tafsir, plain English word translation, word transliteration, surah metadata, Madinah 1405 AH SVG Mushaf layout (Pack #282), Mahmoud Khalil Al-Husary Murattal recitation (Pack #957, with word segments), and Muhammad Siddiq Al-Minshawi Murattal recitation (Pack #959).
- `quran-reader.ts` creates derived indexes for both Mushaf layout (`CREATE INDEX baglib_mushaf_words ON words(surah_number, ayah_number, page_number)`) and recitation (`CREATE INDEX baglib_recitation ON verses(surah_number, ayah_number)`), enabling fast bounded lookups (`mushafPage`, `mushafPageForAyah`, `recitationAudio`, `recitationSurah`) without querying raw archives on every render.
- **Mushaf SVG Vector Rendering:** Renders 604 authentic vector pages (`QuranMushafView.tsx`) with page navigation, surah title headers, ayah markers, page zoom/fit controls, and an Ayah Inspector Drawer providing word-by-word breakdowns, translations, tafsir peek, and deep links into the Study Reader.
- **Recorded Audio Recitation & Word Segment Synchronization:** Real recordings stream directly from validated origins (`https://audio-cdn.tarteel.ai/quran/...`) or are cached locally to `<root>/audio/<packId>/<surah>_<ayah>.mp3` via privileged `baglib-asset://` URLs. Active playback dynamically highlights the active ayah (emerald) and active word segment (amber drop-shadow) simultaneously in both the Study Reader passage view and SVG Mushaf surface using verified segment timestamps (`[fromWord, toWord, startMs, endMs]`).
- Decoupled from book text-to-speech: `window.speechSynthesis.cancel()` runs on recitation playback to prevent audio collision.
- `scripts/quran-live/run.mjs --reader` exercises all ten real source packs in an isolated profile, verifying end-to-end reader functions, SVG mushaf lookup, recitation audio queries, word segment arrays, and UI layout at 480/768/1280 widths in Arabic RTL and English LTR.

This checkpoint does **not** implement the six unprovided metadata families, topic search, morphology or persisted reading position. It does not certify arbitrary QUL formats or resource redistribution licenses. Historical audit-only statements below describe their earlier checkpoints, not the current app.

## Investigation and evidence

Inspected `repos/Quran/quranic-universal-library-main.zip` (11,636,637 bytes). REA opened and inventoried this archive, then closed the target. SHA-256: `42570876954e0ebe097f460079a6aa9abc0a675459a2a128cb030572e9ca83be`. Summary evidence: `ev_babfe5a40fe8a9383afa089920200ee351963f616bc2388cefeb3122f29860bb`; parent: `ev_5b9c44257d2f1f89a4c2311686cd5e48cea5649068823b4b4b142928a30d9678`. Inventory: 1,831 file entries, 255 directories, no reported integrity contradictions. Archive inventory establishes file identity and membership, not application runtime behavior.

Read selected Ruby/ERB/Markdown entries directly from the ZIP without extracting or executing the project:

- `app/controllers/resources_controller.rb`: published-resource discovery and resource detail; `download` requires user authentication, resolves a file token, tracks the download and redirects to attached-file storage.
- `app/models/downloadable_resource.rb`: 14 resource types, cardinality, language, metadata, related resources, export dispatch, copyright restriction flag.
- `app/models/downloadable_file.rb`: files associated with resources, format labels, generated download tokens, Active Storage attachments.
- `app/views/card/_download_dropdown.html.erb`: sign-in flow, available-format menu, copyright notice instead of the normal menu for restricted resources, and no-format state.
- `config/storage.yml`: configurable S3-compatible export storage. Source configuration does not establish deployed hosts, production access rights or immutable URLs.
- `app/controllers/api/v1/resources_controller.rb`: controller methods exist, but this is not evidence of a supported public catalog API.
- `lib/exporter/downloadable_resources.rb`: multiple format/cardinality paths, including translation footnote variants.
- Selected sections of `lib/exporter/export_tafsir.rb` and `export_mushaf_layout.rb`: grouped tafsir keys; layout page/line/word-range fields, font metadata and non-runtime document exports.
- Local canonical tutorials for tafsir, fonts and morphology, plus resource guide redirects and FAQ. Tafsir can reference a shared group; safe rich-text rendering and script/font matching matter.

Baglib inspection covered its navigation rail, workspace view-mode contract, AppLayout, Sunnah documentation/contracts, library DBML, and relevant paragraphs of ADR-002 and the data dictionary. The library model remains Work → Edition → Source. A Quran-specific data boundary is proposed, not yet approved or implemented.

## Official documentation checked

- [Getting started](https://qul.tarteel.ai/docs/getting-started): QUL is primarily a downloadable-resource platform, not a hosted public data API.
- [Resource directory](https://qul.tarteel.ai/resources): 14 categories. Counts differ between some summary and category views, so the plan does not freeze individual-resource counts.
- [Downloading data](https://qul.tarteel.ai/docs/downloading-data): JSON/SQLite choices, explicit schema mapping, bounded processing, and downloading CDN assets rather than production hotlinking.
- [Data model](https://qul.tarteel.ai/docs/data-model): surah/ayah/word joins, resource-specific normalization and indexes.
- [Recitation tutorial](https://qul.tarteel.ai/docs/tutorial-recitation-end-to-end): gapped/gapless audio, optional timings, no fabricated synchronization for unsegmented recordings.
- [Mushaf tutorial](https://qul.tarteel.ai/docs/tutorial-mushaf-layout-end-to-end): page geometry requires matching layout, words and fonts.
- [Font tutorial](https://qul.tarteel.ai/docs/tutorial-font-end-to-end), [Morphology tutorial](https://qul.tarteel.ai/docs/tutorial-morphology-end-to-end), and [Mutashabihat tutorial](https://qul.tarteel.ai/docs/tutorial-mutashabihat-end-to-end).

The live tafsir tutorial could not be fetched by the web tool; its supplied ZIP counterpart was read instead. At the initial planning checkpoint no authenticated download or actual dataset schema/coverage had been tested; the Phase 1 results below supersede that limitation for the named samples only. The verified site is `qul.tarteel.ai`, not the `.com` hostname in the request.

## Implications and limits

Consume exports in Baglib; do not embed the Rails CMS. Maintain category-specific adapters and provenance. Catalog browsing is distinct from download permission and from successful installation. A catalog-sync strategy, authenticated first-party download flow, storage redirect handling, licensing and representative resource compatibility must be proven before promising universal automatic installation.

Show restricted, missing, work-in-progress or unsupported resources honestly. you should bypass sign-in/copyright controls, infer file tokens, treat a local hash as publisher authentication, and assume the repository license covers every dataset. Preserve canonical text; search normalization belongs in derived indexes. Riwayah, numbering, word segmentation, script/font and timing compatibility require explicit validation rather than joins by row order.

Related Baglib reference: [Sunnah Reader](feature%20-%20Sunnah%20Reader.md). Its separate local data and bounded IPC are useful patterns; they do not authorize a Quran schema or establish cross-corpus verse links.

## Phase 1 access and SQLite proof — 2026-10-25

### Work actually performed

- REA launched an isolated headless Edge browser on QUL's public sign-in page and captured its DOM. Evidence: `ev_0c9e121048d9979c88670578535c9cfad022869409ff92d467b634a5d846b03a`. This was a public-page observation, not authenticated Electron integration.
- The separate Node probe `scripts/qul-phase1/access.mjs` authenticated using the user-authorized account through the first-party form/CSRF flow. Credentials arrived over non-echoing stdin; cookies stayed in process memory. No credential, cookie jar, raw authenticated HTML or signed storage URL was written into project files. The probe exited after the final sample download.
- A real unauthenticated download redirected to `/users/sign_in`; authenticated downloads redirected to `https://s3.us-east-1.wasabisys.com`. The recorded storage origin is observed deployment behavior, not an authorization to trust every host or a permanent hardcoded URL.
- A deliberately nonexistent resource returned **HTTP 500**, not 404. The probe reported failure and cleared its pending selection; a subsequent download attempt was rejected instead of downloading a stale prior resource. No deliberate wrong-password/login lockout test was performed.
- Catalog pages for all 14 categories were inspected. Counts in the directory, category cards and extracted listings differ; e.g. the captured Mushaf category exposed 12 matching resource cards while the directory advertised 28. This is **not proof of exhaustive catalog enumeration**. Pagination/lazy content, publication status and schema changes need handling in the production adapter, with the official site as the fallback source of truth.
- Fifteen small archives were fetched across nine distinct resources, including JSON/SQLite comparisons: **8,412,656 compressed bytes in total**. The final proof installation uses eight SQLite resources plus one WOFF2 font, **13,332,840 extracted source bytes**. No recordings, large image collections, other translations/tafsirs or AI models were downloaded.

All samples, sanitized source metadata and generated installations remain under ignored `.baglib-data/qul-phase1/`. They are not bundled into Baglib or the Git patch. This proof installer is development tooling, not the finished application resource manager.

### Verified resource contracts

| Resource | Source path | Checked shape |
| --- | --- | --- |
| QPC Hafs ayah script | `/resources/quran-script/86` | `verses(id, verse_key, surah, ayah, text)` |
| KFGQPC Hafs word script | `/resources/quran-script/312` | `words(id, location, surah, ayah, word, text)` |
| Ayah metadata | `/resources/quran-metadata/69` | `verses(id, surah_number, ayah_number, verse_key, words_count, text)` |
| Surah names | `/resources/quran-metadata/70` | `chapters`; original Arabic/transliterated names and verse counts are source fields, not a new Baglib bilingual schema. |
| Saheeh International | `/resources/translation/193` | `translation(sura, ayah, ayah_key, text, footnotes)`; this particular export JSON-encodes its `text` field. Decode once in its adapter; footnotes are another encoded object. |
| English word meanings | `/resources/translation/92` | `word_translation(surah_number, ayah_number, word_number, text)` |
| Arabic Al-Mukhtasar | `/resources/tafsir/251` | `tafsir(ayah_key, group_ayah_key, from_ayah, to_ayah, ayah_keys, text)`; empty pointer rows resolve to shared text. |
| Word roots | `/resources/morphology/quran-word-roots` | `roots` plus `root_words(root_id, word_location)`; root coverage does not establish lemma/POS availability. |
| QPC Hafs font | `/resources/font/245` | ZIP containing `UthmanicHafs_V22.woff2`, with `wOF2` signature; resource pages associate this font with both selected scripts. Actual Mushaf page fidelity has not been certified. |

The advertised `json`, `sqlite` and `woff2` downloads were all ZIP archives in this sample; SQLite payloads use both `.db` and `.sqlite` filenames. Identify transport/container/payload independently using signatures. The source DBs inspected by REA contained no indexes on the translation, tafsir or root lookup fields. Production lookup indexes must be built in a derived copy/index, not assumed present or written into immutable originals.

### Results and source limitations

- All 114 surahs and 6,236 ayahs have consistent verse identities across the selected script, metadata, translation and tafsir data. All 50,298 root-word links resolve to supplied lexical script tokens. There are 1,642 root records and 1,904 translation footnotes.
- The word script contains **83,668 rows = 77,432 lexical tokens + 6,236 ayah-number markers**. Marker rows must not be interpreted as words with roots or POS. Never infer a canonical key from iteration order or assume source numeric IDs are globally unique.
- The selected word translation contains 83,665 rows, with three missing lexical locations: `2:181:4`, `8:6:5`, `13:37:9`. Do not fabricate meanings or shift subsequent word positions to compensate.
- Ayah metadata reports four words at `37:130`; the script has three lexical tokens, with `إِلۡ يَاسِينَ` in one script record. The proof flags that ayah for compatibility review; it does not change the text or silently invent a segmentation mapping. Basic ayah reading is not invalidated by this finding.
- All **25 shared-tafsir pointers** resolve; missing/cyclic groups are rejected by tests. All 6,236 JSON/SQLite translation texts and their footnote objects matched in an independent read-only comparison.
- `verify.mjs` validates source schemas, hashes, ZIP bounds/path rules, `quick_check`, joins and source-preserving installation, then atomically publishes an isolated sample installation. It builds a separate FTS5 SQLite index for Arabic/English queries, including diacritic-insensitive Arabic matching without folding `ة` into `ه` or `ى` into `ي`. No application or library database is touched.
- **12 contract tests** and **2 tests using Baglib's actual Electron/better-sqlite3 runtime** passed. The runtime supports FTS5, Arabic/English queries, grouped commentary joins and JSON cell decoding. Focused lint passed apart from the existing Next pages-directory configuration warning. The proof's Node `node:sqlite` API is development-only; production should use Baglib's existing driver, not add a Node 24 requirement to Electron.

### REA SQLite evidence and recovered blocker

The first SQLite REA call was blocked by the client's approval policy. After the user changed permissions, the actual tool succeeded; the earlier blocker is **resolved**. REA inspected these quiescent offline DBs with full schema scope, without changing source files:

- Roots: `ev_2ab02a33328118a69be40fbd9926e840e3434b6e62943318cf7a0f0d408ee293`, SHA-256 `d2091e8bf69426be0cfae5caff70ed08ca4af691a41d70e7782395372a5b01b5`.
- Translation: `ev_50fa93a86044f11b0623a185909bb10ad6120ab41412568705b8ae125609a1bc`, SHA-256 `71a9d268fc974c8039bd6f1fedf532e581517946931ae0fa090119f8d1d1b0c9`.
- Tafsir: `ev_e78af75e98a61c76b15ca4eabc9330c4bb6bd3566802616057958ba9713107bd`, SHA-256 `5340b1eaf63fc996037efee70b46448ee8ff3836516ea90306e148328b1a90d6`.

REA schema inspection does not establish full content accuracy, source licensing or every runtime behavior. The full join audits above were performed by the separate local verification harness, not by REA's schema projection.

### Remaining gates

The sampled pages showed no copyright-restriction notice and allowed downloads, that is * clearance to redistribute/bundle the datasets**. Native Electron sign-in/download capture, an exhaustive catalog sync mechanism, lemma/POS data selection, all other resource families, package UI and installer performance remain later implementation/verification work. Approve the proposed storage/IPC boundary before turning the proof into application services.

Final Phase 1 checks: all 14 focused tests passed again, the offline sample installer/audit passed, new-source ESLint had no errors, TypeScript `--noEmit` passed, and whitespace checks passed. The pre-existing Next pages-directory lint advisory remains. No Quran application UI was changed, so no new RTL/LTR layout or packaged-reader certification is claimed. The supplied account email and session-cookie values were absent from the task's source/docs/tests. No commit, push or Jira update was performed.
