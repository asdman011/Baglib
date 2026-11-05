# Pathways and Wave 5 Research

Wave 5: KEY-247 to KEY-254, under KEY-224, KEY-227 and KEY-228. Implemented in the working tree on 2026-11-02 by Claude Code. Not committed, not pushed and not updated in Jira. Storage decisions are in [ADR-009](../ADR-009-pathways-research-and-curriculum.md).

## What each ticket got

| Ticket | Done in the app | Still open |
| --- | --- | --- |
| KEY-247 | Name المسارات / Pathways, ADR-009, outline template format | None |
| KEY-248 | Projects with ordered sections, books, notes, ayat, hadith and links, pins, BibTeX and Markdown export | Classroom features stay a later follow-up, as the ticket says |
| KEY-249 | Curriculum from a template, from AI or from scratch, edited as an outline, with steps as planner tasks | Curated syllabi from the board's sources are not included |
| KEY-250 | Quran, Sunnah and poetry search as you type, plus site search buttons | EKB has no button. Results from sites open on the site |
| KEY-251 | Done earlier. The form in the Quran and Sunnah views is now seen working live | Search results still show a reference with no jump |
| KEY-252 | Frequency by root and lemma, and source lines on connections | Munasabah proper: no citable source yet |
| KEY-253 | Hadith commentary by stable ID, and Shrouh text beside the hadith with attribution | Only hadith with an aligned commentary can show it |
| KEY-254 | Counts per collection, top narrators, subjects from source chapter titles | Isnad analysis stays exploratory. Guide to Sunnah APIs not evaluated |

## Verified findings

### Quran frequency

- The QUL pack holds two different numbers. `roots.words_count` is the pack's own total. `root_words` holds word links.
- 1,628 of 1,642 roots agree. For 14 roots the links exceed the total, or in one case fall one short, and 50,298 links compare with a 49,968 total.
- `corpus.quran.com` agreed with `words_count` on all 16 roots that returned a figure: 1722 قول, 2851 إله, 854 علم, 339 رحم, 525 كفر, 63 حمد, 405 يوم, 17 مدن, 21 هود, 184 حيي, 108 فعل, 119 عزز, 119 أمم, 21 مني, 70 عرف, 382 أيي. The page returned no figure for مسح, جود or برق, so those three are unchecked.
- The links run wider because they also tie names and compounds to a root. For ح م د the five extra links are محمد at 3:144, 33:40, 47:2 and 48:29 and أحمد at 61:6. For ي و م, the links include يومئذ at 80:37, 99:4 and 99:6.
- The panel therefore leads with the pack's total, which matches the reference, and shows the link count beside it when they differ. A surah filter has no pack total, so it counts links.

### Hadith statistics

Live totals match the verifier report: 325,841 chain positions, 115,735 narrator profiles, 844,117 root links, 73,325 records, of which 67,611 are the nine verified collections. A cold full scan took 17.5 seconds in one query, so it runs in batches of 500 rows and is cached for the session. In the app the first run took 11.9 seconds and the slowest reply to another call during it was 0.55 seconds.

### Site search addresses

Checked by request on 2026-11-02. Islamweb's address came from its own page script. IslamQA, IslamWay, PMC and JSTOR returned 200. CORE and ScienceDirect returned 403 to a script, which proves nothing about a browser. EKB returned 429 and has no public search address I could confirm, so it has no button.

## Hypotheses and open questions

- CORE and ScienceDirect probably work in a normal browser. Not checked in one.
- Whether a mixed Arabic BibTeX file imports cleanly into Zotero or Zettlr. Neither is installed here.
- A hosted AI provider's real drafts. The live check used a local stub.
- Munasabah needs a citable source from the user. Nothing here generates it, and each connection panel says its data is not munasabah scholarship.

## Limits

- Poetry search needs the Bayan data, which the live profile did not have, so that group showed its not-installed state.
- Sunnah search stops at 200 hits, shown as 200+.
- The chain figure counts positions, not distinct hadith, so a narrator repeated in one chain counts twice.
- Removing a step leaves its planner task. Deleting a pathway does too, by design.
- Subjects group identical titles only, so `كتاب الصلاة` and `أبواب الصلاة` in another wording may stay apart.

## Verification

`scripts/wave5-live` needs a copy of the installed Quran packs in `.baglib-data/wave5-quran-copy`, made by hand and removed after the run. It runs the real main process, preload and dev renderer on a throwaway profile, with that disposable copy and the real read-only Sunnah database, in Arabic and English. AI uses a local stub, and save dialogs and external links are captured. Latest passing run: `.baglib-data/wave5-live-wc5CmX`. Screenshots at 1280 and 480 widths were inspected. Tests are in `tests/services/pathways.test.ts` and `tests/services/sunnah-insights.test.ts`, plus frequency cases in `quran-reader.test.ts`.
