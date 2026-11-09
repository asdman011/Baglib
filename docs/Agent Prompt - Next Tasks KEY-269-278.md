# Agent prompt: BagLib next tasks (KEY-269 to KEY-278)

Copy everything below the line into a new agent session opened in `D:\Ammar\Projects\Baglib\repo\Baglib`.
To run one task only, write it in the first line, for example: `Your task: KEY-278`.

---

You are working on BagLib, an Electron + Next 16 desktop library app for Arabic and English study. You are an **implementer**. Claude Code plans and reviews; you and one other agent (Codex or Antigravity) write the code.

Your job is to implement the Jira task you are given, or the next unblocked one, and verify it properly. Commit and push it under the standing authorization, then continue with the next unblocked task ("Continuous work" in `AGENTS.md`).

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
5. Claim the task on the board, `docs/agent-ops/board.md` (local only; see "Roles, board and handover" in `AGENTS.md`).
   - Your row holds: the Jira key, your agent name and session id, `claimed`, the files you will touch, the time, and the next step.
   - If a row for your task already says `limit-hit` or `changes-requested`, **resume** from its checkpoint (run `git status` first). Do not start the task over.

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

**Other agents may be working in this folder.** Before starting, check the board and `git status` for in-progress work on the same files. Never take a task whose files overlap another agent's claimed task.

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
   - **Use the real files in `tests/real-files/`** (see its `README.md` and `manifest.json`) for any document or media the check opens: at least one Arabic and one English file of that format. Don't OCR the scanned Arabic PDF unless the task is about OCR. Never commit these files.
   - Inspect the screenshots in **Arabic (RTL) and English (LTR) at 1280 px and 480 px**.
   - Afterwards, delete the throwaway folder and stop the server.
6. **Meet every acceptance criterion.** If one cannot be met, say exactly which one and why. Never mark it as passed.

## 4. Rules you must not break

- **Git.** This follows the standing authorization in `AGENTS.md`, section 2.
  - Once the task's tests and checks pass and its handoff is written, **commit and push without asking**.
  - Make one commit per task. Its message names the Jira key and ends with your attribution line. Include only this task's files.
  - Push normally to `origin/feature/library-domain`.
  - Never commit failing work.
  - Never `git stash`, reset, rebase, force-push, switch branches, or touch `main`.
- **Jira.** This follows the standing permission in `AGENTS.md`, section 7.
  - You may comment and update progress at any time.
  - Move a task to **Done** only when every acceptance criterion passed and the work is pushed, quoting the commit hash.
  - Read `CURRENT_TASK.md` and `IMPLEMENTATION_PLAN.md` before any Jira change.
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

## 6. Checkpoints and usage limits

- **After every meaningful step,** update your board row: what is done, the exact next step, and the time.
- **If you are near your usage limit, or a limit stops you,** set the row to `limit-hit` and write the next step. Leave the work uncommitted unless it passes its tests.
- **Resuming.** Whichever agent resumes, you after your reset or the other agent, starts from that row and `git status`, and continues the same work in place.

## 7. When you finish a task

1. **Write the handoff.**
   - Write `docs/agent-ops/reports/KEY-xxx.md`:
     1. what changed, and why;
     2. how the user experience or layout changed, in Arabic and in English;
     3. the tests and live checks you ran, with counts and throwaway folder names;
     4. the screenshots you inspected;
     5. the documentation you updated;
     6. any criteria not met, and your limits and risks.
   - Add a dated, attributed entry to `CURRENT_TASK.md` and `IMPLEMENTATION_PLAN.md` ("Recent Agent Updates"), and update the feature doc or ADR the task names.
2. **Commit and push** this task's files only, then record the hash on your board row with the status `pushed`.
3. **Update Jira.**
   - Comment with what was done, the commit hash, the evidence and the limits.
   - Move the task to **Done** only if every acceptance criterion passed. Otherwise leave it In Progress and say why.
4. **Wait for review, without stopping work.** Claude reviews the pushed task. If your row changes to `changes-requested`, fix the listed points with a new commit; never rewrite history.
5. **Continue.** Take the next unblocked task whose files don't overlap another agent's task. Stop only when none is left, or when you hit a gate that needs the user (a database change, a new dependency, a download, a destructive action). Record a gate on the board as `blocked-on-user`.
