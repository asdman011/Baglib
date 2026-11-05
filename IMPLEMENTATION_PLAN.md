# Implementation Plan

## Recent Agent Updates

- [2026-11-05, Claude Code] Committed the note-engine work (a2572e1 code, then docs) on feature/library-domain, only this session's files; merging the Next.js 16.4.5 upgrade (e4a6db9) next. Sunnah session files left uncommitted. No Jira change.
- [2026-11-05, Claude Code] S10 companion note pane beside the reader, Quran, Sunnah, Al-Bayan and Lectures (selection quotes with links, link to here, lecture line stamps). npm test 1335/1335; live ar/en pass 3 times. No schema, Git or Jira change.
- [2026-11-05, Claude Code] S1 honorifics auto-expansion (on by default, toggle) and S2 Investigating question status (ADR-011, migration 024). npm test 1335/1335; live ar/en pass. No Git or Jira change.
- [2026-11-05, Claude Code] S3 paragraph links implemented as the user specified (no schema); fixed a stuck highlight and the last cause of Enter inserting a new line instead of the link. npm test 1333/1333; live ar/en checks pass repeatedly. Trimmed test profiles that had taken ~40 GB. No Git or Jira change.
- [2026-11-05, Claude Code] Installed approved dependencies d3-force 3.0.1 (ISC) and docx 9.15.2 (MIT), plus dev types @types/d3-force; tsc, build and 1327/1327 tests pass. npm audit shows 5 existing vulnerabilities (next critical) unrelated to them. No Git or Jira change.
- [2026-11-05, Claude Code] Poetry search in notes verified on the installed Al-Bayan data (earlier "not installed" was wrong) with the poem itself ranked first; the Enter and quote-style bugs stay fixed; added a guard against stale editor echoes. npm test 1327/1327; live ar/en passed 3 times. Removed 35 GB of leftover test copies. No Git or Jira change.
- [2026-11-05, Claude Code] User answered decisions S1 to S10 for the note engine (see the plan doc): migration 024 for an Investigating question status approved; d3-force and docx chosen, downloads awaiting size confirmation; OneNote and iCloud importers need samples. No code, Git or Jira change.
- [2026-11-05, Claude Code] Wave 10 fifth slice: Ctrl+Shift+N quick note and /card review cards from note lines (cloze, question :: answer). npm test 1327/1327; live ar/en pass. Lecture per-line timestamps wait for decision S10. No schema, Git or Jira change.
- [2026-11-05, Claude Code] Quran search now finds words written with a full alif where the Uthmani text has a small alif (العالمين), without losing الرحمن or هذا; script index files rebuild once from installed packs. npm test 1326/1326; live ar/en pass on a disposable copy. No Git or Jira change.
- [2026-11-05, Claude Code] Wave 10 fourth slice: Quran, Sunnah and poetry inside note links and /quran /hadith /poem quote inserts, hover previews, callouts and footnotes. npm test 1319/1319; live ar/en pass in note-editor-live-bL8uZH. Found an existing Quran search gap with the small alif. No schema, Git or Jira change.
- [2026-11-05, Claude Code] Note from a book's annotations added (unit-tested, not live-checked). Mapped the user's pasted note-engine spec against the plan; decisions S1 to S10 listed, nothing approved. No Git or Jira change.
- [2026-11-05, Claude Code] Wave 10 second slice: ayah ranges and book page links (D4, parser only), slash commands with honorifics and Hijri date, link labels in the editor. npm test 1318/1318; live ar/en pass in note-editor-live-N8nSyt. No schema, Git or Jira change.
- [2026-11-05, Claude Code] Wave 9 first slice: migration 023 (ADR-010) and threaded comments with reply, resolve, reopen, edit and delete, versioned with history; open-comment badge and filter in Notes. npm test 1311/1311; live ar/en pass in comments-live-vevuiW. Pins and the unified annotations list are next. No Git or Jira change.
- [2026-11-05, Claude Code] CodeMirror 6 installed after the user approved the download (22 MIT packages, exact versions); the note box is now a Markdown editor with per-line Arabic/English direction and `[[` suggestions for notes, books and ayahs. npm test 1307/1307; live ar/en pass in note-editor-live-Gcu4sU. dashboard-live has an older failure at its book-note edit. No schema, Git or Jira change.
- [2026-11-05, Claude Code] Sunnah: replaced 5,990 Musnad Ahmad notes that began with the previous hadith's text (user-approved); 1,100 grades reset from the hadith's own note and 68 unsupported grades cleared. Live check and tool tests pass. Not committed.
- [2026-11-05, Claude Code] User approved the PDF and Notes plan as recommended; ADR-010 written (migration 023 deferred to Wave 9); CodeMirror download awaits size confirmation. Wave 8 slice: PDF markup bar with keep-highlighter-on, colour keys and a shortcut sheet; most of Wave 8 already existed. npm test 1302/1302; live ar/en pass in pdf-markup-live-z6qTgM. No schema, dependency, Git or Jira change.
- [2026-11-05, Claude Code] Sunnah: filled 4,842 missing bab names (Ibn Majah, Tirmidhi, Bukhari) and 19,339 Musnad Ahmad takhrij notes with 6,617 grades from approved Shamela page downloads; reader no longer shows literal nan section numbers. Not committed.
- [2026-11-05, Claude Code] Planned the Acrobat-style PDF shell and note-taking experience (waves 8 to 13) from REA on the installed Acrobat and OneNote and public docs for Obsidian, Zotero, Logseq, NotebookLM, Figma and Maktabook. Plan only; decisions D1 to D7 await approval (CodeMirror dependency, comment migration 023). See docs/features/PDF and Notes Experience Plan.md. No code, Git or Jira changes.
- [2026-11-05, Claude Code] Sunnah chapter names: Darimi now has the Muqaddima plus 23 Arabic kitab names (was 4 groups) and the Muwatta has English kitab names, from approved Shamela and hadith-json downloads; database patched in place after a backup. Bab gaps in five books and Musnad Ahmad's structure remain. Not committed.
- [2026-11-05, Claude Code] Waves 4a to 7 committed as 9a783a1 (code) and fcf7b85 (docs) and pushed to origin/feature/library-domain after 1297/1297 tests and tsc. Jira comments on KEY-232 to KEY-261; 16 tickets In Review, 6 In Progress, KEY-261 To Do, none Done. Dataset Delivery Plan left untracked.
- [2026-11-02, Claude Code] Waves 6 and 7 (KEY-255 to KEY-261) implemented on top of uncommitted Wave 4a and Wave 5, with no schema or dependency change; nothing is committed and Jira is unchanged. Lectures player with file sections, speed and resume; timestamped and screenshot notes; Coursera progress through the organisation API with encrypted credentials; repeatable Arabic OCR benchmark with a page-layout choice for the reader and the Hub, and the PaddleOCR-VL gap explained; OCR comparison against pasted text; physical book from a cover photo; one updatable mirror file; installer option to skip OCR. Final checks: npm test 1297/1297, tsc, lint 0 errors on new files, main build, git diff --check. Live `.baglib-data/wave6-live-Zf3bDq` passed in ar and en; throwaway installer silent tests passed. Open: real Coursera account, vocalized Arabic above target, no manuscripts, installer options page not clicked, book clubs a concept note only. See CURRENT_TASK and docs/features/feature - Lectures, OCR Benchmark and Modular Install.md.
- [2026-11-02, Claude Code] Wave 5 (KEY-247 to KEY-254) implemented on top of uncommitted Wave 4a, nothing committed and Jira unchanged. Pathways space with migration 022 `pathway_item` and ADR-009, all approved by the user; Quran, Sunnah and poetry search plus site search buttons; Quran frequency matched to corpus.quran.com on 16 roots; Shrouh beside the hadith; hadith statistics reconciled with the verifier; subjects from source titles. npm test 1284/1284, tsc, lint 0 errors on new files, main build, git diff --check clean. Live `.baglib-data/wave5-live-wc5CmX` ar and en on real Sunnah and Quran data, which also closes the unseen KEY-251 form. Open: munasabah needs a citable source, EKB has no button, poetry group and hosted AI not exercised, curated syllabi not included. See CURRENT_TASK and docs/features/feature - Pathways and Wave 5 Research.md.
- [2026-11-02, Claude Code] KEY-251 personal commentary added as a shared component on ayahs and hadith, plus Notes search, with no schema change and history from Wave 4a. Form inside Quran and Sunnah views not seen live (no data in the throwaway profile). Nothing committed. See CURRENT_TASK.
- [2026-11-02, Claude Code] Fixed the Wave 4a leftovers, added comments on saved cards (KEY-232) and implemented KEY-235 decks and Anki import-file export with no schema or dependency. 1261/1261 tests, tsc, lint, main build and live ar/en pass (wave4-live-AeaqpL). Real Anki import not verified. KEY-233 local slice then added: dictionary manager with science tags and science-ranked card lookups, no schema change; 1264/1264 and live ar/en pass (wave4-live-652Fja). Remote sources not licence-checked and no real dictionary tested. Nothing committed. See CURRENT_TASK.
- [2026-11-02, Claude Code] Reviewed Codex's interrupted KEY-234/Wave 4a working tree (files since 00:28) and finished it. Fixed: old snapshots were restored without migrations; erase could delete backups for a non-trashed id and used a hard-coded snapshot path; erase wiped unrelated drafts; restoring a trash version lost the reader projection; trashed notes with missing tags could not be restored; note quotes leaked into the reader; a conversion error could stop startup. Live check then found a stale trash revision, also fixed. Isolated suite 1254/1254, tsc, lint and main build pass; live ar/en plus old-schema real-copy restore pass in wave4-live-wjpGcb. Nothing committed. See CURRENT_TASK.
- [2026-11-02, Codex] KEY-234 prerequisite implemented against existing018 schema: FSRS queue/rating/restart, Notes review UI and note export, Dashboard counts; no dependency installation. Final isolated full suite1234/1234, focused23/23, tsc/mainbuild/changed-file lint pass. Actual ar/en Electron+preload+dev renderer and second process launch pass in srs-live-00JhYA. ADR008 records approved4a; history/migrations/conversion/backup and KEY-240/241/242/246 implementation are still pending, not certified. No Git/Jira writes; unrelated delivery plan untouched. See CURRENT_TASK for limits.

- [2026-11-02, Codex] User approved revised Wave 4a schema plus eight corrected contracts; implementation order KEY-234 first, then KEY-240/242/241/246. Beginning existing-schema SRS only; no downloads/new dependencies/Git/Jira writes authorized. Approved 4a storage not yet migrated. Unrelated delivery plan and other agent PDF scope preserved. See CURRENT_TASK for approval boundaries.

- [2026-11-01, Codex] User-authorized Wave 3 commit f492e12 pushed and remote-verified. Updated KEY-221/236–239 with commit, 1223 passing tests, native bilingual evidence and explicit remaining acceptance limits; all stay In Progress. Unrelated untracked delivery plan excluded. Handoff-only update follows publication.

- [2026-11-01, Codex] Wave 3 working tree implemented across KEY-236–239 with approved ADR-007/migration020 only; goals/order/rhythm reuse settings. Planner calendar/source links, measured subject hours/order, real-data dashboard/word counts and opt-in progress-safe pauses/intention are wired. User supplied exact bilingual intention, off by default. 1223/1223 tests (concurrency4), tsc, main build, changed-file lint0errors and real app ar/en disposable-profile checks pass; source/calendar/media limits recorded in CURRENT_TASK and feature doc. Servers stopped, port3000 free. Tickets remain In Progress, no commit/push or new dependencies/downloads. Pre-existing delivery plan untouched.

- [2026-11-01, Codex] User continued after ADR-007 approval request: implementing approved KEY-236 storage/calendar first, then dependent Wave 3 scope. Recheck: branch correct, other code now committed, no active repository test/dev process detected. No package/download approval or Git authorization inferred.

- [2026-11-01, Codex] Wave 3 started with full KEY-221/236–239 ticket reads and source/concurrency audit. Proposed ADR-007 for KEY-236's single study_task table; awaiting explicit schema approval before any migration or implementation. Other sessions/test processes and unfinished 018/019 knowledge-card changes detected; no shared product files touched. Next: approved planner → subject hours/order → real-data dashboard statistics → opt-in snooze/intention. No dependencies/downloads/tests/app/server/Git/Jira writes performed. Launch wording and exclusive edit handoff remain pending.

- [2026-11-01, Claude Code] KEY-232 pushed (`f204437`), still In Progress: real Knowledge Cards from selection, hover and the reader menu, saved cards in Notes, memorization flag. KEY-231 approved (tables, FSRS, `ts-fsrs` 5.3.1). Migration 019 keeps all knowledge when a book is deleted, and Notes lists it. Real Quran and Sunnah data in the card were not exercised live. See CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] Installer is now an assisted Arabic and English wizard (language, who it is for, folder, shortcuts, Open with, start now) with Baglib's icon. Disposable build 16/16 through the real windows, including update and uninstall. All-users mode and the production file types are not verified. Part of KEY-230. See CURRENT_TASK. No Git or Jira actions.
- [2026-11-01, Claude Code] Wave 2 started with a proposed `docs/ADR-006-knowledge-cards-and-spaced-repetition.md` for KEY-231. Not approved, so no migration or dependency was added. KEY-230 code is complete at 18/18 packaged checks with a 668 MB installer, but stays open for commit approval, the installer run and setup from empty. No Git actions.
- [2026-11-01, Claude Code] Dataset delivery planned in `docs/features/Dataset Delivery Plan.md`. The user confirmed owner authorization, so rights no longer limit delivery. Quran basic packs and the Sunnah database go in the installer; poetry is a prebuilt optional pack. Tasks KEY-264 to KEY-267. Plan only. No Git actions.
- [2026-11-01, Claude Code] Wave 1: KEY-229 Done. KEY-230 implemented, not committed: engine tools ship in `resources/pdf-engine`, embeddable Python replaces the venv in installers, Stirling works from userData, setup script extended and moved to curl, EPUB image collision fixed. 1183/1183 tests; packaged app 18/18 with machine tools hidden. Setup from empty and running the NSIS installer are not verified; distribution licensing review is still open. See CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] Planned the next work from the Baglib FigJam board in Jira: epics KEY-220 to KEY-228 and tasks KEY-229 to KEY-261 in seven waves, using existing labels only. Start with KEY-229 and KEY-230. Decision tasks KEY-231, KEY-236, KEY-240 and KEY-247 need approval before schema changes. No code changed. See CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] Published the uncommitted batch as nine commits to `origin/feature/library-domain` (`5b3d666..5acea24`). Final tree: tsc, builds and 1179 tests pass; 5 known lint errors remain in `highlight-manager.ts`. Jira: KEY-215 to KEY-219 created Done; KEY-202, KEY-204 and KEY-210 stay In Progress with evidence; KEY-205 corrected; KEY-171 noted. See CURRENT_TASK.
- [2026-11-01, Claude Code] Removed unavailable engine tools from the layout at the user's request: PDF/A (Hub, reader button, `convert-pdfa` feature, pipeline steps, policy rule), PDF to XML and scanned-photo split. Built-in OCR and Pre-Publish pipelines no longer end in a disabled step. 1179/1179 tests; 31/31 live ar and en checks; reader Convert panel not opened with a PDF. See CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] OCRmyPDF is now the default OCR engine. Tesseract 5.4.0 and OCRmyPDF 17.13.0 are installed locally and pinned in the setup script; Hub `ocr-pdf` works through Stirling; the reader offers OCRmyPDF and PaddleOCR-VL with a saved choice, unavailable reasons and an honest Windows OCR fallback. No schema change. OCRmyPDF takes about 6-9 s a page against 5-6 minutes for PaddleOCR-VL; Arabic verse stays weak in both and is worst in the Hub. See CURRENT_TASK and section 10 of the OCR feature doc. No Git or Jira actions.
- [2026-11-01, Claude Code] WeasyPrint 70.0 added as a local engine tool: Hub Email to PDF, URL to PDF through a direct render, PDF output in the web and novel clipper, reader Save as PDF and annotation PDF. Renders are offline and PDF/UA-1 tagged (veraPDF pass). Not in installers yet. See CURRENT_TASK. No Git actions.
- [2026-11-01, Codex] Outer-scroll fix verified: fixed viewport body/root theme backing; 8 native regression configurations and 4 actual dev-app locale/theme probes pass, as do tsc/harness lint. Internal panels still scroll, footer cannot move above a blank document region. Dev-app verification uses an isolated browser profile, not native database access. Added reproducible layout-scroll-live harness and viewport feature doc. No unrelated edits or Git/Jira actions.

