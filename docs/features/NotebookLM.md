# NotebookLM — source-grounded notes research

Date: 2026-11-05. Agent: Claude Code. Design input for `PDF and Notes Experience Plan.md`.

## Method and limits

Web product; nothing installed or downloaded. Sources: Google help pages answer/16206563 and answer/16262519 (fetched 2026-11-05). The pages now call the product "Gemini Notebook".

## Verified from public documentation

- Three panels: **Sources** (add, unselect, auto-labelled topic groups once there are five or more), **Chat** (opens with a generated summary of all sources), **Studio** (notes, audio and video overviews, mind maps, reports, data tables, flashcards or quizzes, slide decks, infographics). The prompt behind each generated item can be viewed.
- "Save to note" keeps a chat answer; saved answers can be edited only after their citations are removed.
- Notes can be converted to sources ("Convert", "Convert all notes to source") and then appear in Sources with a note icon; answers that use them cite the passage in the note.
- Unchecking a source or note excludes it from chat and generation.
- New generated items get an unread dot.

## Fit for BagLib

BagLib's PDF AI (`cited-answer.ts`, `PdfReviewPanel`) already checks exact page quotes and refuses rather than inventing. Worth taking: a source checklist that scopes a question to chosen books, ayahs, hadith and the user's own notes; "save answer to note" that keeps citations as live study links (and stays editable, unlike NotebookLM); flashcards drafted from a source into the SRS queue only after the user approves each card. AI stays opt-in through the existing BYOK provider and the existing remote-provider consent.
