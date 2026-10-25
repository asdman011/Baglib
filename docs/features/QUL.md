# QUL investigation for Baglib

Initial investigation: 2026-10-24. Updated: 2026-10-25 after the Phase 1 proof and authorized Phase 2 implementation. A small sample set was authenticated, downloaded and validated in isolated development storage; Phase 2 adds the Quran Resource Library. No library migration, QUL runtime deployment or AI feature was added. Delivery plan: [Quran Experience](feature%20-%20Quran%20Experience.md); approved production boundary: [Quran Resource Contracts](Quran%20Resource%20Contracts.md).

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

Show restricted, missing, work-in-progress or unsupported resources honestly. Never bypass sign-in/copyright controls, infer file tokens, treat a local hash as publisher authentication, or assume the repository license covers every dataset. Preserve canonical text; search normalization belongs in derived indexes. Riwayah, numbering, word segmentation, script/font and timing compatibility require explicit validation rather than joins by row order.

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

At the Phase 1 checkpoint, native Electron sign-in/download capture, exhaustive catalog sync, lemma/POS selection and approval of the proposed boundary remained gates. The user subsequently approved the boundary and Phase 2. Native capture is now implemented and tested in a controlled fixture, as detailed below. Resource-specific rights remain explicit: the sampled pages showed no restriction notice, but that is **not clearance to redistribute/bundle the datasets** or a consequence of the repository MIT license.

Final Phase 1 checks: all 14 focused tests passed again, the offline sample installer/audit passed, new-source ESLint had no errors, TypeScript `--noEmit` passed, and whitespace checks passed. The pre-existing Next pages-directory lint advisory remains. No Quran application UI was changed, so no new RTL/LTR layout or packaged-reader certification is claimed. The supplied account email and session-cookie values were absent from the task's source/docs/tests. No commit, push or Jira update was performed.

## Phase 2 implementation evidence — 2026-10-25

The approved module is implemented in `src/shared/types/quran.ts`, `src/main/services/quran/`, `src/main/quran-worker.ts`, `src/main/ipc/quran.ts`, preload and `src/renderer/components/quran/QuranView.tsx`. The navigation tab precedes Sunnah; all labels, status/errors and category choices use the centralized Arabic/English translations. Existing library entities and migrations are unchanged. See [approved contracts](Quran%20Resource%20Contracts.md) for the concrete schema and limits.

The browser download pattern comes from the actual first-party controller/view investigation above: an authenticated first-party token link (often `target=_blank`) redirects to export storage. Baglib now isolates the source browser, validates that the token belongs to the selected resource's current authenticated page, and captures the browser download rather than accepting arbitrary renderer URLs or exposing account credentials through IPC. Source URLs/tokens remain ephemeral. The origin allowlist reflects the observed QUL/Wasabi deployment and intentionally fails closed if hosts change.

`scripts/quran-live/run.mjs` exercises real Electron preload/IPC, native `will-download`, the observed first-party-to-storage redirect shape with popup-target handling, a real Phase 1 SQLite archive, utility-process validation, local registry publication and removal. Its controlled HTTPS responses are fixtures, **not evidence of a fresh authenticated live-QUL browser download**. The source browser was verified to have sandbox/context isolation, no Node integration and no Baglib preload. Public live QUL catalog refresh through the real Electron session returned 30 Quran script cards after the fixture interception was removed.

Layout checks cover Arabic/English, dark/light, and 480/768/1280 pixels, with collapsed/expanded navigation as appropriate. They check control overlap, page overflow and direction; Arabic narrow and English desktop screenshots were visually inspected. Hidden-window test captures disable transitions to avoid sampling stale compositor animation frames; no animation fidelity claim is made. The fixture uses isolated userData and never imports into the user's real library. Native-download fixtures do not send credentials or bypass QUL sign-in.

Source data remains immutable; invalid packages, unsafe ZIP members and executable SQLite schema are rejected, cancelled jobs cannot return to active state from late progress, and startup marks incomplete jobs interrupted. Unknown reading profiles retain separate resource-scoped identities with explicit qira’ah/riwayah/tariq/numbering/segmentation/script fields. No Hafs/Warsh correspondences, linguistic corrections, AI output or Qira’at datasets are fabricated.

Remaining limits: partial catalog coverage, unverified profile/dependency compatibility, resource-specific rights, a fresh interactive native QUL sign-in check, larger/unsupported resource formats, partial-download resume, reader/query adapters, recitation playback and packaged-installer certification. The UI explicitly identifies installed packs as stored resources, not completed reader capabilities. The existing Work → Edition → Source model and Sunnah domain are unchanged.
