# Zotero — PDF annotation and notes research

Date: 2026-11-05. Agent: Claude Code. Design input for `PDF and Notes Experience Plan.md`.

## Method and limits

Zotero is not installed and nothing was downloaded. Source: zotero.org/support/pdf_reader (fetched 2026-11-05). Items marked "public knowledge" were not re-checked.

## Verified from public documentation

- Unlocked mode (default): selecting text shows a colour popup; one click makes a highlight or underline. Locked mode: pick a tool and colour first, then every selection is marked.
- The left sidebar Annotations tab lists annotations; they can be selected, right-clicked or dragged.
- A Notes pane sits on the right of the reader. "+" offers "Add Item Note from Annotations" and "Add Standalone Note from Annotations".
- Annotations and selected text can be dragged into an open note; each inserted annotation carries a citation.
- In the note, an annotation offers "Show on Page"; its citation offers "Show Item". Colours and citations can be shown or hidden per note.
- Note templates control how annotations are written into notes.
- Annotations are stored in Zotero's database, not in the PDF, unless exported with embedded annotations; page edits in another reader can misplace them.

## Public knowledge (not verified here)

Annotation types also include notes, image areas and ink; each annotation has a comment and tags; sidebar filters by colour, tag and author; colour shortcuts.

## Fit for BagLib

BagLib's study layer already keeps annotations in its own database (migration 010) apart from PDF review annotations written into the file (`PdfReviewPanel`). Worth taking: the one-click colour popup, an annotation sidebar with filters, drag an annotation into a note with a back-link, "Show on Page", a note generated from all of a book's annotations, and a template for that output.
