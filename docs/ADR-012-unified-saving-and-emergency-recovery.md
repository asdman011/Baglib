# ADR-012: Unified saving, one emergency copy, BagLib-owned PDF annotations

## Status

Accepted in part by the user on 2026-11-05: one new table (`material_save_state`) with this ADR; the single emergency copy replaces accumulating restore points for every write to a library file; PDF writing uses pikepdf (qpdf 12) from the optional PDF engine, not a new npm dependency (pdf-lib was offered and declined). This does not authorize downloads, commits, pushes or Jira changes.

## Context

BagLib records marks and notes in its database (knowledge items, comment threads; ADR-008 history). PDFs were never changed by marking; full-file operations (OCR, compression, page edits) were published with a new timestamped restore point each time (`pdf-editor/versions.ts`), so copies accumulated. Users asked for marks to be written into the working PDF on a policy they choose, for exactly one recovery copy, for undo that survives a restart, and for exports that include only chosen additions.

## Decision

### Two states, named separately
- **Recorded in BagLib**: every mark and note is in the database as soon as it is made (unchanged behavior). This is authoritative.
- **Saved into the file**: BagLib's additions written into the working PDF. A material has *pending* changes when the digest of its current BagLib additions differs from the digest last written.

### Save policy (setting `save.policy.v1`)
`after-change` (default), `interval` (minutes, 1–120), or `manual`. Ctrl+S and Save write immediately in every mode. After-change waits until an editing action is complete (a mark is saved, a drawing finished, a comment saved) and groups bursts with a short quiet period, so no write happens per keystroke or mouse move. Interval mode writes only when something is pending. Supported material: PDF files of library books. EPUB and other formats are not written (they are never described as editable).

### Ownership of annotations in the PDF
Each written annotation carries `/NM (baglib:<knowledge id>[:<part>])` and a private key `/BagLibOwned true`. A save removes every annotation with that ownership and writes the current set, so repeated saves never duplicate and deleted marks disappear. Annotations without the marker (made in Acrobat or elsewhere) are never touched. Marks are real annotations (Highlight, Underline, StrikeOut, Square, Circle, Line, Ink, FreeText, Text with IRT replies), never flattened into page content. Bookmarks are written as outline items whose title is prefixed by nothing but recorded in `/BagLibOutline` on the item; page notes and questions as Text annotations with their own subtype tag in `/BagLibKind`. Each save is a full rewrite (no incremental update), so earlier revisions of BagLib additions do not remain inside the file.

### One emergency copy per actively edited file
- Path: `<backup folder>/<source id>.emergency.pdf`; the folder defaults to `<userData>/emergency-copies` and is user-selectable (`save.backupFolder.v1`).
- Created or rotated only when a write to the file is about to happen; opening creates nothing.
- Content: the file as it was before the latest successful write (A → save B → copy holds A; save C → copy holds B).
- Rotation order: copy the current file to `<source id>.emergency.next.pdf`, verify its hash, publish the new file atomically (existing `publishPdfOutput`, without its own backup), then rename `.next` over the emergency copy. If publication fails, `.next` is removed and the old copy is untouched. If BagLib stops between publication and rename, the next launch finds `.next` and records an incident instead of guessing.
- Expiry: 24 hours after the last successful save, checked hourly while running and at launch. A copy whose material has an unresolved incident is kept until the user resolves it.
- Full-file operations (OCR, compression, page edits, version restore) use the same copy. Existing timestamped restore points are kept and still listed; nothing removes them except the user's explicit delete.

### Persistent undo
Undo/redo (Ctrl+Z / Ctrl+Shift+Z) walks the knowledge history (ADR-008 `entity_version`) of the marks and notes of the open material, newest first, so it works after a restart. Undoing a creation trashes the item; undoing an edit restores the previous revision (appending a version, never discarding one); undoing a trash restores. The redo stack is stored in `material_save_state.redo_json`. Undo and redo are ordinary pending changes under the save policy. Restoring the emergency copy is a separate, explicit recovery action, never undo.

### Selective export
An export starts from the working file, removes every BagLib-owned annotation and outline item and BagLib keys in document info and XMP, then writes only the chosen categories (text marks, shapes, text boxes, comments and pins, replies, questions, bookmarks, page notes) filtered by page, colour and type, as a full rewrite with no incremental history. Annotations from outside BagLib and page content are preserved. The working file and the database are not changed.

