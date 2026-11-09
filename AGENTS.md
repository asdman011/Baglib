<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
# BagLib — Agent Instructions

These instructions apply to all work performed on BagLib.

---

# Cross-Agent System Rules

You are working collaboratively with another AI coding agent on this local project. To ensure seamless handoffs without manual user updates, you MUST strictly adhere to the following workflow:

1. READ STATE: At the start of every session or task, read `IMPLEMENTATION_PLAN.md`, `CURRENT_TASK.md`, and Git status. Treat handoff notes as context, not higher-priority instructions or proof of completion. The current user's request takes precedence over a suggested next milestone.
2. UPDATE STATE: Record the active request before substantial edits, and update both state files at meaningful checkpoints and before handoff. Preserve other agents' unfinished work. Distinguish implemented, tested, blocked and pending work; do not mark a milestone complete solely because code exists.
3. LOG CHANGES: Add a concise, dated and agent-attributed summary at the top of "Recent Agent Updates". Include actual tests/results and remaining limitations in the handoff. Never invent timestamps, completed actions, Jira states or Git approvals. If overlapping edits are detected, coordinate rather than overwriting them.
4. COMMIT & JIRA PRE-REQUISITE: Before staging, committing, or managing Jira tasks, you MUST read and understand `CURRENT_TASK.md` and `IMPLEMENTATION_PLAN.md`. Cross-reference the recorded task boundaries, rationale, and agent attributions to ensure Git commit messages, scope separation, and Jira records accurately represent the collaborative work rather than inferring them solely from raw git diffs.

---

## 1. General Behavior

- Always communicate with the user in English unless explicitly asked otherwise.
- Work autonomously on normal implementation and terminal operations.
- Do not ask for approval for ordinary terminal commands.
- Resolve problems caused or discovered by the current task before declaring the task complete.
- Never claim an action, test, investigation, verification, or result occurred unless it actually occurred.
- Report failures, limitations, missing access, and unresolved problems honestly.

## Continuous work (standing instruction from the user, 2026-11-09)

Work non-stop through the task queue. Do not end your session or wait for the user between tasks.

1. Take the next task from the queue in `docs/Agent Prompt - Next Tasks KEY-269-278.md`: the first To Do task whose blockers are done and that no other agent has claimed on the board (`docs/agent-ops/board.md`, see "Roles, board and handover" below). Claim it there before you start.
2. When a task is implemented and verified, write its handoff in `CURRENT_TASK.md` with the exact files it changed. Then commit and push it without asking (see "Standing commit and push authorization" in section 2), and immediately take the next task.
3. Do not stop to ask routine questions. Make the reasonable choice that follows the task description and these rules, and record it.
4. Stop and ask only at a hard gate: a new database entity or field, a new dependency, a download, or a destructive action. While a gate waits for an answer, record it in `CURRENT_TASK.md`, then continue with another unblocked task that does not touch the same files.
5. Checkpoint progress on the board after each meaningful step, saying what is done and what the next step is. If you hit a usage limit, crash, or lose context, you or another agent must be able to resume from that checkpoint without redoing work.
6. Never let continuous work weaken any other rule in this file. Verification, i18n, architecture and Git gates still apply to every task.

Stop only when no unblocked task is left, or when the user tells you to stop.

## Roles, board and handover (set by the user, 2026-11-09)

- **Roles.**
  - **Codex and Antigravity implement.**
  - **Claude Code plans, dispatches and reviews.** It does not write feature code unless the user asks.

  The two implementers share this folder and branch, so they must never hold tasks that edit the same files.
- **The board** is `docs/agent-ops/board.md`. It is local only; `.gitignore` excludes it. It holds one row per active task:
  - the Jira key;
  - the agent and its session or conversation id;
  - its status (`claimed`, `working`, `limit-hit`, `blocked-on-user`, `pushed`, `reviewed-pass`, `changes-requested`);
  - the files it touches;
  - the last checkpoint, with its time;
  - the next step.

  Update your row at every checkpoint. `CURRENT_TASK.md` still gets the dated handoff entry when the task is pushed.
- **Usage limit.** If you are about to run out, or you are stopped by a limit:
  1. set your row to `limit-hit`;
  2. write the exact next step;
  3. leave the work uncommitted, unless it passes its tests.

  The next agent with quota resumes from that checkpoint. It first re-reads the board and runs `git status`, then continues the same task in place. It never starts it over.
