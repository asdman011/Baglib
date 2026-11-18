# Revision recommendations: what to revise next (TBD-3, KEY-404)

- **Status:** a comparison for the user's decision. No approach is chosen and nothing is built.
- **Written:** 2026-11-18 by Claude Code.
- **Related:**
  - `feature - Revision System Investigation.md` §5 TBD-3, which this expands;
  - KEY-387 (revision epic);
  - KEY-221 (study planner);
  - KEY-383 and KEY-385 (AI consent).

## The question

How should BagLib take the lead in suggesting what to revise next, across books, hadith and isnad chains, poetry and notes, and the next step in the user's learning?

## What already exists to build on (verified in the code, 2026-11-18)

| Signal | Where it lives | Notes |
|---|---|---|
| Due, overdue, stability, difficulty and lapses per card | `srs_state`, `srs_review_log` | FSRS. `SrsService` already computes retrievability; the card browser sorts by `retrievability_asc`. |
| Leeches | `srs_state` lapses, plus the preset's `leech_threshold` and `leech_action` (`tag`) | The review screen already offers "compare similar items" on a leech. Since KEY-397 it searches the verse text. |
| Where a card came from | `card_note.source_ref`, `card_detail.source_ref` | Each kind has its own reference: <ul><li>`sunnah-hadith:<collection>:<kitab>:<id>`</li><li>`poem:<id>`</li><li>`narrator:<rijal id>`</li><li>`author:<id>`</li><li>`book-highlight:<work>/<annotation>`</li><li>`ai-question:<work>/…`</li><li>`wikipedia:<lang>:<title>`</li></ul> |
| Live-synced sources per deck | `deck_subscription` | Says which deck follows which book, bab, poem or poet. |
| Reading activity | `work.reading_status` and `reading_progress`, `reading_session`, `reading_page_stat`, `annotations` | Since KEY-398, "finished" already triggers a "time to revise" prompt. |
| Links between things | Study notes (`app_settings` `study.note.v1:*`), whose links can carry a typed relation (`StudyLink.relation`); `work_author`; `category`; the hadith → narrator chains in the research corpus | No single link table. The graph has to be gathered from these sources. |
| Plans and pathways | Planner tasks (KEY-221) and `pathways.templates.v1` | These say what the user means to study soon. |
| AI provider with per-provider consent | `AIProviderService` and `useRemoteConsent` | A local Ollama needs no consent; a remote provider needs the user's yes. |

## The three approaches

### 1. Rule-based planner (offline and deterministic)

A "Revise next" list of short, explained items, each with an action. Each rule has its own data:

| Rule | Data | Example item |
|---|---|---|
| Weakest first | `retrievability < 0.85` among review cards, lowest first | "12 cards you are likely to forget (Bukhari, Kitab al-Iman)" |
| Overdue backlog | `due_at < today`, grouped by deck | "Poetry deck: 40 overdue. Do 20 today?" |
| Lapses and leeches | Recent `again` ratings in `srs_review_log`; the leech tag | "3 verses keep slipping. Compare them side by side." |
| Coverage gaps | <ul><li>a finished book (`reading_status`) with no `deck_subscription`;</li><li>a bab whose hadith are mature with no `narrator:` notes for its chains;</li><li>a poem whose new cards are not yet all introduced;</li><li>highlights with no accepted AI question.</li></ul> | <ul><li>"You finished *al-Muqaddimah*. Make a deck?"</li><li>"Kitab al-Wahy is learned. Learn its 8 narrators?"</li></ul> |

- **UI:** a card on the Dashboard (the existing study area), and the same list as an empty state of the review screen ("Nothing due. Here's what would help").
- **Privacy:** nothing leaves the device.
- **Cost:** low to medium. A `RecommendationService` would run indexed queries over existing tables, and the coverage-gap rules reuse the KEY-396, KEY-397 and KEY-398 services. No schema change; a dismissed item could be remembered in a setting.
- **Limits:** it doesn't understand meaning, the thresholds need tuning, and it can feel mechanical.

### 2. Graph-driven ranking

Due and unstudied material is ranked by how close it is to what the user is doing now: the book or poem open in the reader, today's planner tasks, the active pathway.

**Data.** A neighbourhood is built on demand from what links things:
- the same work, author or category (`work_author`, `category`);
- the same bab, kitab or narrator (`source_ref` prefixes plus the corpus chains);
- the same poet;
- study-note links and their typed relations;
- planner and pathway targets.

No new table is needed for a first version, but a cache could help later.

**UI:**
- ordering of the rule-based list;
- a "Related to what you're reading" strip in the reader's side panel;
- a "Revise with this" action on a planner task.

**Privacy:** local.

**Cost:** medium to high.
- Gathering the graph from several stores, and scoring it.
- Explaining it means showing why each item is suggested, for example "same narrator as the hadith you read".
- How useful it is depends on how many links the user has.

**Limits:**
- weak for a new user with few links;
- harder to explain and to test.

### 3. AI coach (opt-in)

A weekly or on-demand summary of aggregate statistics (retention by deck, backlog, streaks, gaps), sent to the configured provider, which proposes goals and next steps in natural language.

- **Data:** aggregates only by default: counts, rates and deck names. Card text is sent only if the user turns that on.
- **UI:** a "Coach" button on the Dashboard card, with the result shown as suggestions the user can accept. An accepted suggestion becomes a planner task or a filtered deck.
- **Privacy:** it needs KEY-383/385 consent for a remote provider and says exactly what will be sent; a local Ollama needs none.
- **Cost:** medium to build, plus provider cost. The result isn't deterministic, so it has to be validated and kept as suggestions only.
- **Limits:**
  - depends on an AI provider being set up;
  - can sound confident while being wrong;
  - can't be tested exactly.

## Comparison

| | 1. Rules | 2. Graph | 3. AI coach |
|---|---|---|---|
| Works offline and private | Yes | Yes | Only with a local model |
| Explainable | Yes, each item states its rule | Partly, needs "why" text | Partly; it's free text |
| Useful on day one | Yes | Weak until links exist | Yes, with a provider |
| Cost to build | Low to medium | Medium to high | Medium, plus running cost |
| Schema change | None | None (a cache later) | None |
| Testable | Fully | Mostly | Only the guard rails |

## A possible layering (for the user's decision)

1. **Start with rules (1)** as the base. It's cheap and explainable, and it reuses what was built this week. The coverage-gap rules turn existing features into prompts: narrator decks, poem chunking, "time to revise" and AI questions.
2. **Add graph ordering (2)** later, as a ranking on top of the same list rather than a separate screen, once enough links exist.
3. **Keep the AI coach (3)** as an on-demand button that sends aggregates only, never automatic.

This is a suggestion only. The decision, including "none of these", stays with the user.

## Open questions for the user

1. Which approach or layering should BagLib take?
2. Where should it appear first: the Dashboard, the empty review screen, or both?
3. Should dismissed suggestions be remembered, and for how long?
4. For the AI coach: aggregates only, or may it ever see card text with consent?