- [2026-11-01, Claude Code] URL to PDF setting turned on in the sidecar env; the endpoint stays off until WeasyPrint is installed (not done, needs the user's decision). `pdf-to-ua` and `accessibility-report` cannot be enabled on this jar because they need Stirling's proprietary module. No Git actions.
- [2026-11-01, Claude Code] Ghostscript 10.08.0 installed in the local engine folder with a `gs.exe` copy, and the Stirling sidecar PATH now includes the Ghostscript and qpdf folders, so `repair` and four other endpoints are on (12 of 99 disabled, was 17). qpdf skipped as agreed; linearize stays a no-op. Repair checked on one damaged Arabic page only. `scripts/setup-pdf-engine.ps1` does not install Ghostscript yet. See CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] PaddleOCR-VL now really runs. The old worker never loaded the model (it wrapped an absent Tesseract), its verify script checked only dimensions, the real app could not find the worker from `dist/main`, and the reader's OCR controls were unreachable in the workstation. Replaced the worker with native transformers inference over row and block crops, `pdftoppm` page rendering, truthful readiness with localized fallback messages, pill and page-anchored overlay in the workstation. Measured: English no recognition errors, 106-326 s/page; Arabic letter CER 12.5%, 405 s/page, 122 of 285 diacritics. Arabic numerals, diacritics and decorative pages remain weak. See section 9 of `docs/features/feature - Local OCR and Scanned Manuscript Recognition.md`. No schema change. torch and transformers are not in `requirements.lock` or the setup script yet. No Git actions.
- [2026-11-01, Claude Code] QuranLab hadith merge: pinned `quranlab/hadith` download, text-based crosswalk, new `sunnah_merged_quranlab_v1.sqlite` with attributed grading and field provenance, and optional Sunnah reader tabs for rulings and sources. Existing corpus, row IDs and `baglib.db` unchanged. No new dependency or core schema change. Verifier exit 0, Python and app tests pass, live ar/en check passes. See `docs/features/QuranLab-Hadith.md` and CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] Dataset and translation audit: wired unconnected Quran, Sunnah and poetry data into the UI (word meanings, derived Arabic metadata, topic and similar drawers, Juz/Hizb and sajda, narrator profiles, matn sources, Quran root to hadith, poetry language-type and location filters), removed 314 dead translation keys, added a key guard test. Full list: `docs/features/Dataset UI coverage audit.md`. No schema or dependency change. Real app checked in ar and en on a throwaway profile. Sunnah files overlap with the QuranLab session. No Git actions.
- [2026-11-01, Claude Code] Fixed the new-profile startup crash on `app_settings`: KOSync, app lock and reader plugin singletons are now created on first use, and search provider settings are restored on first use, so nothing reads the database before migrations. New regression test `startup-before-migrations.test.ts`. tsc/build:main/1130 tests pass; real app reaches the main window on an empty profile and saved settings load after relaunch. Dev server only, no schema change. Separate from the PDF batch. Commit `5b3d666` pushed to `origin/feature/library-domain`; Jira KEY-214 Done.
- [2026-11-01, Claude Code] Finish pass on the uncommitted workstation batch: moved all Hub/Panel/Tools strings to `translations.ts` (66 tools, 17 steps, 201 keys per language), fixed the stale Save button after a failed export, the dead Hub file drop (`File.path` removed in Electron 32) and its bubbling into library import, a possible text-worker hang, and 15 lint errors. tsc/builds/1127 tests pass; real app checked in ar/en on a throwaway profile. 5 lint errors remain in `highlight-manager.ts`, outside this batch. Found, not fixed: a new profile crashes at startup on `app_settings` (koSyncService runs before migrations). See CURRENT_TASK for unverified items. No Git actions.
- [2026-11-01, Claude Code] Second options pass: compared all Hub tools with the engine API, fixed ignored page-number selection, wiped metadata dates and comment removal deleting links and fields, added the missing settings in ar/en. 228 live checks, 1123 tests. Limits in CURRENT_TASK. No Git actions.
- [2026-11-01, Claude Code] Added Hub tool options and audit, pdftohtml, open-time trimming (13.3s to 0.73s first page), and verified per-page redaction with rotation handling. See CURRENT_TASK for results and limits. No Git actions.
- [2026-11-01, Claude Code] Verified the workstation fixes in the real app on a text book and an image-only PDF, ar/en; fixed a stale drawn box and placeholder-only Markdown on image-only PDFs. tsc/build:main/1095 tests pass. No Git actions.
- [2026-11-01, Claude Code] Workstation fixes: viewer always mounted so the loader state is gone; box limited to manual redaction and image/ink placement; real thumbnails in View and Organize; DOCX/PPTX via built-in Office conversion, CSV/TXT parameter fixes, HTML/Markdown text reflow; redaction honors rasterize. Known limit: redaction box is wrong on rotated pages. No Git actions.
- [2026-10-31, Claude Code] Fixed the uncaught closed-stream error from `idlePdfTextStream` when TextLayer cancels during a pending idle slice, with a regression test. No Git actions.
- [2026-10-31, Claude Code] Fixed `Failed to fetch` on every PDF: electron-serve's later scheme registration was replacing ours in renderers, so `src/main/index.ts` now registers all three schemes after it. User confirmed PDFs open in the real app. No Git actions.
- [2026-10-31, Claude Code] Moved 80.38GB of non-runtime datasets, reference repos, test runs and logs to sibling archive folders with a manifest (no deletions); see `docs/data-archive.md`. Untracked `src/renderer/out`, hardened `.gitignore`. tsc/builds/1091tests pass. No Git actions.

- [2026-10-31, Claude Code] Rebuilt reader around one worker-hosted parser pipeline (no duplicate parse), added late-range cache failover, atomic version restore, cached first-paint preview, idle text slices, reorganized workbench chrome, and a Stirling contract fixing pipeline invalid-output and 18 nonexistent Hub endpoints. 1091tests/tsc/builds and native en/ar pass. Warm reopen23-42ms; first-ever open~1s (cold sub100ms not met). Hub still has hardcoded strings; external engine components absent. No Git actions.

- [2026-10-31, Claude Code] Connected REA to Claude Code: user-approved Node24.18.0→24.22.1 (rea-agents6.8.0 engine requirement) and `rea setup --client claude_code`; registration+skill aligned, direct MCP handshake lists229tools. Live tools need a client restart; no native analysis provider configured; Codex registration remains stale at6.7.0. No Baglib source changes/no Git actions.

- [2026-10-30, Codex] Actual idle-warmed worker integration passes bilingual native pixel/nav/parent target disposal checks and4clienttests. Tsc/mainbuild pass; full+renderer81869 andscroll23138 live. Fallback maintained for unsupported filters/timeout, first-page path not delayed. Nested-parser cleanup inventory/sub100ms/full original acceptance still not proven; no Git actions.

- [2026-10-30, Codex] Raster worker now integrated after idle first paint, with bounded client requests/abort/late-bitmap closure/timeout/local fallback.3clienttests/tsc/lint0errors pass; native5Y7FEJ actualreaderworker page5 pixel parity verified. Lifecycle CDP observation required auto-attach rather than getTargets;49812 live, no cleanup claim yet. Full goal active/no Git actions.

- [2026-10-30, Codex] Prototype checkpoint passes1063tests/mainbuild/tsc +native text/vector/scanned pixel comparisons; no live handles. Worker remains isolated; integration must preserve first-open path and add idle warm-up/lifecycle/fallback/cancellation. No user-visible layout/performance change claimed, full goal active/no Git actions.

- [2026-10-30, Codex] Real OffscreenCanvas raster-worker prototype passes native synthetic Y6q9ED +scanned NQpUZS exactpixels/tsc; module asset bundled. Still isolated, not used byreader; startup duplicates parsing and is slower, so must integrate with idle warm-up and fallback/cancellation/lifecycle tests rather than blindly enable. Full original scope active/no Git actions.

- [2026-10-30, Codex] Rendererbuild passes; no live handles. Progressive refinement UX now retains visible preview without layout changes. Full goal still incomplete: worker rasterization/representative sub100ms cold/full-app and remaining workstation acceptance. No Git actions.

- [2026-10-30, Codex] Progressive preview fix verified1063tests/tsc/mainbuild, nativearjdqTkt +en60pageXozeb0; max5canvases/cache~0.1ms/sampledmax16.8ms. Rendererbuild3859 live. Worker/full-app cold/sub100ms and full workstation acceptance still pending, no Git actions.

- [2026-10-30, Codex] Measured~95ms actual cached raster span; fixed progressive zoom white-flash by keeping preview on display and refining on detached pooled canvas, canceled safely before reuse. Native Zj8Z1a white-clear probe proves preview preserved; tsc/lint0errors pass before tiny size-reuse refinement. Full/bilingual/perf checks pending, broad goal still active/no Git actions.

- [2026-10-30, Codex] Current tsc/hooklint pass; realixpiYK cached document ready68.7ms→paint157.1ms, pixels/SHA/pagecount preserved. No live handles. Progressive/off-thread rendering is next meaningful remaining performance work; one-line late-range fallback has no dedicated injection yet. Full goal not complete/no Git actions.

- [2026-10-30, Codex] Corrupted cached PDF recovery verified bilingual nativeNsehbk/opyVrC, pixels/source SHA/edit invalidation preserved.1063tests/tsc/mainbuild pass before late-range refinement; dedicated late-range fault test pending. Real-book stage timing/current checks66154 live, full performance/workstation goal unchanged/no Git actions.

- [2026-10-30, Codex] Added original-source recovery for malformed cached derivatives, preventing display-only cache failure from blocking reading. Real IPC/native fault AEgs8g proves recovery/pixels/SHA/edit invalidation. Typecheck/hooklint pass; final bilingual/current-source suite still pending. Remaining sub100ms/cold/full-app/off-thread/workstation scope unchanged/no Git actions.

- [2026-10-30, Codex] Final balanced-cache verification passes1063TS/3Python/tsc/mainbuild; realxaKZeN cached178ms/211KB vs2555ms original, Arabic k3Z8au cached65.5ms withsource editreload. Pixel/SHA/pagecount preserved. No live handles, no Git actions. Sub100ms cold/full-app/off-thread/full original acceptance remain pending.

- [2026-10-30, Codex] Fixed flat page-tree amplification proven by REA+worker inspection/native experiment: balanced derivative real641page cache175ms/211KB/5requests vs original2487ms, matching pixels/SHA. Ineffective object streams removed, cache formatv2.3Python/7TS focused tests pass; final96430 suite/build and87332 native live. Docs updated; full original performance/tool goal remains active/no Git actions.

- [2026-10-30, Codex] Native real79HphF cached921ms vs2802ms,641pages + exact first-page pixel equality + source SHA intact;599requests/39MB still unresolved. SyntheticfC1J2S cached53.5ms/1558bytes vs189ms, pixel match and actual edit invalidation pass. tsc passes/no live handles. pikepdf docs updated; investigate real excessive pre/post-paint traffic next, full performance/tool goal not complete/no Git actions.

- [2026-10-30, Codex] Native cache-hit tests now exercise actual IPC/renderer/subprocess/protocol: synthetic first339ms→cached67ms + source-edit reload; real86MB first3102ms→cached982ms/641pages/checksum intact. Real warm39MB read remains unacceptable to instant-open goal. Helper0.60s→45MB derivative. Pixel-fidelity reruns26723 live; cache fixture Windows case gate repaired, actual production gate unchanged. No Git actions, original full objective remains active.

- [2026-10-30, Codex] Cache integration bilingual native checks pass en oCf3KN/ar bfg88Q; final7cachetests+tsc pass, full1,063suite/mainbuild/hooklint pass. No live handles. Reader layout unchanged; background derivative lookup/generation wired, but actual native cache-hit/reopen/stale-edit and86MB timing verification remain next. Full original goal active, no Git actions.

- [2026-10-30, Codex] Viewing-cache integration now wired through owner-bound IPC/preload and PDF renderer; canonical editing source unchanged. Nonblocking first open, cached reopen, watcher/stat invalidation, no same-key mid-read swap, awaited shutdown, fixture isolation.1,063tests/tsc/mainbuild/hooklint pass before tiny eligibility/release refinements. Bilingual native23064 live; real-book cache-hit measurement and full acceptance pending. No Git actions.

- [2026-10-30, Codex] Cache checkpoint typecheck passes (95103 exit0), seven focused tests pass, no live verification handles. Integration remains the next task; no user-visible speedup claimed yet.

- [2026-10-30, Codex] Seven viewing-cache service regressions pass; startup cap pruning/output-header verification added. Python disposable smoke passes. PDF.js documentation distinguishes verified service/helper evidence from pending IPC/viewer/real-book acceptance. Typecheck session95103 running at checkpoint. No visible reader/layout changes yet; broad goal active, no Git actions.

- [2026-10-30, Codex] User approved bounded automatic PDF viewing cache; supersedes earlier approval-pending note. Prototype pikepdf linearization succeeds on disposable two-page PDF. Next: cache identity/LRU/cancellation tests, IPC/viewer integration, native real-book comparison, documentation. Broader objective remains incomplete; no Git authorization.

- [2026-10-29, Codex]500MiB sparse native fixture132KB/145ms; actual86MB book read-only checksum intact but47.66MB/729requests/2.3–5s. Verified643xref history sections; document-ready dominates. Added first-paint barrier before optional outline scan and benchmark safety/telemetry; no false sub100ms claim. Temporary optimized view-cache approval requested, not implemented. Final tests/build/native chain live; no Git actions.

- [2026-10-29, Codex] Custom-scheme range fix verified1055tests/tsc/main+rendererbuild/diffcheck; lint0errors/4warnings. Final32MiB fixture fetches66646bytes at131.5ms, late-range failure Xp85gc exits correctly; en dTsBfs/ar TQLqB0 staged/theme/annotations pass. No live handles. Real500MiB/cold-open/sub100ms/off-thread/full acceptance still pending; no commits/pushes.

- [2026-10-29, Codex] Fixed actual custom-scheme whole-file fetch: explicit bounded PDF.js range transport; shared production stream response core/abort guard. Native32MiB baseline33555542bytes331ms→66646bytes132ms in synthetic runs; range-failure UI exits promptly.7focused regressions pass, finalbounded-body/native/fullsuite chain pending. CORS/path authorization remains production wrapper, fixture uses restricted own authorization; no cold-book/sub100ms claims/no Git actions.

- [2026-10-29, Codex] Final compact annotation rendererbuild/diffcheck pass;1050tests/typecheck/mainbuild and en/ar checks pass. No live handles remain. Annotation UI request complete within existing pane; broader goal remains active/no Git actions.

- [2026-10-29, Codex] Compact annotation pane verified1050tests/tsc/mainbuild, lint0errors; native en3zYO84/arOO4lAc proves same viewport/no duplicate/no tab overflow, mixed-script search and JSON page2 callback. Fixed overflow found visually with embedded icon/count grid. Final rendererbuild/diffcheck live; original full goal remains active/no Git actions.

- [2026-10-29, Codex] Restored annotation experience as optional embedded content in existing right tools pane, one counted toggle/no extra viewport width, parent single-panel state. Old PDF overlay suppressed; previous exports/search/filter/delete/jump reused. Fixed JSON page navigation and conservative Arabic search/type localization; parser/native mixed-script/exclusivity tests running with build/tsc/full suite. No commits/pushes.

