# QUL investigation for Baglib

## Study assistant Warsh correspondence — KEY-276, Codex, 2026-11-09

Review correction to `26f6d7a`: lexical alignment excluded Hafs 1:1's basmala, which left its tafsir/translation unattached. The attached-source map now assigns **Warsh 1:1 → Hafs [1:1, 1:2]**, in that order, when the installed Hafs first ayah is the basmala and the installed Warsh first ayah starts with al-hamd. A script that counts the basmala retains its direct alignment. Only attached Hafs-numbered sources change; no basmala is inserted into canonical Warsh ayah text. Existing localized labels and Hafs citation targets identify each source independently.

`assertHafsCoverage` checks reference identity against every original Hafs ayah after that attachment rule and throws `unattached-hafs-ayahs` with the full missing-reference list. The old cardinality-only check excluded the basmala and did not prove this requirement. The derived cache adapter is now `assistant-overlap-v2`, forcing old maps to rebuild. The reproducible disposable-copy verifier passed all **114 surahs /6,214 Warsh ayahs /6,236 attached Hafs ayahs, zero unattached references** in `.baglib-data/key276-fix-fTNNQr`; its `overlap.json` records the map/coverage and `cleanup.json` confirms127 tracked originals unchanged and copied profiles deleted. The UI is unchanged; no native rerun was required for this fix.

Claude later attributed the late real `catalog.sqlite` hash/WAL change to the user's own installed BagLib writing its `jobs` table; Claude's read-only `quick_check` passed. This is reviewer-provided attribution, not a new inspection by Codex. The original files were not altered or repaired by this task.

This adds one explicit correspondence path for the assistant. Earlier statements that no Warsh/Hafs mapping exists are superseded for this path only. The Quran view's profile compatibility checks remain in force.

Evidence actually inspected:

- REA catalog inventory: `ev_bed8dd9d9b255ee6f044629d978c36553e6e59f3ce816b080dd1ab261c6d5249`, catalog SHA-256 `4fdd1557148453388c369f3991417896653747eb466d111e954b5313415b2647`. No nonempty source WAL was observed; REA uses a private stable-file copy and does not certify an atomic live backup.
- REA copied Warsh WBW inventory: `ev_5a8b601277a05e23a441bfc4f124e357329947dc62439eab780ccc5a5dd5cbdc`, SQLite SHA-256 `dc8126a9ea943961efa8a3d50887d016f052b11c72bb6a5d54a57d6394db2b1d`, one six-column `words` table.
- REA copied Warsh ayah inventory: `ev_a44846df6311314e90bb08593f82c492b97e5eb3812b16e46167e9de4dc1c73c`, SQLite SHA-256 `4823aba2f5bb32b27438d71d565a8f1ed4b93a9c073437ac727a0787490bcf0c`, one five-column `verses` table.
- Parameterized read-only queries against the disposable catalog/pack copies established `words(surah,ayah,word,text)` and `verses(surah,ayah,text)`. The complete sequence experiment and reproducible `scripts/assistant-live/verify-overlap.ts` cover all 114 surahs / 6,214 Warsh ayahs.

Verified observations include: Warsh Al-Fatiha omits the counted basmala; its lexical words map 1–5 to Hafs 2–6 (attached sources additionally include Hafs1:1 on Warsh1:1), and splits Hafs 7 across Warsh 6 and 7. Warsh 4:44 contains the joined token `اُ۬لسَّبِيلَۖوَاللَّهُ`, crossing Hafs 4:44/45. Joined tokens also occur at 20:87/88 and 24:36/37, so matching by ayah index or ordinal WBW position loses references. Split spelling differences include Hafs `وَأَلَّوِ` versus Warsh `وَأَن` + `لَّوِ` at 72:16.

`src/main/services/quran/warsh-overlap.ts` compares normalized copies: strip combining/Quran marks, marker digits, tatweel and spacing; unify alif forms; preserve taa marbuta/haa distinctions. A bounded monotone word edit alignment permits substitutions and 1:2/2:1 joins, including one-letter join differences. Every reachable optimal path must yield the same ayah-pair set; ambiguous pairs, boundary gaps, excessive divergence and unsupported drift fail explicitly. Interior spelling ties are allowed when their ayah mapping agrees. This is an algorithmic correspondence derived from the installed versions, not a claim that the two readings have identical canonical words or a publisher-certified universal map. All tested installed surahs passed; untested future resource versions must pass again. The 12-word band and divergence bound are deliberate compatibility limits.

