---
trigger: model_decision
description: When the agent completes a task and after it has permission to commit and push changes to GitHub
---

# Rule: Reverse-Engineering Documentation and Jira Management

## 1. Document Reverse-Engineering Findings

Store documentation in `docs\features\`.

- Create a Markdown file for each investigated tool, application, website, or project. Update existing files rather than creating duplicates.
- Record implementation details, source paths, functions, APIs, evidence, limitations, and lessons for Baglib. Distinguish verified facts from assumptions.
- For features investigated across multiple tools, create or update `feature: <Feature Name>.md`, comparing approaches, trade-offs, and the best fit for Baglib.
- Keep documentation updated as findings evolve. Correct outdated information and cross-reference related documents.
- Record only work actually performed. Check Baglib’s schema, data dictionary, ADRs, and architecture before applying findings. Do not introduce unapproved entities, fields, relationships, or dependencies.

## 2. Jira Task Management

**Only manage Jira tasks after a feature has been implemented, verified, committed, and successfully pushed to GitHub—and only when I have explicitly authorized the commit and push.** Never assume that authorization.

### Identify and manage tasks at your discretion

- Search Jira using the issue key, feature name, project context, acceptance criteria, and related documentation.
- **You have the freedom to decide whether to create new tasks or update existing ones whenever appropriate** to accurately track the completed work. Avoid duplicates and unrelated changes.
- If the correct existing task cannot be identified confidently, ask me before modifying it.
- For existing tasks, you may refine titles and descriptions, update acceptance criteria and implementation notes to reflect actual results, add links to documentation/commits/PRs, and change status according to the actual completion state and available workflow transitions.
- Create new tasks when they are the appropriate way to track the work, including distinct deliverables that deserve separate tracking.

### Record and report completion

- Verify implementation, tests, and acceptance criteria. Do not mark work Done if significant requirements remain unmet.
- Comment on the relevant task with a concise summary of implementation, tests, useful websites/apps/APIs, reverse-engineered techniques, relevant projects/repos, documentation, and commit hash or PR link when applicable.
- Report tasks created or updated, status changes, and any failed actions.

## 3. Safety and Accuracy

Never fabricate results, claim unmet requirements are complete, expose secrets, or modify unrelated tasks. Report access failures and incomplete actions honestly. A successful push alone does not prove the feature is complete or verified.