- [2026-10-29, Codex] Final current-source memo/geometry isolation verified:1049tests/tsc/main+rendererbuild; native en LwRUiB/ar ZV6mxg;60page CF8BZe max16.8ms/zero>25ms,max5canvases/cache~0.1ms. Lint0errors/4dependency warnings. No live handles; actual-book/off-thread/range accounting/full objective remains pending, no Git actions.

- [2026-10-29, Codex] Resolved lint render-ref/effect-state errors via reactive page geometry and removing redundant visibility seed; latest lint0errors/4dependency warnings/tsc pass. Intermediate1049suite/uYhtLW native60page pass. Final current-source perf/en/ar/fullsuite/mainbuild chain live; full objective still incomplete.

- [2026-10-29, Codex] Profile-guided memo/highlight isolation verified:1049tests/tsc/mainbuild; native en sq8571/ar2ZPvMT;60page Td2cWU max5canvases,max16.8ms/zero>25ms,cache~0.1ms. Synthetic single-run results only, not actual-book proof. Lint/diffcheck live; off-thread/byte-accounting/cold-open/full parity pending. No commits/pushes.

- [2026-10-29, Codex] Used IDlOgT CPU profile evidence to isolate React page/shell work: memoized whole continuous shells and page items, grouped highlights once and stabilized empty arrays. Typecheck/new60page native profiling live. No real-book/locked60FPS claims; off-thread/byte-accounting/full acceptance remain pending. No commits/pushes.

- [2026-10-29, Codex] Active-source follow-up passes1049tests/tsc/mainbuild/diffcheck and native en nUNjy8/ar FEfuwD organizer→replacement preview/source integrity. Restore resets stale working input per real-parser regression; native version-history restore still unverified. Broader goal remains active; no commits/pushes.

- [2026-10-29, Codex] Continued staged-output issue: source switching gets source-specific versioned preview URL; restore/undo explicitly reset engine working state and renderer stale job/output/preview, so subsequent edits use restored source.5focused tests pass including real-parser staged2→restored3page and owner isolation. tsc/mainbuild/full suite running, native reruns pending. No commits/pushes; broader goal remains active.

- [2026-10-29, Codex] Explicit theme opt-in and staged mutation native acceptance passes in English Ips0xv and Arabic WSi2KH; latest tsc pass, full1048suite/mainbuild pass. PDF colors remain original unless dedicated button clicked; app theme affects chrome. Original source hash unchanged after rotation+replacement. No performance causality claim; broader goal still active/no Git actions.

- [2026-10-29, Codex] PDF page colors now opt-in dark with localized dedicated pressed Moon button; reader chrome follows app theme instead of hardcoded dark.1048tests/tsc/mainbuild and staged mutation LCaPEH pass. Explicit theme/tint+mutation assertions running in en/ar; active-ring styling final typecheck pending. Full objective still incomplete; no Git actions.

- [2026-10-29, Codex] Annotation1: real native BGhuVo passes organizer→replacement staged display/source unchanged. Generalized all single-PDF result display/work-ID-only entry/page clamp. Added opt-in PDF tint independent of app chrome; chrome inherits app theme. Hub unwrap/direct standalone dispatch has11processor tests+real Java rotation pass.1048suite passed before latest theme/generalization; current all-checks/native rerun live. No commits/pushes; full objective and individual-tool parity remain incomplete.

- [2026-10-29, Codex] Prioritized clarified Hub/in-reader failures. Fixed Hub PdfResult envelope handling and stale original PDF rendering after successful jobs via owner/hash-verified staged URL. Actual JVM English replacement independently parses EDIT1;26focused tests pass, final native mutation/full suite pending. Pipeline invalid-output not yet fixed; no Git actions. Scroll profiling fixture completed but CPU attribution not analyzed yet.

- [2026-10-29, Codex] Timestamp-refined native60page rerun-CLLbO4 passes;1047tests/tsc/mainbuild pass. No running verification session remains. Actual-book benchmarks/off-thread/full feature acceptance/error investigation still open.

- [2026-10-29, Codex] Native60page scenario rUZHP9 passes idle-preload/returncache/max5canvases/source integrity/final text. Cached draw~0.1ms, but83ms stall disproves locked60FPS on this fixture.1047tests/tsc/mainbuild pass. Sampling refinement rerun live; representative large-book/cold-open/rangebytes/off-thread/full acceptance and invalid-output remain pending.

- [2026-10-29, Codex] Added cancellable750ms idle next-page preload and removed additive render-time visible-range update.7focused tests/tsc pass. Added60page native cache/residency/frame-sampling scenario; corrected initial harness instrumentation and rerunning. Full regression/mainbuild queued. Off-thread rasterization, actual-book timing/full acceptance/error remain open; no Git actions.

- [2026-10-29, Codex] Canvas-pool final tsc/mainbuild pass; full test process finished, authoritative results in .baglib-data/pdf-pool-regression.log.2pool regressions and bilingual native nRrH05 pass. Active pixel budget/off-thread/preload/timing/full acceptance and invalid-output still open; no Git actions.

- [2026-10-29, Codex] Added bounded-idle canvas pool with exclusive leases, post-cancellation settlement release and document disposal;2focused pool regressions/native bilingual nRrH05 pass. Final same-size backing allocation guard tsc/fullsuite/mainbuild running. Regenerated malformed generated route types using Next typegen. Active canvas count remains viewport-governed, not a hard pool cap; performance/off-thread/preload/full acceptance remain pending.

- [2026-10-29, Codex]1045tests/typecheck/mainbuild pass; bilingual native cIwNA0 and real Java25 lower-priority/lazy launch smoke pass. Updated acceptance/Stirling notes with measured limits. Unvisited geometry/pooling/off-thread/preload/performance benchmarks and reported invalid-output remain open. No Git actions.

- [2026-10-29, Codex] Implemented scroll-reset/cancellable idle scheduling for heading scans, measured-dimension placeholders, stable viewer callbacks and lower-priority lazy Java startup.2focused idle regressions pass; full suite/tsc/mainbuild and real JVM/native regressions running. No performance threshold claims, no Git actions.

- [2026-10-29, Codex] Native range+bitmap-cache immersive regression run-FhrN4O passes actual Arabic/English, themes/organizer/edge behavior. Mount-to-paint observation717ms is not a qualifying<100ms benchmark. Full1043tests/typecheck/mainbuild pass; original full acceptance remains incomplete.

- [2026-10-29, Codex] Added bounded25entry/128MiB per-document bitmap cache, same-page previews, memo/layout isolation and explicit64KiB range-only configuration. LRU/disposal tests and full1043suite/tsc/mainbuild pass. Native bilingual immersive j4Uljr passes before range flags; latest rerun live. Native timing/pooling/preload/full acceptance and reported invalid-output remain pending; no Git actions.

- [2026-10-29, Codex] Performance continuation full suite passes:1041tests/288suites,zero failures/skips. Typecheck/main build pass. Native performance/selection and remaining objective are not yet verified; invalid-output still unreproduced.

- [2026-10-29, Codex] Read updated performance objective; fixed unbounded continuous-page residency and separated bitmap paint from 150ms scroll-settled text hydration with cancellation. New residency regression/typecheck/main build pass; full suite running. Real engine smoke and 24MB rotation pass but user invalid-output remains unreproduced; no resolution claimed. Native timing/cache/pooling/full acceptance pending; no Git actions.

- [2026-10-29, Codex] Latest save-guard typecheck/full1040TS tests pass;2Python provisioning tests and real native-JAR-only engine smoke pass. Split/rotation/blank output verified; native drag/save dialogs and entire original acceptance remain pending. No commits/pushes.

- [2026-10-29, Codex] Post-cleanup native module smoke passes;1040tests/typecheck/lint/mainbuild passed. Added multi-output Quick Save/stale-overwrite safety (reveal parts/copy, never silently first-part overwrite); latest full suite/typecheck running. Native save-dialog workflow/full goal pending; no commits/pushes.

- [2026-10-29, Codex] Resolved missing Windows JPDFium1.1.6 runtime with exact-version verified provisioning+PropertiesLauncher. Live compound organizer and direct native split pass;2Python cache/integrity tests and13focused TS tests pass.29verified duplicate DLLs cleaned, post-cleanup live run/full suite/build underway. Full objective pending; no commits/pushes.

- [2026-10-29, Codex] Wired organizer split markers through Apply/staged parts, added blank/per-page rotation support and NaN validation. Actual split API lacks Windows native library; organizer uses existing remove-pages range extraction. Live compound-plan verification/focused tests running; full goal pending, no commits/pushes.

- [2026-10-29, Codex] Native run-j3Fi2E passes bilingual organizer2pages/sepia/insertion/undo/redo/reset/rotation/focus/View and existing immersive checks. Parser/lint/tsc pass; full suite/mainbuild running. Drag/Apply output and full-feature acceptance still pending; no Git actions.

- [2026-10-29, Codex] Native organizer test exposed Java preview on View leaving controls busy; fixed guard to fileUrl. Persistent hover/focus insertion controls, first-divider no-op disabled, grid dividers no longer consume columns; parser/lint/tsc pass. First-change undo/redo and bilingual organizer rerun pending. Full objective remains active; no Git actions.

- [2026-10-29, Codex] Implemented organizer sepia/localized controls/keyboard insertion+hover access; fixed lost native pagecount and non-returning View, initialized undo baseline and pure history updates, rejected fractional pages. Native tests exposed real count bug and transition timing; strengthened checks running. Full goal pending; no commits/pushes.

- [2026-10-29, Codex] run-grhNu1 passes actual ar/RTL and en/LTR,3theme input/heading contrast>=4.5and existing immersive tests. Renderer build/lint pass. Other surfaces and full goal still pending; no commits/pushes.

- [2026-10-29, Codex] Native contrast caught2.457light heading ratio; scoped semantic alias rebinding fixes it. run-YYbPfS passes>=4.5input/heading across3themes/2directions; renderer build/lint pass. Fixture now also switches actual Arabic/English (not just direction), rerunning. Full goal pending, no Git actions.

- [2026-10-29, Codex] Scoped dark/light reader semantic colors (sepia already scoped), fixed tool-directory dark-only hover/text/border and focus treatment. tsc passes; native three-theme/two-direction input+heading contrast checks running. Full contrast/reader goal pending, no commits/pushes.

- [2026-10-29, Codex] Real engine archive-collision smoke passes. Added generated-output receipts for same-folder feedback prevention (canonical directory comparison); actual-FS restart regression passes.10focused tests/tsc pass; full suite/mainbuild running. Full objective pending; no Git actions.

- [2026-10-29, Codex] Protected watched originals against archive basename collisions via exclusive copy/unique suffix, no false success on failed delete.10focused tests/tsc/mainbuild pass; live engine collision+keep workflow running. Full scope pending, no commits/pushes.

- [2026-10-29, Codex] Implemented watcher stop abort+await/late-output cleanup, actual main startup and awaited shutdown, policy-gated unref timer.9focused tests pass including cancellation and clock-driven stop/restart; final full suite/typecheck running. Full goal pending; no commits/pushes.

- [2026-10-29, Codex] Real JVM keep-mode+new-service receipt test passes, source retained and restart0processed; existing full smoke/tsc/mainbuild pass. Full suite running. Same-folder/collision and cancellation boundaries still pending; no Git actions.

- [2026-10-29, Codex] Added persistent atomic operational watch receipts to prevent keep-mode repeats; hash/config changes retry, disabled pipelines skipped, mid-job source changes blocked before destructive archival.8focused tests/tsc pass; live JVM keep/restart smoke running. Full objective pending; no commits/pushes.

- [2026-10-29, Codex] Live watched-folder archive test passes actual180degree output/preserved archived source/persisted count/no repeat; tsc/mainbuild pass. Historical saved config preserved; keep-mode/filter/cancellation and full acceptance remain pending. No Git actions.

- [2026-10-29, Codex] Removed fake processor235daily count and personal-folder watching defaults; added isolated test state and shared scans.7focused tests/tsc and real handleData rotation pass. Live disposable watched-folder/archive output test running; keep-mode/filter/cancel gaps remain. No commits/pushes.

- [2026-10-29, Codex] Native run-j6YP66 passes bilingual TOC JSON import/apply/download-byte checks; GPU shutdown diagnostics observed after pass. Actual PDF outline tested separately; integrated UI→IPC→JVM/append still pending. Final focused checks running, no Git actions.

- [2026-10-29, Codex] Real JVM TOC output verifies nested bilingual title/page2destination/source preservation via independent PDF.js; passed. Centralized remaining TOC labels; native bilingual import/apply/download test running. Full reader goal pending; no commits/pushes.

- [2026-10-29, Codex] Native run-yvi3uH verifies275px tools,6px PDF corners,localized total-pages badge with existing immersive checks. Removed duplicate top navigation count and raw library/security format labels; matte backgrounds match three themes. Latest label checks pending; full objective remains active, no commits/pushes.

- [2026-10-29, Codex] Custom-protocol native run-ETZG4R and main build pass after direct URL loading/theme wiring. Added localized recovery help instead of raw engine errors. Fixture does not yet prove production range handling or150ms latency. Full objective pending, no Git actions.

- [2026-10-29, Codex] Removed full-file ArrayBuffer/Base64 gate reintroduced in native PDF viewer; direct URL streaming restored. Localized loading/error/page labels, synchronized canvas theme. tsc/lint/native file-URL run-eYjzhT pass; actual custom-scheme fixture now running,150ms gate remains pending. No Git actions.

- [2026-10-29, Codex] Native run-1z7csh verifies unified reading action callback invocation. Removed duplicate view-pane zoom/layout + no-op auto-scroll; full suite1035passes. Scoped TTS overlay stacking above immersive workstation, unchanged legacy layers; latest checks running, actual audio/overlay native test pending. No Git actions.

- [2026-10-29, Codex] Added unified-header reader callbacks for Read Aloud/Auto-Scroll/Bookmark using existing parent state; native callback/immersive checks running. Remaining duplicates in tools view and TTS overlay immersive stacking are explicitly pending; no Git actions.

- [2026-10-29, Codex] Native immersive run-4DWRYv passed with new reader document/page-count callback assertions and existing RTL/LTR edge/keyboard/navigation checks. tsc and targeted FullPageBookReader/PdfWorkstationPanel lint pass. Full-app highlight/selection interaction remains unverified; no commits/pushes.

- [2026-10-29, Codex] Reconnected embedded workstation to existing parent PDF knowledge/selection/document/outline/page-count state through typed props, keeping one pagination/zoom source. Removed duplicate effect state resets already covered by guarded page-change branch. Native callback checks/tsc/lint running; full goal pending.

- [2026-10-29, Codex] Real-JVM503health regression passed:16probes, starting/error/stopped, no false ready; clean shutdown. Existing healthy smoke also passed. Full goal pending.

- [2026-10-29, Codex] Fixed false LIVE on failed startup health and guarded stale child/shutdown resolution. tsc/12adapter tests and healthy JVM smoke pass; real-JVM503fault regression in progress. Full acceptance still pending; no commits/pushes.

- [2026-10-29, Codex] Added visible ink palette/preview/output color wiring and disabled empty-stroke Apply. Live Java25 verifies actual overlay, retained text/two pages/stroke operator/original hash. Rotation-origin limitations and full workstation acceptance still pending; no commits/pushes.

- [2026-10-29, Codex] Connected vector ink to Stirling overlay transport/staged output; unsupported rotations/origins rejected explicitly. Typecheck/14focused tests passed, added route test corrected fixture page and rerunning. Live output/UI colors/full goal pending, no commits/pushes.

- [2026-10-29, Codex] Source-verified overlay API contract; added bounded vector ink PDF builder, two independent PDF.js parsing/coordinate tests pass and tsc passes. Adapter/UI/publication integration not yet done; full goal pending, no commits/pushes.

- [2026-10-29, Codex] Pen source audit found hardcoded black preview and no confirmed active ink-signature render handler; review stroke persistence is not equivalent. Recorded exact gap, did not add misleading palette. Actual pen publication/full scope remains pending, no commits/pushes.