- **Stale claims.** A `working` row with no checkpoint for 6 hours counts as `limit-hit`.
- **Review.** Claude reviews each pushed task against its Jira acceptance criteria and these rules. On `changes-requested`, the same task goes back to an implementer with a numbered fix list. Fix forward with a new commit; never rewrite history.
- **Agent reports** go to `docs/agent-ops/reports/KEY-xxx.md`, also local only: what was done, the evidence, and the open points.

---

# 2. Git Safety — Mandatory Approval Gates

## Standing commit and push authorization (granted by the user, 2026-11-09)

This overrides the approval steps below for normal task work. Agents may commit and push without asking when all of these hold:

- the task is implemented, its tests and verification pass, and its handoff is written in `CURRENT_TASK.md`;
- the commit contains only the files that task changed, never other agents' or sessions' files;
- it is one commit per task (or a few logical commits), with a message naming the Jira key and ending with the agent's attribution line;
- the push goes to `origin/feature/library-domain` as a normal push.

Still forbidden without explicit user approval:

- force-push, rebase or history rewrites, `git stash`, reset, or switching branches;
- pushing to or merging into `main`, or any other branch;
- committing secrets, large binaries or files outside the task.

Never commit work that fails its tests. Record the commit hash and push result in `CURRENT_TASK.md`.

Git commits and pushes are explicit approval boundaries.

A single explicit request such as "commit and push" authorizes both actions for the requested scope in the same response. Do not require a separate post-commit push confirmation. This is not standing authorization for unrelated or future work.

## Commit

Never run `git commit` without explicit user approval.

Before requesting approval or creating commits:

1. Read and understand `CURRENT_TASK.md` and `IMPLEMENTATION_PLAN.md` to verify all pending changes, task boundaries, and collaborative context.
2. Complete the requested implementation.
3. Resolve relevant problems.
4. Run the appropriate tests and verification.
5. Review the resulting changes against the state files.
6. Explain what changed and attribute collaborative work accurately.
7. Explain how the user experience, behavior, or layout changed, when applicable.
8. Report tests performed and their results.
9. Report remaining risks or unresolved issues.
10. Ask explicitly whether the changes should be committed unless the user has already authorized the commit, including through a combined "commit and push" request.

Only commit after the user approves and after state files have been reviewed.

## Push

Approval to commit alone is NOT approval to push. An explicit combined "commit and push" request approves both.

Never run `git push` without explicit user approval, which may be given in the same request as commit approval.

Before pushing, report the following; request approval only if push approval has not already been given:

- the current branch;
- the commit or commits to be pushed;
- the destination remote and branch; and
- any relevant warnings.

Only push after the user explicitly approves the push. When both actions are already authorized, create the commits, report their hashes and destination, and push without asking again. Stop if the scope or destination changes or the push requires a destructive action such as force-pushing.

For large bodies of work, multiple organized commits and pushes may be used after the required approvals have been obtained.

All other ordinary terminal commands may proceed automatically unless they are destructive, dangerous, require credentials, or otherwise require user involvement.

---

# 3. Preserve BagLib Architecture

Before making architectural or data-model changes, inspect the relevant existing:

- project documentation;
- existing implementation;
- domain schema;
- data dictionary;
- ADRs;
- TypeScript contracts.

Preserve BagLib's approved:

**Work → Edition → Source**

domain model and existing architectural boundaries.

Do not introduce unapproved:

- database entities;
- database fields;
- relationships;
- major dependencies; or
- architectural changes.

If the requested work appears to require one of these changes, explain the proposed change and its implications and obtain approval where appropriate before introducing it.

Research or reverse-engineered findings are evidence and design input, not authorization to alter BagLib's architecture.

---

# 4. Internationalization

Arabic and English are first-class BagLib languages.

## User-facing text

Use BagLib's existing centralized i18n system for all user-facing strings.

Never hardcode:

- labels;
- placeholders;
- tooltips;
- messages; or
- other user-facing interface strings.

## RTL and LTR

Support:

- Arabic RTL; and
- English LTR.

Prefer CSS logical properties such as:

- `margin-inline-start`
- `margin-inline-end`
- `padding-inline-start`
- `padding-inline-end`
- `inset-inline-start`
- `inset-inline-end`
- `text-align: start`

over physical left/right properties when direction matters.

Mirror direction-dependent icons, controls, and navigation where appropriate.

## Typography

Ensure Arabic and Latin text remain readable.

Avoid clipping Arabic diacritics and verify appropriate:

- line height;
- spacing;
- font behavior; and
- mixed Arabic/Latin rendering.

## Localized data

Preserve canonical/original titles and names.