`QuranReader.overlap` stores per-surah JSON under the existing `quran/derived` directory, keyed by both pack digests, adapter version and surah. No canonical database field/table is added. `ayahTexts` reads the original Warsh **ayah** script read-only; the WBW alignment never replaces its text. `assistantSources` resolves the installed Hafs resources against each overlapping Hafs ayah, preserving original resource titles and grouped commentary content. Distinct labels can reference the same grouped tafsir text; no overlapping reference is removed by deduplicating commentary bodies. Labels carry the actual Hafs reference and localized numbering notice, and citation targets open that Hafs reference.

Native run `.baglib-data/assistant-live-3k7Xnb` verified both UI languages, 1280/480 widths, source pickers for tafsir 22/251 and translations 193/92, exact quotes accepted and fabricated quotes refused. `overlap.json`, `results.json`, `cleanup.json` and six `key276-*.png` screenshots retain evidence; copied corpus/profile directories were deleted. The helper's 128 tracked original-file hashes stayed identical. No downloads, remote provider, source normalization or library schema changes occurred. Existing budget trimming remains explicit through `limited`; very long sources can be shortened or omitted once that budget is exhausted. See [Quran experience](feature%20-%20Quran%20Experience.md#study-assistant-sources--key-276-2026-11-09).

## Arabic metadata translation source audit — 2026-10-26

User-authorized Arabic derivative copies are being prepared separately from immutable supplied sources. REA inspected `surah_infos`, `topics` and `themes` schemas/samples; measured coverage is 114 introductions, 2,512 topics and 2,098 themes. Existing Arabic, IDs, HTML structure and relation/reference fields must remain unchanged. Canonical Hafs quote references come from provided script 312, not backtranslation. See [Arabic Metadata Localization](feature%20-%20Quran%20Metadata%20Arabic%20Localization.md) for exact source evidence, validation and honest progress boundaries; preparation does not mean translation is complete.

## Khatmah division metadata — Codex, 2026-10-26

REA inspected the supplied metadata 68 SQLite (`.baglib-data/qul-resource-audit/quran-metadata-juz.sqlite.zip.sqlite`, SHA-256 `c257b669a0d762db86fda6e1458852ee565dee8bd243222d6802c290e6713703`). The `juz` table contains `juz_number`, `verses_count`, `first_verse_key`, `last_verse_key` and `verse_mapping`. All 30 first/last ayah keys were sampled explicitly for the Khatmah helper; evidence `ev_896d8abb80cc96c72e65413a8d54c57b2f34a282e2eaf9682351ccca0a93c065` covers schema/initial sample. Full first inspection is retained locally in ignored `.baglib-data/khatmah-juz-evidence.json`.

Integration maps these Hafs references through the actual selected layout in the existing worker, rather than estimating page divisions. Both endpoints matter: a Juz can end on the same page the next begins. The page-level assignment includes its ending page; it does not omit trailing ayahs or double-count a previously read page. These findings do not establish a Warsh division mapping. Native fixture validation checks the real first/second Juz boundary and 30 resolved ranges. See [Khatmah](feature%20-%20Quran%20Khatmah.md) for implementation, private settings storage and limitations.

## Public catalog, access limits and recommendations — Codex, 2026-10-26

### Actual scrape and access evidence

Scraped the 14 public category listings without credentials, cookies, browser authentication or admin endpoints. The public `robots.txt` excludes `/admin`; the crawler stays under `/resources/`, uses bounded responses, a request delay and bounded same-category pagination. Results: **546 discoverable entries**, **514 advertising SQLite**, **541 advertising download buttons that point to a sign-in modal**, three explicitly restricted entries, and two without advertised exports. These are observed public-listing counts, not a claim to enumerate unpublished/private QUL records or to reconcile every count on the landing page.

Category totals: script 30; layouts 12; fonts 26; metadata 8; translations 204; tafsir 108; recitations 133; transliteration 9; surah information 6; topics 1; morphology 6; Mutashabihat 1; similar ayahs 1; themes 1. Existing local recitation presets 957/959 are retained even though they were absent from these current public listings.

