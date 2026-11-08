# Minor layout audit — 2026-11-07

## Boundaries

Polish existing BagLib interfaces and connections; do not redesign its data model or change canonical Quran, hadith or poetry. No dependencies, downloads, commits, pushes or Jira changes are part of this request. Preserve concurrent agents' PDF/save work.

## Implemented and evidenced

| Area | Change | Evidence |
| --- | --- | --- |
| Shared shell | Grouped navigation, persistent Settings, active-book return, connected header/footer actions | layout-live-cde24845 ar/en shell and eight-workspace checks; component page-preservation test |
| Library | Labeled ribbon groups, localized primary filters, bounded controls reserving reading space, unclipped column chooser | Same live run at 480/1280: >150px content space, popup bounds/direction/Escape; screenshots inspected |
| Planner | Seven-column calendars scroll internally instead of squeezing labels | Type/lint and 7 planner tests; live workspace screenshots |
| Categories | Five existing dialogs bounded by viewport height with scrolling | 8 category/tag tests; base workspace live check (not all dialogs exercised) |
| Lectures | Bounded list scrolling, wrapping section form | Type/lint; empty workspace live screenshots (long populated list not exercised) |
| Sunnah | Grouped toolbar, Arabic-first mobile translation stacking, readable Arabic heading, focus treatment | 25 UI tests; real-app workspace screenshots (mobile hadith body not yet explicitly asserted) |
| Poetry | Responsive cards/toolbar, stacked narrow hemistichs, loading state, derived description entity cleanup | poetry-live/run-knZTjt real corpus ar/en 480/1280 screenshots and persistence checks; 8 description/core tests |
| Quran | Bounded resizable panels, selected-ayah scope distinct from page scope, visible marker geometry clamping | quran-layout-live/run-pzKgGG installed-pack ar/en popup bounds/scroll/key/focus; 2 explicit scope tests |
| Tags | Ranked Arabic-aware suggestions without renaming stored labels | 2 focused helper tests; live suggestion interaction not yet exercised |

All paths in the evidence column are under `.baglib-data`. Existing snapshots and source-only tests are not proof of untested interactions.

## Regression checkpoint

The isolated full suite passed 1,385 tests and tsc before the final Quran scope-helper extraction; the 2 new scope tests and changed-file lint subsequently passed. Final aggregate verification must be rerun after remaining changes. No renderer production build was run while a dev server was active. Owned dev servers were stopped; port 3000 was confirmed free at the last live checkpoint.

## Final completion checks

- Theme geometry verified in quran-layout-live/run-VSUo4h: ar/en markers agree within 2px with visible SVG elements filtered to exact surah/range; no claim that this covers every corpus theme/page.
- Representative category dialog checked at480x500; final layout-live-c2b4c81e passes ar/en with60lecture entries, bounded list scrolling, mobile bilingual hadith column order/bounds, library content reservation and column popup dismissal, and10workspace overflow checks including Pathways/Settings. Lecture and mobile hadith screenshots inspected.
- Tag keyboard checks pass with loaded fixture tags in poetry-live/run-EJ2sJH: typing reopens suggestions, ArrowDown exposes active descendant, Enter/Escape operate. Stored data unaffected.
- Quran run-4bFhfv passes installed-data marker geometry, popup bounds/focus/scroll, and native resize-enabled style constraints at480/1280. Resize dimensions were applied programmatically, not an OS-level handle-drag test.
- Final tsc and clean lint across18layout/helper files pass. Categories retains5pre-existing warnings, no errors. Isolated full suite1387/1387 passes after production changes. Whole-tree diff --check passes (line-ending conversion warnings only); unrelated pre-existing working-tree changes preserved. Own apps exited, server9440 stopped, port3000free. Handoff updated; no Git/Jira mutations.

The minor-layout pass is complete against the audited existing surfaces and representative bilingual cases. This is not a claim that every content resource, OS DPI setting or third-party PDF/save feature has been tested. The unrelated findings below remain explicitly separate.

## Separate findings

The poetry fixture had stale hidden-panel selectors and legacy note/editor assumptions; these were corrected. Its native checks now pass, but missing history-request IPC in that fixture means history UI is not certified there. The shared-app disposable startup logged `app_settings` missing in the unfinished save system before initialization; no claim is made that this was fixed. Initial earlier test runs accessed the default development DB before explicit isolation was added; no pre-test comparison exists. Subsequent runs used disposable profiles. These caveats must not be hidden by green layout checks.
