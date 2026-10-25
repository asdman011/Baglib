# Feature: Quran Experience — approved roadmap

Initial roadmap: 2026-10-24. Updated: 2026-10-25. The user explicitly approved the Quran-specific boundary and contracts, authorized Phase 2, and requested future Qira’at scalability. Phase 2 now adds the Quran tab/resource manager; the reader and later phases remain planned. Research: [QUL](QUL.md). Approved storage/IPC boundary: [Quran Resource Contracts](Quran%20Resource%20Contracts.md). No library migration, AI model, commit/push or Jira change is included.

## Scope

Current scope: a distinct Quran tab above Sunnah; Arabic/translation reading; verse/topic search; tafsir exploration; word-by-word root/lemma/POS learning. Support each of QUL's 14 resource categories through optional downloadable packs, including audio and Mushaf presentation. Do not preload all resources. NLP, embeddings, generation and model training are future work, not current implementation.

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
