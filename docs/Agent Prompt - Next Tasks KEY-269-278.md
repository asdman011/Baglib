# Agent prompt: BagLib next tasks (KEY-269 to KEY-278)

Copy everything below the line into a new agent session opened in `D:\Ammar\Projects\Baglib\repo\Baglib`.
To run one task only, write it in the first line, for example: `Your task: KEY-278`.

---

You are working on BagLib, an Electron + Next 16 desktop library app for Arabic and English study. Your job is to implement **one** Jira task from the queue below, verify it properly, and hand it back for approval. Do not start a second task unless the user tells you to.

## 1. Before anything else

1. Read `AGENTS.md`, `CURRENT_TASK.md`, `IMPLEMENTATION_PLAN.md` and `git status`. Treat handoff notes as context, not proof.
2. Open your task in Jira:
   - Atlassian cloudId `a2098135-5892-4bd4-859e-421d9973e876`, project `KEY`.
   - Read the whole description. It contains these sections:
     - Order and dependencies
     - Decisions already made by the user
     - Map
     - Current state
     - Approach
     - Out of scope
     - Acceptance criteria
     - Verification
     - How to work
     - Constraints
     - Known workarounds
   - Also read the task's issue links.
3. The **Decisions already made by the user** section is binding. Do not ask about those again, and do not change them.
4. Read every file in the task's **Map** before you edit anything. Before you write renderer code, read the relevant guide in `node_modules/next/dist/docs/`, because this Next.js version differs from older ones.
5. Add a dated, agent-attributed entry at the top of `CURRENT_TASK.md`, for example "<task title> — YYYY-MM-DD, <your agent name> (in progress)".

## 2. Which task to take

Work in this order. Take the first task that is still **To Do** and whose blockers are Done:

| # | Task | Blocked by | Safe to run alongside |
|---|---|---|---|
| 1 | KEY-278 Repair dashboard-live; make note-editor-live self-contained | — | 269, 270 |
| 2 | KEY-269 Undo branching and the undo-scope option | — | 270, 278 |
| 3 | KEY-270 Arabic text boxes in other PDF viewers (Noto Naskh, shaping) | — | 269, 278 |
| 4 | KEY-273 Organizer drafts, recovery button, Arabic replace | — | 277, 276 |
| 5 | KEY-277 `baglib:` deep links and single-note export | KEY-278 | 273, 276 |
| 6 | KEY-276 Assistant: Warsh ayahs, tafsir, translations | KEY-278 | 273, 277 |
| 7 | KEY-275 Review uncertain OCR words | — (related to KEY-258) | 274 |
| 8 | KEY-274 EPUB markup and Marks list | KEY-269 | 275 |
| 9 | KEY-272 Accessibility check and reflow read-aloud | — (related to KEY-155) | 271 |
| 10 | KEY-271 Stamps, measure, saved actions | KEY-270 | 272 |

**Never run these pairs at the same time**, because they edit the same files: KEY-269 with KEY-274, and KEY-273 with KEY-271.

**Other agents may be working in this folder.** Before starting, check `CURRENT_TASK.md` and `git status` for in-progress work on the same files. If you find any, coordinate rather than overwrite.

## 3. How to do the work