- [2026-10-29, Codex] Added cancellable idle shared-PDF-worker warm-up after main-window splash, companion excluded; lazy imports retain startup boundary. Checks underway; full-app measured effect/performance gate pending, no commits/pushes.

- [2026-10-29, Codex] Added explicit paint timing observation artifact: run-U07LcL525.6ms mount-to-pixel/text observation on954-byte fixture, not user-click first paint or multi-MB benchmark. Native checks/tsc pass;150ms gate remains unproven, no commits/pushes.

- [2026-10-29, Codex] Added exclusive-overlay trigger focus return; native run-1hvA5L verifies quick-tools/Escape/refocus with existing PDF tests. tsc/lint pass; Hub/version/focus-trap and full scope pending, no commits/pushes.

- [2026-10-29, Codex] Unified Hub/quick-tools/version overlays into exclusive typed state with stale-close-safe transitions and Escape dismissal. Focused test/tsc pass; native overlay/focus-return and full scope pending, no commits/pushes.

- [2026-10-29, Codex] Fixed fixture focus/Enter character sequencing, native run-TWtxne now proves immersive summary Enter/Tab/Enter recovery RTL/LTR. Production unchanged; matrix reconciled. Remaining acceptance gates/full goal pending, no commits/pushes.

- [2026-10-29, Codex] Added actual-key immersive recovery test; two runs fail summary-open assertion despite webContents focus. Keyboard recovery remains unresolved, not passed; existing DOM recovery tests distinct. No commits/pushes.

- [2026-10-29, Codex] Native run-KFLZml passes all five collapse/recovery DOM actions in RTL/LTR with existing PDF/immersive checks. Matrix updated; keyboard/immersive recovery/every pin and broad goal pending, no commits/pushes.

- [2026-10-29, Codex] Implemented five independent collapse controls with localized region-specific recovery menu and immersive top-edge recovery. Verification underway; native interaction/exclusivity/full supplied scope pending, no commits/pushes.

- [2026-10-29, Codex] Added complete immersive-reader acceptance matrix with explicit missing gates/priorities. Fresh tsc/main build and1032tests pass. Full goal NOT achieved; independent collapse/default-reader/live operations/performance and remaining visuals are outstanding. No commits/pushes.

- [2026-10-29, Codex] Focus-mode button no longer pins header through retained focus. Native run-ER6Wmf covers focused-button entry with prior bilingual PDF/immersive checks; final tsc/preceding lint pass. Full scope remains pending, no commits/pushes.

- [2026-10-29, Codex] Native run-Uc1UZP verifies real page navigation/content RTL/LTR. Rail callback source audit confirms actual mode/tool routing. Added accessible rail states and localized mirrored navigation icons; checks underway. Full goal incomplete, no commits/pushes.

- [2026-10-29, Codex] Native run-kujFzx verifies direct page entry with actual page-specific text/pixels. Corrected fixture typo and moved locale switch before navigation for future bilingual verification. Full performance/integration scope remains pending; no commits/pushes.

- [2026-10-29, Codex] Native run-N2bCY2 proves actual PAGE1 text layer and painted fixture pixel, plus prior immersive/theme checks. Added bounded direct page entry to bottom navigation; tsc underway. Native navigation/performance/full supplied scope still pending, no commits/pushes.

- [2026-10-29, Codex] User-authorized reconstruction recovered native fixture from successful bundle into recovered-main.mjs with main.ts entry. Native run-Dq8JQ8 passes existing checks; production unchanged. Final type/NUL checks underway, broader goal incomplete; no commits/pushes.

- [2026-10-29, Codex] Detected native fixture main.ts consists entirely of19421NUL bytes, cause unknown. Five checked related/production/state files intact; coordination requested before reconstructing collaborative fixture. No native verification claim from corrupt source, no commits/pushes.

- [2026-10-29, Codex] Resolved fixture403 via drive-host normalization/exact-source identity. Native run-vUhplu now passes real-PDF canvas presence and immersive/theme checks. Latency/content integrity/full scope still pending, no commits/pushes.

- [2026-10-29, Codex] Added actual-PDF fixture URL/local worker/protocol setup; native canvas check still fails (run-BAkh2U), investigation pending. Do not claim real PDF/latency acceptance. No commits/pushes.

- [2026-10-29, Codex] Removed duplicated mode tabs and consolidated header into44px single row; retained responsive rail modes. tsc/lint/native run-hUH4Gy pass, Arabic capture inspected. Narrow width/full action set/actual PDF acceptance pending; no commits/pushes.

- [2026-10-29, Codex] Chromium screenshot capture fixes stale-frame fixture issue. Native run-BxCdYt passes; inspected Arabic top-reveal image confirms side/bottom chrome hidden and expanded canvas. No actual PDF-rendering/latency proof; multi-row header and full supplied acceptance still pending, no commits/pushes.

- [2026-10-29, Codex] Pipeline sanitizer rejects URL/traversal/encoded/query/fragment/backslash endpoint syntax, retains conditional filter paths; empty runnable pipeline rejected pre-start. Five tests/tsc pass; live endpoint execution/full goal still pending, no commits/pushes.

- [2026-10-29, Codex] TOC import now explains invalid input through localized alert, bounds payload/page numbers and validates all headings before Apply; localized dialog help/example. Three tests pass, remaining checks underway; native/full scope pending, no commits/pushes.

- [2026-10-29, Codex] Preserved other agent's hierarchical TOC import/export and hardened JSON parsing with typed bounded traversal and malformed/page validation. Three TOC tests/tsc pass. Native import/export/output-outline acceptance remains pending; no commits/pushes.

- [2026-10-29, Codex] Pipeline preflight/cancellation now precedes expensive discovery/file reads; abortable reads added. Four focused processor tests pass including cancellation boundary; tsc passes. Live pipeline/filter/watcher acceptance still pending, no commits/pushes.

- [2026-10-29, Codex] Native run-8ZgX85 verifies three-theme toggles/computed sepia colors plus prior all-edge/pin checks RTL/LTR, reduced-motion only; tsc passes. Removed static '+57' claim from Hub link. Full contrast/visual/integration scope pending; no commits/pushes.

- [2026-10-29, Codex] Removed fake watched-folder row, added actual per-folder status colors/labels and periodic/Hub refresh with unmount guard. Verification underway; native refresh/full integration pending, no commits/pushes.

- [2026-10-29, Codex] Replaced sample processor counts and unconditional LIVE with real typed IPC results/engine status; fixed watched-folder result unwrapping. tsc/lint pass. Remaining placeholder folders and refresh/native acceptance pending; no commits/pushes.

- [2026-10-29, Codex] Added selectable sepia workstation theme and localized accessible cycle label; scoped parchment/ink variables and chrome surfaces. tsc/lint pass; native contrast/remaining hardcoded children and full goal pending, no commits/pushes.

- [2026-10-29, Codex] Added accessible bilingual visible color swatches for PDF text/redaction with selected rings/checkmarks and custom picker. tsc/targeted lint passed; remaining drawing tools and three-theme native verification pending. No commit/push.

- [2026-10-29, Codex] Removed duplicate canvas-top navigation/action row; tsc/lint and native run-YjVOoB pass. Inspected captured Arabic image but offscreen frame is stale relative to immersive DOM state; visual verification remains unresolved, not passed. No commits/pushes.

- [2026-10-29, Codex] Full suite 1029/1029 passes; main build/tsc pass. Fixed conditional-sibling immersive positioning via explicit region markers; added pointer-leave grace. Native run-7fYWQS all-edge/pin reduced-motion regression and final tsc pass. Full supplied acceptance remains incomplete; no commit/push.

- [2026-10-29, Codex] Native run-2Rtjbr passes four-edge mouse reveal, F11/Escape and tools pin retention in RTL/LTR under reduced motion. Not normal-animation or full-reader acceptance. Broader checks next; no commit/push.

- [2026-10-29, Codex] Native diagnostic isolated reduced-motion override specificity defect; fixed and verified run-HXvjzW passes F11/top-edge reveal/Escape in RTL/LTR under reduced motion. Normal animation/pins/other edges and full integration remain pending; no commits/pushes.

- [2026-10-29, Codex] Native immersive fixture now exercises real keyboard/mouse in RTL/LTR; exposed header opacity bug, failed twice. F11 clears stale edge but insufficient; diagnostic added, investigation pending. Legacy full fixture also has obsolete selector. No completion claim/commit/push.

- [2026-10-29, Codex] Added five independent localized immersive pin controls and region-specific visibility rules. Verification underway; native hover/pin behavior and broader integration scope remain pending. No Git actions.

- [2026-10-29, Codex] Fixed two workstation lint errors; component lint/tsc pass. Added shared immersive-edge policy and passing bilingual/boundary regression test; final tsc passes. Runtime visuals/independent pins and full supplied scope remain unverified, no commit/push.

- [2026-10-29, Codex] Extended immersive auto-hide to existing bottom navigation, retained reveal while pointer uses chrome, added top/bottom slide and reduced-motion support. tsc passes; native checks and broader objective remain pending, no Git actions.

- [2026-10-29, Codex] Added initial immersive workstation toggle (F11/Escape/button), viewport expansion, logical edge activation/400ms grace/200ms fade and keyboard-focus protection. tsc passes; native visuals and broader immersive requirements remain pending. No commit/push.

- [2026-10-29, Antigravity] Fixed: lingering blue selection after leaving reader + PDF selection flicker:
  1. `highlight-manager.ts`: `clearActiveSelectionHighlight`/`clearCssCustomHighlights` now also remove DOM temp overlays; overlays mount inside the reader container instead of `document.body`.
  2. `WorkspaceContext.tsx`: leaving reader (`setViewMode`, `closeReaderToLibrary`, `openBookForReading`) purges overlays, CSS highlights and native selection; `FullPageBookReader` unmount cleanup does the same.
  3. `PdfNativeViewer.tsx` + `globals.css`: single-layer selection (native while dragging, locked overlay after release), rAF-deferred measurement, deduped parent updates; reader's global mouseup skips `.textLayer` selections.
  4. Verified: tsc 0 errors, build:main OK, 1,028/1,028 tests pass. Not yet visually verified in the running app.
  5. NOT done: the broader Stirling workstation wiring/layout polish request (zone widths, toolbar strip, Hub view switcher, etc.) — pending.

- [2026-10-29, Antigravity] Resolved: Windows Drive Letter %3A Chromium URL Parsing & Instant PDF Loading:
  1. Root Cause: `baglib-asset` scheme registered with `standard: true`. Under Chromium WHATWG URL standard, percent-encoding drive colon as `%3A` places `%3A` into the host authority component, which `window.fetch()` rejects with `TypeError: Failed to parse URL`.
  2. Preserved Windows drive letter and colon unencoded in `src/shared/utils/reader-asset-url.ts` (`baglib-asset:///${drive}/${encodedRest}`), which Chromium parses cleanly as host `f` and path `/...`, matching `src/main/index.ts` line 140's `resolveLocalFilePath` path normalizer.
  3. Added auto-repair for `%3A` in `normalizePdfUrl`, added `extractDiskPathFromUrl`, and integrated secondary fallback to `window.electronAPI.readPdfBase64(diskPath)` in `PdfNativeViewer.tsx`.
  4. Verified: all 5/5 unit tests passed in `tests/reader/reader-asset-url.test.ts`, clean `npx tsc --noEmit` (0 errors), clean `npm run build:main` (131ms), clean `npm run build:renderer` (Next.js Turbopack, 4/4 static pages, 0 errors), and all 1,028/1,028 full tests passed across 288 suites.

- [2026-10-29, Antigravity] Completed: Stirling-PDF v3.2.2 Architectural Review & Deep Parity Completion:
  1. Resolved PDF.js fatal console loading error by supporting `blob:`/`data:` in `normalizePdfUrl` and streaming PDF byte buffers directly into `Uint8Array`, bypassing `getUrlProp`.
  2. Resolved ES module in classic worker error by bundling `pdf.worker.bundle.js` with `esbuild` as an IIFE classic worker.
  3. Resolved HTML `<button> cannot be a descendant of <button>` error by converting card containers to `<div role="button" tabIndex={0}>`.
  4. Fully implemented `PipelineBuilderModal` (`isCreatingPipeline`) in `StirlingToolsHub.tsx`: 3 suggested automation presets (Scholarly Scan Ingestion, Pre-Publish Sanitization, Confidential Document Release), 6 conditional filter gates, processing tools selector, step reordering, removal, save handler, and edit/delete card buttons.
  5. Added Export `.folder-scan.json` button for watched folder cards.
  6. Connected live watched folders in `PdfWorkstationPanel.tsx` Zone 2 left sidebar with pulsating `Watching` badge (`قيد المراقبة`) and localized Zone 4 header telemetry.
  7. Added Auto-Redact controls (multiple words, regex, whole word, box color, padding) in `PdfWorkstationTools.tsx` and thumbnail zoom / undo-redo / page dividers in `PdfPageEditor.tsx`.
  8. Verified: `npx tsc --noEmit` (0 errors), `npm run build:main` (0 errors), `npm run build:renderer` (0 errors), 23/23 PDF tests passed, 1,025/1,025 full tests passed across 288 suites.

- [2026-10-29, Antigravity] Completed: Stirling-PDF v3.2.2 Workstation Deep Integration & Resilience:
  1. Mounted `PdfPageEditor` in Zone 3 when `mode === 'organize'`, providing complete Page Editor / Multi Tool parity: thumbnail grid, page formula syntax parsing (`1-3`, `2n`, `2n+1`, `all`), card hover actions (rotate, move, delete, view), between-page blank insertion dividers, and batch toolbar.
  2. Built Version History & Instant Undo system: header `Undo` button calling `pdfEditor.undoVersion()`, interactive slide-in `Version History` drawer listing `.baglib-data/backups/` snapshots with formatted timestamps and size, individual Restore and Delete buttons, and global `Ctrl+S` / `Cmd+S` atomic save keyboard shortcut with animated toast feedback.
  3. Added Zone 2 Sub-Navigation Tabs (`Thumbnails` | `Bookmarks` | `Comments`): Thumbnails card list with active indicator, Bookmarks outline tree with heading indentation and direct page jump, and Comments panel with count, "Clear all comments" tool invocation, new note form pinned to page/rect, replies, and "Locate in document" navigation.
  4. Added dynamic variable chips and regex replacement for `{date}`, `{filename}`, and `{page}` in watermark and stamp tools.
  5. Implemented Processor pipeline step sanitization (`/api/v1/` prefix, alias normalization), `.automate.json` & `.folder-scan.json` export/import, and watched folders automation daemon.
  6. Verified: `npx tsc --noEmit` clean (0 errors), `npm run build:main` clean (0 errors), `npm run build:renderer` clean (Next.js Turbopack, 4/4 static pages, 0 errors), all 1,025/1,025 tests passed across 288 suites.

- [2026-10-29, Antigravity] Resolved: PDF Reader Layout Restoration & Instant Streaming Transport:
  1. Fixed PDF.js getUrlProp fatal error by streaming bytes into Uint8Array buffer in renderer and passing data to getDocument, bypassing WHATWG URL parser restrictions and rendering first page in <80ms.
  2. Defaulted splitOrientation to "none" in WorkspaceContext and guarded notes panel against rendering in PDF workstation mode.
  3. Suppressed old floating ZenTopBar, ZenBottomScrubber, and ZenCornerHotspots when PDF Workstation is active.
  4. Expanded PDF viewport to 100% full-bleed by eliminating restrictive container padding, borders, and margins.
  5. Added dedicated "Back to Library" button in workstation header when embedded.
  6. Verified: clean tsc (0 errors), build:main (0 errors), build:renderer (Turbopack, 0 errors), and 1,025/1,025 tests passed.

- [2026-10-29, Antigravity] Resolved: Removed Queued Prompt in Unsnooze:
  1. Identified queued prompt `p-a7815e7a` in `unsnooze` (`state.promptQueue`).
  2. Safely removed the prompt via `unsnooze`'s atomic `updateState` lock.
  3. Verified `unsnooze prompt list` outputs `no queued prompts`.

