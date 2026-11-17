# Revision System: Architecture and Integration Investigation

- **Status:** Investigation complete. Jira epic KEY-387 and its tasks were created on 2026-11-17. No production code and no schema changes yet.
- **Author:** Claude Code, 2026-11-17.
- **Sources inspected:**
  - Anki source `repos/anki-26.09.4.tar.gz`, extracted to a scratch folder and never committed.
  - Installed Anki 26.9.4 at `D:\Program Files\Anki`.
  - The user's real Anki profile (`%APPDATA%\Anki2\User 1`), copied and opened **read-only**. The profile itself was not touched.
  - The official manual: the tarball ships its source as `docs-site/manual/*.mdx`, cross-checked against https://docs.ankiweb.net/deck-options.html.
  - The BagLib code, ADR-006, ADR-013 and Jira (KEY-220 and its children, KEY-386).
- **Legend:**
  - **Verified** means seen in code, data or docs.
  - **Hypothesis** means a reasoned expectation that has not been tested.
  - **TBD** means a user decision.

---

## 1. What BagLib already has (verified)

| Area | State |
|---|---|
| Card model (ADR-006, migration 018) | A card is a `knowledge` row with `knowledge_type='card'`, plus `card_detail(front, back, source_kind, source_ref, source_label, language)`. **One card = one row.** There is no note → sibling-card layer. |
| Question kinds (ADR-013, migration 026) | `card_detail.question_kind` is one of `recall, choice, numeric, short, application, explain_back`, with `payload_json`. `practice_attempt` records `result` and `check_method` (`auto/self/judgment`). Multiple choice and typed answers already have a home. |
| Scheduler (`src/main/services/srs.ts`) | `ts-fsrs` 5.3.1 (FSRS-6, 21 parameters, `enable_fuzz:false`). `srs_state` holds state, due, S, D, reps and lapses. `srs_review_log` holds rating, duration, and a before/after JSON snapshot. The day boundary is **local midnight**. There is no rollover hour, learning-steps setting, burying, leech handling or per-deck options. |
| Decks (`card-decks.ts`) | A deck is `collection(collection_type='deck')`, flat, with cards in `knowledge_collection`. Decks can be generated once from notes or highlights. There is **no live link** back to the source. |
| Anki export | A **tab-separated text** file (`#guid column:1`, `#notetype:Basic`), not `.apkg`. It carries no scheduling and no media. There is no Anki import. |
| `collection.filter_rules` | An existing JSON column (migration 001), unused by decks. It could hold filtered-deck searches and deck-source sync rules **without a new table**. |
| Arabic normalisation | `src/shared/utils/text-normalizer.ts` already covers tashkeel, tatweel, alef/hamza, ة→ه, ى→ي, ؤ and ئ, and includes Levenshtein and token Jaccard. There are also **three more normalisers** (`poetry.ts`, `lookup-candidates.ts`, `editionExtractor.ts`). A grading pipeline should reuse one, not add a fifth. |
| Narrator dataset (**important**) | The Sunnah research corpus **already contains a rijal dataset**:<ul><li>`rijal_narrators`: name, name variants, kunya, nasab, laqab, tabaqah, death year AH, raw jarh wa ta'dil grade, tier, reliability score, teachers and students;</li><li>`hadith_narrators`: hadith → chain position → resolved narrator, with the resolution method.</li></ul>`SunnahResearchCorpus.narrator(id)` serves these today. **Task 5's narrator decks can be built now**; they don't need to wait for a future dataset. |
| Poetry | `poetryBayts()` already splits verses into `sadr` and `ajuz`, which is what Task 6's progressive cloze needs. |
| Reading status | `work.reading_status` (migration 003) can drive Task 7's "book finished → time to revise" trigger. |
| TTS | There's a TTS provider interface (`audio/tts-provider.interface.ts`, Pocket TTS). It can back Anki-style `{{tts}}` on reveal. |
| Wikipedia | `dictionary/wikipedia.service.ts` exists, so Task 10 has its data source. |
| AI | The app-wide assistant with any OpenAI-compatible provider, plus per-provider consent (KEY-383/384/385). This is Task 3's Tier 3 and Task 7's question generator. |
| Lists (KEY-386) | **Not built** (To Do). Its placement question is still open. Lists need new tables, because ayahs, hadith and poems are not `knowledge` rows, so `knowledge_collection` cannot hold them. Task 8 depends on it. |

