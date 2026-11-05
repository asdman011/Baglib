# Figma — comments research

Date: 2026-11-05. Agent: Claude Code. Design input for `PDF and Notes Experience Plan.md`.

## Method and limits

Web and desktop product; not inspected locally. Source: Figma help "Guide to comments in Figma" (fetched 2026-11-05).

## Verified from public documentation

- A comment mode entered from the toolbar or with `C`; while in it, objects cannot be edited; `Esc` leaves.
- Comments are pinned where they are placed; they can be moved, edited, hidden, docked, sorted, filtered, replied to, reacted to with emoji, resolved and deleted.
- In comment mode a right sidebar lists all comments.

## Public knowledge (not verified here)

Pins show the author avatar and open a thread popover; resolved threads hide by default; filters for your own threads and unread; FigJam stickies and sections.

## Fit for BagLib

BagLib's `comment` table already supports threads (`parent_comment_id`) on knowledge items, but `NoteHistory` shows a flat list with no reply, resolve or pin. Worth taking: one comment mode (`C`) shared by the PDF reader, notes and the Quran and Sunnah readers; pins that open a thread; resolve and reopen; a right-side list with filters. BagLib is single-user, so author is the local name and reactions add little; resolve status is the useful part.