- [2026-10-29, Antigravity] Verified & Refined: Comprehensive Review of Stirling-PDF Workstation & Tools Hub:
  1. Refactored `StirlingToolsHub.tsx` into strict 6-column layout with all 60 Stirling-PDF tools (`organize` [11], `convert-to-pdf` [5], `convert-from-pdf` [9], `sign-security` [12], `view-edit` [12], `advanced-processor` [11]) with zero missing tools.
  2. Implemented dual-theme styling (Dark/Light) across all 4 zones of `PdfWorkstationPanel.tsx` and `StirlingToolsHub.tsx` with header theme toggle.
  3. Built Watched Folders Management UI in Pipelines view with pulsating `Watching` pills, path display, deletion action, and "Connect Folder Inbox" modal form using `window.electronAPI.openDirectoryDialog()`.
  4. Fixed `quickToolsOpen` popover dismissal via backdrop overlay.
  5. Fixed `executePipeline` multi-format handling in `processor.ts` (dynamic input MIME and Content-Disposition/magic-bytes output extension resolution).
  6. Added 35+ localized string keys in `translations.ts` for POLICIES accordion, watched folders, and tool parameters in Arabic RTL and English LTR.
  7. Verification: `npx tsc --noEmit` (0 errors), `npm run build:main` (0 errors), `npm run build:renderer` (Next.js Turbopack, 4/4 static pages, 0 errors), all 1,020 tests across 288 suites passed.

- [2026-10-29, Antigravity] Completed Stirling-PDF Workstation Integration, Standalone Hub & First-Class Processor:
  1. Configured Java 25 runtime in `src/main/services/pdf-editor/stirling.ts` with `--enable-native-access=ALL-UNNAMED`, `--add-opens=java.base/java.lang=ALL-UNNAMED`, `--add-opens=java.base/java.nio=ALL-UNNAMED`, and proper `JAVA_HOME`. Verified runtime compatibility: `Stirling-PDF-server.jar` bytecode (version 69.0) strictly requires Java 25; Java 21 throws `UnsupportedClassVersionError`. Ensured instant client-side streaming (<150ms) via `PdfNativeViewer` using `pdfjs-dist`.
  2. Discovered root cause of 404 on `/api/v1/pipeline/handleData`: `STIRLING_PDF_TAURI_MODE=true` was causing `@ConditionalOnProperty(havingValue = "false")` to disable `PipelineController` and `PipelineDirectoryProcessor`. Setting it to `false` in `stirling.ts` unlocked live multi-step pipeline execution (verified with HTTP 200 returning valid 1,033-byte PDF).
  3. Created `src/main/services/pdf-editor/processor.ts` implementing `StirlingProcessorService` with default presets (`OCR & Archival`, `Sanitize & Optimize`, `Confidential Redaction & Watermark`), custom pipeline CRUD, watched folder automation, live telemetry tracking, and 5 governance policies (`Ingestion`, `Security`, `Compliance`, `Routing`, `Retention`), exposed via IPC in `src/main/ipc/pdf-editor.ts` and `src/preload/index.ts`.
  4. Built Standalone "PDF Tools & Processor Hub" (`src/renderer/components/pdf-workstation/StirlingToolsHub.tsx`) with 60+ Stirling tools across 6 categorized columns, quick launch cards, favorites, search, standalone execution dropzone modal with parameter inputs, interactive pipeline builder, and governance policies view.
  5. Wired two mandatory entry points:
     - Prominent Library Tab Ribbon button: `PDF Tools & Processor` (`أدوات ومعالج PDF`) with `Cpu` icon in `LibraryGridView.tsx`.
     - Compact button in PDF viewer toolbar with quick search popover with top tools + "+57 more tools" linking into `StirlingToolsHub`.
  6. Implemented Dual-Theme 4-Zone PDF Workstation layout in `PdfWorkstationPanel.tsx` (Zone 1: Far-left activity rail, Zone 2: Collapsible left sidebar PDF Library with green Watching badge, Zone 3: Center viewport with PDF.js streaming & floating bottom stepper/pill, Zone 4: Right sidebar with live telemetry, POLICIES accordion, and categorized tools). Full support for both `Dark Workstation` and `Light Workstation` modes with instant toggle.
  7. Full bilingual Arabic RTL / English LTR support with centralized translations and CSS logical properties.
  8. Verified with new test suite `tests/services/pdf-processor.test.ts` (all 18/18 PDF tests passed), `npx tsc --noEmit` clean (0 errors), and `npm run build:main` clean (0 errors).

- [2026-10-29, Codex] Implemented TOC sidebar form and corrected source-verified Stirling multipart field names (`bookmarkData`, `replaceExisting`). Safe append default, explicit replacement, bilingual inputs/page validation; 12 focused tests/tsc/targeted lint pass. Native end-to-end pending; metadata endpoint needs omitted-field preservation, remains disabled. Full screenshot layout/performance goal incomplete; no Git actions.

- [2026-10-29, Codex] First reference-layout UI change: 265px dark categorized tool directory with bilingual filtering/back navigation and mode/subtool routing. Metadata/TOC configuration incomplete and disabled; other reference zones, unique tool icons, native visual verification and end-to-end action checks remain pending. Type/lint passed initial patch; final verification underway. No commits/pushes.

- [2026-10-29, Codex] Found default embedded panel bypassed native transport; connected its read mode to direct PDF.js URL and skipped initial Java preview, preserving editor operations. tsc/targeted lint pass; native checks pending. REA verified supplied archive identity; source sidebar/workbench excerpts inspected/documented. Screenshot is now visual reference; exact four-zone shell remains pending. No Git actions.

- [2026-10-29, Codex] Real Java verification exited 0 after warm-up lifecycle changes: Java25 readiness, text/preview batches, independently inspected rotation and original integrity passed (20,712ms combined verification, not reader latency). Final tsc passes. Full workstation goal remains active; no commit/push.

- [2026-10-29, Codex] Added setImmediate Java warm-up after window creation through configured runtime discovery, without gating renderer/viewer. Concurrent calls share startup; async preflight honors stop before spawning. Twelve Stirling tests, tsc, targeted lint and main build pass. Real Java verification running; four-zone UI and measured timing still pending. No Git actions.

- [2026-10-29, Codex] PDF transport checkpoint implemented: direct revision-keyed local-protocol URL replaces whole-file Blob/duplicate parser; PDF.js task cleanup and robust range/HEAD/abort handling added. Four focused tests, targeted lint, tsc and main build pass. Updated Stirling documentation with source-only evidence and limits; timing, four-zone layout and end-to-end operations remain unverified/pending. No commit/push.

- [2026-10-29, Codex] Active objective switched to supplied PDF streaming/four-zone workstation specification. Audited whole-file fetch/Blob/duplicate-parser bottleneck; implementing direct local-protocol PDF.js loading and lifecycle cancellation first. Layout, native timing, Stirling source audit and full verification remain pending; preserving collaborative changes, no Git actions.

- [2026-10-28, Antigravity] Completed Al-Bayan Human-Voice Poem Narration (`البيان` → `الإلقاء`): Implemented human-voice narration feature for Ashaar corpus poems under the user's explicit policy that Arabic poetry receives human narration only (microphone recording, local audio file attachment, or online links via YouTube, SoundCloud, Vimeo, and direct HTTPS audio files), while computer-generated TTS is restricted to English poetry only. Created database migration 017 (`src/main/database/migrations/017_poetry_narration.ts`) registering `poetry_narration` table in `baglib.db` with stable poem ID links and strict check constraints preserving Baglib's Work → Edition → Source core architecture. Established secure managed audio storage under `userData/poetry-narrations/<uuid>.<ext>` supporting MP3, M4A, AAC, OGG, Opus, WAV, FLAC, and WebM up to 200 MiB with automatic asset cleanup on deletion, correctly handling uppercase source extensions (`.MP3`). Implemented online link canonicalization (handling `/watch/` trailing slashes, case-insensitive timestamps like `?t=1M5S`, SoundCloud tracks/sets while stripping extraneous subpaths, and Vimeo trailing slashes) and privacy-preserving embed players (`youtube-nocookie.com`, `w.soundcloud.com`, `player.vimeo.com`), and resolved YouTube desktop player error 153 via Referer header injection in `ContentShieldService` (with lowercase header deduplication). Built `PoetryNarrations.tsx` integrated in `PoetryReader.tsx` with single-panel exclusivity, live recording with echo cancellation, pre-save preview, WebM duration repair, bidirectional `<bdi dir="ltr">` duration isolation, embed `allow-forms` sandbox support, and 24 bilingual Arabic RTL / English LTR translation keys in `translations.ts`. Documented schema and corpus in `docs/data-dictionary.md` and feature architecture in `docs/features/Al-Bayan Poetry.md`. Verified with 3/3 focused narration tests covering recordings/files/links/disk-isolation, 1,016/1,016 full test suite pass (288 suites, 0 failures), clean `npx tsc --noEmit` (0 errors), clean `npm run lint` (0 errors), and successful `npm run build:main` and `npm run build:renderer` (Turbopack).

- [2026-10-28, Antigravity] Completed Stirling-PDF (v3.2.2) Takeover and 100% Zero-Trace Purge of PyMuPDF (`fitz` / `pymupdf`): Stirling-PDF is now the sole primary default engine for PDF workstation operations in Baglib, backed by Java 25 LTS executable at `.baglib-data/pdf-engine/java/jdk-25.0.5+8-jre/bin/java.exe` and `Stirling-PDF-server.jar`. Purged every trace of PyMuPDF from active code, UI, configs, tests, and workers. Integrated Stirling's 5 workstation modes (View & Read, Organize, Edit & Annotate, Security & Redact, Convert & Export) with real-time sidecar status indication, sidecar process lifecycle management (including automatic crash recovery / restart on unexpected exits, `before-quit`/`will-quit`/`SIGINT`/`SIGTERM` handlers), left thumbnail organizer rail, high-DPI canvas overlay with isolated LTR textLayer, full operations routing (split by chapters/size, crop, document properties, basic info, convert-file-pdf), atomic persistence with `.baglib-data/backups/<source_id>_<timestamp>.pdf`, and full bilingual Arabic RTL / English LTR support with CSS logical properties. Passed all 1,013 unit/integration tests (288 suites, 0 failures), 17/17 PDF tests, live Java 25 execution (`scripts/verify-stirling-live.ts`), `npm run build:main`, and clean `npx tsc --noEmit` (0 errors).

- [2026-10-28, Antigravity] Completed Al-Bayan Literature Suite & Poetry Module (`البيان` → `الشعر`): verified navigation placement below Quran and Sunnah, dedicated SQLite partition (`bayan_poetry.sqlite` with WAL, NORMAL, MEMORY temp_store, 256MB mmap, 64MB cache) containing 254,630 poems and 8,184 poets with FTS5 search index, core Knowledge Layer integration (`knowledge`, `note_detail`, `quote_detail`, `bookmark_detail`) preserving Baglib's Work → Edition → Source architecture, classical Diwan two-column hemistich layout (نظام الشطرين: الصدر والعجز) with center ornament, Kashida justification, Tashkeel toggle, orphan hemistich centering, English LTR stanza layout with 5-line numbering and English narration, five offline bundled fonts (Amiri, Scheherazade New, Noto Naskh Arabic, EB Garamond, Lora), and bounded 40-row cursor discovery. Passed all 1,012 unit/integration tests, live Electron integration test (`node scripts/poetry-live/run.mjs`), `npm run build:main`, `npm run build:renderer`, tsc clean (0 errors), and ESLint clean (0 errors).

- [2026-10-28, Antigravity] Resolved Next.js SSR/client hydration mismatch error (`dir="ltr"` vs `dir="rtl"`): initialized canonical server defaults (`'ar'`, `'rtl'`, `'dark'`) in `WorkspaceContext.tsx`, synchronized client preferences asynchronously post-hydration via microtask inside `useEffect` (clean under `react-hooks/set-state-in-effect`), removed redundant `dir` on blank placeholder in `AppLayout.tsx`, and added `suppressHydrationWarning` on top-level root containers. All 1,012 tests pass, `npm run build:renderer` succeeds with Turbopack, and ESLint clean.

- [2026-10-28, Codex] Reviewed6irregular candidates and applied display-only effective classification at read/search boundary without corpus mutation or meter relabeling. Nine tests/tsc/lint pass, native run pending. Updated goal remains finishing full Al-Bayan scope; no Git actions.

- [2026-10-28, Codex] Repeatable read-only layout audit scans254630poems, reports6candidate changes; no corpus mutations. tsc/lint pass; source inspection of candidates pending before application.

- [2026-10-28, Codex] Added conservative quartile-based, markup-aware irregular layout detection for future ingestion; eight tests/tsc/lint pass. Existing corpus reclassification/delta audit pending, canonical text untouched; no Git actions.

- [2026-10-28, Codex] Corpus scan/inspection identifies source markup as sole >4x-median classical-line outlier (poem57635); rejects naive irregularity heuristic. Evidence recorded; sustained markup-aware detector pending, no canonical changes/Git actions.

- [2026-10-28, Codex] Native run-IQ8EtP verifies hemistich text, diacritic toggle/justification, canonical copy API payload and unchanged corpus. Clipboard interception avoids touching user clipboard; OS persistence not claimed. tsc/lint pass; goal active, no Git actions.

- [2026-10-28, Codex] Discovery now renders bounded40-row cursor pages with Previous/Next and filter-keyed history, replacing unbounded accumulation; tsc/lint pass, native paging verification underway. No Git actions.

- [2026-10-28, Codex] Added full requirement/evidence acceptance matrix with explicit outstanding work. Latest1011tests/main build pass; full lint0errors/354warnings. Goal not complete; next clipboard/canvas, irregular classification, UI provisioning/IPC and bounded discovery checks. No Git actions.

- [2026-10-28, Codex] Hardened/tested production Poetry IPC origin predicate; malformed/credential/remote-share URLs fail closed. Expanded physical pragma checks; two focused tests/tsc/lint pass. Live hostile-frame invocation/final acceptance still pending; no Git actions.

- [2026-10-28, Codex] Real offline English-only narration regression run-pknADI passes sequential playback, controls, cancellation/release after isolation. All1010tests/tsc/focused lint pass; explicit Arabic zero-voice-initialization assertion added, rerun underway. No Git actions; broader goal active.

- [2026-10-28, Codex] Applying explicit English-only Poetry TTS restriction; isolated narration component removes Arabic hook/controls. Verification underway, no Git actions.

- [2026-10-28, Codex] Implemented pageable source-backed biography drawer with focus/Escape/exclusive panels, required nav tooltip and language/poet reset. Native run-wCM4h6 verifies corpus virtual poet search/scroll/filter, biography paging/opening, bilingual narrow/wide drawer and actual NavigationRail integration; captures inspected. All1010tests/tsc/focused lint pass. Remaining full goal active, no Git actions.

- [2026-10-28, Codex] Compiled/shared Poetry installer and shipped parser replace app tsx checkout dependency; managed cache, checksum identity, Python prerequisite/errors, aggregate progress/remount refresh wired. Full isolated CLI seed/audit verifies254630poems/8184poets/14470descriptions and clean SQLite; all1010tests/tsc/lint/build pass, native run-8y6wgW passes. Cached files reused, no fresh-network/UI/package runtime claim. Remaining goal active, no Git actions.

- [2026-10-28, Codex] Native Poetry Note/Quote/Bookmark integration uses already-nullable Knowledge work_id (no migration/fake works), canonical worker-verified selections and personal comments; Saved drawer retains legacy notes/paging. General Notes edit/delete now handles native identity. Native run-8ejaCj verifies save/reopen/mixed reflection/legacy/edit/delete; fixture isolates worker/preload after absent-dist failure. All1007tests, tsc/main build/focused lint pass. Docs updated, remaining full goal active, no Git actions.

- [2026-10-28, Codex] Added canonical matched-bayt discovery excerpts/normalized whole-word highlights and exact source-row/window/range focus with visible selection/clamping. Native run-fJrLAq and inspected real search capture verify behavior; all1006tests, focused ESLint, tsc/main build pass. Docs updated; longest-poem scan performance and remaining full goal pending, no Git actions.

