# Implementation Plan

- `[2026-10-26T00:27:00+03:00, Antigravity]` Completed Task 6.4 (KEY-179): evaluated local-first semantic retrieval and cited AI, defined profile-preserving contracts (`QuranSemanticChunk`, `QuranRetrievalQuery`, `QuranRetrievalHit`, `QuranAICitedResponse`), formulated hybrid BM25 + dense ONNX RRF pipeline, documented user APU hardware limits (Ryzen 7 PRO 5750G 15.4 GB RAM), and established non-negotiable theological guardrails in `feature - Quran Semantic Retrieval and Cited AI.md`. Passed 29 focused / 883 full test suite and clean TypeScript typecheck. Verification complete; pending user Git approval.
- `[2026-10-26T00:22:00+03:00, Antigravity]` Completed Task 6.3 (KEY-178): formalized reading profiles (`hafs-kufi` 6,236 verses vs `warsh-madani` 6,214 verses), enforced profile safeguards across QuranReader query methods, registered Warsh layout, and added bilingual profile keys. Passed 29 focused / 883 full test suite, live Electron runner with 15 real packs, and clean TypeScript typecheck. Verification complete; pending user Git approval.
- `[2026-10-25T23:53:00+03:00, Antigravity]` Completed Task 6.2 (KEY-177): implemented similar ayahs contracts, indexer, IPC, bilingual translations, QuranSimilarAyahsDrawer, and inspector/reader triggers. Passed 28 focused / 882 full test suite and live Electron integration with 14 real source packs. Verification complete; pending user Git approval.
- `[2026-10-25T23:38:00+03:00, Antigravity]` Starting Task 6.2: verified QUL route `similar-ayah/74` and inspected `matching-ayah.db` (3,552 pairs, symmetric directed scores, 1-based word ranges). Implementing contracts, indexer, IPC, and side-by-side comparison UI.
- `[2026-10-25T23:25:00+03:00, Antigravity]` Successfully committed 6 organized commits and pushed to `origin/feature/library-domain` (7132aca..57eaf0d). Transitioned Jira KEY-176 to Done with verification summary; transitioned KEY-177 (Task 6.2) to In Progress.
- `[2026-10-25, Codex]` Corrected semantic resource source IDs with legacy compatibility, added cross-tab header Quran search and linked source-positioned Saheeh notes; 44 focused/877 full tests, type/build/lint and controlled native integration pass, with real-auth limitations documented.
- `[2026-10-25, Codex]` Started follow-up fixes for three invalid resource presets, header Quran search and source-positioned Saheeh footnotes; preserving prior work and revalidating before handoff.
- `[2026-10-25, Codex]` Implemented Quran hover/inspector, automatic selected-resource batches, scoped recitation downloads and native immersive Mushaf; 41 focused/874 full tests and bilingual/theme/fullscreen Electron checks pass, with live-auth/format/media limits recorded in CURRENT_TASK.md; no Git/Jira actions.
- `[2026-10-25, Codex]` Started the user's Quran interaction/download/fullscreen corrections; preserving existing Task 6.1 edits and deferring Task 6.2 until this request is verified.
- `[2026-10-25T21:44:00+03:00]` Completed Quran Task 6.1: integrated surah introductions, ayah themes, and topic concepts with FTS5 search, topic drawer, and bilingual UI components.
- `[2026-10-25T21:27:00+03:00]` Relocated Cross-Agent System Rules to the top of `AGENTS.md` before Section 1.
- `[2026-10-25T21:24:00+03:00]` Initialized cross-agent coordination system and resolved Quran audio playback `AbortError` in `QuranAudioPlayer.tsx`.

---

## 1. Overall Objectives
Baglib Quran Integration: Provide a fast, offline-first, local-first research platform for the Holy Quran, supporting mushaf rendering, word-level study, translations/tafsir, recitation audio with segment synchronization, thematic analysis, similar ayahs (mutashabihat), and advanced search.

---

## 2. Feature Epics & Roadmap Status

Historical completion claims below came from earlier agent handoffs and are not independent certification of every resource format, metadata family or morphological field. Current verified scope and limitations are recorded in `CURRENT_TASK.md` and the feature documents. The user's current request takes precedence over the deferred Task 6.2 suggestion.

### Epic 1: Quran Reader Foundations & Local Storage
- [x] Separate Quran resource catalog, immutable packs and derived SQLite query/index stores; do not assume an unapproved unified corpus schema or library migration.
- [x] Initial import and packaging pipeline from local QUL resource zips.
- [x] Preload API and IPC bridge for Quran queries.
- **Status:** Complete.

