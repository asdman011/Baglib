# Current Task

## Active Milestone: Quran Task 6.4 (Jira KEY-179)
**Epic:** KEY-161 (Quran Epic 6: Semantic Context, Themes & Introductions)  
**Title:** Evaluate future local-first semantic retrieval and cited AI  
**Status:** Completed (Verification Complete; Awaiting Git Approval)

---

### Implementation Summary & Deliverables
1. **Source-Preserving Semantic Retrieval Contracts (`src/shared/types/quran.ts`)**:
   - Defined `QuranSemanticChunkKind`: `'ayah' | 'tafsir-section' | 'surah-intro' | 'ayah-theme' | 'topic-concept'`.
   - Defined `QuranSemanticChunk`: versioned data structure preserving `chunkId`, `profileKey` (`hafs-kufi` or `warsh-madani`), authentic `sourceId`, ayah interval boundaries, `immutableSourceDigest`, and canonical citation.
   - Defined `QuranRetrievalQuery` & `QuranRetrievalHit`: hybrid query contracts supporting combined BM25 lexical + dense vector reciprocal rank fusion scoring with profile filtering.
   - Defined `QuranAICitedResponse` & `QuranAIAbstentionReason`: enforcement of mandatory citations (`[Surah:Ayah]`, `[Tafsir, Vol/P]`), out-of-renderer execution, and explicit abstention triggers (`no-retrieved-evidence`, `out-of-domain`, `theological-controversy`, `user-notes-unconsented`).
2. **Comprehensive Architectural Feature Document (`docs/features/feature - Quran Semantic Retrieval and Cited AI.md`)**:
   - Synthesized comparative findings from Tarteel/QUL lexical FTS5, dense multilingual embeddings (`multilingual-e5-small`, `BGE-M3`), and Readest/Baglib BYOK patterns.
   - Formulated Reciprocal Rank Fusion (RRF) pipeline combining SQLite FTS5 exact morphological recall with CPU ONNX semantic embeddings.
   - Mapped out user machine hardware capacity (AMD Ryzen 7 PRO 5750G 8c/16t, 15.4 GiB RAM, integrated Radeon GPU) establishing CPU embedding feasibility (~130 MiB RAM, ~15–25 ms latency) while advising against heavy 7B+ local models on shared APU memory.
   - Enforced non-negotiable theological guardrails: zero substitution of canonical Quranic text or published tafsir, process isolation to keep narration/UI non-blocking, and 100% private local study notes with strict opt-in consent before external requests.
   - Documented cost and infrastructure comparison between local offline inference ($0) vs BYOK cloud endpoints vs dedicated servers.
3. **Roadmap & Contracts Synchronization (`docs/features/feature - Quran Experience.md`)**:
   - Added Phase 6.4 delivery notes and cross-linked the dedicated feature document.

---

### Verification Results
- **TypeScript Typecheck (`npx tsc --noEmit`)**:
  - Clean compilation, **0 errors**.
- **Focused Service & UI Tests (`scripts/test-runner.js`)**:
  - `tests/services/quran-reader.test.ts`: **8 passed, 0 failed**.
  - `tests/ui/quran-reader.test.ts`: **21 passed, 0 failed**.
  - Combined focused tests: **29 passed, 0 failed**.
- **Full Test Suite (`npm test`)**:
  - **883 tests passed, 0 failed** across 184 test suites.
- **Native Live Electron Integration (`node scripts/quran-live/run.mjs --reader`)**:
  - Bundled and executed headless with 15 real source packs, 0 errors, dark and light themes, Arabic and English.

---

### Previous Deliverables Staged in Working Tree (Pending User Git Approval)
- **Task 6.2 (Jira KEY-177)**: Similar Ayahs (Mutashabihat) integration complete and verified (28 focused tests, 882 full suite tests, native live runner passing).
- **Task 6.3 (Jira KEY-178)**: Qira'at reading profiles (`hafs-kufi` vs `warsh-madani`, 6,214 verses) with boundary safeguards and Warsh layout preset complete and verified.

---

### Next Milestone in Line
- **Task 7.1 / Epic 7**: Advanced Study Tools & Annotations (Bookmarks, highlights, personal study tags, and exporting ayah notes to Baglib notebooks).