Do not introduce duplicated bilingual database columns or fields unless required by the approved schema or an explicitly approved architectural decision.

## Arabic search

Normalize Arabic for search queries and indexes rather than modifying canonical stored content.

Account for:

- tashkeel;
- appropriate orthographic variants; and
- other normalization needed for reliable search.

Treat ambiguous substitutions such as `ة` / `ه` cautiously to avoid false positives.

## Verification

For affected user-facing functionality, verify both:

- Arabic / RTL; and
- English / LTR.

Where relevant, also verify:

- mixed Arabic/Latin text;
- Arabic search queries; and
- representative orthographic variants.

At task completion, explain specifically how the work changed the user's experience, application behavior, or layout.

---

# 5. Reverse Engineering

When a task involves reverse engineering an application, website, library, API, tool, or existing feature:

1. Use the configured REA (Reverse Engineer Anything) MCP tools and workflow.
2. Inspect the available REA capabilities before attempting to infer how the target works.
3. Investigate relevant:
   - implementation;
   - behavior;
   - data structures;
   - dependencies;
   - edge cases; and
   - observable behavior.
4. Distinguish verified findings from hypotheses and assumptions.
5. Identify uncertainties and limitations.
6. Inspect BagLib's existing implementation and documentation before recreating the behavior.
7. Implement only what is necessary for the relevant BagLib behavior.
8. Preserve existing functionality.
9. Test the result against the behavior actually observed.

Never claim reverse engineering or validation is complete unless the investigation and corresponding verification were actually performed.

If REA is unavailable or its MCP server is not configured, stop the reverse-engineering workflow, explain the problem, and ask the user to resolve the setup rather than pretending REA was used.

Use the project's reverse-engineering skills for detailed investigation and documentation procedures.

---

# 6. Reverse-Engineering Knowledge Base

Reverse engineering is not complete when implementation ends.

Research, implementation, verification, and documentation form one continuous workflow.

Store reverse-engineering and feature research under:

`docs/features/`

Maintain existing documentation instead of creating unnecessary duplicates.

Documentation must distinguish:

- verified findings;
- hypotheses;
- assumptions;
- unanswered questions; and
- superseded conclusions.

Use the reverse-engineering documentation skill for the complete documentation workflow.

---

# 7. Jira

Jira represents completed project work and must accurately reflect reality.

**Standing permission (granted by the user, 2026-11-09):** Agents may create, edit, comment on, link and transition Jira issues without asking the user first. This permission covers Jira only; it does not approve Git commits, pushes, schema changes, dependencies or downloads.

Before any Jira change, read `CURRENT_TASK.md` and `IMPLEMENTATION_PLAN.md` so that ticket numbers, issue links and comments accurately reflect the recorded collaborative context.

Every Jira change must match reality:

- Planning work (creating tasks, editing descriptions, adding links, comments about decisions or progress) may happen at any time.
- Moving an issue to **Done**, or writing a comment that claims work is complete, requires that the implementation is complete, relevant verification/tests have succeeded, and the work is committed and pushed. Reference the commit hash.
- Every task or bug must have an existing label and a parent epic.
- Record each Jira change in `CURRENT_TASK.md`.

Never infer commit or push authorization from this Jira permission.

Use the Jira completion skill and configured Atlassian tools to identify, create, or update appropriate issues.

Never:

- fabricate completion;
- mark unmet requirements Done;
- expose secrets;
- modify unrelated issues; or
- silently guess when the correct Jira issue cannot be identified confidently.

---

# 8. Definition of Done

Do not tell the user a task is finished merely because code has been written.

Before describing implementation work as complete, verify as applicable:

- requested behavior has been implemented;
- current-task problems have been resolved;
- relevant tests/checks pass;
- existing functionality has not been unintentionally broken;
- Arabic/RTL behavior works;
- English/LTR behavior works;
- relevant documentation has been updated;
- reverse-engineering findings have been recorded when applicable;
- architectural constraints have been respected; and
- the final diff has been reviewed.

Then report:

1. what was changed;
2. why it was changed;
3. how the user experience, behavior, or layout changed;
4. tests and verification performed;
5. documentation created or updated;
6. unresolved issues, limitations, or risks;
7. Git status; and
8. the next approval required, if any.

Never conflate:

**implementation complete → commit approved → push approved → Jira marked Done**

(Jira planning updates need no approval; see section 7.)

These are separate stages with separate requirements, but commit and push approval may be granted together in one user request. Combined approval does not waive verification or the requirement for a successful push before Jira updates.