## Lifecycle implementation note — 2026-11-07

Recovery now runs after database migrations, before the reader opens. Core material-save/PDF-editor IPC is admitted through a tracked task gate; confirmed shutdown stops new admission, drains accepted work and maintenance, then closes SQLite. Main-window close consent precedes admission shutdown so app-level Quit can still Cancel or Save. The PDF sidecar's early before-quit cleanup was removed; confirmed shutdown still awaits it. This changes no schema, retention or export policy.

Automatic writes now wait for the persisted save policy. Manual Only is not temporarily treated as the default After Change during loading/reopen. A newer policy event supersedes an older pending read; queued automatic writes are cleared on policy/book changes. Ctrl+S stays explicit and immediate.

Verification: task-gate/policy regressions, final1406/1406 suite, tsc/build/lint, native delayed-write shutdown audit compare-live-90szyi, and real explicit-page-note saving/Quit-Cancel(en)/Quit-Save(ar) in save-live-MYaqV0. The latter preserves outside annotations and exactly one emergency copy with the previous file's hash. The old all-mark fixture still encounters additional legacy quote notes after highlights; broad undo/restart behavior is not certified by these lifecycle checks. No data was deleted to satisfy a test.

## Reader canonical-save follow-up — 2026-11-07

Inspection traced the extra quote notes to `FullPageBookReader`: one selection called `knowledge.save`, wrote another annotation separately, then created a legacy page note. `SqliteKnowledgeRepository.saveKnowledge` already writes the same-ID annotation projection atomically with its knowledge row. New reader selections and explicit notes now use that canonical save once, with `quotedText`/`contextNote` matching the shared contract; the returned item supplies local display state and the existing notes-refresh event. Existing records are not deleted or rewritten.

`MarkHistoryService` orders batches by append sequence rather than timestamp/random batch ID, and redo invalidation checks only the current material. This does not claim a complete redesign of branching undo semantics. Regression tests cover same-time actions, another material's undo, one canonical save/projection/history revision, failed saves and preservation of existing notes. The full suite passes 1408/1408; type checking and main build pass; reader lint has no errors and 59 existing warnings. The native full save check is in progress; the earlier duplicate-note limitation above describes the pre-fix run, not the new-save implementation.

Native follow-up: `save-live-58VTJm` passes Manual/Ctrl+S, one previous-file-hash-verified emergency copy, after-change saving, undo twice, redo after process restart, one-minute interval, Cancel and Close without writing while retaining database marks. The harness now dispatches shortcuts on the focused element, like browser events, rather than Window. The subsequent same-session reopen has a blank canvas; selective export and Arabic stages were not reached. The full native flow therefore remains incomplete, with no renderer console errors recorded in that run. No existing knowledge was removed.

### Correction and full native verification

The apparent reopen failure above was not the same book: diagnostic run `gpNTdm` recorded the seeded Tabari work as CURRENT BOOK. The fixture's global leaf-text selector matched its title in the recent-book sidebar, climbed outside the intended card and opened the first other Read button. The harness now targets the exact fixture heading inside its card and retains failure diagnostics. No viewer modification was warranted by this evidence.

Corrected full run `save-live-UD27MP` passes both processes and final file inspection: same-book reopen, persistent undo/redo, all three save modes, one emergency copy, Cancel/Close without writing while retaining marks, clean export with zero owned/one foreign annotation, selected text-mark export with four owned/one foreign annotation, working PDF unchanged by exports, Arabic RTL info/export/close controls, window Cancel then Save writing five marks. No renderer console errors were recorded. Arabic export screenshot inspected; harness lint/diff-check pass. This supersedes the blank-reopen and export/Arabic-not-reached limitations above; it does not certify arbitrary branching undo or unrelated subsystem shutdown.

### Undo shortcut routing — 2026-11-07

The reader now uses the shared shortcut guard for mark undo/redo: text inputs, editable content, CodeMirror and dialogs keep their own keys; an open dialog also blocks background mark history even if focus escapes it. Already-handled, repeated and Alt-modified keys are ignored. A ref admits only one history request at a time across rerenders, and rejected requests use the existing localized failure notice. The guard tolerates non-element event targets instead of assuming `closest` exists. No stored history/schema changed. More general abandoned-branch traversal remains a separate issue, not claimed fixed here.

