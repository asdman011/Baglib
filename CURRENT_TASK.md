# Current Task

## Active Milestone: Quran Task 6.2 (Jira KEY-177)
**Epic:** KEY-161 (Quran Epic 6: Semantic Context, Themes & Introductions)  
**Title:** Integrate similar ayahs (mutashabihat) and cross-verse references  
**Status:** In Progress (Transitioned in Jira; ready for implementation)

---

### Previous Pushed Milestones & Completed Commits
All previous work has been organized into 6 commits and pushed to `origin/feature/library-domain`:
1. `7532332`: `chore(agents): initialize cross-agent coordination system and tracking docs`
2. `014518d`: `fix(quran): prevent runtime AbortError during rapid audio play and pause transitions`
3. `678e64a`: `feat(quran): add resilient background resource downloads and electron net fetcher`
4. `d7b5e80`: `refactor(quran): extract ayah inspector, add positioned translation footnotes and global search dialog`
5. `b056e4c`: `feat(quran): add surah intros, ayah themes, and topic concepts indexer and UI (KEY-176)`
6. `57eaf0d`: `docs(quran): document study reader route verification, footnotes, and topic concepts`

Jira Task 6.1 (`KEY-176`) is marked **Done** with full test results and commit notes.

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