### Existing Jira (verified)
- **KEY-220 "Notes Taking Epic 2: Knowledge Cards & Spaced Repetition"** (To Do) is an existing SRS epic. Its children:
  - Done: KEY-231 (data model), 232, 268, 318 and 319 (ayah/hadith range decks), 325.
  - **In Review:** KEY-234 (scheduler) and KEY-235 (decks + Anki export).
  - In Progress: KEY-233 (biographical cards).
- Related, already Done:
  - **KEY-286 (daily Quran wird and muraja'a revision cycle)**;
  - **KEY-175 (Quran memorization controls)**;
  - **KEY-318/319 (memorization decks from ayah ranges)**.

  These overlap the new Quran-hifz guardrail; see TBD-4.

---

## 2. What Anki 26.09.4 actually does (verified in source)

### 2.1 Storage and `.apkg`
- **Collection schema version 18.** The core tables are `notes`, `cards` and `revlog`, still in the old layout. But `notetypes`, `fields`, `templates`, `decks` and `deck_config` store their settings as **protobuf blobs**. In the user's collection, template blob field 1 is the front template and field 2 the back. `cards.due` means different things by queue: a day number since collection creation for reviews, epoch seconds for learning cards, and a position for new cards.
- **FSRS memory state** lives in `cards.data` as JSON: `{"s":stability,"d":difficulty,"dr":desired_retention,"decay":…,"lrt":last_review_secs}`. This is verified on the user's cards.
- **`revlog`:**
  - `id` is the review time in milliseconds;
  - `ease` is 1 to 4;
  - `ivl` and `lastIvl` hold days, or negative seconds;
  - `factor` holds the SM-2 ease, or the FSRS difficulty when FSRS is on;
  - `time` is milliseconds;
  - `type` is 0 learn, 1 review, 2 relearn, 3 filtered, 4 manual, 5 rescheduled.
- **The `.apkg` package** (`import_export/package/meta.rs`, `colpkg/export.rs`) is a zip containing:
  - **Latest:** `collection.anki21b` (a **zstd-compressed** schema-18 SQLite), protobuf `meta`, a protobuf media map, and zstd-compressed media files named `0`, `1`, …; plus a dummy `collection.anki2` that says "please update Anki".
  - **Legacy ("support older Anki versions"):** `collection.anki21` or `collection.anki2` (a schema-11 SQLite with JSON in `col.models/decks/dconf`), and a JSON media map. **No zstd.** Anki 26.09 still imports this.
- **Importing updates notes matched by GUID** when the file is newer, with options to always update, never update, or merge note types (manual, `importing/packaged-decks.mdx`). Scheduling is optional on import.
- **The fsrs-rs crate is version 6.6.2**, with FSRS-6 parameters (`fsrs_params_6`). `ts-fsrs` 5.3.1 also implements FSRS-6, so S and D can be **imported directly** without re-simulating history.

### 2.2 Cards, templates and generation
- The **stock note types** in `notetype/stock.rs` are: Basic; Basic (and reversed card); Basic (optional reversed card); Basic (type in the answer); Cloze; Image Occlusion. **There is no multiple-choice type.** In Anki, multiple choice is add-on territory, so exporting it to `.apkg` will degrade it to Basic.
- **Card generation only adds cards** (`notetype/cardgen.rs`). A card exists when its front renders non-empty, so conditional `{{#Field}}…{{/Field}}` controls which cards exist. Editing **never deletes** cards: orphaned ones are listed under Tools → Empty Cards for the user to confirm (`notetype/emptycards.rs`; manual, `templates/generation.mdx`). Task 2's deletion handling should copy this.
- **Cloze** (`cloze.rs`): hints `{{c1::text::hint}}`, multi-card `{{c1,2::…}}` and nested clozes are all tested in source.
- **Image occlusion** (`image_occlusion/`) is stored as cloze text, for example `{{c1::image-occlusion:rect:left=.23:top=.32:width=.20:height=.09:oi=1}}`. The shapes are rect, ellipse, polygon and text. `oi=1` occludes the inactive shapes too, giving "hide all, guess one"; without it the mode is "hide one, guess one". The image is a media file.
- **Typed answers** (`typeanswer.rs`): Anki only renders a character diff, and **the learner still grades**. `{{type:nc:Field}}` drops combining marks, and **Arabic harakat are combining marks**, so `nc` is Anki's version of "ignore tashkeel". There's no fuzzy or semantic grading at all.
- **`{{tts ar_SA:cloze-only:Text}}`** reads only the hidden part (manual, `templates/fields.mdx`).

### 2.3 Scheduler behaviour to copy (defaults verified in `deckconfig/mod.rs`)

| Setting | Anki default | BagLib today |
|---|---|---|
| Next day starts at | **4 AM, local time** (manual, `preferences.mdx`) | Local midnight |
| Learning / relearning steps | 1m 10m / 10m | None |
| New per day / reviews per day | 20 / 200 | No limits |
| Desired retention | 0.90 (the user's own decks use **0.85**) | ts-fsrs default 0.9 |
| Bury new / review siblings | **Off** by default | Not applicable (no siblings) |
| Leech | Threshold 8, **tag only** (source default; the manual's "suspend" wording is out of date) | None |
| Maximum interval | 36,500 days | ts-fsrs default |
| Easy days, load balancer, FSRS optimiser | Present | None |
| Filtered decks | Search-driven, temporary; cards return to their home deck | None |

---

## 3. The user's real Anki collection (verified, read-only)

- **Size:** 3,051 notes, 6,503 cards, 46,622 review-log rows, 43 decks and 5 deck presets.
- **FSRS:** on, with **2,002 cards carrying FSRS memory state** and `dr:0.85`. This is a good import-fidelity and performance test set.
- **Arabic hadith decks:**
  - "أحاديث الصحيح", with subdecks 74 كتاب الأشربة, 76 كتاب الطب and 78 كتاب الأدب;
  - note type **"حديث"**, with fields **الباب / الأحاديث / شرح** and one card: front = bab, back = hadith + sharh;
  - this is the Task 5 default template, already in use by the user.
  - The text is fully vocalised rich HTML with inline colours, and Quran quotes inside ﴿…﴾.
- **Vocabulary:** "english (and reversed card)", with 1,037 notes (Vocabulary / Translation (Arabic) / Meaning / Usage / Comment) and `[sound:…]` media. These are reversible vocabulary cards, the Task 9 pattern.
- **Cloze at scale:** "Multiplication Table" has 722 cloze notes producing 2,166 cards, with three clozes per note.
- **Templates contain `<script>`.** The hadith template runs JavaScript. **Imported templates must be rendered in a sandbox** (an isolated iframe with no Node or Electron access) or have their scripts stripped. This is a security requirement for Task 1's import.
- **Installed add-ons:**
  - Hyper TTS and AwesomeTTS;
  - Forvo pronunciation;
  - **AnkiConnect**;
  - Anki Image Picker;
  - Customize Keyboard Shortcuts;
  - two Japanese-only add-ons.

  This is the user's own priority list for TBD-2.

---

## 4. Architecture findings and recommendations

### 4.1 "Strict `.apkg` schema mirroring": recommended against as written (decision for the user)

Copying Anki's tables 1:1 into BagLib would bring in:
- protobuf blobs for note types and decks;
- queue-dependent `due` meanings;
- sync bookkeeping (`usn`, `mod`, `graves`);
- integer ids.

It would also **replace** ADR-006's shipped `knowledge`-based cards, and those are what give cards tags, comments, version history, backup and book-deletion survival.

| Option | For | Against |
|---|---|---|
| **A. Copy Anki's schema** (`notes`, `cards`, `revlog`, `notetypes`, `decks`) | Closest file layout | Breaks ADR-006 and migrates every existing card. Protobuf blobs inside BagLib's database. Two card systems during the migration. |
| **B. Anki-shaped BagLib model plus a lossless `.apkg` adapter** (recommended) | Keeps ADR-006. Adds only what's missing: **a note layer** (note → sibling cards by `ord`), note types with fields and templates as JSON, and the missing review-log columns (`ivl`, `last_ivl`, `factor`, `review_kind`). Round-trip ids (`anki_guid`, note/card ids, `ord`) keep re-import and re-export lossless. | Needs an adapter that converts `due`, revlog and memory state. New tables and columns need the user's approval. |
| C. Keep the text export only | No schema work | No scheduling or media round-trip, no import. Doesn't meet the request. |

**"Lossless" under B is defined as:** importing the user's own collection, then exporting it, then re-importing it into Anki keeps:
- every note and its fields;
- card ordinals;
- the FSRS S, D and desired retention;
- due dates (to the day);
- all 46,622 revlog rows;
- media;
- deck hierarchy (`::`);
- tags.

Deck-option fields BagLib doesn't use are kept in an opaque `anki_extra` JSON field so that re-export preserves them.

**Dependencies:**
- Zip: `fflate` is already a dependency.
- Protobuf: a small hand-written reader is enough, because only the note-type, template and deck fields are needed. No new dependency.
- **Importing modern `.apkg` (`anki21b`) needs zstd decompression.** Electron 32 ships Node 20, whose `zlib` has no zstd. The option is **`fzstd`**: decompress only, by the author of `fflate`, which BagLib already uses. That's a **dependency approval gate**.
- Exporting can use the legacy format, which needs no zstd and which Anki 26.09 still imports.

### 4.2 Scheduler parity gaps (Task 1)
- Add a **"next day starts at" hour** (default 4 AM) and use it for "reviewed today", due counts and burying.
- Add **per-deck presets**: learning and relearning steps (ts-fsrs 5 supports `learning_steps` and `relearning_steps`), daily limits, desired retention, maximum interval, burying and leech settings.
- **Sibling burying** needs the note layer from 4.1, which BagLib doesn't have today. It matters for hadith "bab → matn" plus "isnad → matn" pairs, and for reversed vocabulary.
- **Filtered decks** are saved searches in `collection.filter_rules`, for example `prop:r<0.85`, `is:lapsed`, `source:sunnah`, or "in list X". They never move cards.
- **Leeches** should keep Anki's default (tag at 8 lapses). BagLib then *offers* a "compare similar items" card or an AI breakdown, instead of silently suspending.

### 4.3 Live source sync (Task 2): proposed design
- **A deck subscribes to a source:**
  - a book's highlights and comments;
  - a bab or hadith collection;
  - a poem or diwan;
  - a KEY-386 list.

  The subscription is a rule in `collection.filter_rules`, so no new table is needed.
- **Every generated note keeps `source_ref` plus a content hash.** When the source changes:
  - **The text changed:** BagLib updates the note's fields in place. `srs_state` and the review log are never touched. Version history already records the edit (ADR-008).
  - **A new item appears:** BagLib generates the note and its cards and inserts them as new. Whether that happens silently or with a toast is a per-deck policy.
  - **The source was deleted:** BagLib **marks the cards orphaned and suspends them**. Review history is never deleted. An "Orphaned cards" review screen lets the user confirm deletion, Anki's Empty Cards pattern.
- **Sacred text rule (ADR-006) still applies.** Quran and hadith fields are copied verbatim from the source, never reworded.

### 4.4 Arabic grading (Task 3): benchmark on the user's own answers

**Method.** A scratch script (not committed) graded **1,037 real Arabic translations** from the user's vocabulary deck and **135 fully vocalised bab titles** from their hadith deck, against **synthetic** typed variants. It used BagLib's existing normalisation rules and the spec's thresholds: correct above 0.88, sent to AI between 0.45 and 0.85, wrong below 0.45.

| Case (n) | Spec thresholds: auto-correct / AI / auto-wrong | With a length-aware typo rule\*: auto-correct / AI / auto-wrong |
|---|---|---|
| Diacritics left out (135) | 100 / 0 / 0 | 100 / 0 / 0 |
| Hamza, ة/ه, ى/ي variants (933) | 100 / 0 / 0 | 100 / 0 / 0 |
| One typo (933) | **30 / 65 / 0** (5% fall in the gap) | 90 / 10 / 0 |
| Two typos, answers of 6+ letters (428) | 14 / 77 / 0 (8% in the gap) | 63 / 36 / 0 |
| Word order changed (130) | 100 / 0 / 0 | 100 / 0 / 0 |
| One of several listed alternatives (45) | 100 / 0 / 0 | 100 / 0 / 0 |
| **A real synonym that is not in the key (45)** | **0 / 7 / 93** | 2 / 4 / 93 |
| A wrong answer, taken from another card (933) | 0 / 1 / 99 | 0 / 1 / 99 |

\*The length-aware rule also accepts an edit distance of ≤1 for answers of 4 or more letters, and ≤2 for 8 or more. It added **no false accepts**.

**Findings:**
1. Tier 1 handles orthography, diacritics, word order and listed alternatives perfectly.
2. A fixed 88% ratio is **too strict for short Arabic words**. One typo in a 4–5 letter word scores about 0.75–0.80. Use length-aware edit distance. Accept close answers *with the diff shown* and a one-key override, as Anki does.
3. **The spec's 0.85–0.88 band is undefined.** 5–8% of typo cases landed there.
4. **The real gap is synonyms.** Correct synonyms score below 0.45, so they are auto-rejected and **never reach Tier 3**. This is exactly what Tier 2 embeddings would catch; see TBD-1.
5. Tashkeel stays significant for nahw and sarf decks (a per-deck or per-tag flag). This is Anki's `type:` versus `type:nc` distinction.

**Limits of the benchmark.** The typed variants are synthetic, because Anki doesn't store what learners type. The answers are short vocabulary plus bab titles, with no long matn or sharh answers. The synonym set is small (45 pairs).

---

## 5. TBD findings (for the user's decision; nothing chosen)

### TBD-1: a Tier 2 local embedding model, or two tiers only

**Evidence.** See 4.4. Tier 1 plus length-aware typos covers the orthographic and typo classes, about 90–100% of them with no false accepts. What remains is **semantic: synonyms and paraphrases**. Today they are auto-rejected and the AI never sees them.

| Option | Pros | Cons |
|---|---|---|
| a. **Two tiers only**, plus a visible *"I think I was right / Verify with AI"* button on every wrong verdict, and an option to send scores below 0.45 to AI when the deck is marked "meaning-based" | No download. Uses the existing AI and consent. | Synonyms need a click, or depend on being online and having an AI provider. |
| b. **"Tier 1.5", no download:** expand the answer key with synonyms from BagLib's installed lexicons and dictionaries (headwords, migration 012) and Quranic or morphological roots already on disk, then match by root or stem overlap | Offline, 0 MB extra, and Arabic-specific | Coverage depends on which dictionaries are installed. Root matching can over-accept (same root, different meaning). Needs its own benchmark. |
| c. **A local multilingual embedding model** (for example the e5-small or MiniLM-multilingual classes) | Offline semantic matching | **Hypothesis:** quantised sizes are around 100 MB and up, which contradicts the under-15 MB target. **I found no Arabic-capable semantic model under 15 MB with credible quality.** Static-embedding distillations (model2vec-style) might fit, but I haven't verified their Arabic quality. Downloading any of them needs approval, and runtime inference would add ONNX or WASM to the app. |

**Next step if wanted:** benchmark option b on the same 45 synonym pairs, plus a real typed-answer set collected from the user, before deciding on c.

### TBD-2: compatibility with Anki add-ons

**Verified.** An add-on is a Python package that Anki loads into its own process, and it drives the Qt GUI directly (`from aqt import mw`, `aqt.qt`, hooks). Running one would mean embedding Python, PyQt and Anki's Rust backend inside Electron: hundreds of MB, and a second app inside the first. It would also run third-party code with full access. **Native compatibility isn't realistic.**

Two options, both within reach:
- **Re-implement natively, using the user's own add-ons as the priority list:**
  - TTS (Hyper/AwesomeTTS): BagLib's TTS providers plus `{{tts}}` and `cloze-only`;
  - Forvo pronunciation: an optional online audio fetch, which needs a privacy and consent decision;
  - Image Picker: image search into a card field;
  - Customize Keyboard Shortcuts: review-screen keybindings.
- **Compatibility at the edges instead of a runtime.** BagLib's `.apkg` import keeps whatever add-ons created: `[sound:]` media, custom templates (sandboxed) and custom fields. *Optionally*, it could expose an **AnkiConnect-compatible local API**, so browser tools such as Yomitan can add cards to BagLib. Pros: those tools work unchanged. Cons: a localhost HTTP server needs a security design (a token, origin checks, off by default).

### TBD-3: proactive revision recommendations (three approaches, none chosen)

1. **Rule-based planner (offline, deterministic).** A daily "Revise next" panel built from FSRS queries:
   - lowest retrievability first (`prop:r<0.85`);
   - overdue backlog;
   - recent lapses and leeches;
   - **coverage gaps**: books finished with no deck, a bab memorised but its narrators not, a poem half-chunked.

   *Pros:* explainable, free, private. *Cons:* doesn't understand meaning; the rules need tuning.
2. **Graph-driven.** Rank due and unstudied material by closeness in BagLib's link graph to what the user is reading or planning now: the same bab, narrator, root or subject; study planner KEY-221; pathways. *Pros:* revision follows what's being studied. *Cons:* depends on how dense the graph is, and is harder to explain.
3. **AI coach (opt-in).** A weekly or on-demand summary of aggregate stats (no raw text unless the user consents) through the existing provider, proposing next steps and study goals. *Pros:* flexible natural language. *Cons:* cost, needs consent, non-deterministic.

They can be layered (1 as the base, 2 for ranking, 3 on demand), but the choice is the user's.

### TBD-4: a long-term policy on Quran memorization
- **Proposed boundary text:** "BagLib does not provide Quran hifz features (memorising the script or verses), because that requires instruction from qualified scholars. Quranic roots, vocabulary and tafsir highlights are in scope."
- **Conflict found, which needs the user's decision.** These shipped features already serve hifz-style revision:
  - KEY-318/319 (memorization decks from ayah ranges);
  - KEY-175 (Quran memorization controls);
  - KEY-286 (daily wird and muraja'a cycle).

  The options are:
  - (a) keep them, as recitation and review aids outside the Revision system;
  - (b) hide them behind a setting;
  - (c) remove or relabel them.

  None of the new tasks will extend them in the meantime.

---

## 6. Other open questions for the user
1. **Epic:** re-scope the existing **KEY-220** into the Revision epic, keeping KEY-234/235 as its foundation, or create a new epic and link KEY-220 to it.
2. **Schema:** Option B in 4.1. It needs approval of a new ADR, ADR-017, for the note layer and note types, the extra review-log columns, and the round-trip ids.
3. **Dependency:** `fzstd`, for importing modern `.apkg` files.
4. **Auto-grading → FSRS rating:** should a verdict set the rating automatically (correct → Good, wrong → Again), or suggest one that the learner confirms with one key? Anki always lets the learner grade.
5. **Day boundary:** adopt Anki's 4 AM default, or keep midnight?
6. **Multiple choice** exports to Anki as Basic, with the options on the front, which loses the option list. Is that acceptable?
7. **KEY-234/235 acceptance:** the acceptance bundle planned earlier was never dispatched. Should it go ahead before Task 1, so Task 1 builds on accepted work?

---

## 7. Jira structure (created 2026-11-17)

The user approved, and these were created: epic **KEY-387** (linked to KEY-220); 1A–1E = KEY-388 to 392; Tasks 2–10 = KEY-393 to 401; research tasks TBD-1, TBD-2 and TBD-3 = KEY-402, 403 and 404.

**Epic: "Revision Epic: BagLib native revision system".**
- Label: `Notes-Taking`.
- Either a re-scoped KEY-220 or a new epic (question 6.1).
- Epic description: the product vision, the guardrails (TBD-4), and links to this document and ADR-006/013.

Task 1 is split into five, because it's too big for one agent to deliver and review. Each task gets the house format: label, parent epic, "Done when", and "Suggested agent: X. reason."

| # | Task | Depends on | Label | Open items in the ticket | Suggested agent |
|---|---|---|---|---|---|
| 1A | **ADR-017 revision data model:** note layer, note types (fields and templates JSON), sibling `ord`, review-log columns, round-trip ids, presets. Doc and approval only. | KEY-234/235 accepted | Notes-Taking | Questions 6.2, 6.5 | Claude, because it's a design and approval document. |
| 1B | **Scheduler parity:** rollover hour, learning steps, daily limits, per-deck presets, sibling burying, leech tagging, filtered decks (`filter_rules` searches) | 1A | Notes-Taking | 6.5 | Codex, because it's service logic and tests. |
| 1C | **Note types and card generation:** Basic, Reversed, Optional reversed, Cloze (hints, multi, nested), progressive context cloze, Type-in-answer, Multiple choice; conditional generation; sandboxed template renderer; `{{tts}}` | 1A | Notes-Taking | 6.6 | Codex for the generation engine, then Antigravity for the review-screen UI. |
| 1D | **Image occlusion:** editor (rect, ellipse, polygon, text), both modes, card media storage, Anki-compatible `image-occlusion:` cloze text | 1C | Notes-Taking | none | Antigravity, because it's canvas-heavy UI. |
| 1E | **`.apkg` import and export, lossless:** import `anki21b` and legacy, export legacy, FSRS S/D, due and revlog conversion, media, deck hierarchy, GUID update rules; tested on the user's real collection (copy only) | 1A, 1C | Notes-Taking | Dependency 6.3 | Codex, because it's format and adapter work with a large test matrix. |
| 2 | **Live source → deck sync:** subscriptions in `filter_rules`, content-hash diffing, in-place updates keeping FSRS state, new-item injection (silent or toast policy), orphan → suspend → confirm screen | 1C | Notes-Taking | The silent-vs-toast default | Codex |
| 3 | **Arabic grading pipeline:** one shared normaliser, a nahw/sarf tashkeel flag, length-aware Tier 1, accept-with-diff plus override, Tier 3 on the gray zone or on click; records `practice_attempt` | 1C | Notes-Taking | **TBD-1**, questions 6.4 and the 0.85–0.88 gap | Codex for the logic, then Antigravity for the answer UI. |
| 4 | **Revision browser and deck manager:** filters by source type, science/discipline and lists; sorting; saved searches; bulk actions | 1B; KEY-386 for list filters | Notes-Taking | Where "science" comes from (book categories vs card tags) | Antigravity, because it's a large UI on existing queries. |
| 5 | **Sunnah decks:** right-click a book, bab or collection to make a deck; three templates (bab → isnad+matn, bab → matn, isnad → matn); **narrator decks from the existing `rijal_narrators` and `hadith_narrators` data** (from mastered hadith or chosen babs) | 1C, 2 | Sunnah | Which narrator fields go on cards | Codex |
| 6 | **Poetry decks:** right-click a poet or diwan; whole-poem mode; daily new-verse quota; progressive context cloze (verse N−1 shown, N clozed by sadr or ajuz, N+1 blurred) | 1C, 2 | Library | none | Antigravity, because the work is mostly card layout. |
| 7 | **Books:** import a book or category as a deck; AI question and MCQ generation from highlights and comments (unpublished until accepted, ADR-013); "finished book → time to revise" prompt from `reading_status` | 2, 3 | Reader | AI consent reused per provider | Codex |
| 8 | **Notes lists → decks:** "Revise this list" on KEY-386 lists, reversible cards, live sync on add, edit or reorder | **KEY-386**, 2 | Notes-Taking | KEY-386's placement question | Antigravity |
| 9 | **Lexicons, vocabulary, Quranic roots and tafsir:** bulk lexicon extraction, translation cards both ways, inline "add word ↔ meaning" from lookups, root-concept cards, tafsir highlight cards. **No hifz** (guardrail). | 1C, 2 | Quran | TBD-4 | Codex |
| 10 | **Biographies and Wikipedia quick-cards:** name or title → first summary paragraph, from `wikipedia.service.ts`; scholar decks; coordinate with KEY-233 | 1C | Notes-Taking | Overlap with KEY-233 | Antigravity |
| R | **Research tasks for the TBDs** (no code): TBD-1 Tier 1.5 benchmark; TBD-2 AnkiConnect API security design; TBD-3 recommendation approach | none | Research | Each is a decision | Claude |

**Proposed order:** first finish KEY-234/235 acceptance, then 1A (gate), then 1B, 1C and 1E (1B and 1C can run in parallel, because they touch different files), then 1D and 2, then 3, then 5, 6, 8 and 9 (each with its own module files), then 7, 4 and 10.

---

## 8. User decisions (2026-11-17)

- **Answer grading is shelved.**
  - Automatic grading of typed answers (Tier 1 fuzzy and Tier 3 AI, KEY-394) and the TBD-1 research (KEY-402) are **on hold**. They must not be started without the user's approval.
  - Type-in cards follow Anki exactly (KEY-390): a character diff on reveal, and **the learner grades**.
  - Section 4.4 stays as reference for when the work resumes.
- **TBD-4 is resolved for now.**
  - The shipped Quran features KEY-175, 286, 318 and 319 **stay as they are**.
  - Wird and muraja'a are important and belong to revision, but they're outside the Anki ecosystem being replicated.
  - Their placement (the to-do list, Revision, or both) is undecided. Future follow-up: **KEY-405**.
  - The no-new-hifz-features guardrail still applies.
- **ADR-017 revision 2** (same day) supersedes parts of sections 4.1–4.3:
  - The user allowed restructuring, because the app hasn't shipped. Decks move to dedicated `deck`, `deck_card` and `deck_subscription` tables, replacing `collection` decks and `filter_rules` JSON.
  - Day start: 4 AM by default, with a Settings option for midnight.
  - Notes have their own table.
  - Anki's rating-0 entries are "reset to new" markers.
  - Shared cards stay shared until edited, with a choice of "this deck only" or "everywhere". Live sync flags copies instead of overwriting them.
  - See `docs/ADR-017-revision-data-model.md`.
