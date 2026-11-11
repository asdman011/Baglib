# Usability inspection — 2026-11-07

Status after authorized follow-ups: U1/U2/U4/U5/U6 and the scoped U3 dialogs have implementation/verification notes below. Original findings and recommendations are historical evidence, not statements that those same scoped problems remain unchanged. Final recovery/background pass: 1394/1394 tests, tsc passes, changed-file lint zero errors/5 existing warnings, owned server stopped and port3000free. Changes are uncommitted; no Jira actions. Remaining limits include cancellation/restart recovery, other modal focus coverage, actual assistive speech, external sync and the unrelated pre-initialization save-service warning.

Request: inspect inconveniences in using the app. This is an inspection, not authorization to change behavior or schema. Production files remain unchanged by this inspection.

## Source-verified findings

### U3 follow-up — dialog focus implementation (2026-11-07)

**Cloud Sync follow-up:** shared named dialog/nested discard focus protects KOReader/cloud settings and snapshot description drafts. Explicit local Save actions avoid requiring a network test just to save settings. One synchronous operation guard serializes actions and prevents dismissal during saves/sync/backup/restore/delete; failed snapshot creation keeps its description. Failed settings reads cannot overwrite stored settings with defaults. Actual run layout-live-0db94466 verifies native ar/en keyboard, draft retention/discard and opener return without remote activity. Controlled cloud-sync-safety tests cover save and snapshot failures/busy dismissal. No cloud connection, real backup/restore, cancellation or speech certification is claimed. Initial approval-service failure was resolved before validation; final combined suite1402/1402 and tsc/lint pass.

**Provider settings follow-up:** ProviderSettingsModal now traps focus, exposes a localized modal name, restores the opener, and uses a nested discard confirmation for Escape/backdrop/Close/Cancel. Dirty detection covers provider toggles/order and SourceUrlsPanel's address field. Source addresses retain their independent update action; the provider Save button cannot silently discard that draft. Saves/source updates block dismissal, failed saves retain edits, and missing/failed configuration loads cannot be saved as empty data. Save-session tokens and timer cleanup prevent late save completion from closing a later/unmounted session; source-update UI callbacks also ignore unmount.

Actual run `.baglib-data/layout-live-c1d1bacd` verifies native Tab/Shift+Tab containment, localized names, provider/source draft retention through Escape/Keep Editing, explicit discard and opener return in Arabic/English, without saving settings or fetching a source file. `tests/ui/provider-settings-safety.test.ts` uses fake APIs for busy source updates, failed save/retry, failed-load write protection and late-save cleanup. This is not testing real source downloads, backend cancellation or screen-reader speech. Cloud Sync and other configuration dialogs remain separate follow-ups.

**Additional coverage, 2026-11-07:** Reading Statistics and Storage Manager now use the shared focus stack. Storage's rebind-results and duplicate-prune overlays are named nested dialogs. Escape dismisses confirmation/results only, not the parent or a deletion; busy repairs block Escape and both parent Close buttons. Locate, verify, rebind and prune operations share a synchronous guard and visible localized busy status. The asynchronous duplicate-removal callback is awaited before unlocking.

Native Electron run `.baglib-data/layout-live-c3cbf2d8` passes Arabic/English 40 Tab + 40 Shift+Tab presses, named modal semantics, safe idle Escape and opener restoration for Statistics/Storage. `tests/ui/storage-dialog-focus.test.ts` additionally uses controlled promises to check confirmation cancellation without deletion, Escape during rebind, result dismissal and the async prune fallback. The expanded fallback test exposed a pre-existing notification timeout surviving Storage unmount; toast timers now clear on replacement and unmount. No actual files were repaired/deleted in these checks; speech output remains untested. Other dialogs still need individual migration/safety review.

The subsequent user request authorizes fixing keyboard focus. Search Hub, Import Wizard, Book Details and its nested discard confirmation now use `useDialogFocus`: a topmost-dialog stack, Tab/Shift+Tab wrapping, focus containment, safe Escape callbacks and opener restoration. Dialog roles, modal state and localized accessible names were added. Search starts in its query field. No layout or data model changes were needed.

