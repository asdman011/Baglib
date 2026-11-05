# Adobe Acrobat Pro — reverse-engineering findings

Date: 2026-11-05. Agent: Claude Code. Purpose: design input for the BagLib PDF experience plan (`PDF and Notes Experience Plan.md`). This is evidence, not authorization for any schema, dependency or architecture change.

Target: the user's installed copy at `D:\Program Files\Adobe Acrobat Pro\Acrobat\` (about 3.2 GB). Read-only throughout: nothing was executed, patched, copied into the repo or modified. Acrobat was not launched, so no live UI was observed.

## Method

| Step | Tool | Evidence |
|---|---|---|
| Directory inventory | REA `inspect_desktop_application` | `ev_2aed8f61…` (summary `ev_4eb66edc…`). Traversal capped at 400 entries, so it is partial. |
| Resource tree of `AcrobatRes.dll` | REA `inspect_pe_resources` | `ev_6d05c191…`: 1,181 resources, mostly PNG icons (`PNGI` 437), `EXVW` 190, `EVEF` 100, 44 string-table blocks. |
| String tables decoded from the REA-reported payload offsets | Python, read-only | 334 strings. Few UI labels; the modern UI text lives elsewhere. |
| Tool manifests `AcroApp/ENU/*.aapp` and `AcroApp/MEA/*.aapp` (plain XML) | Python XML parse | 46 ENU manifests, one empty (`CollectFeedback.aapp`). |
| Theme files `UIThemes/*.acrotheme`, toolset files `UICustomization/*/Custom0N.aaui` | read | Light and dark token sets; "Common Tools" grouping. |
| Plug-in names `plug_ins/*.api` and their ASCII/UTF-16 strings | `strings` | Comments (`Annots.api`), search/index (`Search.api`), Read Out Loud, Compare, Reflow. |
| Shipped web UI `WebResources/Resource3` (desktop "drop-in" app) | grep of `translations-en-US-json-chunk.js` and `static/js/plugins/*` | 3,260 English strings, plug-ins `dc-annotations`, `reviews`, `search-summary`, `redact`, `fss`, `signatures`, etc. |

Raw extracts are kept outside the repo in the session notes folder (`acrobat-evidence/enu.txt`, `web_en.txt`, `strtab.txt`).

## Verified findings

### 1. The UI is a set of "apps" (tools), each a manifest with commands and contextual top bars

Every tool is an `<Application>` with an id, title, description, `requiresDoc`, a `<Commands>` list and one or more `<Layout>`s. Each layout has a `TopBar` (the contextual tool bar that appears above the page when the tool is active), touch-bar variants and, for the viewer, a right-hand pane (`RHP`). The viewer's own manifest is just `Layout name="Default" rhpModes="expanded,appSwitcherOnly"` with `AppShortcutListView` in the RHP, i.e. **the right pane can collapse to an icon strip of tool shortcuts**.

Tool inventory (ENU), with the top bar each one shows:

| Tool (id) | Title | Contextual top bar (first layout) |
|---|---|---|
| CommentApp | Comment | Sticky note, Highlight, Underline, Strike-out, Replace text, keep tool selected, colour. Expanded layout adds Caret, Typewriter, Text box, Ink, Erase, Stamp, Attach file, Line, Arrow, Rectangle, Oval, Callout, Polygon, Cloud, Polyline, line thickness, text properties. |
| EditPDFApp | Edit PDF | Edit text/images, Add text, Add image, Link, Crop, Header & Footer, Watermark, More (Bates, background, bookmark, attachment, article thread). |
| PagesApp | Organize Pages | Page range, Rotate CCW/CW, Delete, Extract, Insert, Insert from template, Replace, Split, More (Bates, crop, transitions, number pages, page properties). |
| FillSignApp | Fill & Sign | Text, Cross, Check, Circle, Line, Dot, colour, Sign, Invite others. |
| FormsApp | Prepare Form | Text field, Check box, Radio, List, Combo, Button, Image, Date, Signature, Barcode, keep tool selected. |
| RedactApp | Redact | Mark text and images, Apply, properties, Remove hidden information, Sanitize. |
| ProtectApp | Protect | Password, policies, Remove hidden info, More. |
| CompareApp | Compare Files | Side by side, Overlay old/new, display format, Previous / Next difference, Options. |
| PaperToPDFApp | Scan & OCR | Insert, Enhance, Text recognition, Bates, Crop, Rotate, Delete; "Show capture suspects" to review OCR doubts. |
| OptimizePDFApp, CompressPDFApp | Optimize / Compress | Reduce size, Optimizer, Optimize scanned, Preflight. |
| StandardsApp | PDF Standards | PDF/A, PDF/X, PDF/E, Preflight. |
| AccessibilityApp | Accessibility | Auto-tag, tag form fields, reading options, full check, report, alt text, reading order. |
| MeasureApp | Measure | Measuring tool, object data, geospatial location. |
| IndexApp | Index | Catalog (build a full-text index over a folder of PDFs), Embed index. |
| StampApp | Stamp | Add stamp, stamp palette, custom stamps, Bates. |
| CertificatesApp | Certificates | Sign, Timestamp, Validate all, Certify. |
| ReviewApp | Send for Comments | Email review, shared review, track, approval, compare. |
| ActionsApp | Action Wizard | Create, manage and find "actions" (saved multi-step workflows) and custom tools. |
| CreateCustomUIApp | Create Custom Tool | User-assembled tool sets that can be shared. |
| CombineApp | Combine Files | Thumbnail and list view of files, move up/down, insert, delete. |
| ExportPDFApp, CreatePDFApp, ConvertPDFAppFull | Export / Create / Convert | Word, Excel, PowerPoint, RTF, image, HTML. |
| GenAIAssistantApp, GenAISummaryApp | AI Assistant, Generative summary | Chat with the document and a navigable summary. |
| RichMediaApp, DeveloperApp, PrintProductionApp | Rich media, JavaScript, Print production | Specialist tools. |
| Cloud-only | Request e-signatures, Send in bulk, Collect payments, Web form, Share, Stylize, Generate image, Add custom page | Depend on Adobe cloud services. |

