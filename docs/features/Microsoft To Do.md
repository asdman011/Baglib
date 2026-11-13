# Microsoft To Do

## 2026-11-13 investigation — Codex

Installed Microsoft.Todos 2.178.8571.0 was discovered through Get-AppxPackage. REA inspected the installed x64 Todo.exe resource tree, evidence `ev_05a9577e2db5b66ccd250e02c9c28fdf9b882cfd2fb9d19e32a2c43ba10589df`, SHA-256 `accdb054af899acb7f9bebdb8e9effb1e04148856207587fd7093ed83aba289f`. NETNATIVEBUILDINFO, version and manifest resources are present. Runtime UI, menu callbacks, internal task/list data structures and keyboard behavior remain unverified. REA’s native UI observation provider supports macOS, and the inspected Windows session cannot capture this app through that route. No app data or authentication state was read or changed.

The user’s screenshot description in the KEY-341 task specifies lists/groups, four quick-add menus, Enter and Ctrl+Enter, three panes and a calendar popup. BagLib implements these explicit requirements through its existing planner storage and notifications boundaries. Detailed evidence, assumptions, trade-offs and architecture mapping are maintained in [Tasks (To Do model)](feature%20-%20Tasks%20(To%20Do%20model).md).