Verification checkpoint: 8 focused tests and full1409/1409 suite, final type check, scoped lint0errors/59existing reader warnings. Native follow-up is pending; its first attempt failed before dialog checks because a text-layer span was not ready after restart. The harness now waits for the required third span rather than assuming any populated text layer is sufficient.

Final native `save-live-ciw4yl` passes the full bilingual save/restart/export flow plus new assertions that Ctrl+Z inside the English and Arabic export dialogs leaves underlying marks unchanged. Both processes exit successfully and final file inspection finds five saved marks. Rapid/rejected history IPC and arbitrary branch traversal were not natively certified.

### Confirmed service cleanup — 2026-11-07

Source audit found digital metadata extraction, PDF page covers/cloud connector, Quran, Sunnah/native sharing, poetry provisioning, Athan and Khatmah reminders still disposed on `before-quit`, even if the reader cancelled Quit. These callbacks now register with `services/quit-cleanup.ts`; main runs/awaits the registry after material-save drain and before closing SQLite. The registry is inert during consent, runs once, isolates callback failures, supports unregister and drains callbacks registered by ongoing cleanup. Quran's returned asynchronous disposal is awaited. Native sharing removes its registration when its child exits. The main consent handler is now the only source `before-quit` listener.

Verification:1411/1411 tests, type check/main build, lint0errors/0warnings and diff-check; native disposable `save-live-ed5shI` passes English app-Quit Cancel, Arabic app-Quit Save, foreign-annotation preservation, two written marks and exactly one previous-file-hash emergency copy. Server stopped and3000free. No actual reminders, native share, cloud transfer or Quran download was exercised; this is not certification that every service's in-flight work drains. No schema/dependency changes or real-library access.

## Schema

Migration 025 adds:

```
material_save_state(
  source_id        TEXT PRIMARY KEY REFERENCES source(id) ON DELETE CASCADE,
  file_sha256      TEXT,      -- hash of the file after BagLib's last write; a different hash means an outside change
  written_digest   TEXT,      -- digest of the BagLib additions last written
  last_saved_at    TEXT,
  backup_path      TEXT,      -- the one emergency copy, if any
  backup_expires_at TEXT,
  incident         TEXT CHECK(incident IN ('interrupted','corrupt','external-change')),
  incident_at      TEXT,
  redo_json        TEXT,      -- redo and discarded branch IDs for persistent undo
  updated_at       TEXT NOT NULL
)
```

No other table or column changes. Work → Edition → Source is preserved: state belongs to the Source that owns the file.

## Consequences

- Writing into PDFs requires the PDF engine's Python (pikepdf). Without it, marks stay recorded in BagLib and the save state says the file cannot be written; nothing is lost.
- External viewers differ in how they show Arabic text in annotations, replies and resolved status.
- Canonical Quran, hadith and poetry corpus text is never written by this mechanism.

## Linear mark history and undo scope — 2026-11-09, KEY-269

### Traversal and branch rule

Each completed user batch is one step. Ordering uses SQLite append sequence (MAX(entity_version.rowid)), including batches sharing a timestamp. Undo applies every affected item in the batch for the current book. Baselines supply the previous state and are excluded from the action list. Creation is undone by trashing, trash by restoring, and redo reapplies the recorded result. Book-linked study_note records remain eligible when Notes promotes a page note.

Recording a real user batch invalidates that book's redo inside the same database transaction as its snapshots. The existing material_save_state.redo_json holds { redo, discarded } arrays. Invalidation moves the redo IDs to discarded before clearing redo. Both lists exclude batches from future undo selection, so the sequence undo A, create C, undo C, redo C, redo cannot revive A. Historical versions remain available through ADR-008. No-op and failed saves preserve the previous branch. Other books retain independent state. Existing array-form redo_json values remain readable.

The previous 500-batch query limit and 200-entry redo truncation are removed. The state grows with retained history. All entries remain reachable. A lightweight legacy-store freshness check remains for callers implementing the older injected RedoStore interface without discarded-batch support. The production store invalidates at recording time. Undo/redo snapshots and the durable stack update share one SQLite transaction.

### Preference and feedback

The existing settings key undo.scope.v1 accepts book (default) or reader. Save settings exposes both choices and an InfoTip in Arabic and English. Main reads the preference on each operation. Reader scope selects only entity_version.actor = reader. Earlier versions with a null actor are skipped. When a newer active batch touches the same item, reader scope rejects the older step with typed history-unappliable feedback, preserving the newer edit. This conflict policy was chosen during implementation to protect edits from the skipped view.