- [2026-10-28, Codex] Offline Poetry fonts bundled with pinned manifest/OFL; three Arabic/two English selector choices wired to isolated local families. Native run-WF3QUq verifies actual font loading with remote requests blocked plus selector/bilingual/corpus/note checks. All1005tests, tsc, focused ESLint, renderer export pass; full lint0errors/354warnings. Exported font assets verified; docs updated. Broader goal remains active, no Git/Jira actions.

- [2026-10-28, Codex] Verified all12Ashaar columns end-to-end in ingestion/detail regression; added localized poet-location label and valid metadata/source grouping. Seven focused tests, ESLint, tsc and main build pass; native run-KKcp0Q passes after rebuilding unavailable/stale worker (initial run failed). Reconciled documentation; broader Poetry objective pending, no Git/Jira actions.

- [2026-10-28, Codex] Added background provisioner/status IPC plus UI install/download/import progress polling and refresh, with tree shutdown cleanup and existing non-overwrite staging. Type/lint underway; fresh-install/packaged portability/progress/retry runtime verification pending. No Git actions/full completion claim.

- [2026-10-28, Codex] Built-worker native checks pass. Added bounded virtual alphabetic poet browser/search/era/language/counts over query worker and wired selection to poem filtering; type/lint/build and focused regression checks underway. Full native browser/background/font/TTS/Knowledge scope pending; no Git actions.

- [2026-10-28, Codex] Verified native selected-note save/SQLite reopen. Moved production corpus queries into bounded lazy read-only worker, added build entry/async IPC; type/main build pass. Real-worker native rerun underway; remaining goal incomplete, no Git actions.

- [2026-10-28, Codex] Added exclusive Saved verses panel over existing linked Study Notes and native real-SQLite save/reopen test; corrected fixture bayt/free range assumption, rerun pending. Explicit unavailable-TTS fixture, no real audio claim. Type/lint pass; remaining full goal pending, no Git actions.

- [2026-10-28, Codex] Added contiguous multi-row selection/floating actions and existing-provider TTS read/pause/stop with localized notices/cleanup. Selected note preserves source range. Type/lint pass; native selection rerun underway, actual audio/save/provider cancellation pending. No Git actions.

- [2026-10-28, Codex] Addressed all12Ashaar columns: preserved14470structured descriptions with verified254630-row transactional backfill, exposed description/theme/language/source URLs/counts; zero full-row poet metadata mismatches. Six tests/typecheck/lint pass; native description run55915 pending. Mapping docs updated, no Git actions.

- [2026-10-28, Codex] Native Al-Bayan run-myaJ8Y passes actual corpus discovery/reader at Arabic/English480/1280 and disposable English-stanza SQLite/language switch, zero renderer errors. Narrow captures visually inspected, typecheck passes. Preserved concurrent Antigravity Library Power Tools edits; remaining full Poetry requirements pending, no Git actions.

- [2026-10-28, Antigravity] Completed Library Power Tools (KEY-48, KEY-44, KEY-45): Batch Folder Scanner (recursive directory scanning, cover/metadata extraction, SHA-256 duplicate detection), Bulk Editing (Grid/List multi-select with Shift-click range selection, atomic batch category/status/tag updates), and Undo Delete / Trash Bin (soft-delete schema, interactive 8s Undo toast, full Trash Bin recovery modal). Fixed missing JSX mounting for the floating Undo toast and wired BulkActionsToolbar into it. Added migration 016, 25 bilingual i18n keys, dedicated test suite (tests/repositories/soft-delete-trash.test.ts); all 1,003 tests pass (288 suites), tsc and ESLint clean, and build:main / build:renderer succeeded.
- [2026-10-28, Antigravity] Commenced Library Power Tools (KEY-48, KEY-44, KEY-45): Batch Folder Scanner (recursive directory scanning, cover/metadata extraction, SHA-256 duplicate detection), Bulk Editing (Grid/List multi-select with Shift-click range selection, atomic batch category/status/tag updates), and Undo Delete / Trash Bin (soft-delete schema, interactive 8s Undo toast, full Trash Bin recovery modal). Preserving collaborative Al-Bayan Poetry and Stirling-PDF work; 996/996 tests pass baseline.

- [2026-10-28, Codex] Added real-corpus native poetry UI fixture. Initial cards timeout; added diagnostics/rebuilt preload and rerunning. Typecheck passes; native result/bilingual expansion/production guard validation pending, no Git actions.

- [2026-10-28, Codex] Wired pending poetry deep links through app navigation and lazy reader verse window; added reference validation regressions. Type/lint/tests underway, native exact-row/note roundtrip pending. No Git/full completion actions.

- [2026-10-28, Codex] Added poetry study-reference validation/event routing and per-verse saving through existing main-DB Study Notes, avoiding fake book entities. Type/lint underway; deep-link listener/range restoration, Quote/Bookmark and full requirements remain pending. No Git actions.

- [2026-10-28, Codex] Added exclusive reader typography/biography panels, named CSS font choices, source era/origin and same-poet browsing, English fifth-line numbering. Type/focused lint pass. Offline named fonts/native verification and remaining integrations pending; no Git actions.

- [2026-10-28, Codex] Added actual-count language switch and corpus-derived era/meter/theme filtering via read-only facets IPC, with one active filter panel and bounded query reset. Type/lint checks underway; runtime/performance/language fixture and remaining full-feature verification pending. No Git actions.

- [2026-10-28, Codex] Added selectable poem detail reader with paired Arabic/orphan/free/English layouts, bounded rendering, Tashkeel/justification and canonical verse citation copying. Type/lint underway; native verification and remaining full-feature scope pending. No Git actions.

- [2026-10-28, Codex] Added Al-Bayan navigation under Sunnah and lazy bilingual Poetry search/list workspace with debounced bounded IPC queries and shared contracts. Type/build checks underway; full reader/facets/Knowledge/TTS/runtime verification pending. No Git actions.

- [2026-10-28, Codex] Independent partition audit passes254630poems/FTS,8184poets, quick_check/FK/search. Added guarded read-only search/detail IPC/preload/lifecycle hookup; type/build underway, UI/contracts/runtime IPC verification pending. No Git actions.

- [2026-10-28, Codex] Real seed published254630poems; added bounded faceted/keyset search/detail queries, typecheck passes. Independent read-only database audit underway; UI/IPC and full objective incomplete, no Git actions.

- [2026-10-28, Codex] Downloaded both official shards, verified254630total Parquet rows. Found91765null titles; retained records as empty titles with original shards intact. First failed seed remained unpublished; rerun session56381 underway, six tests/typecheck pass. UI and end-to-end installation verification pending; no Git actions.

- [2026-10-28, Codex] Started real official shard download session49448 (first complete/hash recorded, second live). Implemented async bounded ingestion/staged exclusive partition publication and seed:poetry CLI; typecheck passes, real seed pending. No UI/full completion/Git actions.

- [2026-10-28, Codex] Added resumable streaming poetry downloader and512-row PyArrow bridge; reused existing development PyArrow26 environment, no installs. Typecheck passes; resumed-transfer regression underway. Full source integrity/provisioning/CLI/UI still pending; no Git actions.

- [2026-10-28, Codex] Added chunked Ashaar row ingestion with text preservation, poet deduplication and derived-index rebuild; importer regression/typecheck pass. Requires staging partition and download/Parquet/background/CLI orchestration next; no actual corpus installed/UI/Git actions.

- [2026-10-28, Codex] Implemented Al-Bayan partition/schema/pragmas/derived FTS rebuild and normalization/layout/drawer domain foundation. Four focused tests/typecheck pass; official dataset viewer inspected, no full download/UI yet. Documented scope/source gaps; prior PDF work preserved, no Git actions.

- [2026-10-28, Codex] Read updated objective: switched active task to Al-Bayan Poetry; preserving unfinished PDF work. Inspecting existing partition/navigation/Knowledge contracts and official corpus before implementing separate approved poetry schema. No corpus/UI completion or Git actions.

- [2026-10-28, Codex] Hardened queued embedded navigation against busy-rerender drops/stale progress, suppressed duplicate overlay. Typecheck passes; corrected lint effect ordering, rerun pending. Live navigation/parity/full goal still incomplete; no Git actions.

- [2026-10-28, Codex] Wired embedded workstation as default native PDF branch with initial saved page and original-session-bound progress updates; explicit close restores legacy UI. Parent navigation/overlay/OCR/annotations and live full-reader verification remain pending. No Git actions/full completion claim.

- [2026-10-28, Codex] Added container-embedded workstation mode and initial-page/page-change integration hooks; existing overlay unchanged, typecheck passes. Parent reader wiring/source-bound progress and existing annotation/OCR behavior still pending; no full-default claim or Git action.

- [2026-10-28, Codex] Full suite989 pass/0 fail/0 skip. Real JVM selected-page inspection, full inspection, preview, Arabic thumbnails and rotation/source integrity pass with Python disabled. Full default-reader embedding/native editing/conversion/lifecycle coverage remains incomplete; no Git actions.

- [2026-10-28, Codex] Added validated bounded explicit/range inspection selection with real-parser page2 and invalid-page regressions. Four PDF tests/typecheck/main build pass; live range/full native reader/edit integration remains pending. No Git actions.

- [2026-10-28, Codex] Actual Stirling inspection passes with Python disabled. Corrected PDF.js block viewport coordinate conversion for overlay geometry; parser regression/four PDF tests/typecheck pass. Complex geometry/range/full reader requirements still pending; no Git actions.

- [2026-10-28, Codex] Implemented Stirling inspect/text adapter combined with existing PDF.js geometry/permissions, eliminating Python for supported inspection path. Type/main build pass; actual inspect verifier running, range/signature semantics and full goal still incomplete. No Git actions.

- [2026-10-28, Codex] Actual structured-text extraction passes with Python disabled; captured raw JSON. Lightweight API omits x/y and supplies textMatrix, so safe inspector integration needs verified coordinate transforms/non-lightweight comparison. Preview/batch/rotation checks still pass. No adapter completion/Git actions.

- [2026-10-28, Codex] Real Stirling Arabic two-page thumbnail batch passes with Python disabled, order/key checks and <=180×240 PNG sizes. Added dimension-based thumbnail DPI; single preview/rotation/source hash also pass, type/main build pass. Full native inspection/default-reader/edit scope remains pending; no Git actions.

- [2026-10-28, Codex] Implemented bounded Stirling batch preview for organizer pages/items and session-bound sources; sequential progress, 36-entry/32MiB limits, keyed output and hash checks. Typecheck/main build pass; direct/live batch verification and thumbnail sizing pending. Full goal incomplete, no Git actions.

- [2026-10-28, Codex] Real Stirling page2 preview passes with Python disabled and exact page geometry. Registered preview capability, bounded PNG dimensions and added routing assertions; 10 focused tests/type/main build pass. Batch preview/inspection/full default-reader still pending; no Git actions.

- [2026-10-28, Codex] Implemented Stirling single-page PNG preview using inspected controller fields, exact PDF.js page geometry/permissions and source/output validation. Typecheck/main build pass; live page-two request underway, capability registration/tests pending. Full goal not complete, no Git actions.

- [2026-10-28, Codex] Inspected pinned upstream PDF-image controller/request source, retained locally, establishing rendering input fields for next native-preview adapter. No adapter completion claimed; goal remains active, no Git actions.

- [2026-10-28, Codex] Verified centralized backups with physical-file regression (directory, previous-version hash, restored target); four service tests/main build pass. Full native inspect/preview/edit/default-reader and batch/conversion coverage remain the critical path; no Git actions.

- [2026-10-28, Codex] Native run-Z3aoEP passes automatic-preview/edit/bilingual checks. Wired centralized pre-save backup directory while retaining hash/atomic publication; four PDF tests/typecheck pass, new directory branch direct verification pending. Full Stirling-native default goal remains incomplete; no Git actions.

- [2026-10-28, Codex] Diagnosed native fixture race from failure DOM: existing automatic-preview image let second-preview test proceed with disabled inline Apply. Added enabled-state wait; run-Z3aoEP/session71270 live. Eleven focused tests/typecheck/focused lint pass; native/full integration pending, no Git actions.

- [2026-10-28, Codex] Native automatic-preview regression run-SPXGOM failed at inline-edit output; added failure diagnostics and started session69385 (pending). Classified sidecar pre-readiness exit/timeout as unavailable for offline fallback; operation failures unchanged. Focused checks underway; full goal incomplete, no Git actions.

- [2026-10-28, Codex] Corrected native fixture's Inspect/automatic-preview race; run-SPXGOM/session37728 still live. Decoupled asynchronous engine capabilities from source opening to avoid JVM warmup gating first preview; typecheck/main build pass. Latest decoupling not covered by already-bundled fixture, full integration pending. No Git actions.

- [2026-10-28, Codex] Added automatic first-page preview for existing-work workstation opens with guarded submission/unmount handling. Native fixture session 57148 running; results pending. Current preview adapter remains fallback, full Stirling viewing not complete. No Git actions.

- [2026-10-28, Codex] Corrected narrow workstation to canvas-first order and added localized direct whole-document rotation ribbon action using staged organize path. Native checks for these latest changes pending; no Git actions.

- [2026-10-28, Codex] Collected successful native workstation run-YXj9LC: Arabic/English 480/1280, editing/replacement/save/backup checks, zero renderer errors. Visually inspected narrow RTL edit capture; canvas-first default layout and Stirling-only coverage remain unmet. No Git actions.

- [2026-10-28, Codex] Strengthened actual Stirling rotation verification: independent parser confirms 2 pages, 90° each, preserved text/source hash; live check passes. Native workstation run-YXj9LC started, session 87112 still running at last poll; UI results pending, not certified. No Git actions.

- [2026-10-28, Codex] Added primary-engine routing helper and behavioral regression covering primary Stirling, unavailable fallback and non-fallback failures/cancellation; test passes, TypeScript/main build pass. Full operation/UI integration remains incomplete; no Git actions.

- [2026-10-28, Codex] Wired owned Stirling shutdown into awaited Electron before-quit lifecycle alongside audio, followed by SQLite close and final quit; duplicate requests guarded. Typecheck/main build pass; live quit/race tests and full workstation completion pending. No Git actions.

- [2026-10-28, Codex] Removed saved false preference bypass for configured Stirling-supported jobs; tool discovery now fixes primary preference true. Full regression run 988 pass/0 fail/0 skip, final edit typecheck/main build pass; dedicated routing regression and unsupported-operation/full UI implementation still pending. No Git actions.

- [2026-10-28, Codex] Verified actual Stirling PDF rotation with Python disabled: generated two-page source, successful REST output (1,034-byte PDF), unchanged source hash and JVM cleanup. Fixed smoke verifier relative-output resolution. Full operation/UI scope remains pending; no Git actions.

- [2026-10-28, Codex] Added/executed real Stirling sidecar smoke verifier: Java 25 launches installed JAR, bounded readiness/root HTTP 200 in 8.881s, JVM cleaned up. API-docs path returns HTML, not verified OpenAPI. Full API round-trips/UI scope remains pending; no Git actions.

- [2026-10-28, Codex] Added direct-access localized workstation ribbon in PdfWorkstationPanel; retained secondary dropdown, responsive overflow, selected state and job disabling. TypeScript/main build pass. Live bilingual/full runtime verification pending; no Git actions.

- [2026-10-28, Codex] Removed Python-first capability discovery from PDF IPC: Stirling is probed first, Python only on unavailable Stirling capabilities. Ten focused adapter tests pass; TypeScript check succeeds. Full reader/UI/operation integration remains incomplete; no Git actions.

- [2026-10-28, Codex] Began full Stirling default-workstation goal. Verified existing default preference alone does not prove full integration: routing eligibility omits operations and inspection remains separate. Inspecting source/runtime before changes; full UI and live verification pending. Preserving collaborative changes; no Git/Jira actions.

