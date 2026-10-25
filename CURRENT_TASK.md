# Current Task

## Active follow-up: resource URLs, global Quran search and inline footnotes

Implemented by Codex: official source IDs `surah-info/3`, `ayah-theme/62`, `ayah-topics/45`, with explicit old-ID aliases for existing immutable installs and retries; more specific localized action errors; Quran header search beside Sunnah; a cross-tab/in-memory navigation handoff to the exact Study Reader reference; and source-positioned Saheeh footnote numbers with click-to-note and return links. Existing translation packs work without re-downloading because positions are computed at query time. Previous interaction/fullscreen changes and Antigravity edits remain uncommitted and must be preserved. No commit/push/Jira authorization is implied.

Follow-up verification: 44 focused tests and all 877 repository tests pass. TypeScript, main/preload/worker build and focused lint pass (existing Next pages-directory advisory only). The isolated native fixture downloads/reinstalls all three semantic resources through corrected routes using real supplied archives and exercises their queries; verifies linked footnotes, header Quran search in both languages, and navigation from Library to `2:255`; and retains 12 native fullscreen checks plus prior offline/hover/audio-cancellation regressions. Controlled fixture exports are not live authenticated QUL transfers. Official routes were independently checked on QUL; sign-in/access restrictions still apply. REA archive evidence and links are in QUL.md. Screenshots/test artifacts are under ignored `.baglib-data/`.

Next: user acceptance, then the deferred Task 6.2 if requested. Do not assume commit/push/Jira permission. No app-user catalog was modified by tests.

## Active request: Quran interaction, downloads and distraction-free Mushaf fixes

Implemented by Codex: emerald word hover/focus and ayah illumination in both readers; a shared RTL-right/LTR-left Ayah Inspector with full canonical/source Imlaey text, copy and Study Reader jump; default Mushaf mode with native fullscreen and side controls; automatic selected-resource batch download/install; and surah/whole-Quran recorded-audio downloads with cancellation/retry. App theme and Tailwind dark variants now agree. Progress notifications are coalesced and unchanged catalogs do not reload the reader. The user's final sentence about Study Reader was incomplete; it remains an alternative mode. Antigravity's Task 6.1/topic/audio work is preserved. No commit, push or Jira authorization is given for this request.

Verification: 41 focused tests and 874 full-suite tests pass; TypeScript and main build pass; focused modified-source lint has only the existing Next pages-directory advisory. The isolated Electron fixture uses 13 real supplied packs, one controlled native download, one controlled automatic batch download, six synthetic audio files, whole-Quran cancellation, word feedback and inspector jumps, and 12 native fullscreen entry/exit checks across both languages/themes and three window widths. Screenshots were inspected. No real-user catalog was modified. Live QUL sign-in/download permissions, unsupported formats/local-only resource URLs, actual recording quality/segment alignment and packaged-installer behavior remain explicit limitations, not verified successes.

Next logical milestone: user acceptance of these fixes, then resume Task 6.2 below. Do not assume Git/Jira approval. Existing roadmap completion claims from earlier agents are not automatically re-certified by these tests; consult the source/contracts for actual implemented adapters. Relevant docs: QUL.md, Quran Resource Contracts.md, feature - Quran Experience.md. Test logs/fixtures are ignored under `.baglib-data/`.

## Deferred Milestone: Quran Task 6.2 (Jira KEY-177)
**Epic:** KEY-161 (Quran Epic 6: Semantic Context, Themes & Introductions)  
**Title:** Integrate similar ayahs (mutashabihat) and cross-verse references  
**Status:** In Progress  

---

### Context & Resources Inspected
Source datasets located in `repos/Quran/QUL Developer Resources/`:
1. **Similar Ayahs (`Similiar ayahs/matching-ayah.db.zip`)**:
   - Table: `similar_ayahs (verse_key TEXT, matched_ayah_key TEXT, matched_words_count INTEGER, coverage INTEGER, score INTEGER, match_words_range TEXT)`
   - Rows: 3,552 matched ayah pairs with similarity scores, matched word counts, and word ranges.
2. **Mutashabihat ul Quran (`Mutashabihat ul Quran/Mutashabihat ul Quran.json.bz2`)**:
   - JSON structure containing classified mutashabihat groups with linguistic nuances and phrase differences.

---

### Previous Task Completed
- **Task 6.1 (`KEY-176`)**: Integrate topics, themes and surah introductions.
  - Implemented SQLite indexation & FTS5 search for Surah introductions, Ayah themes, and 2,512 Quran topics.
  - Added `QuranSurahIntroCard` and `QuranTopicDrawer` with bilingual (RTL/LTR) support.
  - Passed all 21 unit/UI tests and live Electron runner checks.

---

### Immediate Next Steps for Task 6.2
1. **TypeScript Contracts (`src/shared/types/quran.ts`)**:
   - Define `QuranSimilarAyah`:
     `{ verseKey: string; matchedAyahKey: string; surah: number; ayah: number; matchedWordsCount: number; coverage: number; score: number; matchWordsRange: [number, number][] }`
   - Update `QuranAPI` with `similarAyahs(query: { surah: number; ayah: number; pack?: string })`.
2. **Resource Preset Registration (`src/main/services/quran/reader-resources.ts`)**:
   - Register `similar-ayah/matching` with `matching-ayah.db.zip`.
3. **Reader Service Engine (`src/main/services/quran/quran-reader.ts`)**:
   - Add indexing for `similar_ayahs(verse_key)` and reverse lookup `similar_ayahs(matched_ayah_key)`.
   - Implement `similarAyahs(packId: string | undefined, surah: number, ayah: number)`.
4. **IPC Bridge & Preload (`src/main/ipc/quran.ts`, `src/preload/index.ts`)**:
   - Expose `quran:similar-ayahs` handler and preload mapping.
5. **UI Integration (`src/renderer/components/quran/`)**:
   - Add similar ayahs action button / badge on ayah cards.
   - Display side-by-side comparison of matched verses with highlighted differences.
6. **Verification**:
   - Type check (`npx tsc --noEmit`).
   - Unit & UI tests (`node scripts/test-runner.js`).
