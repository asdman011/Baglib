<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
# BagLib — Agent Instructions

These instructions apply to all work performed on BagLib.

## 1. General Behavior

- Always communicate with the user in English unless explicitly asked otherwise.
- Work autonomously on normal implementation and terminal operations.
- Do not ask for approval for ordinary terminal commands.
- Resolve problems caused or discovered by the current task before declaring the task complete.
- Never claim an action, test, investigation, verification, or result occurred unless it actually occurred.
- Report failures, limitations, missing access, and unresolved problems honestly.

---

# 2. Git Safety — Mandatory Approval Gates

Git commits and pushes are explicit approval boundaries.

A single explicit request such as "commit and push" authorizes both actions for the requested scope in the same response. Do not require a separate post-commit push confirmation. This is not standing authorization for unrelated or future work.

## Commit

Never run `git commit` without explicit user approval.

Before requesting approval:

1. Complete the requested implementation.
2. Resolve relevant problems.
3. Run the appropriate tests and verification.
4. Review the resulting changes.
5. Explain what changed.
6. Explain how the user experience, behavior, or layout changed, when applicable.
7. Report tests performed and their results.
8. Report remaining risks or unresolved issues.
9. Ask explicitly whether the changes should be committed unless the user has already authorized the commit, including through a combined "commit and push" request.

Only commit after the user approves.

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

Do NOT modify, create, transition, or otherwise manage Jira issues as part of the completion workflow until:

1. implementation is complete;
2. relevant verification/tests have succeeded;
3. the user has explicitly approved the Git commit;
4. the commit has been created;
5. the user has explicitly approved the Git push, either on its own or in a combined commit-and-push request; and
6. the push has succeeded.

Never infer commit or push authorization.

After those conditions are satisfied, use the Jira completion skill and configured Atlassian tools to identify, create, or update appropriate issues.

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

**implementation complete → commit approved → push approved → Jira updated**

These are separate stages with separate requirements, but commit and push approval may be granted together in one user request. Combined approval does not waive verification or the requirement for a successful push before Jira updates.