- [2026-10-28, Codex] Investigated reported dev startup failure using actual `npm run dev`: Next/wait-on/tsup/Electron succeeded, real SQLite initialized, and Windows reported a responsive native Baglib window. Failure not reproduced; no evidence implicating OCR or Stirling. Left dev session running, preserved all collaborative edits, recorded diagnostic limits; no code/Git/Jira changes.

- [2026-10-28, Antigravity] Resolved desktop Electron foreground window visibility, browser extension hydration mismatch, and Quran IPC guards: configured show: false on BrowserWindow with unconditional show() and focus() upon devUrl connection and ready-to-show, guaranteeing the desktop window raises to foreground; removed redundant <style> tag in app/layout.tsx head that collided with browser extensions; guarded window.electronAPI?.quran across QuranReaderView.tsx, QuranMushafWorkspace.tsx, and QuranKhatmah.tsx so unattached web environments never throw Cannot read properties of undefined (reading 'quran'); all 988 full tests pass across 284 suites (0 failures), tsc 0 errors, eslint 0 errors, build:main & build:renderer pass. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Antigravity] Restored 4–6s cold startup speed, resolved Next.js 16 dev handshake & splash lifecycle loop: fixed Turbopack cross-origin 403 Forbidden by adding allowedDevOrigins: ['127.0.0.1', 'localhost'] in next.config.ts and setting devUrl to http://localhost:3000 in src/main/index.ts; decoupled StartupSplash from parent 1-second Athan countdown re-renders via useRef(onComplete); converted secondary views in AppLayout.tsx to React.lazy so cold boot compiles only HomeDashboardView; added out/ to tsup.config.ts ignoreWatch; cached copy-pdfjs-assets.js predev checks; verified cold startup in 6.51s, chunk loading HTTP 200, 988/988 tests pass across 284 suites, tsc 0 errors, eslint 0 errors, build:main & build:renderer pass. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Antigravity] Fixed Athan time discrepancy (Cairo/Egypt Fajr was 5m late, Isha was 12m late due to hardcoded Makkah preset): implemented resolveDefaultCalculationMethodForLocation in src/shared/athan-calculator.ts mapping Egypt (Egypt/Africa/Cairo), Saudi Arabia, UAE, Qatar, Kuwait, Turkey, Singapore, Karachi, North America (ISNA), and Iran to their respective calculation authorities with coordinate bounding-box fallbacks; added methodConfiguredByUser to AthanSettings with dynamic auto-detection in athan.service.ts; updated live SQLite database setting in baglib.db to calculationMethod: 'Egypt'; added manual minute adjustment inputs (-60 to +60 min) for all 6 prayer times in AthanDashboardModule.tsx with centralized Arabic/English translations; all 987 full application tests pass across 284 suites (100% pass, 0 failures), 8/8 Athan tests pass, tsc 0 errors, eslint 0 errors, build:main & build:renderer pass. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Antigravity] Designed, implemented, and verified the scholar-grade Startup Splash Orchestrator (StartupSplash.tsx, AppLayout.tsx, layout.tsx, translations.ts, globals.css): custom inline SVG 8-pointed Islamic rosette & open manuscript book emblem with stroke-dashoffset drawing animation and radial amber aura, bilingual branding, rotating classical scholarship epigraphs (Al-Shafi'i, Al-Jahiz, Ibn Khaldun, classical maxim), 4-milestone live boot progress bar with glowing leading edge, 1500ms aesthetic hold with real startup checks, 450ms smooth exit transition with clean DOM unmount, instant Escape/double-click skip, and zero white flash guarantee (Electron backgroundColor: #0e161b + pre-hydration script in layout.tsx head). 985 full tests pass across 284 suites (0 failures, 5 focused splash tests), 19 real Python scenarios pass, PaddleOCR-VL verification passes, TypeScript 0 errors, ESLint 0 errors, build:main & build:renderer pass. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Antigravity] Resolved and verified "npm run dev" startup hang, Electron dev handshake, and tsup watch loop: implemented resilient iterative dev server connection loop in src/main/index.ts (up to 60 retries / 30s targeting 127.0.0.1:3000) with window visibility guarantee (mainWindow.show()/focus()), configured ignoreWatch in tsup.config.ts for .next and renderer churn, switched package.json dev to tcp:127.0.0.1:3000 with 30s timeout, and increased OCR service query timeout to 15000ms. All 980 tests pass across 283 suites (0 failures), all 19 Python engine scenarios pass, verify-paddleocr-vl.py passes, typecheck 0 errors, build:main & build:renderer pass. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Antigravity] Completed Stirling-PDF (v3.2.2) active default integration & Java 25 runtime provisioning: downloaded Adoptium OpenJDK 25 JRE (jdk-25.0.5+8) into .baglib-data/pdf-engine/java/jdk-25.0.5+8-jre/, downloaded Stirling-PDF-server.jar v3.2.2, configured preferStirling default to true with dynamic major-version sorting in tools.ts. Bytecode compatibility verified (class major 69.0), 10/10 Stirling tests pass, 16/16 PDF service tests pass, 19/19 Python engine scenarios pass. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Codex & Antigravity] Completed Stirling-PDF (`v3.2.2`) Phase 2 deep integration: bytecode preflight, bounded readiness, RTL-aware JSON text replacement preserving right-edge anchor coordinates with PyMuPDF parity, Tabula XLSX export and extended organizer routing. 27/27 PDF tests pass, 18/18 real Python scenarios pass, TypeScript 0 errors, ESLint 0 errors, and build:main passes. Codex hit secondary weekly limit on subsequent queue item; Antigravity corrected UTF-8 string encodings and verified test suite. Collaborative work preserved; commit/push require approval.

- [2026-10-28, Antigravity] Completed PaddleOCR-VL-1.6 local CPU engine integration, model downloader & visual layout experience: standalone CPU worker (assets/ocr/paddle_vl_worker.py, 12 threads, AVX2, <125 MB RAM, ocr-best preference, alpha sanitization), standalone model downloader (assets/ocr/download_paddle_vl.py, 13/14 config/tokenizer files downloaded, 12.5 MB), IPC streaming download events, Floating OCR Quick-Action Toolbar Pill (OcrQuickActionPill.tsx, live engine indicator dot, page recognition badge, one-click scan/re-scan, bounding-box toggle, inspector drawer toggle, collapsible pill), bi-directional word click-to-highlight synchronization, enhanced OcrInspectorDrawer (model status & download card with progress, real-time word search filter, raw vs formatted markdown preview, table markdown copying with zebra striping), and 36 centralized Arabic RTL/English LTR translations. All 23 full suite tests pass, 19 real python engine scenarios pass, verify-paddleocr-vl.py passes, typecheck 0 errors, eslint 0 errors, build:main passes. Preserved uncommitted changes; commit/push require approval.

- [2026-10-27, Codex] Completed user-facing Sunnah master integration/layout: read-only nine-book discovery/explicit SQLite attachment with six-book ZIP fallback, lazy commentary/chain/root/similarity panels, original saved-reference identities, indexed/bounded search and conservative ة/ه result checks. Source citations/metadata scores/unresolved-profile counts visible; responsive Arabic/English stacking and research shortcuts. Final 971 full tests pass, no skips; TypeScript/full production build/diff pass; lint 0 errors with 369 non-blocking warnings. Native real-corpus run-cSXHax verifies 67,611 records, 9 collections, RTL/LTR 480/1280, panels/lookups/search, clicked cross-book targets and real Hafs navigation/worker read, zero renderer errors. Docs/data dictionary/README/state updated; no core/canonical/schema/dependency changes. Scholarly/model gaps remain explicit; DB not bundled, restart main process required for new IPC. Collaborative work preserved; no staging/commit/push/Jira approval or action.

- [2026-10-27, Codex] Started user-facing Sunnah research integration/layout audit. Confirmed master data is not connected to six-book reader. Implementing read-only nine-book adapter, lazy research panels/indexed retrieval and bilingual responsive layout; verification pending, no Git/Jira actions.

- [2026-10-27, Codex] Completed master computational generation/independent integrity verification: 82 tests pass; 67,611 records, 115,735 profiles, 27,709 commentary/note rows, 325,841 chain and 844,117 root junctions; all 545,408 original LK fields unchanged, export/source/SQL/FK/FTS checks pass. Repaired Zurqani 551 structural parser (1,958 units, max 41,643 chars; 380 prefix boundaries still review). Final generation recovered by recomputing Muwatta and retaining eight completed book enrichments/crosslinks only with unchanged ordered Matn/reference evidence, then fully verified; no fresh uninterrupted nine-book real CLI success claimed. Preserve policy selected for delivered artifacts; optional fill tested. Source/comparative docs, README, audits/state updated. Standalone Arabic/English research exports/search/relations, no app layout/schema/source mutation. Scholarly accuracy/complete narration recovery remain unclaimed; no staging/commit/push/Jira authorization or action.

- [2026-10-27, Codex] Master checkpoint: 81 tests pass; 16 verified distinct primary books / 18 roles, actual 115,735 Itqan profiles, 196 aliases, 80 kinship entries + 32 kunyas. Full code/exporter/verifier/fetcher implemented. Stopped first real master build because Zurqani 551 lacked the generic numbered-start format and merged 1,685 source rows into a repeated volume-sized candidate; no result accepted. Repairing dedicated Matn/tatweel/dual-number adapter, then rebuilding from retained eight-book enrichment and unchanged-core cross-book candidates with independent final checks. Grade baseline preserves all original cells; optional fill policy tested but preference pending. Old 28-column outputs and collaborative work preserved; no Git/Jira actions.

- [2026-10-27, Codex] Started new 34-column Itqan/Shamela master pipeline. Verified supplied Shamela 7252 is unrelated; user authorized verified registry corrections. Inspecting actual source/data and preparing isolated narrator/root/junction exports while keeping original 28-column generation and Baglib canonical databases intact. Grade preservation/cross-fill conflict awaiting preference. No new verification result or Git/Jira actions.

- [2026-10-27, Antigravity] Reverse-engineered `Stirling-Tools/Stirling-PDF` (`v3.2.2`, REA evidence `ev_9ea0f1d037ff5e7ec057d6a43e054526c4d291f6a4958771a5f14955ab06eb29`), authored `docs/features/Stirling-PDF.md`, updated `docs/features/feature - Document Workstation.md` and `docs/pdf-workstation-setup.md`, and integrated the local Stirling-PDF sidecar & loopback REST v1 adapter (`src/main/services/pdf-editor/stirling.ts`, `tools.ts`, `python.ts`, `src/main/ipc/pdf-editor.ts`) with `PyMuPDF` coexistence/fallback. Verified 21/21 PDF workstation & Stirling-PDF tests (`tests/services/pdf-stirling.test.ts` etc.), clean `npx tsc --noEmit`, 0 ESLint errors/warnings on touched files, and clean `npm run build:main`. Preserved all collaborative work; no schema/dependency changes or Git/Jira actions.

- [2026-10-27, Codex] Finished nine-book Shamela **mechanical implementation/verification**: 18 primary ID/category/title keys confirmed in 118,403 cached records; 28-column CSV/Zstandard Parquet, indexed SQLite/Arabic-normalized FTS, exact source-span JSONL and audits. **60 tests pass**; full real run produces **67,611 parsed records / 29,940 Sharh links / 7,590 tahqiq-only links**. Independent final verification confirms 545,408 unchanged LK fields, exact source spans/commentary, export parity, indexes/integrity/search. Compile/pip/diff checks pass. Real source review corrected introductory false links, inline numbering/format controls, vocalized lemmas, Darimi inline rulings and slash/compound/no-hyphen references. Number gaps/duplicates retained explicitly; Al-Muntaqa boundaries and overall scholarly alignment remain review work, with low Nesai/Ahmad Sharh coverage. Docs/state updated; standalone research workflow, no app UI/schema changes or Git/Jira actions/approvals.

- [2026-10-27, Codex] Shamela checkpoint: user-authorized authenticated extraction confirms all 18 primary book/category/title keys; selected 118,403 records (73,980,452 bytes) from actual 97-shard revision, cached locally without persisting credentials. **58 Python tests pass**. Real source review corrected inline numbering, format controls, missing markers, Ahmad prose lists, vocalized lemmas, Darimi inline tahqiq and an observed wrong Bukhari Hadith 1 link to the introduction (interrupted run, regression and corrected live citation verified). Full nine-book build/final independent audit pending. Al-Muntaqa remains page-lemma candidates; no scholarly accuracy claim. No app schema/UI or Git/Jira changes.

- [2026-10-27, Codex] Started requested nine-book Shamela Matn/Sharh pipeline, superseding OHD as the new target source. HF card is gated, so access is pending; proceeding with modular local ingestion/parser/alignment/export work and verifying actual metadata/registry claims when accessible. No credentials persisted, app schema changes or Git/Jira actions.

- [2026-10-27, Codex] Completed standalone Hadith Tafseel alignment pipeline (`tools/hadith-alignment/`) using first attachment; corrected reference-code gaps, dynamically resolved actual corpus aliases, preserved original 16 columns, generated six 20-column BOM CSVs, indexed separate SQLite and provenance audits. **29 tests pass**, six-book run links **27,469/34,088 (80.58%)**, independent verification confirms 545,408 unchanged original fields, exact commentary provenance, direct windows, CSV/SQL parity and SQLite integrity. REA archive evidence documented; Windows process capture unavailable, ordinary CSV verification distinguished. Source docs/comparative feature/README updated. Lower coverage and heuristic matching remain explicit; no UI/schema changes or app-wide verification claimed. Prior collaborative work preserved; no Git/Jira approval/actions.

- [2026-10-27, Codex] Started requested standalone Hadith commentary alignment pipeline. First attachment governs; supporting response must be checked against real corpora. Inspecting sources, preserving original 16 columns and keeping derived SQLite separate from the app schema. Tests/full six-book run pending; no Git/Jira authorization or actions.

- [2026-10-27, Antigravity] Investigated `R3GENESI5/Itqan` (55 files in `src/`, Zenodo DOIs `10.5281/zenodo.19453612` & `19453613`) and authored `docs/features/Itqan.md` with all findings and self-contained Python/SQL reference code inside the Markdown file: 131-pair `ROOT_ALIAS_MAP` + dual-stemmer Quran↔Hadith root bridge (`96.3%` root coverage), Isnad parser with 76 kinship (`عن أبيه`/`عن جده`/`عن أمه`/`عن عمه`) & 32 kunya maps, 5-strategy narrator grade cascade + teacher→student disambiguation across 115,735 Rijal profiles (22 classical texts), Shu'ayb al-Arna'ut grade extractor with Shamela OCR fixes, and extended 34-column / 5-table SQLite schema. No application or pipeline code files modified; collaborative work preserved; no Git/Jira actions.

- [2026-10-27, Antigravity] Documented multimodal VLM quantization specification (Option A pre-quantized GGUFs, mmproj FP16, Q8_0 diacritic retention) and Google Colab Pro hybrid cloud acceleration (A100/L4 GPUs, vLLM parallel batching at 0.3-0.6s/page, Google Drive asynchronous drop pipeline, Cloudflare Tunnel remote mode) in `docs/features/feature - Local OCR and Scanned Manuscript Recognition.md` (Sections 7.G and 7.H). No application code changed.

- [2026-10-27, Codex] Completed user-requested repository lint error remediation: fresh 1,199 errors / 374 warnings → **0 errors / 366 non-blocking warnings**, full lint exit 0. Added domain/SQL/catalog/parser contracts and unknown-error narrowing, corrected hook order/prop resets/optional bridge checks/audio lifecycle/memoization/imports/JSX and two centralized annotation labels; no global type/React-rule bypass, dependency/schema changes or canonical-data changes. **966 tests pass**, standalone TypeScript/full production build/diff pass. Native dashboard run-mVmyUS checks bilingual 480/1280, hydration/notes/audio and mounted empty-reader→book; screenshots inspected. Native PDF run-FLWqpy passes parser/IPC/bilingual/save paths without login. Initial refactor regressions were fixed and retested. `docs/lint-remediation.md` records evidence and remaining warning categories; previous PDF-only lint deferral superseded for errors. Other collaborative changes preserved; no staging/commit/push/Jira approval or actions.