Import Escape still invokes the existing operation-lock guard. Book Escape opens the existing unsaved prompt; Escape there returns to editing, not discard. Closing both nested and parent dialogs restores the original opener. The other inspection findings remain outstanding; this does not claim every modal in Baglib has been migrated.

Verification: disposable real Electron profile `.baglib-data/layout-live-90e1cc71`, `BAGLIB_USABILITY_INSPECT=1` and `BAGLIB_FOCUS_CHECK=1`. Both languages exercise 40 forward and 40 reverse native Tab presses per inspected dialog, accessible names, Escape, opener return, and mixed-script dirty input retained through the confirmation flow. DOM semantics were checked, not actual screen-reader speech. Active imports were covered by source inspection and the shared busy-callback regression, not a live import interrupted by Escape. Full regression suite 1388/1388; TypeScript passes; changed-file lint has zero errors and 10 existing warnings. No commits, push or Jira changes.

### U1 — Readiness feedback is not connected to actual readiness

#### KEY-301 part 1 follow-up - 2026-11-11, Codex

The status bar consumes the existing FTS statistics probe and PDF-engine status endpoint. Statistics now reports whether SQLite is open and whether both indexed-book and indexed-page queries succeeded. Engine status also reports the existing configuration/file-availability check. The renderer refreshes on engine changes, window focus and a 30-second interval. It initially says Checking, then reports Ready or Some tools unavailable, with an Arabic/English tooltip identifying the unavailable component and a next step. A stopped, installed engine is available without starting its sidecar. This probe establishes index availability and engine configuration. Indexing coverage and successful rendering remain separate checks.

The missing-engine simulation changes only pdf-editor.engine.v1 in a disposable profile to nonexistent Java/JAR paths. Real engine files remain in place. Bilingual controlled tests verify the status change and recovery. Native matrix evidence and the final full-suite result are recorded in the local KEY-301 report.


**Implemented 2026-11-07:** StatusBar now describes local storage neutrally, without claiming database/index health. Notes count distinguishes loading and load failure. No synthetic health check or new storage was added. Arabic/English component and real-app checks cover the new wording/layout.

`src/renderer/components/layout/StatusBar.tsx` always renders `localLibraryReady` with a green database icon. Its workspace values contain labels, navigation and language, but no database/index status subscription. `useStudyNotes` can fail independently and exposes an error state the status bar does not read.

Impact: users can see a reassuring ready/indexed message during data-loading failures. Recommendation: replace the assertion with neutral local-storage wording until an existing authoritative readiness signal is available; do not invent health checks or new storage.

### U2 — Import progress cannot be dismissed or cancelled through the wizard

**Implemented 2026-11-07 (safe background alternative):** the lazy Import Wizard session is now owned by WorkspaceProvider rather than LibraryGridView, so changing view does not unmount it. Minimize releases modal focus and exposes a logical-end floating Resume/progress/results control. Reopening Import resumes the existing session. Incoming paths cannot replace an open session. Active Escape minimizes; final close still refuses unfinished scan/import work. Staging, per-file progress, result summary and the existing single completion refresh survive view changes.

Source investigation: `src/main/ipc/digital.ts` serializes work through `enqueue`; `digital:import-files` awaits `pipeline.importFiles`, and `digital:check-duplicates` awaits its batch check. `digital-import-pipeline.service.ts` completes sequential `importFile` calls without an abort contract. No cancellation API, backend queue or transaction behavior was changed. Background here means **within the running app**, not resuming after app closure/restart; localized guidance states this explicitly.

Evidence: `tests/ui/import-background.test.ts` controls an in-flight import and verifies navigation, progress/results retention, one refresh, safe Escape and ignoring replacement paths in both languages. Actual Electron controlled-IPC run `.baglib-data/layout-live-c6b66d44` passes ar/en file staging, delayed progress, minimize, navigation and results reopening with zero renderer console errors. The test stubs duplicate/import responses and does not certify real file extraction. Main stderr also contains an existing save-service startup `app_settings` ordering warning; the library subsequently initializes. That unrelated save subsystem was not modified.

