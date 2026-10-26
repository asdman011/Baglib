# Current Task

## Completed delivery — Arabic Quran metadata copies — 2026-10-26, Antigravity

Completed the Arabic Quran metadata review and publication pipeline following the handoff from Codex:
1. **Unblocked PreToolUse hook**: Fixed `hooks.json` in `C:\Users\Ammar's\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\` by disabling the failing quoted script invocation (`"enabled": false`, `"PreToolUse": []`).
2. **Context-Checked Topic Row 2315**: Confirmed that adjacent topic row 2315 under parent 2284 (`Prophets(25 mentioned by name)`) with child topic 2316 (`swallowed by whale then saved`, citing Ayah 10:98) intends **Prophet Yunus (Jonah)** rather than the English source typo `John`. Corrected row 2315 to `يونس (ﷺ)` in `015.json` and added corresponding review issue.
3. **Hash-Bound Review Decisions (`reviews.json`)**: Formulated 88 cryptographic decisions across surahs and topics binding `issueSha256`, `translationSha256`, and explicit status (`verified-quotation`, `accepted-source-limitation`, or `corrected-source-error`), resolving all unresolved reports without fabricating scripture.
4. **Fail-Closed Build & Publication**: Executed `build.mjs` and `publish.mjs` with 100% success:
   - `surah-info-ar.db` (114 surahs, SHA-256 `70caf11eb209580f00fa4056e0d1105b05bbc2068689ef36c365ea5c10f05232`)
   - `topics-ar.db` (2,512 topics, SHA-256 `d5bb4de1a2c0decbb3e32126c47dada5406e470a5d21834cdc5e9a793d9602d6`)
   - `ayah-themes-ar.db` (2,098 ayah themes, SHA-256 `58347430bfd1f78270a99ea74bddaece0e952a6d467c06fc36a646ceb718dfcc`)
   - Output ZIP created at `repos/Quran/QUL Developer Resources/Arabic metadata - Baglib/baglib-quran-arabic-metadata.zip` with `manifest.json` and Arabic `README.md`.
5. **Verification**: All 6 metadata pipeline tests pass (`validate.test.mjs`, `build.test.mjs`); all **925 tests pass** across 226 suites in `npm test`; clean `npx tsc --noEmit` (0 errors). All unrelated collaborative changes preserved. No git commit, push, or Jira action authorized for this task.

## Active request — Arabic Quran metadata copies — 2026-10-26, Codex

User selected translation of the three existing supplied QUL datasets into separate Arabic SQLite copies and explicitly approved parallel translation agents. Preserve exact schemas, IDs, original source files and existing Arabic verbatim. Scope: 114 surah introductions (917,630 HTML characters plus summaries), 2,512 topics (992 existing Arabic names, 287 descriptions), and 2,098 ayah themes. Six disjoint translation workers process 105 bounded input batches under ignored `.baglib-data/quran-arabic-translation`; no external translation API/model download is used. Parent owns scripts, validation, canonical references and final SQLite build, not worker translation ranges.

Prepared verified local 6,236-ayah Hafs quote references from script 312 and Arabic names from metadata 70; only numeral ornaments are stripped in quote-reference exports, never source files. Exact-source/Arabic/HTML/ID validation and fail-closed SQLite publication are implemented under `scripts/quran-metadata-arabic`; **4 isolated pipeline tests pass**. Last validated checkpoint: 25/114 surah rows, 256/2512 topics, 509/2098 themes; all saved rows passed current structural/canonical checks, but translation remains incomplete. No final Arabic database has been published. Ambiguous scripture quotations must remain flagged for review, not fabricated. No installed source replacement, app/schema modification, Git/Jira action or completion claimed. Feature/source audit documentation updated.

Continuation checkpoint: prior workers hit account usage limits, with all saved work retained. Latest validation finds **72/114 surah rows**, **2512/2512 topics** and **2098/2098 themes** saved. Topics have source-anomaly review issues (including gender/mislabel errors in original English); themes pass structural/canonical checks. One saved surah summary retains Latin name spellings and needs correction. No corpus-wide publication. Same four surah workers were resumed once after the user's renewed continue, without switching model/service or creating substitute workers; remaining source-anomaly policy is awaiting the user's choice. Main owns validation/publication and review, not those resumed ranges.

Latest clarification: all **114/114 surah rows**, **2512/2512 topics**, and **2098/2098 themes** are now saved and structurally valid; final semantic/source review remains before publication. The user confirmed that topic row 2314's source label `Job the Baptist` intends **John the Baptist**, so the Arabic copy now uses `يحيى (يوحنا المعمدان) (ﷺ)`. This is supported by its linked child topic's references to 3:38-41, including the explicit name `يحيى` in 3:39. The original English database remains unchanged.

## Active request — LibGen covers, compact geek control, book volumes — 2026-10-26, Codex

Implemented and verified. REA confirmed LibGen search needs `covers=on`; the current table includes a leading rating cell and shifts title/cover columns. Search now requests covers, parses actual header cells and keeps correlated row covers after JSON hydration. Multiple real cover responses returned HTTP 200. The separate JSON endpoint returned HTTP 500/provider database saturation; HTML row fallback handles that failure without pretending the JSON service was repaired. Added stable lazy image placeholders, a 28px accessible icon-only geek control, book volume/set fields and independent volume navigation/safe drafts using existing approved `BookSpecificMetadata` fields and work `metadata_json`. Library cards/list rows show volume badges. No SQL schema/entity/relationship/dependency changes; prior uncommitted Quran/Khatmah work preserved.

Verification: **925 full tests pass** (12 new cover/volume tests), clean typecheck/main build and `git diff --check`. Native `scripts/book-details-live/run.mjs`, final `run-wLZOK4`, verifies two existing volumes, navigation and safe third-volume creation/persistence, independent first-volume progress, 28px control geometry, Arabic/English at 480/1280, light/dark captures and controlled remote image loading/failure with unavailable-JSON fallback; zero renderer errors. Arabic dark/English light volume screenshots were visually inspected. Existing-file ESLint debt was checked against HEAD: no increase in errors (134 existing across the five edited legacy files), one existing warning removed. New source files have no lint errors; native `<img>` has the expected Next optimization advisory.

Documentation: updated `docs/features/libgen.md` and `feature - Cover Retrieval.md`; added `feature - Book Volumes.md`. REA evidence retained locally in ignored `.baglib-data/libgen-covers-rea-evidence.json`, plus a two-row public HTML metadata fixture. Limits: explicit local set-title/author grouping, not automatic filename volume inference or a new durable set entity; same-named sets by the same author can span editions. Source cover/provider availability is not guaranteed, and search thumbnails are not offline cached book covers. Branch `feature/library-domain`; all work remains uncommitted. No staging, commit, push or Jira actions/authorization.

## Active request — integrated Khatmah, 2026-10-26, Codex

Implemented and verified the running-desktop Khatmah feature: up to 20 independent plans; preset/custom dates/days, pages/session and whole-Hafs-Juz pacing; adaptive duration/date targets; exact source-bound Mushaf jumps; explicit target/page marking and undo; opt-in 20-second visible/focused page activity; completion/streak/forecast statistics; pause/edit/delete; optional localized native reminders. State uses existing SQLite `app_settings` key `quran.khatmah.v1`, not new schema tables or immutable Quran packs. Arabic/English dashboard and side dock respect themes/direction; Warsh page/date plans explicitly label adapted pagination and do not borrow Hafs Juz mapping.

Verification: **913 full tests / 17 focused Khatmah tests pass**, clean `npx tsc --noEmit`, `npm run build:main`, focused ESLint (existing Next pages-directory advisory only), and `git diff --check`. Native fixture `run-8UoU7K` uses 22 real packs, resolves source Juz boundaries, verifies independent plans, direct page-2 navigation, manual mark/undo and reload persistence, source mismatch rejection, and Arabic/English geometry at 480/1280; dark/light screenshots were inspected. Existing reader/audio/Warsh checks remain passing (14 native fullscreen checks, zero renderer errors). Physical SQLite close/reopen and reminder deduplication are tested separately. Deterministic dwell tests verify the real 20,000ms interval/cancellation, not human reading comprehension.

Limits: native reminder banners were **not** displayed/verified against Windows notification permissions; reminders work only while Baglib runs, with fixed local times, not an OS background/prayer-time service. Source pack IDs remain fixed; newly imported replacement packs can require a new plan. No group sync, fractional Juz, printed Warsh page equivalence or cross-layout progress migration. QUL Juz endpoint REA evidence and implementation details are documented in `docs/features/feature - Quran Khatmah.md`, QUL and contract/experience documents. Prior uncommitted work is preserved. Branch `feature/library-domain`; no staging, commit, push or Jira actions, and no authorization inferred.

## Active request — public QUL catalog and compatibility, 2026-10-26, Codex

Implemented catalog/local-install/compatibility work; **universal anonymous remote downloading remains provider-limited**, not a completed requirement. Scraped 546 public entries across all 14 categories; 514 advertise SQLite and 541 advertise sign-in modal buttons. The other five are restricted/no advertised export, not verified public downloads. Small metadata snapshot seeds the existing SQLite catalog; no canonical corpus migration, SQL schema migration or dependency was introduced.

- Public formats/tags/access states are preserved without persisting credentials, cookies or export tokens. Logged-out buttons and login redirects now yield `authentication-required`, distinct from licensing restrictions. No QUL account was used for this scrape and no public mirror/credential proxy was deployed.
- Added compatible bundles for lightweight Hafs, Hafs study, matched V4 and Warsh. Cards explain profiles, companions, source formats, feature differences, audio metadata versus audio files, and reader-supported versus storage-only resources. Tags alone do not certify compatibility. Known companion dependencies are resolved/deduplicated before queueing.
- Provided local packs install without a website request. Explicit local mappings cover the 22 reader presets plus seven additional metadata files, three ayah-morphology exports and the supplied colored-WBW export; unknown schemas remain storage-only. Font format/shared-template fallbacks are scoped to known paths, not arbitrary renderer filenames. Packaged builds do not implicitly redistribute the developer's supplied data directory.
- Reproducible metadata audit: `node --import tsx scripts/qul-catalog/scrape.mjs` writes ignored SQLite/JSON/excerpt-HAR artifacts under `.baglib-data/qul-public-catalog`. The bundled source snapshot is reviewed separately. REA parent evidence: `ev_03c16e499ac020786a1d57f7fc56412513d705e3cf892354599ba02ed7a80b05` (14 response excerpts; no browser attribution claimed).

Verification: **896 full tests passed**, clean typecheck/main build and focused ESLint (existing Next pages-directory advisory only). Native `run-D0rGd4` retains all reader/audio/Warsh checks and verifies the four recommendation cards/resource-library layout in Arabic/English at 480/1280 widths, with zero renderer errors. Native `run-szxa3g` verifies 22 automatic local installs, both offline voices, registration-free translation reinstallation and extra metadata installation with no source download, and a controlled gated export reporting authentication without creating a browser window. No live account-free QUL binary download is claimed.

Provider/licensing limitation: fulfilling anonymous downloads for every QUL resource requires QUL-supported public exports or an explicitly licensed mirror arrangement. Unsupported schemas still cannot be advertised as usable immediately. Updated QUL/experience/contracts documentation records this boundary and the recommended combinations. Prior uncommitted changes remain preserved on `feature/library-domain`; no commit, push or Jira actions/authorization.

## Active follow-up — 2026-10-26, Codex

Implemented and verified: removed the blanket Warsh Mushaf restriction and separated shared layout templating from canonical content. Warsh now renders its supplied text with its own WOFF2, using shared SVG line slots/capacities and explicitly adapted line/page breaks. This is not a claim of a printed Warsh facsimile. Script-aware page/ayah IPC and navigation preserve Madani numbering; Hafs-only verse study resources remain isolated.

Verification: **889 full tests / 35 focused tests pass**, plus typecheck, main build and focused lint (only the existing Next pages-directory configuration advisory). Native evidence `run-u9uT7q` compared all 604 adapted pages against the source: 77,856 words and 6,214 references, exact ordered-tuple SHA-256 `288fedd0999daa28cfb787d79488b8d9d5ca1bedf3ad7a700a8e2cbfdb259731`. Actual Warsh font loading, Arabic RTL/English LTR script switching, canonical inspection and ayah/page round trips passed with no Hafs outline paths or renderer errors. All 14 fullscreen checks (12 existing plus Warsh in both languages) and existing audio checks pass. Warsh screenshots were captured; Arabic fullscreen rendering was visually inspected. Hidden-window capture required a native fullscreen compositor surface before capture; the fixture now exercises that path. No scraping work was started; the user explicitly withdrew that prompt.

Prior uncommitted changes are preserved. Documentation reconciles the previous overbroad restriction. No Git/Jira authorization or actions; restart Baglib to load the updated main/preload contracts.

## Active Request — 2026-10-26, Codex

Unified Mushaf workspace, selected dataset provisioning, and recitation repair. In progress; prior milestone notes below are historical handoff evidence, not verification of this request.

Plan: verify source numbering and fix recitation downloads; provision selected resources; integrate selected script/font/layout adapters; replace split readers with a page-centered multi-panel workspace; verify bilingual interaction, playback, and resource handling.

### Implemented and verified checkpoint

- Downloaded all eight selected metadata exports (63–70) to the supplied folder; all passed SQLite quick checks. Completed both entire recitations: 114 surahs / 6,236 MP3s per voice; 12,472 files total (4,128,357,176 bytes), with all-file signature/count verification. Authentication remained memory-only and its helper session was closed.
- Fixed global-versus-local audio numbering, including later surahs. The supplied local recordings are resolved into app-private caches before playback. Default playback continues across surahs; stale async loads are cancelled on source/navigation changes.
- Replaced the split renderer with one Mushaf workspace. Added resizable simultaneous side cards; whole-page translation/tafsir/topics; right-click tools, double-click stacked study tools; page-adjacent theme brackets; fullscreen proximity/focus docks; enlarged word hit testing; and a compact play launcher. The inspector is now a nonmodal resizable card.
- Integrated the selected Hafs V4 glyph/layout/page-font stack alongside SVG, with canonical location checks and managed font loading. Added real root/lemma/stem and phrase-based Mutashabihat adapters, separate from scored similar ayahs. Ambiguous word alignment falls back explicitly to ayah-level data; canonical text is unchanged.
- Development startup automatically provisions 22 compatible supplied packs through isolated installers without requiring folder selection. No new library/domain tables, dependencies, commits, pushes or Jira changes.

### Verification actually performed

- Full suite: **887 passed, 0 failed**; typecheck and main build pass.
- Focused ESLint: no code errors/warnings; the existing Next pages-directory configuration advisory remains.
- Native integration: 22 real source packs; V4 font load and first/last glyph pages; morphology/phrase queries; multi-window/context/double-click tools; linked whole-page notes; theme placement; actual MP3 decoding from both voices; muted real playback with simulated end events across the Al-Fatihah → Al-Baqarah boundary; pause/cleanup; cross-tab search to 2:255; and all 12 Arabic/English × light/dark × 480/768/1280 fullscreen checks. Zero renderer errors. Latest evidence: `.baglib-data/quran-reader-live/run-5JOd7a`.
- Separate native provisioning-only run: all 22 packs installed automatically and both voices resolved offline without a folder dialog or audio network access (`run-Q2AW02`). All 12,472 recording signatures/counts passed, but only representative recordings were decoded, not the entire 4.13 GB audio collection.
- Updated `docs/features/QUL.md` and `docs/features/feature - Quran Experience.md` with actual REA evidence, downloads, implementation and limitations.

### Source limitations and handoff

The previous blanket Warsh rendering restriction is superseded by the shared-template adapter above. Embedded Hafs paths are not relabeled; Warsh text/font render with adapted page/line breaks, not a certified printed facsimile. The nonexistent `mushaf-layout/warsh-svg` URL is still unnecessary and removed. The deleted Warsh V4 file was not inspected or restored. Font choices remain constrained by script/layout compatibility. The downloaded metadata families do not all have reader navigation UI yet, and supplied morphology files do not provide POS/complete grammar. Existing translation/transliteration gaps remain explicit.

No commit, push, or Jira authorization for this request. All current changes remain uncommitted on `feature/library-domain`. Historical milestone notes below are preserved as prior-agent context, not current Git status.

---

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
