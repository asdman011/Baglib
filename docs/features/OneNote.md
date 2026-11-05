# Microsoft OneNote — note-taking research

Date: 2026-11-05. Agent: Claude Code. Design input for `PDF and Notes Experience Plan.md`.

## Method

- Installed desktop OneNote at `C:\Program Files\Microsoft Office\root\Office16\`. Read-only; OneNote was not launched.
- REA `inspect_pe_resources` on `1033\ONINTL.DLL` (evidence `ev_0032a670…`); string tables decoded from the reported offsets give 177 strings. Main ribbon labels are not in this DLL, so UI coverage is small.
- The folder holds the Office add-ins `ONBttnWD.dll`, `ONBttnPPT.dll` and `ONBttnOL.dll` (OneNote buttons inside Word, PowerPoint and Outlook).

## Verified

- **Linked Notes**: OneNote "will keep links back to this document for each line of notes" and, for slides, "will link each line of notes to the slide you are looking at". Notes are taken in a docked window beside the document; every line remembers where the reader was. Limits stated: saved documents only, no restricted-permission content, not in private browsing.
- Linked meeting, contact and task notes from Outlook items.

## Public knowledge (not verified here)

Free-form page canvas with movable containers; notebook › section › page › subpage; note tags on Ctrl+1…9 (To Do, Important, Question, Remember for later, Definition, …) with a tag summary; ink and lasso; audio recording synchronised with typed notes; Immersive Reader; page templates.

## Fit for BagLib

The most useful idea is Linked Notes: a note pane docked beside the reader where each paragraph quietly records the page, ayah, hadith or lecture second it was written at. BagLib already has the split reader (`SplitPaneReader`, `canvas/NoteEditorPane`) and `media:` timestamps for lectures; it lacks per-paragraph location capture. Note tags with a summary map onto BagLib's existing tags plus the question status from migration 021.
