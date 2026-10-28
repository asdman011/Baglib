# Feature: Quran Experience — approved roadmap

## Integrated Khatmah — 2026-10-26

A localized Khatmahs tab adds independent private completion plans, custom/preset scheduling, page/session and verified Hafs Juz pacing, adaptive assignments, exact Mushaf jumps, progress/streaks and pace forecasts. A reader-side mark/undo control supports optional visibility/focus-gated 20-second activity tracking. Native reminders require Baglib to be running. No source Quran databases or Work → Edition → Source schemas are modified; the existing private SQLite settings repository is reused. See [Khatmah](feature%20-%20Quran%20Khatmah.md) for contracts, calculations, evidence, resource-binding/Warsh limits and verification.

## Public catalog and compatibility UX — 2026-10-26

The Resource Library now starts with a scraped, offline-browsable public catalog (546 entries across all 14 categories), stored in the existing SQLite catalog. Cards show preferred format, observed access requirements, audited reader support versus storage-only status, reading profile, companion dependencies and feature badges. Four localized install bundles compare lightweight Hafs, feature-rich Hafs study, matched V4 and Warsh/shared-template setups. Companion resources are added automatically; arbitrary matching tags do not certify compatibility.

Provided local resources install directly without QUL registration. Most advertised remote exports still open QUL sign-in; the app now reports that access condition precisely instead of calling it copyright restriction or installing a login page. Universal anonymous downloading is a provider/licensing limitation, not a completed feature. See [QUL investigation](QUL.md#public-catalog-access-limits-and-recommendations--codex-2026-10-26) for discovery counts, REA evidence, bundle comparison and remaining boundaries. No credentials or signed URLs are shipped; no API/mirror server or SQL schema migration was introduced.

## Warsh correction — 2026-10-26

Warsh is now available in the same Mushaf workspace using the supplied Warsh script/font and the selected shared SVG **template**, rather than a Hafs-only renderer gate. Script selection travels through IPC and determines page content, numbering, font and ayah lookup. All 77,856 supplied Warsh words / 6,214 references passed complete ordered coverage validation. Arabic/English native checks load the actual Warsh font and verify inspector text and navigation.

The adapter preserves source words and riwayah numbering while adapting line/page breaks to shared line capacities. It does not relabel Hafs vector outlines or claim a facsimile of a particular Warsh print. This distinction is explained in reading options, not through a blocking warning. Hafs-only verse annotations and recitations remain isolated. See [QUL evidence](QUL.md#warsh-shared-template-rendering-correction--codex-2026-10-26) for the precise reflow method and tests. Earlier statements that Warsh could not render at all are superseded.

## Unified workspace checkpoint — 2026-10-26

The split reader modes described in older checkpoints below are superseded by one page-centered Mushaf workspace. SVG and the selected compatible V4 glyph/layout/font stack share the same tools; canonical Arabic remains separate from display glyphs. [Source evidence and download results](QUL.md#unified-mushaf-and-live-provisioning--codex-2026-10-26) document verified scope and source gaps.

- Right-side tafsir, translation and topic/concept tools read **every ayah on the current page**, including pages spanning surahs. Grouped tafsir is deduplicated by source coverage. Multiple panels stay open and can be resized.
- Right-click opens a cursor-positioned tool menu. Selected tools open in a scrollable left-side stack; double-click opens morphology, transliteration, phrase-based Mutashabihat and scored similar ayahs together. The inspector is a resizable nonmodal card, so it no longer blocks other tools.
- Themes appear as brackets immediately beside the page, not at the far tool rail. Word hit testing includes transparent SVG hit regions and a 12-CSS-pixel nearest-word tolerance. Hover still colors the word emerald and softly illuminates its encompassing ayah.
- Script, layout and compatible font information live at the upper right. Layouts enforce profile compatibility; V4 fonts are matched to their page glyphs, not offered as arbitrary interchangeable decorative fonts. Side docks remain visible in normal mode and reveal on pointer proximity or keyboard focus in fullscreen.
- A medium bottom play button starts at the current page's first ayah and expands the recitation controls. Default playback crosses surah boundaries and wraps after surah 114; existing repeat/gap/sleep settings can override that behavior. Manual page navigation stops the old playback to prevent stale page jumps. Async generation identifiers prevent stale audio loads from replacing a newly selected source.
- Selected local datasets install automatically in development. Both complete selected recitations are now supplied locally; recordings are reused into app-private caches without needing the user to redownload them. Arbitrary published QUL resources still require their own compatible adapters/rights checks.

Scope limitations: no fabricated Warsh page mapping, no invented POS/grammar fields, no correction of source translation/transliteration gaps, and no certification that every possible QUL export or every supplied metadata family has a reader UI. These limitations are not waived by successful package installation.

Initial roadmap: 2026-10-24. Updated: 2026-10-25. The user approved the Quran-specific boundary, SQLite-first implementation and future Qira’at scalability. Study reading, SVG Mushaf and recorded-audio code now exist; the current checkpoint below describes what was actually verified. Research: [QUL](QUL.md). Approved boundary: [Quran Resource Contracts](Quran%20Resource%20Contracts.md). No library migration or AI model is included.

## Current checkpoint: interaction, bulk downloads and immersive Mushaf

Follow-up corrections: the English surah-info, theme and topic presets now point to verified QUL resources 3, 62 and 45, with legacy install aliases preserved. A Quran search button beside Sunnah in the top app header opens a bilingual modal for local Arabic verse search across surahs; selecting a hit opens the exact reference in Study Reader, including when Quran was not mounted. Saheeh International displays numbered footnote references at their source positions, with click-to-note and return navigation. Download/setup failures now retain more specific localized error messages. See [QUL evidence](QUL.md) for routes, alias behavior and limitations.

- The Quran workspace defaults to **Mushaf**; Study Reader remains an alternative. Hover/focus highlights the individual word in emerald and softly illuminates its encompassing ayah in both views. SVG events resolve nested paths to their actual word group, and stable SVG markup avoids replacing the word DOM during hover. Keyboard users can focus and activate words.
- Clicking a word opens the shared **Ayah Inspector** on the right in Arabic RTL and left in English LTR. It includes surah/reference, complete canonical text from the selected script, source Imlaey text, separate copy actions and a jump to that ayah in Study Reader. The backend gathers Imlaey words across every containing page, not just the visible page. Missing Imlaey is reported, never synthesized; Warsh is not relabeled as Hafs. The modal traps focus, restores it and supports Escape.
- Fullscreen requests native browser fullscreen and covers the app chrome with a viewport-sized reading surface. Only side controls remain, including exit, Study Reader, resource setup and audio. Inspector/setup/audio can appear at the sides. Fullscreen exit and Escape preserve the selected page. At 100% zoom the page width is bounded by viewport height; intentional zoom can scroll.
- Resources defaults to all types with search, cross-page selection, select-current-results, clear and **Download selected**. Reader setup also supports select-all and batch download. Supported exports are chosen automatically, preferring SQLite; existing installs are retained. One background transfer/install runs at a time, with queued/progress/failure states, cancellation, bounded files, first-party authentication and validated redirect origins. Sign in through the isolated QUL window when needed, then retry; copyright/access restrictions are not bypassed.
- Audio downloads explicitly select **current surah** or **whole Quran** for the chosen installed reciter. Downloads are sequential and cancellable, show file counts, retain completed files and skip valid cached files when retried. Recitation metadata downloads do not silently fetch every recording. Source/format availability still limits what can be installed; a stored resource is not proof of an implemented reader adapter.

Verification uses the isolated Electron fixture with 13 supplied packs, a controlled native download and a controlled automatic batch export download, six synthetic audio files and cancellation of a whole-Quran job. These are not fresh authenticated QUL downloads or proof of actual audio decoding/timing accuracy. The fixture checks emerald word feedback, inspector/deep links, native fullscreen entry/exit and layout in Arabic/English, dark/light and 480/768/1280 window sizes. No production user catalog was modified. Focused tests, full-regression results and current limitations are recorded in the cross-agent handoff. These changes are not committed/pushed and no Jira state was changed.

## Historical checkpoint: first study-reader slice

The Quran tab now opens **Read**, alongside **Resources**. Readers choose a surah/start ayah, read bounded passages with optional English translation/footnotes, search canonical Arabic through a normalized local index, enable word meanings/transliteration and expand grouped Ibn Kathir tafsir beneath an ayah. Reading options collapse on demand; switching to Resources preserves the mounted reading session. Copy includes displayed text and an ayah reference. Arabic RTL and English LTR use centralized strings and readable Arabic line height.

Choose resources offers seven explicit audited SQLite adapters with native QUL download links and selected-folder import. The real-source integration fixture reuses supplied archives plus previously downloaded surah metadata, in isolated storage only. No fresh authenticated download or automatic installation into the user's actual profile is claimed. To provision the app, import the supplied `QUL Developer Resources` folder through this UI and obtain any missing selected metadata via QUL. The folder's empty metadata directory is not silently repaired.

Verification: 20 focused service/UI tests pass; TypeScript and main/preload/worker build pass. Focused lint reports only the existing Next pages-directory advisory. The real Electron fixture validates seven packs, offline queries, controlled native download capture, source gaps, grouped tafsir, copy dispatch, Warsh isolation and basmala exceptions. Arabic/English × dark/light × three viewport widths pass geometry checks with no renderer errors. No packaged-installer certification or full renderer production build is claimed.

Remaining milestones: safe SVG/page-font Mushaf rendering, recorded audio and verified segment highlights, metadata divisions, topic search, morphology/root/lemma/POS, persistent reading position and broader resource-adapter coverage. The present text reader is not a claim that all five audited resource families are fully integrated. Current implementation changes are uncommitted; no new push or Jira update has occurred.

## Scope

Current scope: a distinct Quran tab above Sunnah; Arabic/translation reading; verse/topic search; tafsir exploration; word-by-word root/lemma/POS learning. Support all QUL resource types through bulk-selectable downloadable packs, including audio and Mushaf presentation. Bulk selection is authorized; do not confuse that with downloading every available language/version/recording without user selection. Recitations require a chosen voice and surah/whole-Quran scope. NLP, embeddings, generation and model training are future work, not current implementation.

## Experience and category coverage

| QUL type | Proposed integration |
| --- | --- |
| Quran script | Ayah/word Unicode, glyph and image-backed adapters; script selection; source-preserving copy/search representation. |
| Mushaf layout | Faithful page/line presentation, navigation, compatible word-range/font dependencies; explicit WIP labels. |
| Font | App-local font installation, compatible script associations and lazy page-font loading. No OS font installation needed. |
| Quran metadata | Surah/ayah/juz/hizb/rub/manzil/ruku/page/sajdah navigation where supplied; validate against the selected reading profile. |
| Translation | Ayah-aligned language columns, toggle/compare, word meanings and source footnotes. |
| Tafsir | Source selector/comparison, rich-text sanitization, grouped ayah resolution and visible coverage/source. |
| Recitation | Recorded audio only, surah/ayah/word variants where supplied, gapless or gapped playback, real timing-based highlights. |
| Transliteration | Optional ayah/word display, independent of translation. |
| Surah information | Source-attributed introductions and contextual information in installed languages. |
| Topics/concepts | Browse supplied concepts/relationships and jump to linked ayahs; deterministic topic search now. |
| Morphology/grammar | Word inspector with supplied root, lemma, stem, POS and grammatical segments; concordance search. |
| Mutashabihat | Phrase-level comparison and memorization aids using supplied mappings. |
| Similar ayah | Related-verse navigation and side-by-side comparison, separate from phrase mappings. |
| Ayah theme | Supplied theme labels/ranges and links; not AI-generated interpretation. |

Reading modes: continuous surah study with Arabic and optional translations, focused ayah, and fixed-layout Mushaf. Arabic stays RTL regardless of interface language. English translations use LTR. Responsive stacking, keyboard navigation, diacritic-safe typography, theme support and one active study panel avoid overlap. Preserve the selected ayah across mode changes; persist reading position/bookmarks and personal reflections separately from immutable content. Copy/share offers original text, selected translations and references; never silently includes private notes.

## Download and installation experience

Resource Library has All resources, Installed and Downloads views. Search/filter by category, language, author/reciter, script, reading profile and compatibility. Display QUL source page, available formats, rights/restrictions, publication status, known size and unknown-size states. Related-resource links are hints, not proof of required compatibility.

First run offers a minimal compatible Arabic script + font + navigation metadata set, with explicit user confirmation. Offer one user-selected English translation and optional tafsir; do not automatically install all translations, commentaries, layouts or recitations. Show every supported category even when no pack is installed, with a clear download action. Missing content is not generated or silently fetched.

Target flow: choose resource → review dependencies/size/rights → authenticate on QUL when needed → download from QUL's actual storage redirects → validate → index → atomically activate → offer Use now. A new tafsir appears in the tafsir picker, not as a normal book or an unexplained file. Installed data works offline.

The first milestone must prove catalog discovery and download access. QUL offers no supported public catalog API in the checked documentation. Prefer a QUL-approved catalog feed/contract if available; otherwise use the official resource browser as the source of truth, with a versioned, cached metadata adapter only where permitted. Do not build against private endpoints or copy every dataset to a Baglib server. For sign-in, investigate an isolated sandboxed QUL window with no Baglib preload/Node privileges, user-controlled authentication and native download capture. External-browser/manual-file import is a visible fallback, not proof that seamless automatic installation has been achieved.

Queue, cancellation, bounded concurrency, restart recovery, conditional resume support, disk-space checks, safe archive paths/size limits, JSON/SQLite validation, sanitized markup, indexes and rollback are required. Download into staging; reject corrupt or incompatible packages without damaging working installs. Check upstream checksums when supplied and retain local hashes for identity. Keep provenance and format-adapter versions. Updates are explicit and preserve notes/bookmarks. Dependency-aware removal must not break another installed pack.

Audio exports can be manifests pointing to media, not the media itself. Distinguish timing installed, selected surahs downloaded and fully offline. Ask before fetching large audio/image/font dependencies. Do not permanently hotlink QUL's shared audio CDN. Standard interchange data is installed through an adapter; auxiliary DOCX/export artifacts can be offered as source downloads without pretending they power interactive word features.

## Approved architecture

- Dedicated Quran module, not a PDF/EPUB reader or library Work for each ayah.
- Typed main-process services for catalog, downloads, pack installation, local queries/search and audio asset resolution. Renderer receives bounded results through preload IPC.
- Background processing for unpacking/indexing; virtualized reading, bounded caches and cancellable queries.
- Immutable source packs plus derived SQLite indexes and a separate user-state store. **SQLite is the production default**, following the user's explicit preference and the Phase 1 runtime proof. JSON remains a transport/interchange fallback for resources without a suitable SQLite export, not the primary query store. Final schema/storage contracts must be reviewed before application implementation.
- Stable surah/ayah/word identifiers scoped by relevant reading/numbering/segmentation profile. Preserve dataset IDs, versions, language, authorship and source text. Never mix incompatible Hafs/Warsh/layout/audio mappings by assumption.
- Reuse existing Baglib UI/i18n and appropriate local-storage/IPC patterns. Any bridge into the approved knowledge model requires an explicit ADR rather than new arbitrary relations.
- Future provider boundary for embeddings/AI, with no model dependency, automatic model downloads or AI background jobs now.

## Delivery milestones and acceptance gates

1. **Access and data-contract proof:** inventory categories/formats, authenticate with user involvement, install a deliberately small compatible sample set, map license/coverage/version semantics, and approve the architecture. Gate: source-backed resource to validated local data, including denied/restricted/broken-download states. No bulk download.
2. **Resource manager and navigation:** Quran above Sunnah; first-run picker; progress/retry/cancel; isolated installation and rollback; installed/offline status. Gate: interrupted/corrupt installs do not affect existing packs or freeze the app.
3. **Core reader and search:** Unicode reading, metadata navigation, Arabic plus toggleable translations/footnotes, verse references, local full-text/topic search, reading position and copy/share. Gate: original text fidelity, correct joins and Arabic/English RTL/LTR behavior offline.
4. **Tafsir and word learning:** grouped commentary, multiple-source comparison, word meanings/transliteration, roots/lemmas/POS, concordance, source-labelled reflections. Gate: no missing grouped commentary, unsafe HTML, fabricated linguistic fields or changed canonical text.
5. **Mushaf and rendering families:** script/layout/font dependency resolver, glyph and image formats, page fidelity and available tajweed presentation. Gate: representative beginning/middle/end pages, special headers, diacritics, copy fallback and mismatched-resource rejection.
6. **Audio and memorization:** actual recordings, continuous play, seek, pause/stop, selected-surah downloads, range/ayah repetition, sleep timer and supplied timing highlights. Gate: no invented timing, stale playback, overlapping book TTS or hidden network dependency after media download.
7. **Complete resource coverage and hardening:** topics, themes, introductions, similar ayahs, mutashabihat, updates, removal, repair, backup/user-state preservation. Gate: at least one real compatible test package per category and materially different adapter format, plus packaged-app and performance checks. Do not label every individual resource supported without adapter/rights/compatibility verification.
8. **Future NLP/AI, separately authorized:** benchmark Arabic/English retrieval, then optional cited generation. Not part of current delivery.

Each milestone includes regression checks for Library/Sunnah and research updates. Git and Jira remain subject to their separate approval gates. No delivery-time estimate is fixed before the access/schema proof.

### Five-family sample audit acceptance updates — 2026-10-25

The [QUL developer-resource audit](QUL.md#five-family-developer-resource-audit--2026-10-25) inspected the supplied script/font/layout, tafsir, recitation and translation/transliteration samples and all 18 linked documentation pages. The supplied metadata folder was empty at inventory time; older ayah/surah samples remain separate. This adds evidence and acceptance requirements, not completed reader features or new implementation authorization.

- Core reader: prove format-specific JSON decoding, safe inline footnotes/transliteration and profile-specific verse joins. Do not attach Hafs resources to Warsh by unqualified ayah key.
- Tafsir/word study: all 4,325 Ibn Kathir pointer rows resolve, but supplied word translation/transliteration alignments have documented gaps. Preserve grouped commentary and explicitly gate incompatible word overlays.
- Mushaf: honor the user's shared ligature-based SVG layout decision for Hafs/Warsh while validating reading-specific paths and semantic mappings. QPC V4 SQLite layout remains Hafs-only. SVG and V4 glyph rendering are separate implementations with separate safety/font checks; the current package installer lacks SVG support.
- Audio: map global SQLite verse IDs, normalize the observed legacy four-number tuples, preserve repeated words and independently verify word segmentation and actual media timings. Ayah playback must not depend on unverified word highlights. Actual recordings remain optional downloads, not embedded database content.
- Navigation/hardening: inspect the six missing metadata families, validate page/font rendering in Arabic RTL and English LTR, and benchmark bounded SVG/font/media handling before marking the corresponding milestones complete.

No app layout, source schema, IPC, canonical dataset or playback behavior changed during this audit. The user-reported deleted Warsh copy of the Hafs SQLite layout was not revisited or restored.

### Phase 1 checkpoint — 2026-10-25

Authenticated downloads and a read-only eight-database-plus-font sample installation are proven in isolated development storage. Arabic/English FTS queries and actual Electron SQLite-driver capabilities pass; 14 focused tests pass. Container sniffing, translation JSON-in-SQLite decoding, tafsir groups and explicit source-data gaps are documented in [QUL](QUL.md). REA's initial SQLite permission blocker was resolved and real schema evidence recorded. No Quran tab or in-app download UI has been added yet.

At that checkpoint the architecture was a reviewable proposal. The user subsequently approved it and Phase 2; this supersedes the earlier approval gate. Comprehensive catalog enumeration and resource-specific redistribution rights remain limitations rather than assumptions. Native download capture is now implemented/tested with a controlled redirect fixture; a fresh interactive live-QUL login remains an end-user acceptance check.

### Phase 2 delivery — 2026-10-25

- Quran appears immediately above Sunnah in the existing navigation rail, mirrored with the application direction. Its own workspace contains All resources, Installed and Downloads tabs, all 14 category choices, cached-title search, paged cards, resource-folder selection and bilingual setup guidance.
- Source titles remain canonical/mixed-script. Arabic/English labels, errors and progress messages use centralized translations. Stored packs are explicitly distinguished from later reader/study/playback features.
- Users refresh the selected category, choose a resource, sign in/select a format on QUL if needed, and download through a sandboxed source window. Background validation publishes an immutable local version. Local-file import, cancel, retry, independent-version removal, interrupted-job recovery and offline cached listings are supported.
- Qira’at scalability is established by explicit profile-scoped identity, including separate qira’ah/riwayah/tariq/numbering/segmentation/script fields. No variant is silently coerced into Hafs, and recorded-audio reciters are not treated as Qira’at. No future Qira’at datasets or AI models were downloaded.
- The native fixture verifies real preload/IPC, a QUL-style first-party token redirect including `target=_blank`, one real SQLite archive, utility-process installation and removal. Arabic/English × dark/light × 480/768/1280-pixel checks found no tested control overlap or horizontal overflow. Screenshots were visually inspected with transitions disabled in the test fixture for stable hidden-window capture. A separate live QUL category refresh returned 30 script resource cards.

Catalog coverage is explicitly partial, rights remain resource-specific, and archives outside the supported formats/limits are rejected. Automatic dependency resolution, format-specific Quran query adapters, reader content, recitations and installer certification are not Phase 2 completion claims. See the contracts for concrete storage, security and lifecycle details.

Final verification: **54 focused regression tests passed**, covering the Quran manager/UI and existing Sunnah, reader TTS, digital imports, import wizard and PDF-cover paths. TypeScript and main/preload/utility-worker build passed. Focused new-source lint had no errors; the repository's existing Next pages-directory advisory remains. The final native run verified the popup-target redirect download, utility-process publication, removal, 30-card live catalog refresh and the bilingual layout matrix with zero renderer errors. No full renderer production build or packaged-installer certification is claimed.

An earlier test assertion was corrected to query the matching resource page rather than assuming its pack would appear on every catalog page; test cleanup now closes its SQLite handle even on assertion failure. A cleanup command for that earlier failed run's single OS-temporary fixture directory was blocked by client policy, so that old small fixture may remain. This does not affect application data or the passing final run. No commit, push or Jira update was performed.

### Phase 6.3 delivery: Qira'at reading profiles & boundary isolation — 2026-10-26

- **Reading profile formalization**: Explicit contracts `HAFS_READING_PROFILE` (`hafs-kufi`, 6,236 verses) and `WARSH_READING_PROFILE` (`warsh-madani`, 6,214 verses) distinguish Qira'ah (`'asim` vs `nafi'`), Riwayah (`hafs` vs `warsh`), Tariq (`shatibiyyah` vs `azraq`), Numbering (`kufi` vs `madani-first`), Segmentation (`qpc-hafs` vs `qpc-warsh`), and Script (`kfgqpc-hafs` vs `qpc-warsh`).
- **Strict profile isolation**: In `QuranReader.read`, `commentary`, `inspectAyah`, `ayahThemes`, and `similarAyahs`, cross-profile resource joins (e.g. attempting to attach Hafs translations, Ibn Kathir tafsir, Hafs word meanings/transliterations, or Hafs similar-ayahs to Warsh script without explicit mapping) are strictly rejected with `'invalid-resource'`.
- **Madani-first numbering**: Warsh Surah 1:1 begins with "اِ۬لْحَمْدُ لِلَّهِ رَبِّ اِ۬لْعَٰلَمِينَ" (Basmala is an unnumbered preamble in Surah 1 in Warsh), having 6,214 verses total across the Quran compared to 6,236 in Hafs.
- **Audio & Layout isolation**: Recitations and layouts are profile-tagged. Warsh layout preset `mushaf-layout/warsh-svg` is registered for vector Mushaf rendering, and Hafs layouts/recitations are prevented from being misaligned onto Warsh text.
- **Bilingual notices**: Users switching to Warsh script receive clear bilingual notices (`quranWarshNotice`) in Arabic RTL and English LTR, and incompatible Hafs-only options are disabled in the UI.

### Phase 6.4 delivery: Local-First Semantic Retrieval and Cited AI Evaluation — 2026-10-26

- **Evaluation Document**: Formalized complete architectural evaluation in [`feature - Quran Semantic Retrieval and Cited AI.md`](./feature%20-%20Quran%20Semantic%20Retrieval%20and%20Cited%20AI.md).
- **Hybrid Retrieval Architecture**: Formulated Reciprocal Rank Fusion (RRF) pipeline combining SQLite FTS5 BM25 exact lexical root/lemma recall with ONNX-quantized dense multilingual embeddings (`multilingual-e5-small`).
- **Source-Preserving Data Contracts**: Defined `QuranSemanticChunk`, `QuranRetrievalQuery`, `QuranRetrievalHit`, and `QuranAICitedResponse` in `src/shared/types/quran.ts`, guaranteeing strict profile tagging (`hafs-kufi` vs `warsh-madani`), pack digest verification, and exact verse boundaries.
- **Hardware Capacity Limits**: Measured and documented user machine constraints (Ryzen 7 PRO 5750G 8c/16t, 15.4 GB RAM, integrated Radeon GPU); proved feasibility of lightweight CPU embeddings (~130 MB, ~15-25 ms) while ruling out heavy local 7B+ LLMs due to memory contention with Electron and Windows.
- **Theological & Privacy Guardrails**: Formulated non-negotiable policies: zero substitution of canonical Quranic text or published tafsir; mandatory exact citations; explicit abstention policy; background utility process isolation; and 100% private local study notes with strict opt-in consent before external requests.

## Future NLP/AI and this machine

Read-only Windows hardware queries on 2026-10-24 reported Ryzen 7 PRO 5750G (8 cores/16 threads), 15.4 GiB OS-visible physical RAM and integrated AMD Radeon Graphics. Windows reported 512 MiB adapter memory; this is not a dedicated modern compute GPU and does not describe all shared graphics memory. C: had about 32.4 GiB free; D: about 103.9 GiB. These are a snapshot, not a benchmark. Offer a configurable data folder rather than filling C: with audio.

Expected suitability (engineering estimates, not measured Quran performance): current non-AI features fit this class of machine; no server/GPU is inherently required. Small multilingual embedding inference and incremental CPU indexing are plausible locally. Initial indexing takes more CPU than subsequent queries. Start with a compact model such as [multilingual E5 small](https://huggingface.co/intfloat/multilingual-e5-small/raw/main/README.md), benchmark Quranic Arabic relevance, and treat [BGE-M3](https://huggingface.co/BAAI/bge-m3) as a heavier comparison candidate, not a requirement.

Future pipeline: immutable passages with provenance → bounded ayah/tafsir chunks → versioned embeddings → hybrid lexical/vector retrieval → optional reranking → optional generator with verifiable source references. Reindex only changed packs. Run models out of process, cap threads/RAM and unload idle models; avoid competing with narration/imports. Keep notes local unless explicitly selected for an opted-in external request. Generated analysis must never replace Quran text or be presented as authoritative tafsir. Use held-out Arabic/English queries and citation/abstention tests before enabling generation. Training is not needed for this retrieval-first plan.

Small quantized 1–3B generators may run on CPU but need latency/Arabic-quality testing. A 7–8B quantized model may fit with short context, but 16 GB shared with Windows/Electron leaves limited headroom; do not promise a seamless experience. For stronger local generation, a future 32 GB RAM plus roughly 12–16 GB dedicated VRAM configuration is a planning target, not an upgrade requirement or compatibility guarantee. Larger models, long context and training can need substantially more. Server compute is optional for faster/heavier models or multi-user service, not required for ordinary Quran use.

## Future hosting cost illustration

USD rates checked 2026-10-24 from [Hugging Face dedicated endpoint pricing](https://huggingface.co/docs/inference-endpoints/support/pricing). Actual deployment availability/model fit, subscription requirements, storage, bandwidth, taxes and current prices must be checked before purchase. No service was provisioned.

| Example instance | Listed hourly compute | 20 billed hours | 730 billed hours |
| --- | ---: | ---: | ---: |
| AWS CPU, 4 vCPU / 8 GB | $0.134 | $2.68 | $97.82 |
| AWS L4, 24 GB GPU memory | $0.80 | $16.00 | $584.00 |

These are arithmetic examples of infrastructure cost, not estimates of a specific query workload or training job. Initialization/idle running time may be billable; use pause/scale-to-zero and budget controls where supported. Local non-AI use and local inference need no hosting fee, but still use electricity, disk and download bandwidth. No AI server should be purchased for the current scope.
## Quran navigation and study-layout refinement — 2026-10-26, Codex

Implemented directly in Baglib's existing reader, without investigating an external application's implementation or changing canonical Quran data:

- Left/Right arrows follow the current RTL/LTR reading direction. Space advances, Shift+Space goes back; PageUp/PageDown also work. Bounds, loading, IME composition, repeated held keys, modifiers, focused controls, editable text, study content and open dialogs are respected. The existing page navigation path closes transient ayah/audio state consistently.
- Compact recitation and expanded player use direction-independent horizontal centering. The previous logical `start:50%` plus negative physical X translation shifted them in RTL.
- Study tools replace the active floating card rather than stacking overlapping windows. The header/close control stays outside one keyboard-focusable scrolling body, with stable gutter, contained scrolling, wrapping and theme-aware thin scrollbar. The floating ayah inspector retains resize support with the same single-body scrolling pattern.
- Popups are constrained to the reader's height and responsive insets. The Mushaf fits its actual container using `cqh`, reserves room for controls, and can still be zoomed/scrolled.

Evidence: `quran-page-keys.ts`, `QuranReaderView.tsx`, `QuranMushafWorkspace.tsx`, `QuranMushafView.tsx`, `QuranAyahInspector.tsx`; 32 focused tests including navigation and existing source/footnote/theme behavior. `scripts/quran-layout-live/run.mjs` uses an existing disposable installed-pack profile, not the user's application profile. Run `run-H4emJC` passed actual Electron page transitions, input/study focus isolation, exact play-button centering, one scroll body and panel viewport bounds in Arabic/English at 480/1280; screenshots were inspected. Final run `run-CTfk57` additionally passed Arabic dark / English light screenshots with the theme-aware scrollbar. Keyboard events are dispatched in Electron DOM; physical keyboard hardware and speaker output are not certified. Existing native fixture preparation was corrected to include its bundled reader worker; earlier fixture timeouts were not application feature failures.