`src/renderer/components/library/ImportWizardModal.tsx`: close is disabled during importing/duplicate scanning, and `handleModalClose` also rejects those states. No cancellation control or abort request exists in this component. This may intentionally protect ongoing work; it is not evidence that imports are hung.

Impact: a slow scan leaves the user waiting with no clear escape path. Recommendation: inspect backend cancellation first; distinguish a safe background/minimize action from actual cancellation. Never enable abrupt close if it can lose progress.

### U3 — Search/import focus, verified part-1 follow-up on 2026-11-11

The original inspection recorded fixed-div overlays with incomplete modal semantics and unverified Tab containment. Earlier useDialogFocus follow-ups established their guarded focus behavior. KEY-298 part 1 now composes SearchHubModal and ImportWizardModal through the U2 Modal, with the same shared topmost stack used by Sheet and 23 other converted panels.

The production search and import panels pass native Tab and Shift+Tab traversal, boundary wrapping, external-focus containment, Escape and opener restoration in Arabic RTL and English LTR, light and dark, at 1280 and 480 px. The one-window harness uses production preload/IPC and real Arabic/English PDFs in a throwaway profile. It mounts production components in an isolated renderer fixture. Evidence is in `.baglib-data/KEY-298-evidence/2026-11-11T11-22-51-431Z/`, with 224/224 complete panel checks overall and eight screenshots inspected.

Keyboard focus uses the focus token in both themes. React-autofocus opener loss and async storage-result opener loss were reproduced and fixed, each with a regression test. Both shortcut sheets list the current scoped registry by workspace. Reduced motion is checked with Emulation.setEmulatedMedia. Focused tests pass 35/35 and the final full suite passes 1839/1839.

Remaining hand-made overlays, the remaining application-entry-point tour and the whole-app semantics audit are listed in the local KEY-298 report. KEY-298 remains open for part 2.

### KEY-301 part 2 - 2026-11-11, Codex then Claude Code

The U1 readiness tooltip and accessible label now join unavailable components with a real middle dot. U5: the Notes list empty state names "no matching results" and offers New note. A failed marks-list load shows Retry. Boards, the planner, pathways and every dashboard module show content-shaped skeletons while loading, then a one-sentence empty state with one primary action. Notes, saved cards and review comments offer Undo through the existing knowledge-history restore; boards through their pre-delete snapshot. Deletions without a restore path show a confirmation only. Long metadata, storage and OCR operations show one persistent progress notification. Native verification: feedback-ui-live 8/8 in ar/en, light/dark, 1280/480. Full suite 1806/1806.

## Additional recovery and discoverability findings

### U5 — Notes errors give little actionable recovery guidance

#### KEY-301 part 1 follow-up - 2026-11-11, Codex

Notes keeps the independent-source loading/retry implementation described below. Action failures retain their existing localized retry/reference next step. The existing note-list loading message becomes content-shaped U2 skeletons with its accessible loading label. Successful data and unsaved drafts retain their existing recovery behavior. Bilingual recovery regressions exercise the existing retry and retained-data paths. Wider empty-state, dashboard and progress coverage remains for KEY-301 part 2.


**Implemented 2026-11-07:** study notes and knowledge load independently with all-settled results; successful sources and previous failed-source data remain visible. Obsolete concurrent loads are ignored. Notes identifies the failed source, offers disabled-while-loading Retry, separates load failures from action failures, and does not describe a failed/loading collection as empty. Retry does not close the editor or replace its unsaved draft. No stored note text was changed.

Evidence: `tests/ui/usability-recovery.test.ts` exercises each source failure, retained data, Retry and genuine empty state in Arabic/English. Actual-app run `.baglib-data/layout-live-458bb497` injects failure only into the disposable process's notes-list IPC handler, verifies error/no false empty state, restores the handler and retries successfully in both languages. This verifies a controlled read failure, not corrupt-database recovery or every action error.

