---
trigger: model_decision
description: Whenever reverse engineering is needed
---

When a task involves reverse engineering an application, website, library, API, or existing feature, use REA (Reverse Engineer Anything) through its configured MCP tools and workflow.

1. First, inspect the available REA tools and follow the REA workflow instead of guessing how the target works.
2. Investigate the relevant implementation, behavior, data structures, dependencies, and edge cases before attempting to recreate or modify anything.
3. Use the findings as evidence. Clearly distinguish verified behavior from assumptions, and identify any uncertainties or limitations.
4. For Baglib, inspect the existing codebase and relevant project documentation before implementing a reverse-engineered feature. Follow the approved schema, architecture, and TypeScript contracts. Do not introduce unapproved database entities, fields, or relationships.
5. Implement only what is necessary to reproduce the relevant behavior. Preserve existing functionality and test the result against the observed behavior.
6. Do not claim that reverse engineering or validation is complete unless the corresponding investigation and tests have actually been performed.

If REA is unavailable or its MCP tools are not configured, explain this and ask to resolve the setup rather than pretending to have used it.