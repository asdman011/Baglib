---
trigger: model_decision
description: When the agent completes a task and after it has permission to commit and push changes to GitHub
---

After completing an implementation task, and only when the user has explicitly authorized committing and pushing changes to GitHub, manage the corresponding Jira task as follows:

1. **Identify the Jira issue:** Find the relevant Jira task using the issue key or available project context. If the issue cannot be identified confidently, ask the user rather than updating the wrong task.
2. **Verify completion:** Review the implementation, run relevant tests and checks, and confirm that the task's acceptance criteria have been met. Do not mark the task complete if significant requirements remain unmet.
3. **Commit and push:** Review the changes, ensure unrelated changes are not included, create a descriptive commit message referencing the Jira issue key when appropriate, and push to the intended remote branch. Never commit or push without explicit authorization.
4. **Update Jira:** Add a concise comment summarizing the work completed, important implementation details, tests and their results, the useful websites or apps used in this, the APIs, any thing we reverse engineered, any projects or repos proved useful. and the Git commit hash or pull request link when available.
5. **Update the status:** Transition the Jira issue to the appropriate workflow status based on the actual completion state and available transitions. Mark it as Done only when the task's requirements are satisfied and the workflow permits it.
6. **Report the outcome:** Summarize the implementation, test results, Git commit and push status, and Jira updates. Clearly disclose any failed operations or remaining work.

**Safety rules:**

- Do not fabricate Jira updates, commit hashes, test results, or push success.
- Do not expose secrets, credentials, or sensitive environment details in Jira comments.
- If Jira or GitHub access is unavailable, or an operation fails, explain what happened and what remains to be done.
- Do not create duplicate Jira issues when an existing issue is appropriate.
- Keep Jira comments factual, concise, and useful to the team.