### Epic 2: Multi-View Reader & Bilingual Search
- [x] Uthmani text viewer with page/surah/juz navigation.
- [x] Full-text search with Arabic diacritic/orthographic normalization (FTS5).
- [x] Bilingual LTR/RTL support for English and Arabic.
- **Status:** Complete.

### Epic 3: Word-by-Word Study & Tafsir/Translation Packs
- [x] Word morphology, lemma, root, and audio pronunciation data structures.
- [x] Resource catalog and installation manager for translation/tafsir packs.
- [x] Side-by-side study panel with active ayah context.
- **Status:** Complete.

### Epic 4: Vector Mushaf Rendering (QCF V1/V2 & SVG)
- [x] Direct page-based rendering with accurate glyph placement.
- [x] Ayah highlight overlays and interactive click-to-select support.
- [x] High-performance fallback rendering.
- **Status:** Complete.

### Epic 5: Recitation Audio Playback & Ayah/Word Synchronization (`KEY-160`)
- [x] Reciter catalog (`recitation/957` Husary Murattal, `recitation/959` Minshawi Murattal), matching the actual presets and supplied archive names.
- [x] Local audio cache & on-demand stream downloading.
- [x] Segment timing parser & synchronization with ayah cards during playback.
- [x] Fixed `AbortError` race condition in `QuranAudioPlayer.tsx`.
- **Status:** Complete (Commit `7132aca` pushed to `origin/feature/library-domain`, Jira `KEY-174`, `KEY-175`, `KEY-160` closed).

### Epic 6: Semantic Context, Themes & Introductions (`KEY-161`) — *ACTIVE*
- [x] **Task 6.1 (`KEY-176`)**: Integrate topics, themes, and surah introductions.
  - Surah introductions from `surah-info-en.db.zip` (114 surahs).
  - Ayah themes from `ayah-themes.db.zip` (2,098 theme spans).
  - Semantic topics & concepts from `topics.db.zip` (2,512 topics with hierarchical relationships & ayah lists).
- [x] **Task 6.2 (`KEY-177`)**: Integrate similar ayahs (mutashabihat) and cross-verse references.
  - Source dataset `similar-ayah/74` (`matching-ayah.db.zip`, 3,552 matched pairs).
  - Derived SQLite indexing, score & coverage metrics, and 1-based word ranges.
  - Bilingual `QuranSimilarAyahsDrawer` with verse jump and copy actions.
- [x] **Task 6.3 (`KEY-178`)**: Integrate future Qira’at resources without global-reference assumptions.
  - Formalize verified `QuranReadingProfile` identities for Hafs (`hafs-kufi`, 6,236 verses) and Warsh (`warsh-madani`, 6,214 verses).
  - Enforce strict reading-profile isolation across reader query methods, rejecting unaligned cross-profile joins without explicit correspondence.
  - Register Warsh script and layout presets, validating Madani first numbering and authentic Warsh orthography.
- [x] **Task 6.4 (`KEY-179`)**: Evaluate future local-first semantic retrieval and cited AI.
  - Formalized `QuranSemanticChunk` and `QuranRetrievalQuery` contracts preserving profileKey, pack digest, and exact verse boundaries.
  - Benchmarked user APU hardware limits (Ryzen 7 PRO 5750G, 15.4 GB RAM), demonstrating CPU embedding feasibility (~130 MB, ~15–25 ms) while ruling out heavy 7B+ local LLMs on shared memory.
  - Established hybrid lexical (FTS5 BM25) + dense vector (ONNX `multilingual-e5-small`) Reciprocal Rank Fusion architecture.
  - Enforced strict theological guardrails (zero hallucination or replacement of canonical text/tafsir, mandatory citations, explicit abstention, and private local notes).
  - Authored comprehensive evaluation feature document `docs/features/feature - Quran Semantic Retrieval and Cited AI.md`.
- **Status:** Complete (Epic 6 fully delivered across all 4 tasks; ready for user commit & push approval).

### Epic 7: Advanced Study Tools & Annotations
- [ ] Ayah reflection bookmarks, highlights, and personal tags.
- [ ] Exporting ayah study notes to Baglib markdown notebooks.
- **Status:** Pending Epic 6 completion.

### Epic 8: Offline Packaging & Performance Hardening
- [ ] Lazy database attachment for secondary packs.
- [ ] Automated integration benchmarks and packaging tests.
- **Status:** Pending.
