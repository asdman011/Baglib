# Remaining UI audit — 2026-11-07

This continues the completed minor-layout pass. It covers the remaining existing dialogs and secondary interfaces, not new domain features. Canonical texts, schema, security, providers, inference, file processing, sync and destructive operations are unchanged.

## Changes and initial verification inventory

| Surface | Presentation changes | Current evidence |
| --- | --- | --- |
| Search hub | Dynamic viewport height, bounded control region, shrinking results, logical search/clear positioning, localized accessible labels | tsc; 5 existing UI tests; live rendering pending |
| Book details / Import | Wrapping headers/actions, readable long title, localized dirty badge, three-column import steps, scrolling form bodies | tsc; 16 focused tests; live bounds/close ar/en480x600 in layout-live-155ed4af |
| Security / Statistics / Sync | Bounded scrolling forms, localized icon labels, scrollable nonshrinking sync tabs | tsc; 22 service regressions; same live dialog run |
| Storage / Catalog | Bounded summaries/results, scrollable tabs, localized path search, dynamic sizing | tsc; 15 regressions; first live run found storage starvation; compact-header fix under stronger recheck |
| AI settings / Clipper / Audio pairing | Bounded scrolling bodies, compact spacing, localized close, wrapping steps/actions | tsc; 3 clipper tests; Clipper in actual-app bounds check; AI/pairing live checks pending |
| Reader plugins / PDF tools hub | Compact mobile spacing, shrinkable scrolling content, bounded plugin/nested forms | tsc; 5 plugin tests; live checks pending; engine behavior not exercised |
| Floating TTS | RTL-safe centering, no fixed340pxminimum, wrapping controls, bounded timer menu, readable Arabic timer labels | poetry-live/run-mJPDDU ar/en320/480/1280 player/menu bounds; final font tweak not recaptured |
| Trash / metadata review / providers / edition comparison | Viewport bounds, shrinkable scrolling forms, mobile spacing, no fixed300pxTrash floor | tsc; 12 focused tests; metadata/Trash live recheck running |
| Lending / Return | Existing scrollable overlay and auto margins inspected | No changes needed from source audit; live form check pending |

## Scope of tests

Service regression tests support behavior preservation, not visual correctness. Bounds tests do not establish usability by themselves: storage's valid outer bounds initially hid an almost-empty results area. The current live harness explicitly requires at least80px for that area at480x600. All real app runs use both BAGLIB_DATA_DIR and --user-data-dir pointing to disposable layout-live directories. No personal library or saved credentials are used for dialog interactions.

Warnings reported in existing components are not silently fixed as unrelated cleanup. No production renderer build is run alongside a dev server. All owned test servers must be stopped and port3000checked before final handoff.

## Final live coverage

- layout-live-1bf23378: ten real first-level dialogs in Arabic/English at480x600, with storage results at least80px; compact storage screenshot inspected.
- layout-live-53d0f72e: twelve-dialog pass including Search/tools, plus workspace checks. Visual inspection caught the tools Close button outside the viewport; this run alone was not accepted as final evidence for that header.
- layout-live-157071f7: post-fix Search/tools live pass in both languages, including explicit bounds for every visible tools-header button. Fresh screenshot inspected: Close, view and theme actions remain visible.
- poetry-live/run-mIXBzf: nine controlled secondary dialogs in Arabic/English at480x600 (AI, plugins, pairing, providers, metadata diff/candidates, lending, return, edition fallback). Header/footer reachability checked for intentionally scrolling loan forms. Audio player/timer verified at320/480/1280 with updated UI-font labels. Screenshots inspected across these runs.
- The no-TOC pairing dialog initially crashed in real rendering. Stabilizing its empty default array fixed the repeated render reset; the above live pass covers omitted TOC.

All artifact directories are under `.baglib-data`. The final aggregate checkpoint is recorded in CURRENT_TASK.md, which supersedes provisional status entries in the table above.

Final checkpoint: post-header-fix tsc passes; isolated npm test1387/1387passes, no skipped/cancelled tests. Twenty-file lint reports0errors/69retained warnings; post-fix tools lint reports0errors. Diff whitespace check passes, owned test processes exited, port3000free. No renderer build was run with a dev server. This completes the remaining existing-UI presentation pass with the limitations below; no claim is made that deferred domain features or other agents' unfinished save functionality are complete.

## Coverage limitations, not implementation claims

- Provider/source/borrower/history services omitted by the controlled fixture exercise fallback layout only. They are not proof of production integration failure or success. No credentials, network metadata lookup, loan submission, deletion or enrichment application was performed.
- Tool-hub browsing/closing is covered; executing every PDF operation is outside this presentation pass. Other agents' unfinished save/history work was preserved.
- No claim is made that every imported record, OS scaling level or content length was rendered. Tests cover representative narrow/short screens and Arabic/English directionality.
- The earlier development-DB isolation caveat remains in the previous audit; subsequent UI checks use disposable profiles. Missing fixture IPC and the unrelated save-startup warning are not presented as fixed.

No Git commits, pushes, or Jira updates are authorized by this UI request.