1. **Test first.** Write or extend a unit test that fails for the missing behavior. Run one test file with `node scripts/test-runner.js tests/<path>.test.ts`.
2. **Implement** only what the task's Approach and Acceptance criteria describe. List anything else you notice as a follow-up; do not fix it.
3. **Text and layout.**
   - Every user-facing string goes in `src/renderer/translations.ts` under both `ar` and `en`; the key-parity test fails otherwise.
   - Use logical CSS properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`).
   - Mirror direction-dependent icons.
   - Do not clip Arabic tashkeel.
4. **Static checks**, all of which must pass:
   - `npm test`: 1415 tests passed at commit 159aed6; report your new count.
   - `npx tsc --noEmit`
   - `npx eslint <changed files>`, with 0 errors
   - `npx tsup` (main build)
   - `git diff --check`
5. **Live check in the real app:**
   - Free port 3000 with `node scripts/ensure-port-free.js`.
   - Start the renderer in the background with `node node_modules/next/dist/bin/next dev src/renderer -p 3000 -H 127.0.0.1`.
   - Build main with `npx tsup`, then run the task's `node scripts/<name>-live/run.mjs`.
   - The harness must use a throwaway folder under `.baglib-data/`, passed as `BAGLIB_DATA_DIR` and `--user-data-dir`.
   - Inspect the screenshots in **Arabic (RTL) and English (LTR) at 1280 px and 480 px**.
   - Afterwards, delete the throwaway folder and stop the server.
6. **Meet every acceptance criterion.** If one cannot be met, say exactly which one and why. Never mark it as passed.

## 4. Rules you must not break

- **Git.**
  - Never `git commit` or `git push` without the user's explicit approval. "Commit and push" in one message approves both.
  - Never `git stash`, reset, force-push or switch branches.
  - Commit only the files you changed. The branch is `feature/library-domain`.
- **Jira.** Never change Jira (status, comments, edits) until:
  1. the user has approved the commit and push;
  2. the push has succeeded;
  3. you have re-read the state files.
- **Approvals.** Ask the user before:
  - any new database table, column or relationship;
  - any new npm or Python dependency;
  - any download (name the file, its use and its size), except the downloads a task already lists as approved.
- **Data model.** Keep **Work → Edition → Source** intact. Use the existing settings store for small preferences and drafts, as the tasks describe.
- **User data.** Never open or change the user's real library or installed data. You may read installed Quran packs read-only to copy them into a throwaway profile. Never write to the originals.
- **Other sessions' files.** Leave these alone:
  - `.claude/`
  - `docs/features/Dataset Delivery Plan.md`
  - `docs/features/feature - Sunnah Chapter Names.md`
  - `scripts/sunnah-names-live/`
  - the untracked `tools/hadith-alignment/` patches and tests.
- **PDF writing (ADR-012).**
  - Marks are real annotations owned by BagLib (`/NM baglib:<id>`, `/BagLibOwned`). Never flatten them, and never touch annotations made elsewhere.
  - There is exactly one emergency copy per file.
  - Writes happen only on Save, from staged output.
  - EPUB files are never written.
- **Corpus text.** Canonical Quran, hadith and poetry text is read-only, and every assistant quote is checked against installed text.
- **Honesty.** Never claim that a test, check or result happened unless it did. Report failures and limits plainly.

## 5. Known pitfalls on this Windows machine

- **CRLF.** Many files use CRLF line endings. Use an editor tool, or normalize line endings before regex replacements.
- **Quoting.** Inline PowerShell and bash scripts break on Arabic text or `\p{…}`. Write the script to a temp file and run that.
- **Build.** Never run `npm run build:renderer` while the dev server is running; it overwrites `.next`.
- **Live harness timing.**
  - Call `win.show(); win.focus(); win.webContents.focus()` before keyboard or tooltip checks.
  - Dispatch shortcuts on the focused element, not on `window`.
  - After any PDF rewrite, wait for `.textLayer span` again.
  - Find fixtures by their exact heading inside the card, not by global text.
- **PDF engine Python.** It is at `.baglib-data/pdf-engine/venv/Scripts/python.exe` (pikepdf 10.17, with uharfbuzz, fonttools and pypdfium2).
  - pikepdf `Name()` needs a leading `/`.
  - Appearance streams use BBox equal to the annotation rect, with an identity matrix.
  - Unicode written by pikepdf is hex-encoded, so walk the objects instead of byte-searching.
- **Engine jobs.** Poll for output for up to 60 s; 10 s is too short.
- **Installed tools.** Tesseract (with `ara` and `eng` data), veraPDF, Java, Stirling and PaddleOCR-VL are already in `.baglib-data/`. Don't reinstall them.

## 6. When you finish

1. Update `CURRENT_TASK.md` and `IMPLEMENTATION_PLAN.md` ("Recent Agent Updates", dated and attributed) and the feature doc or ADR the task names. Keep implemented, tested and not-verified work separate.
2. Report to the user:
   1. what changed, and why;
   2. how the user experience or layout changed, in Arabic and in English;
   3. the tests and live checks you ran, with counts and throwaway folder names;
   4. the documentation you updated;
   5. any criteria not met, limits and risks;
   6. `git status`;
   7. the question: "Commit and push?"
3. Only after the push succeeds, update the Jira task with a short comment (what was done, commit hash, evidence, limits). Move it to Done only if every acceptance criterion passed; otherwise leave it In Progress and say why.
