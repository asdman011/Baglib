# Tasks (To Do model)

## Investigation — 2026-11-13, Codex

### Verified evidence

`Get-AppxPackage *Todos*` identified Microsoft.Todos 2.178.8571.0 at `C:/Program Files/WindowsApps/Microsoft.Todos_2.178.8571.0_x64__8wekyb3d8bbwe`. REA `binary_session` reported native macOS UI observation unsupported on this Windows host and Ghidra unconfigured. REA `inspect_pe_resources` inspected `Todo.exe`, SHA-256 `accdb054af899acb7f9bebdb8e9effb1e04148856207587fd7093ed83aba289f`, a 23,040-byte PE32+ x64 image. Evidence `ev_05a9577e2db5b66ccd250e02c9c28fdf9b882cfd2fb9d19e32a2c43ba10589df` inventories NETNATIVEBUILDINFO, version and manifest resources. This establishes artifact identity and static resource structure. Its opaque payloads provide no verified task model or menu behavior.

### Screenshot-derived requirements and unknowns

The actual screenshot files were not supplied in this session. The dispatch's description specifies a start-side list/group pane, central task rows and bottom quick-add, end-side details, due/reminder/repeat menus, Enter to add, and Ctrl+Enter for description. Treat these as user requirements. To Do runtime keyboard behavior, internal schema, recurrence and delivery implementation remain unverified. Windows native UI observation needs a supported provider to certify those aspects. The task explicitly permits implementing the described model when that observation is unavailable.

### Application to BagLib

Existing `study-planner.ts`, migration 020, planner repository and guarded IPC own tasks independently of Work → Edition → Source. ADR-007 and the data dictionary describe local civil dates and persistent source labels. The user approved task lists and four task columns on 2026-11-12. Migration 027 extends this boundary. Groups use the approved nullable group_name on lists. Notifications reuse NotificationService and its settings-backed history, suppression and native Windows sink. Reference navigation preserves reading profile identity and saved canonical labels. Gregorian and Hijri remain display projections of local civil dates.

### Trade-offs

A group is a name shared by lists. Empty groups and group ordering reuse an existing app_settings string-array value, since the approval includes no group entity. Completion and next-occurrence creation must be one transaction. Retry protection uses deterministic successor identity and existing optimistic revisions. Clamped calendar month/year dates need a stable anchor in recurrence JSON to retain the intended day after February. Reminders run while main is running, with overdue delivery on restart through durable history deduplication. Native OS presentation is controlled by Windows and existing quiet/focus suppression.

## Implementation and verification

Migration 027, validated list/task API, transactional recurring completion, main reminder scheduler and responsive three-pane planner are implemented. 52/52 focused and compatibility tests pass. TypeScript, scoped lint and main build pass. Native planner and source-link checks passed in Arabic and English at 1280 and 480. The final full suite passes 1975/1975 with concurrency two. The original To Do runtime remains unverified. See [Microsoft To Do](Microsoft%20To%20Do.md) for the per-application investigation.


### Implemented details

The start pane supports default/custom lists, My Day, All, search, empty/folding groups and a subject filter. The centre has circular completion controls and the bottom quick-add. The end pane keeps start date, description, priority, status and source references alongside the new fields. The calendar popup retains the old three periods and both calendars, adds a selected-day task list and opens existing tasks from that list. Groups retain empty names/order in app_settings; deleting a list moves tasks transactionally. Native keyboard tests led to explicit Enter handling and uncovered a stale dialog close event, now fixed. A consumed notification target prevents deleted-task reload loops.

Main reminders use the actual existing Windows Notification sink and notificationHistory. Native tests exercised Notification.show and simulated its click event. Physical OS toast clicks and To Do’s own UI execution remain outside the verified evidence. Weekdays are Monday–Friday, and selected-day custom weekly rules use Monday-based intervals. Month-end anchors and durable delivery markers are documented in ADR-007 and the data dictionary.


### Compatibility follow-up

The first full suite found the old Quran Wird fixture’s missing schema migration and four translation keys that became unused when the former planner toolbar moved. Both manually declared planner fixtures now apply migration 027. The existing scheduled/unscheduled filter and Gregorian date-entry hint were retained in the calendar popup and details editor, with native coverage for unscheduled tasks. The focused compatibility set passes 52/52. These corrections preserve earlier planner options.

Final verification passed full1975/1975, focused52/52, tsc, scoped lint and main build. Native planner/source-link checks passed ar/en1280/480 with zero renderer errors, all profiles removed and original corpus hashes unchanged. The calendar filters also passed live. Native Notification.show was invoked and its click simulated.