`NotesOverviewView.tsx` combines loading errors and action errors into `studyActionFailed`. The message has no adjacent retry button or indication of which source failed. An empty filtered list can also render `studyNoResults` while that error is shown. `useStudyNotes.ts` catches a combined notes/knowledge load into one boolean.

Impact: users cannot readily distinguish an unavailable store from an empty collection or a failed action. Recommendation: preserve existing notes on errors, distinguish load/action failure, and offer a scoped retry without suggesting data was lost. Source verified; a real database fault was not injected.

### U6 — Settings is not a reliable directory of available settings

#### KEY-307 / U13 implementation - 2026-11-11, Codex

Settings now has one searchable page with 31 entries in the ten requested groups. Each entry indexes its Arabic and English name and description through the existing Arabic search normalizer. Advanced stays behind a disclosure. SaveSettings and the provider, storage, sync, AI, lock, extension and wird editors remain the configuration owners. Search-source switches use the existing persisted provider API. New coverage scans registered preference constants across the source tree and checks directory membership, with explicit exclusions for content, caches and derived lock secrets.

The once-only guide starts after the KEY-150 splash completion callback and stores its seen flag and optional import-source folder in the existing app_settings key-value store. Its pack step reads catalog/status APIs. Its final action opens the existing import wizard with the chosen folder. Help reopens the guide. About/Support reads the native version and data path, opens the fixed native logs directory, links to the KEY-316 shortcut sheet and offers the project's GitHub issue form.

Sequential verification passed TypeScript, changed-file lint (zero errors, five existing warnings), 16 focused checks, the main build and whitespace checks. The final native matrix passed all eight ar/en, light/dark, 1280/480 combinations with zero renderer errors. Evidence is in `.baglib-data/KEY-307-evidence/2026-11-10T23-20-59-161Z/`. Five final screenshots were directly inspected. The profile was deleted. The single final full-suite run passed 1786/1786 tests across 334 suites at concurrency two. CURRENT_TASK.md and the local KEY-307 report record the full handoff.

The native harness stages real Arabic/English PDFs and cancels the import wizard before the PDF-cover pipeline creates its additional hidden BrowserWindow. It verifies guide completion and import handoff, with shell folder/URL calls intercepted. It supplies the product package version because its CJS launch entry otherwise reports Electron's version. External sync, actual OS folder/browser opening and biometric authentication are outside these checks. Corpus availability reflects the device's installed resources, with the expected missing-layout warning in the isolated profile. No schema, dependency or download was added.


**Implemented 2026-11-07:** SettingsDirectory adds localized searchable shortcuts, existing theme/language actions, direct access to the original provider/sync dialogs and clearly described navigation to Quran/Library tools. SaveSettings remains unchanged. The outdated future-only description is replaced; no preference store was duplicated. Search uses the existing derived-text normalizer and leaves canonical content untouched.

Evidence: bilingual component checks exercise theme changes, Quran navigation and diacritized Arabic settings search. Actual-app recovery run opens/closes existing provider and sync dialogs in Arabic/English and checks short-window overflow. It does not save provider/cloud credentials, perform synchronization or certify external services.

Historical inspection: `AppLayout.tsx` rendered the settings title/description plus `SaveSettings`. The centralized description says fonts/display/sync are reserved for future updates, while sync, provider and other settings already exist in separate workflow dialogs. Those settings are not linked from this view.

Impact: users may conclude a feature is unavailable or need to remember which reader/library dialog contains its configuration. Recommendation: make Settings an honest, searchable directory linking existing controls, without inventing new preferences or duplicated state. Source verified; preference storage was not changed.

## Inspection conclusions and priorities

1. **High: U3** keyboard focus escapes modal overlays (live reproduced ar/en).
2. **Medium: U4** clearing search may admit stale results (source call path, not delayed-response reproduced).
3. **Medium: U2** long imports lack a safe cancel/background escape route (source verified; cancellation safety requires backend investigation).
4. **Medium: U5** generic Notes failure/empty-state recovery (source verified).
5. **Medium: U1** readiness/indexed assertion is not actual health feedback (source verified).
6. **Low/medium: U6** scattered settings and outdated description (source verified).