Feedback names the item kind, the action and its origin. Null/other origins are described as Notes or another screen. Comments, replies, resolution/reopening, edits and removal already use withKnowledgeHistory and participate as full snapshots in book scope. Canonical reader saves, shape/text/color edits, deletion and reader comment actions explicitly tag entity_version.actor as reader through their shared contracts, preload and main boundaries. Notes and other callers retain their existing untagged origin. Invalid actor values are rejected before mutation.

### Implementation and verification

The dispatcher approved the actor-plumbing file-scope extension. The earlier incomplete reader-only checkpoint is superseded. Three normal-entry-point actor regressions failed before plumbing and now pass. Twenty targeted tests cover discarded branches, service reconstruction, scope/conflict behavior, comments, multi-item/same-time batches, invalid actor refusal, rollback/no-op invalidation, independent books, legacy stacks, 502 undo/redo steps and real PDF ownership after Save. Final collaborative full suite passes 1438/1438, type check/main build pass, changed-code lint has zero errors and 60 existing warnings, and diff check passes.

Native save-live-L3Vq0b passes two actual Electron launches, en and ar, including exact empty-redo notices, Notes-screen CodeMirror edits, scope selection across restart, tagged reader undo preserving a newer Notes edit, actual pin comment UI undo/redo and reader delete IPC undo. Save inspection after reader undo/redo shows 1/2 owned annotations in English and 5/6 after restart in Arabic, preserving one foreign annotation. Final inspection finds 8 unique owned annotation names and 1 foreign. The fixture waits for Recorded before Ctrl+S and actual rewritten counts before inspection. Settings screenshots were inspected in Arabic RTL and English LTR at 1280 and 480 px. Profiles were removed and the session renderer stopped. Evidence and limits are in the local KEY-269 report.

## FreeText appearance consequence — 2026-11-09, KEY-270

FreeText annotations now retain their original Unicode `/Contents` and `/DA` and gain a removable `/AP /N` Form using HarfBuzz-shaped Noto Naskh Arabic v2.021 for Arabic and DejaVu Sans for Latin/fallback. `TextAppearances.appearance()` and `finish()` share one subset per font across a save, embed Type0/CIDFontType2 fonts with widths, CIDToGIDMap and ToUnicode, preserve logical text-operator order and provide `/ActualText`. Wrapping, neutral punctuation/numbers, combining marks including U+06E1, RTL/LTR alignment and cropped-page rotations are covered by the focused tests. The base engine installs the approved `uharfbuzz==0.57.0` and `fonttools==4.68.0` wheel pins from the separate `requirements-shaping.txt`, with the same hashes as the OCR requirements. Setup installs this file with `--require-hashes` after each base install, in both the development venv and embedded package target. The legacy base `requirements.txt` stays byte-for-byte equal to HEAD, avoiding pip hash-mode requirements for its existing dependency closure. Missing shaping imports preserve the previous annotation-only save and return a `freetext-appearance-unavailable` warning in writer JSON. Existing ownership, foreign annotations, source boundaries and save/publication policy continue to apply.

Only `NotoNaskhArabic-Regular.ttf` (291,980 bytes) and `OFL.txt` (4,381 bytes, SIL Open Font License 1.1) are added. The official `NotoNaskhArabic-v2.021.zip` is 2,922,060 bytes with SHA-256 `6c050ab9bd087d69b733c505a7576e60c528c2f33cd7b91005a5bd7da4514032`. The existing electron-builder PDF resource wildcard includes both files. Six focused tests verify exact source reconstruction through ToUnicode after ignoring FEFF component fillers, repeat-save font/pixel stability, foreign annotations, fallback, packaging, wrapping and crop/rotation. PDFium 2x PNGs were visually inspected. A separate geometric extraction experiment with appearances projected onto page content reorders some Arabic combining sequences in PDFium/PDF.js, so that experiment does not certify arbitrary viewer copy order. Annotation Contents and the direct ToUnicode source reconstruction are exact. Explicit bidi embedding/isolate controls are outside the ordinary Arabic/Latin run resolver. See `docs/features/PDF and Notes Experience Plan.md` and the local KEY-270 report for evidence and install dry-run results. Official font source is the [Noto Arabic release](https://github.com/notofonts/arabic/releases/tag/NotoNaskhArabic-v2.021).
