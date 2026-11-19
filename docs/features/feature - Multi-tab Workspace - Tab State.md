# Multi-tab workspace: tab keep-alive and save-before-sleep (KEY-380)

The user's decision of 2026-11-19, recorded as given. It is the authoritative spec for tab state, sleep and the snapshot used for restore. The plan is `feature - Multi-tab Workspace.md`.

## The decision

1. **Keep the 6 most recently used tabs alive.**
   - They stay mounted and are hidden with `display:none`.
   - Switching back is instant, with everything as it was.
2. **Older tabs sleep, but they save their full state first.**
   - Each tab writes a snapshot of its state before it unmounts.
   - When the user opens it again, it remounts and restores from that snapshot.
   - Sleeping must never lose saved work, and must lose as little view state as possible.
3. **Tabs that never sleep**, whatever their age:
   - a tab that is playing audio or video, such as a running lecture. Sleeping would stop playback. It may sleep once paused.
   - a tab with an open dialog or modal, such as a half-filled new-card form. Saving every dialog's draft is not worth the cost.
   - a tab whose save failed. It stays alive and shows the save error, so nothing is discarded.
   - If more than 6 tabs are exempt, the limit is exceeded rather than an exempt tab being put to sleep.
4. **The same snapshot drives "restore tabs after restart".** One snapshot format serves both sleep and restart. Snapshots are also written on a short debounce while a tab is active, so a crash loses at most a few seconds of view state.

## The snapshot contract

- **The generic part** comes from the tab model itself, so every view gets it without extra work:
  - the tab's view;
  - its study-target string (`book:` / `quran:` / `sunnah:` / `poetry:` / `media:` / `note:`);
  - its title;
  - the main scroll offset.
- **The view-specific part** comes from a small per-view hook. Each view registers it through `useTab()`:
  - `saveState(): Promise<ViewSnapshot>` runs before sleep and on the debounce. It may perform a real save, for example the manuscript.
  - `restoreState(snapshot)` runs after the view remounts.
  - Snapshots are plain JSON, validated on restore. An invalid or outdated field is dropped, never thrown.
  - Each snapshot carries a `version` per view.
- **A view without the hook yet** still restores to its target and scroll. The hooks can be added view by view.
- **Storage:** snapshots live in the tab state under the `settings` key `workspace.tabs.v1`, with no new table.
  - Each snapshot is capped at about 16 KB.
  - Document content never goes in a snapshot. Content is saved through the normal save path, and the snapshot only points at it.

## What each kind of tab saves before sleeping

| Tab (view) | Save before sleep | Restore on wake |
|---|---|---|
| **Manuscript / research editor** (`notes-editor`) | Run the normal save if anything is unsaved, so it creates the usual version-history entry (ADR-008). Snapshot: manuscript id, cursor or selection position, scroll, open side panels (outline, sources, comments), and zoom or width mode. | Open the saved document, then put back the cursor, scroll and panels. |
| **Study note editor** (`notes`, a note open) | The same as the manuscript: the normal save first, then note id, cursor, scroll and the open inspector or relations panel. | The same note, cursor and panels. |
| **Search** (search hub or in-view search) | Query text, filters (sources, kinds, languages, Arabic-normalisation options), sort, the selected result and the results scroll. Not the results themselves. | Run the same search again, select the same result if it still exists, and scroll to it. |
| **Book reader** (`reader`) | Work id and source id, page (PDF) or CFI (EPUB), zoom and fit mode, split orientation, the open side panel (notes, highlights, outline), the active highlight or markup tool, and the dictionary or reading-pad state if open. | The same book, page, zoom and panel. |
| **Quran** (`quran`) | Script or profile, surah and ayah, or page and layout in Mushaf mode; reading mode (reader or Mushaf); open inspector and its tab (tafsir, translation, notes); the selected ayah range; and the khatmah context if any. | The same position, mode and inspector. |
| **Sunnah** (`sunnah`) | Collection, chapter and hadith id; the list filter (personal lists); the open grading or notes panel; and the scroll inside the chapter. | The same hadith, filter and panel. |
| **Poetry / Bayan** (`bayan`) | Poem id and verse range, the reader mode (qasidah view or line view), and the open notes or inspector. | The same poem and verse. |
| **Lecture** (`lectures`) | Lecture id and the current timestamp, playback speed, the open transcript or notes panel, and the transcript scroll. A playing lecture never sleeps (rule 3). | Paused at the saved second, at the same speed, with the same panel. |
| **Library** (`library`) | The active category, filters, sort, search text, grid or list mode, the selected book and the scroll. | The same view. |
| **Categories** (`categories`) | The expanded tree nodes, the selected category and the scroll. | The same tree state. |
| **Notes overview / lists hub / cards** (`notes`) | The active sub-tab (notes, cards, lists, …), filters, the selected item or deck, and the scroll. | The same sub-tab and selection. |
| **Dashboard / planner / pathways / statistics / Islamic hub** | The active sub-tab or section, the selected date or range (planner, statistics) and the scroll. | The same section. |
| **Settings** (single instance) | The open settings section and the scroll. | The same section. |

## Known limits (to be reported, not hidden)

- **Typing undo in the editors.**
  - Saved content and version history survive sleep. The editor's in-memory Ctrl+Z steps may not.
  - The implementer checks whether the research editor's undo history can be serialised into the snapshot, and reports it if it can't.
  - Mark and note undo already survives restarts (ADR-012), so it survives sleep too.
- **Search results are recomputed on wake, not stored.** If the library changed in the meantime, the results can differ.
- **Exempt tabs (rule 3) can push memory beyond 6 live tabs.** Memory is measured with real PDFs from `tests/real-files/` and recorded.

## Tests and verification

- **Unit:**
  - snapshot validation (invalid, outdated and oversized fields are dropped);
  - the sleep-selection rule (least recently used first, exemptions honoured, never more than 6 non-exempt tabs alive);
  - debounce behaviour.
- **UI tests:**
  - a manuscript tab with unsaved text is saved, with a new version-history entry, before it sleeps;
  - a playing-lecture tab and a tab with an open dialog never sleep;
  - a failed save keeps the tab alive.
- **Live run** (real files, ar and en, off-screen harness windows, throwaway profile under `.baglib-data/`):
  1. Open 8 tabs: a real Arabic PDF, a real English EPUB or PDF, Quran in Mushaf mode, a Sunnah hadith, a lecture, a manuscript with unsaved text, a search with filters, and the library with a filter.
  2. Confirm the two oldest tabs sleep.
  3. Wake each one and confirm its position, panels, filters and selection came back, and that the manuscript text was saved.
  4. Restart the app and confirm the same.
  5. Record memory use.
- Full suite green; no renderer errors.

## Gates

- No new table, column or dependency: all of this uses the existing `settings` store.
- If anything here seems to need a schema change, stop and ask the user.