Two patterns stand out:

- **Progressive disclosure inside one tool**: the Comment tool has a compact top bar (5 markup tools plus colour) and an expanded one with every drawing tool (`CommentAppMenuExpandDrawingTools` / `…CollapseDrawingTools` / `…ActiveDrawingTool` — the collapsed bar keeps showing whichever drawing tool was used last).
- **"Keep tool selected"** (`CommentAppKeepToolSticky`, `AcroForm:KeepToolSelected`): a tool either fires once and returns to selection, or stays armed for repeated use.

### 2. Comment model and comment-list behaviour

- Annotation command names map to the PDF annotation types: Text (sticky note), Highlight, Underline, StrikeOut, Replace and Caret (text edits), FreeText, FreeTextTypewriter, FreeTextCallout, Line, LineArrow, Square, Circle, Polygon, PolygonCloud, PolyLine, Ink, EraseInk, Stamp, FileAttachment, Sound.
- The comment list has Sort, Filter and list menus (`SortCommentsMenu`, `FilterCommentsMenu`, `CommentListMenu`).
- Filter panel strings (web UI): "Choose filters", "Time posted" (Today, Last 7 days, by date), "Comment by" (author), "@ Mentions", "Type", "Status", "Color", "Checkmark", "Hide resolved comments", "Clear all", "Apply", and a preview line "Select Apply to view {filter} of {total} comments".
- Comments support emoji reactions (an emoji picker with search and recent items).
- `Annots.api` exposes review workflows: send comments to author, shared review, email review, approval.
- `Annotations/Stamps` ships stamp PDFs per locale (ENU and MEA), including `CompareMarkers.pdf`.

### 3. Search, reading and accessibility

- `Search.api`: separate quick Find (`&Find`, `&Find Again`) and Advanced Search with index support ("Highlight all", "Smart search", embedded indexes, background indexing, catalog of a folder).
- `ReadOutLoud.api` (voice, reading mode) and `reflow.api` (re-flow tagged content for narrow windows; Liquid Mode is the cloud successor and is not shipped here).
- `Compare.api`: side-by-side and overlay compare with difference rows, page numbers and markers.

### 4. AI assistant structure (shipped strings)

- Chat panel with a placeholder "Ask a question about this document" and a different one for selected text, an "Overview" card, and categories Understand / Analyze / Generate with suggested prompts; a separate student set ("Create a study guide", "Generate practice test questions", "Organize my notes in a structured format").
- Multi-document collections ("Ask a question about these documents", per-file status, "Go to source {source}" chips with page numbers) and a disclaimer that answers must be checked against sources.

### 5. Themes, regions and right-to-left

- Two themes as named style tokens with states (normal, hover, active, checked, disabled): RegularBackground, ProminentBackground, DocumentBackground, Border, Separator, Icon, HeaderText, RegularText. Dark theme document background `0x282828`, accent `0x2175C8` / hover `0x51AAFE`.
- `MEA` (Middle East) variants exist for tool manifests, toolsets, sequences and stamps, but the web UI ships only `en-AE` / `en-IL` English translations. There is **no Arabic interface string set** in this install: Acrobat supports Arabic content, not an Arabic UI. BagLib's bilingual interface is a real advantage to keep.
- `UICustomization` "Common Tools" groups tools by task with short guidance labels ("Scan paper documents into searchable PDF files", "Export to Another Format").

## Hypotheses (not verified in this install)

- The current Acrobat window layout is: a left navigation rail (thumbnails, bookmarks, attachments, layers, signatures, search), a left "All tools" panel that opens a tool and its top bar, a floating quick-action bar on text selection, and a right comment/AI pane. This matches the manifests (top bars, RHP, AppShortcutListView) and Adobe's public material, but the pane widths, ordering and keyboard shortcuts were not observed because Acrobat was not launched.
- Comment status values (Accepted, Rejected, Cancelled, Completed, None) and the checkmark state come from the PDF review model and public documentation; only "Status" and "Checkmark" as filter names are verified here.

## Unanswered questions

- Exact keyboard shortcuts, pane resize limits and selection-toolbar contents. Answering needs a live, observed session (launch Acrobat with the user's permission, a throwaway file, and REA `capture_native_ui_scenario` or screenshots).
- How the MEA layouts differ from ENU beyond the missing cloud tools.

## What BagLib should and should not take

Take: the tool-as-mode model with a contextual top bar; compact versus expanded markup bars; keep-tool-selected; a filterable, sortable comment list with status and checkmarks; quick Find plus indexed search; side-by-side and overlay compare; accessibility check; a cited AI panel with study prompts; theme tokens.

Leave out: e-signature cloud flows, payments, bulk send, web forms, rich media, JavaScript, print production, Adobe cloud storage and anything that sends a file off the machine without the user's explicit choice.
