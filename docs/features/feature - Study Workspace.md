# Feature — Study Workspace (design note)

Status: **approved plan (user, 2026-11-09)**; ADR-013 accepted. Phase 1 tasks are in Jira (see section 5).

Origin: the user's proposal "Study website improvements and possible Baglib integration", based on their static midterm study site (`midterm-study-site`: a Python importer that splits course PDFs/DOCX into passages, plus JS practice, schedule and progress), and the user's answers on 2026-11-09:
- page links will name their source;
- the practice-attempt storage gets an ADR first;
- Phase 1 includes reader selection actions, a Today panel, a separate progress view and explanations with book citations, plus "get creative" engagement ideas from Duolingo, Coursera and Khan Academy;
- the user's five course folders are read-only live-test material.

## 1. What BagLib already has (verified in source)

| Need | Existing piece | Where |
|---|---|---|
| Subjects / lectures / curriculum | Pathways: `collection` with `collection_type` research or curriculum, plus `pathway_item` | ADR-009, migration 022 |
| Dated plan | `study_task` (dates, status, priority, `references_json`), Hijri and Gregorian | ADR-007, migration 020 |
| Review questions + spaced repetition | `card_detail` (front, back, `source_kind`, `source_ref`), `srs_state`, `srs_review_log`, `services/srs.ts`, `SrsReviewPanel.tsx` | ADR-006, migration 018 |
| Reading evidence | `reading_page_stat` (page dwell per book), `reading_book_stat`, `reading_session` | migrations 001, 014 |
| Explain with verified quotes | Study assistant: quote validation against installed text (Quran, hadith; KEY-276 adds Warsh, tafsir, translations) | `src/main/ipc/study-assistant.ts` |
| Research questions | `question_detail` with open, investigating, answered, dismissed | ADR-011 |
| Links that reopen a place | study targets `book:`, `note:`, `quran:`, `sunnah:`, plus `baglib:` deep links (KEY-277) | `src/shared/study-notes.ts`, `src/shared/deep-link.ts` |
| Scanned material | OCR engine; uncertain-word review (KEY-275, in progress) | `.baglib-data/pdf-engine/` |

**The design glues these together. It isn't a second learning system.**

## 2. Gaps

1. **Page links don't name the source.** `book:<id>#p=N` has no edition or source, so a page number is ambiguous once a book has more than one source.
2. **No combined "what next".** Planner tasks, due cards and unfinished pathway steps live on separate screens.
3. **Reading, demonstrated knowledge and confidence are mixed or missing.** `srs_review_log` ratings (again/hard/good/easy) are self-ratings, and confidence isn't recorded.
4. **No practice attempts.** Nothing stores how an answer was checked, what kind of mistake it was, or the question type beyond front/back cards. See ADR-013 (draft).
5. **No "Explain" on a book selection.** The assistant cites corpus texts, not book passages.
6. **Nothing reacts to a changed source.** When a PDF is re-OCR'd or replaced, the cards and explanations built on it aren't flagged.
7. **Math, tables and diagrams** in scanned lectures aren't handled explicitly.

## 3. Decisions taken (user, 2026-11-09)

- **Source-precise links:** `book:<id>@<sourceId>#p=N`.
  - Old `book:<id>#p=N` links keep working and open the default source.
  - It's a grammar change only, in `study-notes.ts`, `deep-link.ts` and Markdown export/import, with no database change.
  - The KEY-277 deep-link validator must accept the new form.
- **Practice attempts:** draft ADR-013 first; nothing is built until it is approved.
- **Course folders:** read-only live-test material (see `tests/real-files/README.md`, "External course corpus").

## 4. Engagement design: what we borrow, what we refuse

Research summary (sources at the end): Duolingo leans on streaks, streak freezes, a one-lesson minimum, XP, leagues and quests. Khan Academy uses mastery levels that have to be earned and can be lost, with unit tests and course challenges. Coursera-style platforms use suggested deadlines that the learner can reset, plus weekly goals.

BagLib is an offline, single-user, scholarly library in Arabic and English, so the adaptation is:

| Borrowed mechanic | BagLib version | Why |
|---|---|---|
| Streak + one-lesson minimum (Duolingo) | **Weekly rhythm.** The user sets a weekly goal (minutes, reviews or pages); any one meaningful action counts toward the day: one review, one page read with dwell above a threshold, or one practice answer. | Builds a habit without daily pressure; a week is kinder than a day for students with exams. |
| Streak freeze (Duolingo) | **Rest days.** Two rest days a week are kept automatically; Fridays can be marked as rest by default (configurable). | Removes the "all is lost" moment that makes people quit. |
| Quests (Duolingo) | **Today's three steps.** The Today panel proposes up to three small, concrete steps (for example "review 12 due cards", "read pages 40–48 of <lecture>", "answer 5 questions on §3.2"). The user can accept, swap or skip each. | It answers "what should I study next?", the proposal's first priority. |
| Mastery levels (Khan) | **Per pathway section / card set:** Started → Familiar → Proficient → Mastered, derived from evidence. Mastered requires a correct answer on an *unfamiliar* question or after a delay (a later retrieval), and a mastered level can drop after lapses. | Separates "I read it" from "I showed it", and makes success meaningful. |
| Unit test / course challenge (Khan) | **Section check / curriculum challenge.** A mixed set across a section or a whole curriculum; passing lets the user skip review of what they already know. | Saves time for strong learners; gives evidence for mastery. |
| Suggested, resettable deadlines (Coursera) | **Exam date + adaptive plan.** The user gives an exam date and free time; the plan suggests a daily load. Falling behind triggers "re-plan" (spread what's left), never a guilt message. | Planning against real deadlines without shame. |
| XP / points | **Evidence points shown only as progress**, never as currency: reading coverage %, mastery %, reviews done this week. | Points that reflect learning, not app opens. |
| Celebrations | Tasteful milestone moments: finishing a pathway section, the first Mastered set, a 4-week rhythm. Localized, short, respecting `prefers-reduced-motion`, and can be switched off. | Positive reinforcement without noise. |

**Refused on purpose:**
- hearts or lives that punish mistakes;
- leaderboards or leagues (single-user and offline, and competition isn't the goal of study);
- guilt or loss-aversion wording ("your streak will die");
- more than one notification a day; notifications are opt-in, at a time the user picks;
- any reward that can be earned without learning.

**BagLib-specific ideas.** The user moved these into Phase 1 on 2026-11-09; they are tasks 8–10 in section 5.

## 5. Phase 1 scope (proposed tasks)

**Jira (created 2026-11-09):** 1 = KEY-279, 2 = KEY-280, 3 = KEY-281, 4 = KEY-282, 5 = KEY-283, 6 = KEY-284, 7 = KEY-285, 8 = KEY-286, 9 = KEY-287, 10 = KEY-288.

All of Phase 1 needs no schema change, except item 3. It depends on ADR-013 only for storing attempts; until that is approved, Practice writes cards and SRS reviews only.

1. **Source-precise study links.** The `book:<id>@<sourceId>#p=N` grammar: parsers, validators, deep links, Markdown export, and navigation that opens the right source; old links stay valid.
2. **Reader selection actions.** Explain, Practice and Review later on selected text in the PDF and EPUB readers.
   - *Review later* creates a card whose `source_ref` is the precise link.
   - *Practice* opens a small editor for one question pre-filled from the selection.
   - *Explain* opens the assistant with the passage as a cited source.
   - Arabic and English UI.
3. **Practice attempts.** Question kinds, check method, mistake category and confidence. **Blocked on ADR-013 approval.**
4. **Explain with book citations.** The assistant takes a book passage (with its precise link) as a source. Quotes are validated against that passage's extracted text, and citations reopen the page. Gaps in the material are stated.
5. **Today panel.** Up to three steps from due planner tasks, due cards and unfinished pathway steps, plus the weekly rhythm and rest days. Accept, swap or skip. Weekly-goal settings live in the settings store.
6. **Separate progress view.** Three separate measures per pathway or book, never merged into a single score:
   - **Reading coverage:** the share of pages actually read from `reading_page_stat` dwell (minimum threshold >= 30 seconds), distinguishing read pages from opened pages (< 30s dwell) and total pages.
   - **Demonstrated knowledge:** Khan-style mastery levels (Started → Familiar → Proficient → Mastered) derived solely from automatically checked (`check_method = 'auto'`) or judged (`check_method = 'judgment'`) attempts in `practice_attempt`. Self-ratings (`check_method = 'self'` and SRS ratings) are kept separate and displayed as self-rated.
     - *Not Started:* 0 demonstrated attempts.
     - *Started:* At least 1 completed demonstrated attempt.
     - *Familiar:* At least 2 correct demonstrated attempts.
     - *Proficient:* At least 3 correct demonstrated attempts with recent accuracy >= 75%.
     - *Mastered:* Reached Proficient AND demonstrated retention either via delayed retrieval (>= 20 hours after a prior correct attempt) OR an unfamiliar / challenge context (`context = 'challenge'` or `section_check`), with no active lapse.
     - *Demotion on Lapse:* An incorrect attempt at Mastered or Proficient demotes the card to Familiar (and lapsesCount >= 3 drops to Started). Re-earning Mastered requires post-lapse retention evidence.
     - *Aggregate set/section mastery:* Mastered requires >= 80% cards mastered; Proficient requires >= 70% proficient+mastered; Familiar requires >= 50% familiar+proficient+mastered.
   - **Reviews due:** spaced repetition review count from `srs_state` due today (`due_at <= end of today`) and this week (`due_at <= now + 7 days`), plus overdue count.

   Each measure features an InfoTip in Arabic and English explaining its source and calculation.
7. **Exam-date re-planning.** An optional exam date on a curriculum. Re-plan spreads the remaining steps over the free days as editable `study_task` suggestions. Nothing is created without confirmation.

8. **Daily wird and muraja'a cycle.** The user sets a daily Quran portion and a revision rotation, for example new memorization plus revising the last N juz in turn.
   - Profile: Hafs or Warsh, using the installed packs and existing `quran:` targets.
   - Units: pages, ayahs or juz.
   - Days: which days of the week it runs.

   *Storage, no schema change:*
   - The settings are JSON in the settings store under `study.wird.v1`, validated and bounded, following the `pathways.templates.v1` precedent.
   - Each day's portion is a `study_task` whose `references_json` holds the `quran:` range, so completing it in the planner, the Today panel or the Quran view is the same write (ADR-007).

   *Behavior:*
   - The Today panel always shows the wird as one of its steps, and the step opens the Quran view at the start of the portion.
   - Skipped portions roll into a "catch-up" suggestion. They never pile up silently or show a guilt message.
   - Ayahs never become ordinary books (ADR-004, ADR-005), and canonical text is never changed.
9. **"Explain it back".** After reading a passage, the user writes a short summary in Arabic or English. The assistant compares it **only** with the cited passage (its precise `book:…@source#p=` link, or a `quran:`/`sunnah:` target with installed text), and marks each claim as supported, missing from the passage or unsupported, quoting the passage for each.
   - The result is always labelled "needs judgment": the learner accepts or corrects the verdict.
   - The assistant never adds facts from outside the passage. If the passage is too short or unreadable (for example an image-only page without OCR), it says so.
   - Uses the existing provider rules (`allowRemote`, BYOK) and quote validation. Tests use a fake or local provider.

   *Storage:* until ADR-013 is approved, the summary and verdict are saved only as a study note linked to the passage. Once it is approved, each check is also a `practice_attempt` with `question_kind = explain_back` and `check_method = judgment`.
10. **Prerequisite hints.** In a curriculum, a section can name the sections it depends on, for example variance → covariance → regression. When a section's mastery level drops, or practice on it keeps failing, the Today panel suggests revisiting the weakest prerequisite first, with one click to its review set.
    - Cycles are rejected when saved.
    - Hints are suggestions the user can dismiss, never blocks.
    - Mastery comes from the evidence rules in section 4: SRS lapses now, and attempts once ADR-013 lands.

    *Storage, no schema change:* a validated, bounded JSON map per curriculum in the settings store under `pathways.prerequisites.v1:<collectionId>` (section → list of sections), following the same `pathways.templates.v1` precedent. Deleting a pathway removes its map; renaming a section updates its entries.

Later phases: generated questions with citations that the user can correct; mastery challenges; flagging stale cards when a source's hash changes; math and table extraction for scanned lectures.

## 6. Constraints for every task

- Work → Edition → Source is preserved. Study selections keep work, edition and source identity through the precise link; a page belongs to its source.
- Personal learning data never cascades with a deleted book; it keeps its saved label (as in ADR-007 and ADR-009).
- No new table or column without approval. The only proposed one is in ADR-013.
- Every string is in `translations.ts` (ar and en); layouts are RTL/LTR; mixed-script text is readable; original titles are kept; Arabic normalization applies to queries and indexes only.
- Assessment feedback always labels the check: checked automatically, rated by you, or needs judgment.
- **Live tests:** `tests/real-files/` plus the user's external course corpus (read-only), in Arabic and English.

## Sources (engagement research, 2026-11-09)

- [Duolingo blog — How the streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
- [Duolingo blog — Improving the streak](https://blog.duolingo.com/improving-the-streak)
- [Deconstructor of Fun — Duolingo streak mechanics](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- [Why Duolingo's gamification works and when it doesn't (DEV)](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4)
- [How Duolingo engineered 50M daily users, and the backlash](https://jtbdux-protocol.pages.dev/adoption-and-behavior/behavior-design-patterns/how-duolingo-engineered-50-million-daily-users-and-the-backlash-that-came-with-it)
- [Khan Academy — How do mastery levels work?](https://support.khanacademy.org/hc/tr/articles/5548760867853)
- [Khan Academy — Course and unit mastery](https://support.khanacademy.org/hc/articles/115002552631-What-are-Course-and-Unit-Mastery-)
- [Khan Academy — Mastery mechanics changes, Sept 2018](https://support.khanacademy.org/hc/de/community/posts/360023249611/comments/360003019811)
- [Coursera blog — Striking a balance with start dates and deadlines](https://blog.coursera.org/coursera-update-striking-a-balance-with-start/)
- [Codecademy — Weekly targets](https://help.codecademy.com/hc/en-us/articles/360056218734-Weekly-Targets)

The research figures come mostly from secondary analyses, and none of them are used as evidence in BagLib. The table above takes the mechanics, not the claimed retention numbers.