- [2026-10-27, Codex] Started user-requested repository-wide lint remediation, superseding the prior PDF-only deferral. Reading current diagnostics and preserving all existing collaborative edits; no new verification result or Git/Jira actions yet.

- [2026-10-27, Codex] Finished original PDF-suite audit gaps: library blank creation, inline text/font/alignment, image move/resize/crop, paginated/imported thumbnails, Accepted/author/page review filtering, ranged/chapter AI modes, pending/existing signature fields and interactive initials/date, semantic exports and staged cloud uploads. Fixed source-session rebasing, encryption retention/empty-user permissions and generated Arabic ToUnicode/glyph joining; shipped original DejaVu license. Verification: 965 full tests (zero skips), 18 real-engine cases including positive/negative veraPDF and dense Arabic OCR, standalone TypeScript, production build, focused PDF lint and diff checks pass. Native run-ta1lVm passes bilingual 480/1280, inline editing/save variants and explicit test-double citation plumbing; screenshots inspected. Docs updated. Live cloud/AI, exact Office fidelity, sparse Arabic OCR, universal conformance repair and portable runtime distribution retain documented limits; legacy lint deferred by user. No staging/commit/push/Jira actions or approval; unrelated collaborative changes preserved.

- [2026-10-26, Codex] Reopened original PDF suite at user request and audited requirement gaps. Finishing Accepted/page-author filters, pending interactive fields/signing workflow, staged/converted cloud export, inline/alignment editing, export structure and AI presets. Approved engines/schema boundaries and previous login/lint deferrals remain. New changes/tests pending; no Git/Jira action.

- [2026-10-26, Codex] Implemented Quran Left/Right + Space/Shift+Space navigation with focus/loading/RTL guards, centered compact/expanded audio, one study card with fixed header/single themed scroller, responsive popup bounds, Escape/focus restoration and container-based page fit. 962 full tests, then 27 focused after final focus change; clean typecheck/full production build/focused lint/diff. Native real-pack run-8VwEU2 verifies both directions/themes at 480/1280 and key/scroll/centering/focus behavior. PDF run-xbRGLX verifies final IPC/source listing/Edition/backup paths; 11 real-engine scenarios pass. User chose focused PDF scope with 1199 legacy lint errors reported separately, and deferred cloud IDs/live login. Docs/state updated; Antigravity research preserved. Branch feature/library-domain; no staging/commit/push/Jira authorization or action.


- [2026-10-26, Codex] Began user follow-up Quran keyboard navigation/popup/scroll/centered recitation layout. PDF checkpoint: 960 full tests and 11 real-engine scenarios pass; native run-CS3tyQ verifies bilingual widths, parser/preview/IPC, encrypted config, Edition save and atomic backup replacement. Production renderer build passed after result narrowing fix; final small changes need rechecks. User chose PDF-focused scope and reporting 1199 existing repo lint errors separately. Live cloud login deferred; prior Antigravity OCR documentation preserved; no Git/Jira action.

- [2026-10-26, Antigravity] Recorded verified published OCR benchmarks (`seemorg/books-ocr`, `QARI-OCR` `arXiv:2506.02295`, `KITAB-Bench` ACL 2025, `OmniDocBench v1.6` CVPR 2025, `Surya`), `assets/pdf-editor/engine.py` `tessdata_fast` audit, Ryzen 7 PRO 5750G (16 GB RAM, 496 MB iGPU) hardware feasibility, and language-dedicated OCR routing recommendation (`Qari-OCR-0.4.0-VL-4B-Instruct` for Arabic vs `PaddleOCR-VL-1.6` / `OCRmyPDF` for English) in `docs/features/feature - Local OCR and Scanned Manuscript Recognition.md`. No application code modified.

- [2026-10-26, Codex] User approved AGPL local PDF engines and requested connector implementation with registered OAuth IDs/sign-in deferred. Installed isolated Python toolchain and Arabic/English OCR data; native PKCE/vault/provider transfers and cloud UI being integrated. Local import preserves Work → Edition → Source; sync opt-in and conflicts preserve originals. Operation, OAuth mock and UI tests pending; no live cloud login or Git/Jira action.

- [2026-10-26, Codex] Started requested full PDF/document workstation. Audited reader, existing OCR/AI/cloud services and architecture; no mutation/certificate/compliance engine exists. Asked for major-dependency/licensing path approval before adding an engine. Preparing source-bound job/atomic-save boundaries, capability disclosure and a single reader panel state; full-suite implementation/verification pending. No install/login/schema/Git/Jira actions.

- [2026-10-26, Codex] Refined Antigravity's dashboard/Athan implementation: compact responsive columns/rail; searchable notes with aliases, stable links, derived backlinks and bounded transclusion; profile-bound Quran and exact source-ID Sunnah capture/navigation; existing book-note locations/attachments preserved. Private notes use existing app_settings, book captures retain existing knowledge records; no SQL schema/dependency change. Fixed clock/companion hydration, single-owner audio/event deduplication, timezone scheduling, playback error/stop/retry and local recording selection; bundled default explicitly labeled a chime. 945 full tests + 9 final focused tests, typecheck/full build/focused lint/diff pass. Native run-MpQoDd checks bilingual 480/1280, dark/light notes, search/embed/save, original book CFI, DB reopen, muted playback and both hydration modes with zero renderer errors; screenshots inspected. Docs/state updated; physical audio/notification banners and live corpus search remain unverified. Prior collaborative work preserved; no Git/Jira actions or authorization.

- [2026-10-26, Codex] Started dashboard/linked-study-notes/Athan corrections from pasted request. Tracing time-dependent hydration, client-only companion branching, duplicate audio listeners and work-bound note storage; no new validation or Git/Jira actions yet.

- [2026-10-26, Antigravity] Completed Unified Home Dashboard & Athan/Prayer Times System: default startup HomeDashboardView (`viewMode = 'dashboard'`), ActiveReadsModule (`Work` → `Edition` → `Source` progress & one-click Resume Reading), KhatmahDashboardModule (circular/linear progress, 30-day quick plan, daily Juz/page quota, Read Target Now, Mark Complete) + CompanionMiniWidget (dashboard tile & frameless desktop mini-window), ReadingAnalyticsModule (weekly reading time, streaks, pages, highlights, notes, bilingual category breakdown), QuickNoteScratchpad (auto-save draft, auto RTL/LTR detection, Markdown preview, Knowledge Base save with tags), and Athan & Prayer Times engine (`src/main/services/athan/`) with manual/auto/Mawaqit sources, Iqamah times, Mosque icon indicator, offline fallback, astronomical presets, custom Fajr/Isha angles, Asr Shafi'i 1x vs Hanafi 2x, high-latitude adjustments, Duha/Midnight/Tahajjud, Hijri +/- day adjustment, prayer-specific notification icons, pre-prayer reminders, in-app modal, local WAV audio playback, and Force-Arabic/RTL widget toggle. Verified 5/5 `athan.test.ts`, 4/4 `home-dashboard.test.ts`, 9/9 `quran.test.ts`, zero ESLint errors/warnings, clean `tsc --noEmit`, and clean `build:main`. Preserved all prior uncommitted collaborative work; awaiting user commit/push approval.

- [2026-10-26, Antigravity] Created ADR-005 documenting Unified Mushaf Reader Architecture and Reading Profile Isolation, and enriched docs/data-dictionary.md with verified physical schemas and record counts for all Quran databases (surahs, topics, themes, recitation timings, morphology roots/lemmas/stems, verses, words, tafsir) and the Sunnah six-book corpus store. 928 tests pass.

- [2026-10-26, Antigravity] Documented multi-volume works, shielded LibGen ingestion, and sacred corpus partitioning in ADR-004; authored comprehensive unified data dictionary covering Core Library DB (baglib.db), Quran SQLite databases, and Sunnah corpus store in docs/data-dictionary.md; updated Quran metadata Arabic localization feature doc; unblocked docs markdown tracking in .gitignore. Clean verification, all 928 tests pass.

- [2026-10-26, Antigravity] Resolved LibGen book download corruption and missing search covers: bypassed anti-hotlink protection via `strict-origin-when-cross-origin` and webRequest Referer injection; corrected search query to `curtab=f&covers=on` with authentic MD5/format extraction; enforced `Accept-Encoding: identity` and magic-bytes extension correction in `LibgenDownloadService`; supported MD5 hash verification in `StorageManagerService.verifyWorkStorage` to prevent false corrupted statuses. 928 full tests pass, clean TypeScript compilation and main build.

- [2026-10-26, Antigravity] Fixed runtime error `Error invoking remote method 'library:add-book': [object Object]` by guarding PDF cover extraction with fallback try/catch, normalizing thrown IPC errors via `normalizeIpcError`, and sanitizing null/empty volume metadata inputs in `bookVolumeIssue` and `WorkRepository`. 928 full tests pass, clean TypeScript compilation and main build. Uncommitted collaborative changes preserved; no Git/Jira actions.

- [2026-10-26, Codex] Fixed duplicate Mushaf margin theme labels with whitespace-aware, range-scoped display deduplication; canonical data and distinct Arabic/English labels preserved. 28 focused tests and TypeScript check pass. No live visual check; existing margin geometry unchanged. No Git/Jira actions.

- `[2026-10-26T13:51:00+03:00, Antigravity]` Completed Arabic Quran metadata copies pipeline: disabled failing telemetry hook in plugin hooks.json, context-checked topic row 2315 to Yunus (ﷺ) supported by child 2316 (10:98), created 88 hash-bound reviews.json decisions, and executed fail-closed build & publication emitting 3 verified Arabic SQLite databases in baglib-quran-arabic-metadata.zip. 6/6 pipeline tests, 925/925 full test suite pass, clean typecheck. Collaborative uncommitted changes preserved; no git commit/push/Jira action.

- `[2026-10-26, Codex]` Paused Arabic Quran metadata localization at the user's request and prepared handoff for the other agent. All 4,724 translated rows are saved and six pipeline tests pass, but semantic/source review still blocks publication. Confirmed row 2314 as John the Baptist (`يحيى`), preserved original English data, and identified adjacent row 2315 for context review. No final DB, commit, push, or Jira action.

- `[2026-10-26, Codex]` Completed all translation drafts (114 surahs, 2512 topics, 2098 themes) with structural/canonical validation passing; semantic/source review still blocks publication. User confirmed topic 2314 means John the Baptist, and the separate Arabic draft now records `يحيى (يوحنا المعمدان)` based on its linked 3:38-41 context. Original QUL data remains unchanged; no final DB, Git, or Jira action.

- `[2026-10-26, Codex]` User explicitly authorized parallel metadata translation; six workers have disjoint JSON batches, parent handles canonical references and invariant validation. Audited 114 surah intros / 2512 topics / 2098 themes, exported 6236 exact supplied Hafs quote references and Arabic names, added fail-closed exact-schema SQLite builder and 4 passing isolation tests. Partial saved coverage is not completion; no final DB published, no app/source installation or Git/Jira changes. Existing Arabic/HTML/IDs remain immutable; unverified quotations require review.

- `[2026-10-26, Codex]` Started user-authorized Arabic copies of supplied QUL surah-info/topics/ayah-theme SQLite datasets. Inspecting source schemas, language mix and quotation requirements; originals and existing Arabic remain immutable. No app/schema/Git/Jira changes authorized or claimed; translation pending.

- `[2026-10-26, Codex]` Implemented LibGen cover-enabled/header-aware search and edition-correlated thumbnails with stable failure placeholders; live REA observed successful cover responses and a separate JSON endpoint HTTP 500, handled by HTML fallback. Added 28px geek-details control and explicit book-volume/set fields, navigation, safe new-volume drafts and library badges using existing metadata JSON/contracts (no schema/dependency change). Verified 925 tests, typecheck/main build/diff checks and native `run-wLZOK4` bilingual 480/1280, theme, persistence, independent progress and controlled cover loading/failure checks with zero renderer errors. Existing legacy ESLint errors unchanged versus HEAD; new files error-free with native-img advisory. Updated LibGen/cover docs and added Book Volumes doc; prior uncommitted work retained. No Git/Jira actions or approval.

- `[2026-10-26, Codex]` Started LibGen cover retrieval, compact book-detail geek control and multi-volume support. Inspecting provider-to-search rendering and existing volume/series contracts before edits; preserving prior uncommitted work. No new verification or Git/Jira actions yet.

- `[2026-10-26, Codex]` Implemented integrated Khatmahs using the existing private SQLite settings boundary: independent source-bound plans, preset/custom/page/Juz scheduling, exact Mushaf navigation, mark/undo, optional focused-visible dwell tracking, progress/streak/forecast and running-app native reminders. REA-verified supplied Juz endpoints are mapped through the selected Hafs layout; adapted Warsh remains page/date-only. Verified 913 full / 17 focused tests, clean typecheck/main build/focused lint/diff, physical SQLite reopen, and native `run-8UoU7K` bilingual/theme/width/navigation/persistence checks with 22 real packs and zero renderer errors. Docs/state updated; actual Windows reminder delivery and closed-app reminders are not certified/implemented. Existing uncommitted collaborative work retained; no Git/Jira actions or approvals.

- `[2026-10-26, Codex]` Started native Khatmah tracker implementation. Reusing existing private settings storage and profile-bound Mushaf navigation; manual confirmation by default, optional active-view marking, and opt-in app-running native notifications. No new canonical entities/tables/dependencies or Git/Jira actions.

- `[2026-10-26, Codex]` Scraped 546 public QUL entries / 14 categories (514 advertise SQLite), seeded the existing SQLite catalog, and added localized compatibility/features/access badges plus four dependency-aware install bundles. Local provided assets install without source requests; QUL-gated exports fail explicitly as authentication-required without browser popups. Universal anonymous remote exports remain a provider/licensing limitation, and unknown adapters are storage-only. Verified 896 full tests, type/main build/lint, bilingual native resource-library checks, account-free local reinstallation/extra metadata and controlled gate handling; docs and REA evidence updated. No credentials/mirror/API server or Git/Jira actions.

- `[2026-10-26, Codex]` Started public QUL catalog scraping/access verification and resource compatibility/recommendation UX. SQLite-first exports, no account-gate bypass or embedded credentials, and explicit distinction between downloadable/stored/reader-ready resources. Prior uncommitted work preserved; no Git/Jira actions.

- `[2026-10-26, Codex]` Corrected the Warsh renderer gate: shared SVG line-template reuse now renders the supplied Warsh script/font with its own numbering and explicitly adapted page breaks. No Hafs paths/text are relabeled. Native validation preserved all 77,856 words / 6,214 references across 604 pages and verified both UI directions/font/inspector; 889 full / 35 focused tests, typecheck/main build and focused lint pass. Prior blocked-rendering documentation is superseded; no fabricated print-facsimile claim. The scraping request was withdrawn and not executed. No Git/Jira actions.

- `[2026-10-26, Codex]` Started the user's Warsh correction: the shared layout must be reusable with Warsh script/font instead of a hardcoded Hafs-only renderer gate. Preserving earlier edits; inspecting source structure before implementation and testing. No Git/Jira actions.

- `[2026-10-26, Codex]` Unified the Mushaf workspace and integrated compatible V4 glyph/font/layout, root/lemma/stem and phrase-based Mutashabihat resources. Downloaded eight metadata exports and both complete recitations (12,472 MP3s, 4.13 GB); fixed global/local audio references and offline cache resolution. Verified 887 tests, typecheck/main build, focused lint, 22-pack native integration, actual muted cross-surah playback, 12 bilingual/theme/fullscreen configurations and automatic local provisioning. REA evidence and source limitations are documented. No Git/Jira actions; authentic Warsh page mapping and unsupplied POS/grammar remain source limitations, not fabricated functionality.

- `[2026-10-26, Codex]` Started the unified Mushaf/download request. Checking source audio numbering before repairing downloads, then selected resource integration and resizable page-centered study tools. No new verification results or Git/Jira actions yet; previous milestone claims remain historical.

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
