# Logseq — outliner, flashcards and PDF research

Date: 2026-11-05. Agent: Claude Code. Design input for `PDF and Notes Experience Plan.md`.

## Method and limits

Not installed; nothing downloaded. The docs site page was too large to fetch, so the source is the docs repository page `pages/Flashcards.md` on GitHub (fetched 2026-11-05).

## Verified from public documentation

- Any block becomes a flashcard with `#card` (or "Make a Flashcard" from the bullet menu). A card is just a tagged block and can contain clozes.
- Scheduling is stored as block properties (`card-last-interval`, `card-repeats`, `card-ease-factor`, `card-next-schedule`, `card-last-reviewed`, `card-last-score`); the docs point to SM-5.
- Review all cards from a Flashcards entry in the left sidebar or with `t c`; review a subset with a query such as `{{cards [[Topic]]}}`, or exclude with `(not …)`; `/cards` inserts the query; "Preview Card" from the bullet menu.

## Public knowledge (not verified here)

Everything is a block in an outline; the daily journal opens by default; block references `((uuid))` and embeds; PDF highlights create an `hls__` page whose blocks link back to the page and area; slash commands; a right sidebar for opening blocks side by side.

## Fit for BagLib

BagLib uses FSRS (`ts-fsrs`) on `card_detail` and `srs_state`, which is stronger than SM-5. Worth taking: making a card from where you are without leaving the note, cloze cards, scoped review ("only this book, deck or tag") and a journal-first entry point. Cloze text can live inside `front` and `back`, so it needs no schema change.
