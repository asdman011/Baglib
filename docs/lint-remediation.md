# Repository lint remediation

2026-10-27, Codex. The user explicitly expanded the earlier PDF-only scope to repair the repository lint failures. No dependency, database schema, canonical corpus, commit, push or Jira change was authorized or introduced by this remediation.

## Baseline and result

The fresh baseline was **1,199 errors and 374 warnings**. Earlier handoff notes reported 375 warnings; the new machine-readable baseline is the evidence for this task. The final full `npm run lint` run inspected 566 files, exited successfully and reported **0 errors / 366 warnings**. Remaining warnings are 306 unused-symbol findings, 35 hook-dependency advisories and 25 native-image advisories. This is an error-free lint run, not a warning-free repository.

No global `no-explicit-any` or React rule was disabled. Next's documented `rootDir` setting now points at `src/renderer`. The require-import exception is limited to actual CommonJS `.cjs` entry points and the two existing CommonJS Node scripts. Application TypeScript module loads were converted to imports. Existing generated/vendor exclusions remain in place.

## Changes

- Replaced explicit `any` with domain contracts, SQL projection row types, catalog wire types, PDF/parser/ZIP/dictionary declarations, inferred callbacks, or `unknown` at genuinely untyped boundaries. Error-message/code helpers narrow thrown values. Removed redundant casts that masked incompatible event handlers, incorrect API names and missing translation keys. These are TypeScript contracts, not new persisted fields.
- Moved the reader's empty-selection return after its hooks. Opening a book in the same mounted reader no longer changes hook order. OCR overlays and candidate selection also call hooks consistently.
- Prop-dependent form/selection/page state resets during guarded render adjustments instead of post-paint effects. Loan forms mount for the selected open record and initialize their dates/drafts once. External data arrives through asynchronous callbacks with cancellation guards where added. Optional preload-method checks still support partial/browser bridges.
- Audio listeners subscribe with current track state and release on cleanup. Recursive speech uses a named callback; the sleep timer stops playback from its timer callback. Text-only reading does not construct an audiobook element. A three-track regression verifies that playback does not repeat the second track.
- Corrected manual memo dependencies, immutable declarations, JSX escaping and DOM/typed-array boundaries. Added centralized Arabic/English labels for the existing annotation controls. Preserved native file images and the approved local-first architecture.

## Verification

- Full lint: **0 errors / 366 warnings**, exit 0.
- `npx tsc --noEmit`: passed.
- `npm test`: **966 passed, 0 failed, 0 skipped**. Includes `tests/reader/audiobook-track-lifecycle.test.ts`.
- `npm run build`: main and renderer production builds passed.
- `git diff --check`: passed; Git's existing LF/CRLF notices are not whitespace failures.
- Native dashboard `scripts/dashboard-live/run.mjs`, run `run-mVmyUS`: Arabic/English 480/1280 dashboard/notes, muted playback, hydration, and mounted empty-reader → selected-book transition passed with no renderer errors. New reader screenshots were visually inspected in both directions. The reader fixture intentionally uses a physical work without a local PDF, so this is not a PDF pagination/fidelity check.
- Native PDF workstation `scripts/pdf-workstation-live/run.mjs`, run `run-FLWqpy`: parser/IPC, bilingual 480/1280, encrypted setup without browser login and save scenarios passed with no renderer errors.

The first regression run failed because optional bridge methods were assumed present, an eager audio element was created in a text-only environment, and search statuses included ineligible providers. These regressions were corrected; the subsequent affected tests and full suite pass. The initial native startup failure exposed another missing method-specific capability check; it was restored before the successful native run. Tests were not weakened to accept these failures.

User experience changes are behavioral: stable reader selection transitions, correctly reset modal/page state, reliable audiobook progression and localized annotation tooltips. The existing layout and canonical metadata are preserved. Full warning remediation, live cloud/AI checks and portable PDF-runtime distribution remain separate from the completed lint-error remediation.
