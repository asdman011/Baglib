# Obsidian — note-taking research

Date: 2026-11-05. Agent: Claude Code. Design input for `PDF and Notes Experience Plan.md`; not authorization for schema or dependency changes.

## Method and limits

- `D:\Program Files\Obsidian` exists but is empty, so there was no binary or `app.asar` for REA to inspect. Nothing was downloaded or installed.
- Findings come from Obsidian's public help page on internal links (obsidian.md/help/links, fetched 2026-11-05). Items marked "public knowledge" were not re-checked in this session.

## Verified from public documentation

- Wikilinks `[[Note]]`, heading links `[[Note#Heading]]`, nested `[[Note#Heading#Sub]]`, vault-wide heading search by typing `[[##`.
- Block links `[[Note#^id]]`; typing `^` offers blocks; `^id` is appended to the paragraph; vault-wide block search `[[^^`.
- Embeds: any link prefixed with `!` shows the content inline (`![[Note]]`, `![[image.png]]`).
- Display text `[[Note|Label]]` and per-note aliases.
- Typing `[[` autocompletes; selecting text and typing `[[` wraps it; a link to a missing note creates it.
- Hover preview on links (Ctrl-hover while editing).
- Renaming a note updates every link to it, optionally after a prompt.

## Public knowledge (not verified here)

Backlinks and unlinked mentions, properties shown as a form, command palette, quick switcher, daily notes, Canvas, callouts, graph view, live preview that hides Markdown syntax except on the line being edited.

## Fit for BagLib

BagLib already has `[[target|label]]`, `![[…]]` embeds, aliases, backlinks (`studyBacklinks`, `BacklinksSection`) and typed targets (`quran:`, `sunnah:`, `poetry:`, `book:`, `note:`, `media:`). Missing: autocomplete while typing `[[`, heading and block anchors inside notes, links to a PDF page or annotation, hover preview, rename that rewrites links, unlinked mentions, live-preview editing, a command palette and a quick switcher.