Observed anonymous markup for Saheeh International's SQLite button: `href="#_"`, `data-controller="ajax-modal"`, and a `data-url` pointing to `/users/sign_in?modal=true`. This is **not a public file URL**. Scraping cannot legitimately make that export anonymous. QUL's [download guide](https://qul.tarteel.ai/docs/getting-started) recommends SQLite for query-heavy uses, but it does not grant a public API or blanket redistribution rights. The [Saheeh licence page](https://qul.tarteel.ai/resources/translation/193/licence) states that copyright information is unavailable; this is not permission to mirror its files. No authenticated download links, signed storage URLs, cookies or developer credentials were bundled.

REA inspected the retained anonymous response-excerpt HAR: parent Evidence `ev_03c16e499ac020786a1d57f7fc56412513d705e3cf892354599ba02ed7a80b05`, summary `ev_b8e4905ab7b869cedd65710aacbfc58560e212264d8e05d55bbdb559340aa4d2`. Coverage: all 14 recorded responses. This is producer-recorded HTTP evidence with bounded HTML excerpts, not a browser execution trace or a complete traffic capture. No live browser attribution is claimed.

### Integration actually implemented

- `scripts/qul-catalog/scrape.mjs` reproduces discovery into ignored `catalog.sqlite`, JSON provenance and an anonymous excerpt HAR. `src/shared/data/qul-public-catalog.json` bundles only small public catalog metadata. At startup those rows populate the existing application SQLite catalog; no canonical Quran corpus is moved to JSON and no library/Quran SQL schema migration was added.
- Catalog cards now preserve advertised formats/tags even when download anchors open sign-in, distinguish access from copyright restrictions, and distinguish **supported adapter** from **storage-only** resources. Unknown resources remain unverified even when their tags say Hafs. Discovery is not a claim that 546 schemas are reader-ready.
- Download batches prefer supported SQLite variants, with WOFF2 for fonts and SVG for the selected outline layout. Saheeh's inline-note variant remains mandatory for its audited adapter. Known companion resources are resolved with deduplication before enqueueing; existing installations are retained.
- Supplied local preset files install directly through the isolated installer, with no website round trip or registration. Explicit mappings also cover the seven additional metadata exports, three ayah-morphology exports and colored WBW translation; storage-only status is preserved where no reader adapter exists. Only known scoped paths are used, and font/shared-layout alternatives are allowed without accepting arbitrary renderer filenames. For other exports, public actionable links can use the existing direct-transfer pipeline; source sign-in modals/redirects produce the distinct localized `authentication-required` result. No hidden login, user credential embedding, fabricated public mirror or access-control bypass was added.
- Metadata/timing exports are explicitly distinguished from actual recitation audio. Audio remains a separate user choice: one surah or the full Quran for a selected compatible reciter.

### Recommended combinations and why

| Bundle | Resources | Benefit and compatibility |
| --- | --- | --- |
| Lightweight Hafs | script 312 + SVG layout 569 + surah metadata 70 | Recommended quick start; searchable canonical text and vector pages without downloading page-font families. |
| Hafs study | Lightweight set + translation 193, tafsir 22, WBW translation 92, transliteration 71, roots/lemma/stem, themes/topics, surah introductions and both similarity datasets | Most currently implemented study features, including positioned footnotes and grouped tafsir. Existing source gaps remain explicit; this does not invent POS/grammar. |
| Matched V4 | canonical script 312 + glyph script 47 + layout 19 + font 240 + metadata 70 | Use the matching V4 family together. V1/V2, Unicode and arbitrary page fonts are not interchangeable with these glyph codes. |
| Warsh reader | Warsh WBW script + Warsh font + shared layout 569 | Own text, Madani-first numbering and font, with explicitly adapted template pagination. Hafs verse/word add-ons must not be joined without a verified correspondence. |

These are technical integration recommendations, not endorsements of one translation/tafsir's interpretation or redistribution licence. Shared layout geometry does not establish cross-reading word/ayah equivalence. Publisher tags/related links are hints, not validation.

### Remaining provider boundary

**Registration-free access to every remote export is not achieved:** QUL currently gates the observed offered downloads. It would require QUL-supported public export links or an explicitly licensed distribution/mirror arrangement. None was invented or deployed. Account-free catalog browsing and local-file installation are implemented; unsupported resource schemas remain storage-only rather than being falsely advertised as usable immediately.

Verification: 896 full tests pass, with clean typecheck/main build and focused lint (existing Next pages-directory advisory). Native resource-library checks cover Arabic/English and 480/1280 widths. Separate native checks verify local translation reinstallation and extra ayah-metadata installation with no source download, plus a controlled sign-in-gated export reported without opening a browser. Existing 22-pack reader, Warsh, actual audio and 14 fullscreen checks still pass. No live account-free remote binary success is claimed. Current evidence paths are recorded in `CURRENT_TASK.md`.

## Warsh shared-template rendering correction — Codex, 2026-10-26

The earlier blanket Warsh rendering restriction was too broad: it confused reusing a layout template with reusing embedded Hafs outlines. The user's supplied Warsh script and font now render in the shared Ligature Basd SVG Mushaf line-slot template. No new Warsh SVG export or copy of the Hafs V4 database is required.

Verified source structure: the Warsh SQLite `words` table contains independent `id/location/surah/ayah/word/text` records; its first canonical reference is `1:1:1 = اِ۬لْحَمْدُ`, not Hafs's numbered Bismillah. REA inspected this offline table. The shared SVG supplies numbered lines and surah-local word capacities; paths and `data-hafs` strings are not reused as Warsh content.

`warsh-layout.ts:buildWarshLayout` redistributes each surah's complete ordered Warsh word stream across the shared template's line slots proportionally to their capacities. It preserves all original word strings and Warsh ayah identities, emits presentation-only verse numbers, and builds a Warsh-specific ayah-to-page index. The result explicitly carries `layoutMode: adapted`; line/page breaks are Baglib's template-based reflow, **not certification of a particular printed Warsh edition**. Reading options explain this distinction without blocking reading. This is a display/index adapter, not a canonical content change or a cross-riwayah verse correspondence map.

The reader IPC now accepts the selected script alongside the layout. Hafs SVG/V4 rendering is unchanged; Warsh uses its own WOFF2 through `FontFace`. A session-local worker cache avoids rebuilding all pages on every navigation, and is released with the reader. Copy, hover, inspection and page navigation use Warsh canonical references. Hafs-only verse annotations/recitations are not applied to Warsh numbering; unmatched study resources get an explicit localized explanation.

Verification: a native pass rendered all 604 adapted pages and compared the complete ordered output with the immutable source. All **77,856 source words and 6,214 ayah references** matched; ordered-tuple SHA-256 was `288fedd0999daa28cfb787d79488b8d9d5ca1bedf3ad7a700a8e2cbfdb259731`. Both Arabic RTL and English LTR loaded the supplied Warsh font, displayed the opening canonical text, and opened the correct inspector without Hafs SVG paths. Native round trips include 1:7, 2:2 and 114:6. The fixture passes 14 fullscreen checks, including Warsh in both languages, and retains screenshots; Arabic Warsh rendering was visually inspected. Unit tests cover exact coverage, unchanged inputs, invalid templates and duplicate locations. Full suite: **889 passed**; typecheck, main build and focused lint pass (existing Next pages-directory advisory remains).

## Unified Mushaf and live provisioning — Codex, 2026-10-26

This section supersedes the earlier split Study/Mushaf UI and audit-only statements for the adapters described here. No library-domain entities or migrations were introduced.

### Source evidence and repairs

- REA SQLite inspection of Husary 957 (`ev_7393456f991a683c4070c2b19aedbcc203dfdb2f58a8657955e709f9e9122486`) showed surah 2 begins with `ayah_number=8`, while its source URL ends in `002001.mp3`. The two selected recitation exports use global verse IDs. `QuranReader.recitationSurah` now derives validated local references from the supplied six-digit audio filenames, rejects inconsistent/duplicate references, and keeps original databases unchanged. Individual lookup and downloads share this conversion. Regressions cover surahs 2, 112, 113 and 114 rather than certifying only Al-Fatihah.
- REA inspected the V4 layout `pages`/`info` tables (`ev_88e0e24f26b26dee2ae305fc47d922e5d114a5034196b307bb1e122ef7fee24a`) and glyph `words` (`ev_4136645d40ff27c55d1a927eaa59817ed7f7e58c11b89df23293322876033116`). Resource 19's page/line word-ID intervals are joined to resource 47 and checked against resource 312's canonical location before rendering. Font 240 is selected page-by-page with `FontFace`, without OS font installation. SVG remains a separate outline renderer; arbitrary fonts must not be applied to vector paths.
- REA inspected supplied word root/lemma/stem exports: `roots`/`root_words`, `lemmas`/`lemma_words`, `stems`/`stem_words` (`ev_c8c37cdb7956884d446a550c9663d490e1d6983f3c8d0a0618d59b74b130557b`, `ev_db365b0e2f21f2759ad58384d2289d522efbec4cf25a7dc9bfcc1f054c771a97`, `ev_3d1f2395398a187996c2a28389c3f6a63b62e88e40f24c9fa66e78f3a3dc062a`). Read-only source joins and disposable lookup indexes now back the study card. No POS or grammatical annotations are invented where the supplied exports do not contain them.
- The supplied `Mutashabihat ul Quran.json.bz2` is actually a ZIP containing `phrase_verses.json` and `phrases.json`, verified from its PK signature and extracted JSON. Resource 73 now exposes source phrase ranges and matching references; it is not conflated with scored similar-ayah resource 74. Results are bounded to 50 phrases and 100 references per phrase, retaining the source total.
- Actual SVG reference attributes are zero-padded (`data-surah="005"`, `data-aya="018"`). Theme positioning now compares numeric identities instead of selectors assuming unpadded strings. Identical theme intervals are grouped for display; source rows are not rewritten.

### Downloads actually performed

Authenticated first-party QUL login succeeded using a memory-only helper; the session was explicitly closed afterward. No credentials, cookies or signed download URLs were added to project files. The eight selected SQLite metadata exports (63–70: rub, sajda, ruku, manzil, hizb, juz, ayah and surah names) were downloaded into `repos/Quran/QUL Developer Resources/5-Quran metadata`, with provenance sidecars; all eight passed SQLite `quick_check`. Downloaded metadata is not a claim that every metadata family already has reader navigation controls.

All 114 surahs for both selected reciters were downloaded: Husary 6,236 files / 2,471,643,510 bytes; Minshawi 6,236 files / 1,656,713,666 bytes. Total: 12,472 MP3s / 4,128,357,176 bytes. `scripts/qul-phase1/download-recitals.mjs` uses the supplied source archives, bounded HTTPS streaming, retries, signature checks and atomic publication. It resumes completed files. An initial Node/Undici assertion interrupted the first run; the remaining downloads completed on resume, and the helper now uses Node HTTPS rather than the failing transport. A subsequent all-file signature/count pass reused all 12,472 recordings with no failures. This is not an exhaustive audio decode of every recording.

Development builds automatically enqueue the selected compatible local packs through the existing isolated installer, without requiring folder selection. The normal app-private audio cache can copy supplied recordings locally before first playback, without first trying an external stream. Packaged builds retain the ordinary download/import flow; the developer repository directory is not bundled implicitly. Existing installs are retained.

### Verification and remaining boundaries

The updated native fixture installs 22 actual source packs and exercises V4 font loading, first/last glyph pages, morphology, phrase matches, whole-page translations and linked notes, multi-window tools, themes, recitation reference conversion, download cancellation and Arabic/English layouts. A separate provisioning-only native run verified automatic installation of all 22 packs without a folder dialog and direct offline cache resolution for both voices. Representative MP3s for both voices decoded successfully; a muted native player advanced from Al-Fatihah into Al-Baqarah using simulated end events on real media, then paused and cleaned up. All 12 bilingual/theme/width fullscreen checks passed with zero renderer errors. Full tests: 887 passed, 0 failed; typecheck/main build and focused lint pass. This does not certify uninterrupted playback of all recordings. Current evidence paths are recorded in `CURRENT_TASK.md`.

Superseded restriction: the duplicate SVGs do not establish printed Warsh outline content, but that does not prevent their reuse as a template with the supplied Warsh text/font. The shared-template renderer above now supports that use. The nonexistent `mushaf-layout/warsh-svg` download URL remains removed; it is not necessary to invent a resource to reuse the installed layout. The deleted Warsh V4 file was not inspected or restored. Existing meaning/transliteration gaps remain explicit, and word-level audio segmentation is not proof of cross-renderer segmentation equivalence.

## Follow-up: official resource routes and positioned footnotes — 2026-10-25

Verified the public QUL listings and their resource links: [English surah information](https://qul.tarteel.ai/resources/surah-info/3), [ayah themes](https://qul.tarteel.ai/resources/ayah-theme/62), and [topics/concepts](https://qul.tarteel.ai/resources/ayah-topics/45). The previously configured `/surah-info/en`, `/ayah-theme/default` and `/ayah-topics/default` were local placeholder identities, not the verified source routes. `reader-resources.ts` now uses the real IDs; old IDs remain explicit adapter/IPC aliases so installed immutable packs do not need rewriting. Startup drops obsolete mutable catalog aliases and seeds official entries. Download/setup/retry operations canonicalize aliases before accessing QUL. Reader operation failures retain localized network/access/format/storage distinctions instead of always reporting a reading error.

REA opened and inventoried the supplied `Surah information/surah-info-en.db.zip`, SHA-256 `6849ea462761f57d63c7c1cfc25cf31366ffe2fba2dfda0153da63747af9b600`, with no reported integrity contradictions, then closed the target. Summary evidence: `ev_a24d56d6cbf320f7313c12f58cb9683681201fb3b65b2066faf222a707bdd968`; retained inspection parent: `ev_c493120d987dc020205823be9921b60d1bb9eba2e76ef583a976337897554547`. This archive inventory does not establish schema or runtime semantics; actual installer/query verification is performed by the isolated Electron fixture.

The existing Saheeh adapter removed each source `[[note]]` and kept only a detached notes list, losing reference positions. It now preserves each marker's UTF-16 offset in the cleaned display string and its one-based note number. `QuranTranslationText.tsx` renders numbered inline links at exactly those offsets, expands/focuses the corresponding note and offers a return link. Canonical downloaded bytes are unchanged, text remains React-escaped, and note targets are unique across component instances. No linguistic span is inferred or fabricated. Older payloads without offsets retain their list rather than receiving invented marker positions.

The header Quran search queries installed Arabic scripts through the existing normalized FTS API. Its in-memory navigation handoff works both with an already mounted Quran workspace and when navigating from another tab; the selected script/ayah opens in Study Reader. This is Arabic verse search, not a claim of translation-language or semantic AI search. The native fixture exercises corrected-route automatic downloads with supplied archives, real source queries, linked notes and cross-tab search. Public route verification and controlled downloads do not prove a fresh authenticated live-QUL download; login/access requirements remain in force.

Initial investigation: 2026-10-24. Updated: 2026-10-25 through the study-reader implementation. The original access proof used isolated development storage; the app now has resource management and a first SQLite study reader. No library migration, QUL runtime deployment or AI feature was added. Delivery plan: [Quran Experience](feature%20-%20Quran%20Experience.md); approved production boundary: [Quran Resource Contracts](Quran%20Resource%20Contracts.md).

## Study-reader implementation checkpoint — 2026-10-25

### Subsequent interaction/download corrections — Codex, 2026-10-25

Inspected the existing Baglib source paths, not a new external reverse-engineering target: `QuranMushafView.tsx`, `QuranReaderView.tsx`, `QuranAudioPlayer.tsx`, Quran IPC/services, supplied-pack Electron fixtures and local Electron type declarations. SVG hover previously tracked only ayahs and used sky-blue selectors; its inspector was a below-page block. Study words had no inspection callback. These are replaced by per-word emerald feedback, ayah glow and the shared side `QuranAyahInspector.tsx`, including full-reference queries and keyboard handling. Default mode is now Mushaf, with native fullscreen and side-only controls.

Bulk downloads use `resource-download.ts`, `electron-download-fetch.ts` and the existing library/job/installer boundary. Verified Electron-specific failure: `session.fetch(..., {redirect:'manual'})` rejects a redirect with `Redirect was cancelled`. The replacement uses `net.request` redirect events, exposes each destination to the origin validator and keeps session cookies inside main. Byte/time caps and temporary-file cleanup apply before installation; no token/credential is sent to the renderer or logged. Queued jobs use existing JSON job descriptors; no library/domain schema is added.

The fixture verifies automatic first-party-token → allowed-storage transfer and installation with a real supplied translation archive, plus six synthetic audio files and cancellation of a whole-Quran request. Authenticated live QUL access remains a user-session acceptance check. Synthetic audio files prove download/cache plumbing, not playback quality. Bulk selection works across resource types; unsupported formats and unresolved/local-only resource URLs still fail explicitly rather than being certified compatible. Earlier checkpoint statements about seven formats and future Mushaf/audio delivery are historical; see the current [experience checkpoint](feature%20-%20Quran%20Experience.md).

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
