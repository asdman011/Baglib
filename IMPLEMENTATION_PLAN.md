# Implementation Plan

## Recent Agent Updates
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
- [ ] **Task 6.2 (`KEY-177`)**: Integrate similar ayahs (mutashabihat) and cross-verse references.
- **Status:** In Progress (Task 6.1 complete; moving to Task 6.2).

### Epic 7: Advanced Study Tools & Annotations
- [ ] Ayah reflection bookmarks, highlights, and personal tags.
- [ ] Exporting ayah study notes to Baglib markdown notebooks.
- **Status:** Pending Epic 6 completion.

### Epic 8: Offline Packaging & Performance Hardening
- [ ] Lazy database attachment for secondary packs.
- [ ] Automated integration benchmarks and packaging tests.
- **Status:** Pending.
