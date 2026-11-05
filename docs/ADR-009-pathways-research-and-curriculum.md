# ADR-009: Pathways, the Research and Curriculum Space

## Status

Accepted for KEY-247 on 2026-11-02. The user chose the name, approved the one table below and chose the online search and connection scope. Approval covers this table only, not later schema, dependency or Git changes.

## Name

`المسارات` in Arabic and `Pathways` in English. The board asked for a name other than collection. In code the feature is `pathway`.

## Context

- KEY-248 needs a project that holds ordered books, notes and links, with pinned links per subject, and exports references.
- KEY-249 needs a curriculum started from a template or from AI, edited, with progress tied to the planner.
- `work_collection` and `knowledge_collection` have no order, cannot hold a link and cannot hold a Quran or hadith target. A `collection` row already carries a name, a description and a type.
- ADR-007 made `study_task` the owner of task status and rejected linking tasks from a new subtype of knowledge.

## Decision

A pathway is a `collection` row with `collection_type` of `research` or `curriculum`. Its contents live in one new table, added by migration 022:

| Column | Type / constraints | Meaning |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | Generated item identity |
| collection_id | TEXT NOT NULL, references `collection(id)` ON DELETE CASCADE | The owning pathway |
| section | TEXT NOT NULL DEFAULT '' | Subject or stage heading, as the user typed it |
| kind | TEXT NOT NULL, one of resource, link, step | What the row is |
| reference | TEXT NULL | A resource's study target, or `task:<id>` for a step |
| title | TEXT NOT NULL | The saved label, kept if the target is later deleted |
| url | TEXT NULL | http or https address of a link |
| pinned | INTEGER NOT NULL DEFAULT 0, 0 or 1 | Shown first, per section |
| sort_order | INTEGER NOT NULL DEFAULT 0 | User-controlled order |
| created_at | TEXT NOT NULL | UTC ISO timestamp |

One index covers `(collection_id, sort_order)`.

### Relations

- Works and notes are soft references through existing study targets (`book:`, `note:`, `quran:`, `sunnah:`). Deleting a book never deletes the item, matching migration 019's preservation rule. Export falls back to the saved title.
- A pathway adds nothing to Works, Editions or Sources, and it is not knowledge.
- A step is a `study_task` plus an item pointing at it. The planner owns status, so finishing a step in the planner or in Pathways is the same write. A cancelled task leaves the progress count. Deleting a pathway or a step keeps its planner tasks: they may already carry dates and links.

### Template format

A template is an outline in plain text: a line starting with `#` opens a section and each other line is a step. The same outline is what AI drafts fill in and what the user edits before creating a curriculum, so all three starts share one path. Built-in templates are localized text in `translations.ts`. Personal templates live in `app_settings` under `pathways.templates.v1`. Built-in templates hold structure only and name no books, since no curated reading list from the board's sources has been verified.

### AI

Drafting uses the existing BYOK provider (KEY-143) and stays optional. The prompt asks for topics and steps and forbids naming books, scholars or quoting texts, so the draft cannot invent a citation. The draft always lands in the editable outline; nothing is created until the user confirms.

### Online search

KEY-250 opens each site's own search page in the browser. Baglib fetches nothing from those sites, so no scraping or terms question arises and results stay labelled by site.

## Options rejected

| Option | Why not |
| --- | --- |
| JSON in `collection.filter_rules` | That field holds filter rules, and items could not be queried, indexed or edited atomically. The user chose the table. |
| Pathway items as `knowledge` | A link or a syllabus step is not scholarship, as ADR-007 argued for tasks. |
| Order columns on `work_collection` and `knowledge_collection` | Still no place for links, Quran or hadith targets, and it changes two shared tables. |

## Consequences and follow-ups

- The space is reachable from the navigation rail, below the planner.
- Classroom and teacher features stay a later follow-up, as KEY-248 states. Nothing here is built for them.
- A connection between ayat is shown only with a named installed source. Munasabah stays open under KEY-252 until a citable source exists.
- The peer review idea from the board is the last step of the research template, not a timed reminder.