The requested inspection is delivered as findings, not fixes. It reviewed current navigation/status, settings, import control flow, notes recovery and search behavior, with live keyboard inspection in both languages. It does not certify every app feature as free of inconvenience. Search delayed-response behavior, actual cancellation, injected DB failures, assistive-technology speech and production save/history remain explicitly untested. Those limits qualify the findings rather than silently claiming broad runtime proof.

### Live keyboard evidence for U3

Disposable actual-app inspection `.baglib-data/layout-live-fddb4b7b/usability.json` confirms Tab leaves both overlays in both UI languages. Import reaches the background footer after4Tab presses from the dialog's first button; search also escapes its overlay (exact counts recorded in JSON). Neither overlay exposes modal semantics in the check. The inspection started focus inside each dialog, so even this best-case starting position does not keep keyboard navigation contained. No files imported, searches submitted, or production behavior modified. Own app exited and server stopped.

### U4 — Clearing a search does not invalidate the pending request (source-verified risk)

#### KEY-301 part 1 follow-up - 2026-11-11, Codex

Search Hub retains the previously implemented request invalidation and now also suppresses obsolete error toasts. New delayed-response tests submit two different queries, complete the newer request first and verify that the older result stays absent. Saved cards and personal commentary now invalidate sequence IDs on query edits, clear and effect cleanup, and check them before committing successes, errors or loading completion. Reader search ignores aborted progress and aborted errors as well as final results. Existing Arabic normalization and canonical content are retained.

Search Hub uses the shared toast service, content-shaped result skeletons and a single Clear action for zero results. Native tests inject delayed local responses into the disposable process while exercising the production renderer. These tests cover ordering and clearing. External provider/network behavior has separate verification requirements.


**2026-11-07 implementation follow-up:** Search Hub now invalidates the old request before attempting cancellation, immediately on query edits (including whitespace/clear), and before empty/source-scope returns. It removes queued debounce work on scope/provider execution, close and unmount, rejects stale progress and both awaited result types through the existing ID checks, and uses a counter alongside timestamps to avoid same-millisecond ID reuse. Clearing also resets full-text results, timing and provider statuses. Closing resets the spinner without discarding the query.

Controlled component regressions in `tests/ui/search-race.test.ts` cover Arabic/English, delayed provider results/progress after Clear, delayed full-text results after empty input, and debounce cancellation on clear/close. These use local fake providers, not external searches. Real app bilingual smoke/focus coverage passed on a disposable profile in layout-live-74565684; this is not a live network-latency reproduction. Final aggregate results are recorded in the state files.

`SearchHubModal.tsx` returns from its empty-query branch before cancelling or replacing `activeSearchIdRef`. The clear-button handler clears query/results but also does not invalidate that ref. A previously awaited result can therefore still satisfy the ID check and repopulate results. This is a call-path finding, not a live delayed-response reproduction. Ordinary nonempty searches do cancel previous requests and guard result IDs; do not incorrectly describe all request ordering as broken.

- Follow-up implementation, if requested, should start with modal focus containment and a controlled stale-search reproduction. No commits, pushes, Jira actions, downloads or production changes are included in this inspection.

### KEY-301 integration correction - hidden PDF measurement canvas

Native screenshot inspection exposed an English-PDF shell compression. Runtime capture diagnostics found a canvas.hiddenCanvasElement appended directly to body, in normal flex flow, measuring 1280 by 640 CSS pixels at desktop width and consuming space alongside the shell. At 480 px it consumed 240 px. The installed node_modules/pdfjs-dist/web/pdf_viewer.css at line 3115 supplies display none for this element. BagLib's custom PDF styles omitted that rule. globals.css now includes it, with a new regression test and native footer-position assertions. A preliminary document-scroll hypothesis was disproved by scrollY zero in the diagnostics, and its attempted reset was removed.
