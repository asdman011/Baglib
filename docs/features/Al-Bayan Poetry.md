# Al-Bayan Poetry

## Scope and status — 2026-10-28, Codex

Native checkpoint run-myaJ8Y: real-corpus first40results and poem detail open successfully; Arabic/English UI directions at480/1280 pass overflow checks and screenshot capture. A separate disposable SQLite English stanza fixture is selected through the language filter and rendered LTR; installed Arabic corpus remains read-only. Zero renderer errors. Arabic and English-UI narrow screenshots visually inspected. Fixture registration is not production IPC-origin-guard coverage; exact deep-link restoration, saved note roundtrip, clipboard, requested fonts and TTS still require verification.

User-approved separate poetry partition and bilingual layout foundation. Existing Work → Edition → Source and unfinished PDF work remain unchanged. The full corpus is installed; the broader workspace objective remains incomplete.

## Verified dataset evidence

Actual download audit: two converted Parquets contain127315rows each (254630total). SHA256: shard0000 `75cffe4e2fb5a44855eba3ed695fbdd8931b6d9e36f22f413466ff5574d6a467`; shard0001 `6a5ff88137ce13653ef042d09a108b1ea6f7dfa5e221c9ec3abe92b6bd5cc04c`. All source rows were scanned for required fields:91765titles are null, no empty poet names or non-list verse arrays. Null titles map to empty strings because approved title column is NOT NULL; original nulls remain in retained Parquets, with no invented title or verse. Initial fail-closed staging revealed this source shape; subsequent full installations succeeded, including the compiled pipeline verification below.

The official [arbml/ashaar dataset](https://huggingface.co/datasets/arbml/ashaar) viewer advertises approximately255k training rows and the requested poem/poet fields. Viewer examples show consecutive Arabic hemistich strings and classical meter names beginning with `بحر`. Both complete shards have now been downloaded and counted as recorded above. License terms and full-data layout anomalies remain to be audited before distribution claims.

## Implemented foundation

### Reviewed effective layout policy

All6audit candidates were inspected:9016/15284 have truncated short source lines;10045/18264 are muwashshah with short refrains;30481/45793 alternate long/short lines. `free_verse` here is a single-column display mode, not an assertion that their source meter or genre is incorrect. Existing even bayt rows receive effective classification in detail and matching excerpts; future ingestion stores the classifier result. Stored original verse strings and meter labels are never rewritten. Explicit odd orphan layouts remain paired as configured. Nine focused tests/typecheck/lint pass; native verification follows.

### Conservative irregular-line detection — 2026-10-28

The ingestion classifier now measures derived line lengths after removing BBCode/HTML-like markup, diacritics, tatweel and whitespace. For at least four nonblank lines, an upper quartile of at least16characters exceeding the lower quartile by more than3x selects free verse. This intentionally requires sustained variation, not a maximum-length outlier. It is a conservative rendering heuristic, not a claim to scan Arabic meter. Canonical strings remain unchanged. Eight focused tests/typecheck/lint pass, including sustained variation and isolated long/markup outliers. Existing installed classifications have not been rewritten; a full-corpus delta audit is still required before applying the new policy to existing rows.

### Classical canvas and copy verification — 2026-10-28

Native run-IQ8EtP asserts both canonical hemistich strings, display-only tashkeel removal, justification style and Copy-button output preserving vocalization and the ` *** ` separator plus citation. The database verse JSON remains unchanged. The fixture captures `navigator.clipboard.writeText` rather than overwriting the user's system clipboard; this verifies the application API payload, not OS clipboard persistence. TypeScript/focused lint pass.

### Bounded discovery pages — 2026-10-28

Discovery retains only the current40-row result window, using Previous/Next cursor pages rather than accumulating every loaded card. Cursor history is tied to the current language/query/facets/poet selection, and result scroll resets on page completion. Native run-PItal4 verifies forward/backward restoration while exactly40cards remain rendered; the wider native regression also passes. TypeScript/focused lint pass. Longest-poem search profiling is still pending.

### IPC access and partition verification — 2026-10-28

Production Poetry IPC uses `services/poetry/access.ts` to reject subframes, malformed URLs, credential-bearing URLs and remote file shares. Allowed top-frame origins remain local file URLs, `app://-` and `http://localhost:3000`. Unit tests exercise that actual predicate; they are not a substitute for live hostile-frame invocation coverage. Physical partition tests now assert all requested WAL/NORMAL/MEMORY/mmap/cache pragmas, not only WAL/cache.

### Real offline selected-verse narration — 2026-10-28

**Superseding user decision:** narration is English poetry only. Arabic poems never mount the TTS hook or display narration controls, regardless of installed system voices. `EnglishPoetryNarration` owns English selection playback and teardown; changing selections unmounts the prior audio session. Earlier Arabic-fallback experiments described below are historical and no longer enabled in Poetry.

Post-isolation verification: real offline run-pknADI passes English sequential playback, Pause/Resume/Stop, navigation cancellation and release. Default native run-n3qbFv explicitly asserts zero voice initialization while browsing/selecting Arabic poetry and absence of its narration component. All1010tests, TypeScript and focused lint pass at this checkpoint.

The Poetry toolbar reuses `useTTSAudio` and the existing `TTSProvider` IPC contracts, passing only selected canonical bayts/lines (no synthetic book ID). Pause now exposes a localized Resume action instead of requiring selection playback to restart. Stop and reader teardown use the existing hook's cancellation/source cleanup. The hook already stabilizes callbacks through refs; no obsolete effect-loop fix or replacement engine was introduced.

Run the opt-in native fixture with `BAGLIB_POETRY_REAL_TTS=1` and `node scripts/poetry-live/run.mjs` when Pocket TTS/model/Alba are provisioned. It uses the real `PocketTTSProvider`, real PCM streaming and actual WebAudio scheduling, with `HF_HUB_OFFLINE=1`, renderer HTTP/HTTPS blocked and audio output muted. The default fixture still explicitly models unavailable TTS and makes no synthesis claim. The opt-in run exercises sequential selected English lines, pause/resume, explicit Stop and navigating away during another active generation, asserting stopped jobs and zero remaining scheduled WebAudio sources, then releasing the provider. It does not validate perceived pronunciation or audible sound quality.

Existing independent offline TTS baseline passed:3sentences,147PCMbuffers, maximum scheduling gap39.48ms. Native Poetry run-KaA6Oh passed real selected-line synthesis (42PCMchunks), sequential completion, pause/resume, job cancellation, unmount cleanup and released server status, with no requests for unselected text. An earlier harness run-sWlDOa incorrectly expected Stop to set `idle`; the existing hook contract is `stopped`, which the corrected test now respects. No shared playback-state contract was changed to satisfy the test.

Pocket TTS has no native Arabic model in this integration. Poetry checks for an installed Arabic browser/system voice before starting Arabic narration; absence produces a localized actionable notice instead of silently choosing a non-Arabic voice. If present, the existing system-voice path is used with the existing Pocket-Arabic-fallback notice. Arabic text is never sent to the English Pocket model. Native coverage checks this routing/notification policy; Arabic speech quality and installing extra OS voices remain outside this verification.

### Human-voice poem narrations — 2026-10-28

User decision: Arabic poems in Al-Bayan receive narration solely through human voices (microphone recordings, attached local audio files, or online links via YouTube, SoundCloud, Vimeo, and direct HTTPS audio URLs). Computer-generated speech (TTS) is never stored or played as an Arabic poem narration. English poetry retains its existing Pocket TTS bar upon verse selection.

1. **Storage & Architecture**:
   - SQLite migration 017 (`src/main/database/migrations/017_poetry_narration.ts`) adds `poetry_narration` in the core database (`baglib.db`). Because the poem corpus lives in an immutable dedicated partition (`bayan_poetry.sqlite`), `poem_id` serves as a stable external reference rather than a foreign key.
   - Enforces check constraints: local narrations (`kind <> 'online'`, `provider = 'local'`, non-null `file_name`, null `url`), and online narrations (`kind = 'online'`, `provider <> 'local'`, non-null `url`, null `file_name`).
   - Managed audio files live strictly in `userData/poetry-narrations/<uuid>.<ext>` with UUID-based filenames to avoid directory traversal.
   - Supported audio formats: `.mp3`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus`, `.wav`, `.flac`, `.webm` up to 200 MiB.
   - Link parser validates and canonicalizes YouTube (`youtu.be`, `youtube.com` watch/shorts/embed with timestamp parsing), SoundCloud, Vimeo, and direct HTTPS audio files.
   - Embed URLs use privacy-respecting embeds (`youtube-nocookie.com`, `w.soundcloud.com`, `player.vimeo.com`).
   - Electron network layer: `ContentShieldService` injects a valid `Referer` header for `www.youtube-nocookie.com/embed/*` requests, defusing YouTube player configuration error 153 caused by missing Referers in packaged desktop apps.

2. **Frontend Experience & Audio Controls**:
   - `PoetryNarrations.tsx` integrated in `PoetryReader.tsx` via the reader header toggle `البيان → الإلقاء`, participating in the mutually exclusive single-panel state machine.
   - Microphone recording uses `navigator.mediaDevices.getUserMedia` with echo cancellation / noise suppression and WebM/Ogg/MP4 container inspection. Includes a duration recovery mechanism for Chromium MediaRecorder WebM files that lack duration headers.
   - Bilingual UI/UX: full Arabic RTL and English LTR support with logical CSS properties and centralized strings in `translations.ts`.

### Poet biography, browser and navigation — 2026-10-28

`PoetBiography.tsx` replaces the former biography-only box/filter link with a logical-side overlay drawer containing source biography, era/origin and the poet's other poems. It requests40rows through the existing indexed worker search, excludes the active poem, supports forward/backward cursor pages and opens exact source-linked poems. Only one page is rendered; all pages remain reachable without loading a whole diwan. Close/Escape returns focus to the biography control. It shares the reader's existing mutually exclusive panel state with Typography/Saved verses. Blank source values remain blank.

The primary NavigationRail includes the specified localized `البيان — الشعر والأدب` tooltip (English equivalent included), immediately after Quran/Sunnah. Switching corpus language clears a previously selected poet ID as well as other facet filters, preventing an Arabic poet filter from hiding the English dataset.

Native run-GJJXJE verifies actual corpus poet-browser virtual scrolling (40rendered entries after a400-row scroll), vocalized `المُتَنَبِّي` name search, poet filtering and English switching/reset. It verifies biography page text against source query results, next/back pages, poem opening, exclusive typography transition and Escape/focus restoration. Arabic480drawer capture visually inspected. The real NavigationRail/WorkspaceProvider fixture checks Arabic/English ordering, tooltips and clicks opening the Poetry workspace. This is navigation-component integration coverage, not the complete AppLayout/startup shell or production IPC-origin guard test. Expanded bilingual drawer screenshots/checks are recorded in CURRENT_TASK.md.

Initial native runs E3jrEq/NPCGcJ clicked the prior reader before an asynchronous same-ID reference remount had committed. The fixture now waits for both poem ID and source reference, rather than treating matching ID alone as navigation completion.

### Compiled corpus provisioning — 2026-10-28

The application now launches `dist/main/poetry-provision-worker.js` with Electron's Node runtime, not checkout-only `tsx` scripts or a nested `require('electron')` executable lookup. `PoetryProvisioner` uses writable userData as the working directory. The worker, CLI and download helper share `services/poetry/corpus.ts` and `seed.ts`; production inference/parsing never enters the renderer. `tsup.config.ts` builds the worker; `electron-builder.yml` includes `assets/poetry/parquet_rows.py` under `resources/poetry/`. No new JavaScript dependency or database schema is introduced.

Runtime prerequisites remain **Python with PyArrow installed**. `BAGLIB_POETRY_PYTHON` selects its executable; development can reuse the existing Hadith alignment interpreter, while a non-checkout installation falls back to `python` (Windows) or `python3` (Unix). The worker probes PyArrow before downloading. The bundled parser path is passed explicitly by main IPC. A missing interpreter/module produces localized setup instructions instead of a silent timeout. Python/PyArrow are not automatically installed or included in the app package; an actual packaged-app runtime test remains pending.

Background cache defaults to `userData/cache/poetry/shards`; `BAGLIB_POETRY_CACHE` can select an existing cache. The CLI `npm run seed:poetry` builds main and invokes the same compiled worker, defaulting to the existing development shard cache. Both shards must match the audited byte sizes and SHA256 values in `POETRY_SHARDS`, including when reused from cache. This prevents mutable upstream refs or corrupted cached bytes from silently changing ordinal cross-reference IDs. Integrity mismatch fails closed with a localized diagnostic; cache repair is manual currently. The managed manifest records the approved files/URLs/hashes. Downloads report aggregate MiB and percentage across both shards; imports report localized row counts. The UI resumes polling on remount and refreshes queries even when setup immediately reports ready.

Seeding parses bounded batches into a fresh isolated staging partition, validates the exact expected254630rows plus SQLite integrity, checkpoints/closes WAL and publishes with an exclusive hard link. Existing corpus files are never overwritten. Wrong-count/cancelled/failed imports cannot publish a final partition. Failed staging remains available for diagnostics; automated pruning is not implemented. Shutdown terminates the subprocess tree on Windows or process group on Unix.

Verified `npm run seed:poetry` against cached official shards in isolated `.baglib-data/poetry-install-01c88db9a3284ac6ad27f507df4c15b6` (exit0). Independent read-only audit:254630poems,8184poets,254630FTSrows,14470descriptions, quick_check=ok, zero FK violations. The user's installed corpus was not replaced. This is a full compiled CLI installation test, not a fresh network download or UI-triggered install test. Native reader run-8y6wgW still passes after the status/progress changes. New tests cover real tiny-Parquet publication/non-overwrite/wrong-count/abort, corrupt-cache rejection and child-process progress/error/duplicate-start/retry lifecycle; the real-Parquet unit test skips explicitly where no configured interpreter exists.

### Native Knowledge records — 2026-10-28

Inspection of `src/main/database/migrations/001_initial_schema.ts` verifies `knowledge.work_id` is nullable already, as are edition/source links. Earlier handoff assumptions that Poetry Quote/Bookmark support required a schema migration were incorrect: the constraint was the book-oriented TypeScript DTO, not SQLite. The dedicated `PoetryKnowledgeService` uses the approved existing `knowledge`, `note_detail`, `quote_detail` and `bookmark_detail` tables without new entities, fields, migrations, Work records or corpus writes. Its dedicated corpus DTO avoids pretending corpus references have book IDs. Existing book-oriented Knowledge APIs are unchanged.

`knowledge.location` stores `poetry:ashaar:<poemId>:<from>:<to>`. Guarded Poetry IPC validates the request and fetches canonical poem detail through the read-only corpus worker before writing a transaction in the main database; renderer-supplied text cannot replace quoted corpus text. Selection boundaries must exist in the poem. Notes include a valid study reference, selected text, citation and optional personal reflection; quotes retain canonical selected text and citation/reflection context; bookmarks retain the title and exact source range. Canonical whitespace/diacritics remain intact, with ` *** ` separating paired hemistichs for formatting.

The selected-verse toolbar provides Note, Quote and Bookmark actions plus an optional two-line personal comment field. Saved verses displays native record types alongside previous Study Notes, preserves legacy entries and can page beyond the former100-note cutoff. Native records are fetched40at a time; the saved drawer is not itself an editing/deletion manager. Main Notes uses a derived `knowledgeId` to edit/delete native corpus notes through the existing Knowledge API rather than creating a divergent private-only note; this field is UI metadata, not a database column. Existing native attachment identity is preserved, and canonical Knowledge content wins over a same-ID private settings shadow. Book-oriented legacy DTOs still assume non-null work IDs; no claim of every library UI or book-reader routing for corpus rows is made.

`tests/services/poetry-knowledge.test.ts` verifies all three detail tables,40-row paging, exact canonical quote content, range/type validation, zero new work rows, unchanged table inventory and FK integrity against the real migration schema. Final native run-8ejaCj verifies all three actions, mixed-script personal reflection, persistent SQLite reopen, no fake books, legacy visibility, saved-item navigation, and actual main Notes/Scratchpad edit/delete with the same source reference and untouched quotes/bookmarks. The fixture bundles current production worker/preload source into an isolated run directory; prior dist-dependent runs failed when the worker artifact was absent. The installed corpus remains read-only and these native tests use a disposable main-database fixture, not the user's live Knowledge database.

### Matching-bayt search and exact navigation — 2026-10-28

FTS still searches normalized title/poet/poem text using bounded, parameterized queries in the read-only corpus worker. For nonempty queries only, the bounded result window reads canonical verse arrays and scores consecutive bayts (or individual free/stanza lines) by distinct matching tokens. The first best-scoring row is returned as a source-indexed excerpt; title/poet-only hits may have no excerpt. Default browsing does not load verse arrays. Complete arrays never cross IPC in discovery responses. This adds per-result JSON/linear scan work for search, not a new derived table or corpus rewrite; very long poems still need performance profiling.

The result card displays the original vocalized strings and highlights complete matching words through React text nodes, never injected HTML. Comparison normalizes only a derived copy; canonical spelling, tashkeel, punctuation and whitespace remain unchanged. Choosing an excerpt opens the reader's correct 100-row window, focuses/scrolls to its source row, and visibly selects it. Saved range links restore all encompassing rows; out-of-corpus references clamp to the actual final source row instead of opening an empty window. A paired bayt selection encompasses both hemistichs.

Focused tests cover canonical excerpts, original-text reconstruction, orthographic normalization, whole-word matching, English lines, no-match behavior and SQLite query responses. Native run-pJ1XXx verifies real unvocalized `الخيل والليل والبيداء` search, exact original excerpt text, visible highlights at480/1280, click-to-focused-row and long-poem window navigation. The Arabic480search capture was visually inspected. Later expanded range/clamp checks are recorded in CURRENT_TASK.md; full application navigation and production-origin IPC guards remain outside this fixture.

### Offline typography — 2026-10-28

The Poetry canvas uses five bundled, isolated `Baglib Poetry …` font families rather than unverified system font names: Amiri, Scheherazade New, Noto Naskh Arabic, EB Garamond and Lora. The selector offers the three Arabic families for Arabic poems and two Latin families for English poems. This does not alter global app typography or canonical text.

Official font sources were inspected through the Google Fonts GitHub API at pinned revision `9862abc066c9b83bf84c3e8ed1fc2d8d48f9bbf0`. `scripts/poetry/fonts.mjs` downloads those exact TrueType files and each family's unmodified SIL Open Font License. The committed assets and source/size/SHA256 manifest live in `src/renderer/public/assets/poetry-fonts/`. These are locally served CSS assets, requiring neither runtime Google requests nor a corpus download. `npm run build:renderer` succeeds and includes all font/license/manifest files in `out/assets/poetry-fonts/`, covered by the existing packaging `out/**/*` rule.

`tests/services/poetry-fonts.test.ts` verifies all five assets, signatures, checksums, pinned URLs and license files. Native run-am0UnZ explicitly blocks HTTP/HTTPS requests and confirms `document.fonts.load` returns loaded FontFace objects for all five families; selector changes reach the canvas. Arabic/English narrow/wide reader checks pass with zero renderer errors. The fixture copies the same production assets and only rewrites root-relative CSS URLs to fixture-local file URLs. This proves local font decoding/loading, not a packaged-app runtime test. Arabic narrow metadata/description capture was visually inspected; no claim of exhaustive glyph-by-glyph validation.

### All source columns — 2026-10-28

| Ashaar source column | Storage | Visible use |
| --- | --- | --- |
| poem title | poems.title | Discovery and reader heading |
| poem meter | poems.meter | Filter, cards, reader metadata/citation |
| poem verses | poems.verses_json | Canonical verse canvas, copy/save |
| poem theme | poems.theme | Filter, cards, reader metadata |
| poem url | poems.source_url | Reader source link |
| poet name | poets.name | Discovery, heading, biography/citation |
| poet description | poets.bio | Biography panel |
| poet url | poets.external_url | Reader poet source link |
| poet era | poets.era | Filter and reader/biography metadata |
| poet location | poets.location | Reader and biography metadata |
| poem description | poems.description_json | Description text section; structured nodes preserved as JSON, never executed as HTML |
| poem language type | poems.language_variant | Reader metadata |

The user explicitly requested all columns; added one source-preserving `description_json` field to the isolated poetry partition, not the main library. Transactional installed-corpus backfill verified all254630titles/URLs/verse arrays before commit and retained14470non-null descriptions. Independent full-row joined-poet audit found zero mismatches across name/biography/era/location/URL after deduplication. Missing source values remain empty. Six focused tests/typecheck/focused lint pass; latest native description check is recorded in CURRENT_TASK.md.

Real seed successfully published all254630rows. Independent Python read-only audit found8184poets,254630FTS entries, quick_check=ok, zero FK violations and36conjunctive Arabic search matches. Top-frame/local-origin guarded read-only poetry IPC and preload bridge are implemented. Native fixtures now verify rendering/search/source navigation and Knowledge actions; complete application navigation and production IPC-origin validation remain pending.

- `src/main/services/poetry/partition.ts` opens only userData/partitions/bayan_poetry.sqlite, sets WAL/NORMAL/MEMORY,256MiB mmap/64MiB cache and foreign keys, and creates the explicitly requested poets/poems schema.
- FTS is a separate derived index with explicit joined rebuild. The proposed external-content index cannot rebuild against poems because poet_name_normalized is absent there. No extra canonical column was added. Ingestion must rebuild FTS and counts before publishing a corpus.
- `src/shared/poetry.ts` preserves original text, provides requested search-only normalization (including explicitly requested ة→ه), display-only diacritic removal, layout classification, ordered hemistich pairing including orphan lines, and single active drawer state.
- Four focused tests pass; TypeScript passes. Physical partition/FTS test verifies poet and unvocalized verse search, original vocalization, counts and main-database isolation.

### Human-voice poem narrations — 2026-10-28

Under the user's explicit policy, Arabic poems in Al-Bayan receive narration solely through human voices; computer-generated TTS is never generated, played, or stored for Arabic poetry. English poems retain the existing Pocket TTS selection toolbar.

#### 1. Schema Migration 017 (`poetry_narration`)
Registered in `src/main/database/migrations/index.ts`. Stores `poem_id` as a stable external link to the read-only `bayan_poetry.sqlite` corpus partition without modifying the core Work → Edition → Source library model.
- Columns: `id` (UUID PK), `poem_id` (INTEGER NOT NULL > 0), `kind` ('recording', 'file', 'online'), `provider` ('local', 'youtube', 'soundcloud', 'vimeo', 'url'), `label` (TEXT max 200), `file_name` (UUID.ext), `url` (TEXT), `mime_type` (TEXT), `duration_seconds` (REAL), `created_at` (ISO timestamp).
- Check constraints enforce that online narrations require provider != 'local', non-null URL, and null `file_name`, while local recordings/files require provider = 'local', non-null `file_name`, and null URL.
- Index `idx_poetry_narration_poem` on `(poem_id, created_at)`.

#### 2. Managed Audio Storage & Local Isolation
Local audio files and microphone recordings are safely copied/persisted into `userData/poetry-narrations/<uuid>.<ext>` using random UUID identifiers, immune to directory traversal.
- Supported audio formats: MP3, M4A, AAC, OGG, OGA, Opus, WAV, FLAC, and WebM up to 200 MiB.
- Recording extensions are verified from container leading byte signatures (EBML for WebM, OggS for Ogg, ftyp for M4A).
- Deleting a narration safely removes the managed disk asset without touching any library works.
- Audio streaming uses `baglib-asset://` custom protocol with full byte-range support (HTTP 206 Partial Content) for native seeking and scrubbing.

#### 3. Online Narration Providers & Privacy Embeds
Shared link canonicalizer in `src/shared/poetry-narration.ts` validates and canonicalizes links:
- **YouTube**: Standard `/watch` (including trailing slashes `/watch/`), shorts `/shorts/:id`, embed `/embed/:id`, live `/live/:id`, and short URLs `youtu.be/:id`, with case-insensitive timestamp parsing (`?t=1m5s`, `?t=90s`). Generates privacy-enhanced embed URL via `https://www.youtube-nocookie.com/embed/:id?rel=0&start=:s`.
- **SoundCloud**: Canonicalizes tracks `/:user/:track`, private tracks `/:user/:track/:secret`, and sets `/:user/sets/:set`, stripping trailing subpaths. Embeds via `https://w.soundcloud.com/player/?url=...`.
- **Vimeo**: Canonicalizes `/:id` and `/video/:id` (handling trailing slashes). Embeds via `https://player.vimeo.com/video/:id`.
- **Direct HTTPS audio**: Verified audio extensions over HTTPS.

#### 4. Shield & Referer Injection
Configured `ContentShieldService` in `src/main/services/shield/content-shield.service.ts` to inject `Referer: https://www.youtube-nocookie.com/` for YouTube embeds, eliminating YouTube desktop player configuration error 153 when framed inside Electron `app://` or `file://` contexts. Lowercase `referer` header is cleaned up to prevent header collision.

#### 5. Bilingual UI/UX & Controls
`PoetryNarrations.tsx` integrated in `PoetryReader.tsx` via reader header toggle (`البيان → الإلقاء`), obeying the single-panel state machine.
- Microphone recording via `navigator.mediaDevices.getUserMedia` with echo cancellation and noise suppression.
- Chromium WebM duration repair (`repairDuration`) fixes infinite duration headers on native `<audio>` elements.
- Durations wrapped in `<bdi dir="ltr">` for bidirectional stability in Arabic RTL layouts.
- Lazy embed mounting: users click "Load player" before third-party iframes load, preventing unwanted tracking until requested.
- Full RTL/LTR layout with CSS logical properties (`text-start`, `me-2`, `ms-auto`) and 24 centralized translation keys in `src/renderer/translations.ts`.

## Next implementation steps

Row ingestion is implemented in `src/main/services/poetry/ingest.ts`: bounded5000-row transactions, exact canonical strings/verse arrays, URL-based poet identity and final FTS/count rebuild. Run only against an unpublished empty staging partition; chunk commits are not corpus-wide atomic publication. Downloader, shared seed service, compiled background provisioner/CLI and exclusive publication are implemented and full CLI ingestion verified. Worker/parser packaging configuration is included, but a full installed-package runtime test remains pending; Python/PyArrow are explicit external prerequisites, not bundled dependencies. Official repository metadata was fetched at revision `9b5e723df1c5b13b9e4428caff758fe2f3c737f6`; both source Parquet filenames exist. License terms remain unverified.

Verify exact source revisions/shards and Parquet tooling; implement resumable/background provisioning and CLI; add bounded indexed query IPC; connect navigation and bilingual discovery/reader; reuse existing Knowledge/TTS boundaries with stable source references; validate full corpus, English stanza fixture, RTL/LTR and lint. Do not invent corpus counts, missing metadata, biographies or inferred metrical certainty.

## Centred poem layout and compact actions — KEY-313, 2026-11-10

The reader uses buildPoetryRows in poetry-layout.ts to pair canonical source lines into equal centred columns. Below640px each hemistich stacks. Amiri and 2.4 line height preserve tashkeel. Single Arabic lines are centred, while English stanzas retain their LTR start alignment. The header shows available title, poet, era, metre and a derived closing-letter rhyme chip. Original verse JSON and approved layout classification remain unchanged.

poetry-line-actions.ts exports the single Select/Copy/Share/Note list, key bindings and touch thresholds for hover/focus icons and KEY-316 reuse. The reading rows reserve space for small end icons shown on hover/focus or long-press. The header copies the whole poem or selection and shares through the existing native text-sharing IPC. Notes/commentary and saved verses remain reachable. Discovery and poet cards use the shared semantic surface/border/primary-text tokens.

Focused 12/12, final full 1744/1744 at concurrency 2, TypeScript zero errors, scoped ESLint zero errors/warnings, diff check clean. Copied-corpus Electron run-JF8xsL passed eight ar/en/light/dark/1280/480 layout configurations, copy/selection/whole poem, share payload, keyboard and long-press assertions. Thirty PNGs retained. Inspected 02-poem-ar-light-1280.png, 02-poem-ar-dark-1280.png, 03-hover-ar-dark-1280.png, 07-stacked-ar-light-480.png in .baglib-data/KEY-313-evidence/. Corpus cleanup verified one original unchanged and removed its copy.

The fixture renders the production poetry components with real copied Arabic corpus and isolated IPC, not the whole app shell. English stanza text is a generated fixture because no real English poetry corpus is installed. Share payload is verified against the existing sunnah.share IPC contract without opening the OS share panel. The displayed rhyme is a derived common closing letter, not prosodic analysis. No original corpus/document edits, schema changes, dependencies, downloads or Jira changes. Existing tests are unchanged. scripts/poetry-live/main.ts has three selector adjustments for the changed production markup.

## Local prebuilt poetry pack: KEY-266, 2026-11-14, Claude Code

Installed builds can now import the poetry database from a local pack instead of building it with Python and PyArrow. The pack is local only. It is not hosted, following the user's 2026-11-01 decision.

**Format.** A pack is two files side by side:
- `bayan_poetry-v1.sqlite.gz`: the database, gzip level 6.
- `bayan_poetry-v1.pack.json`: format `baglib-poetry-pack`, version 1, the uncompressed `bytes` and `sha256`, the poem count `rows`, and `createdAt`.

Build a pack with `scripts/poetry-pack/build.mjs <source.sqlite> <outDir>`, running under Electron's Node. It runs `quick_check` and refuses a source that has an unmerged `-wal` file.

**Measured on the current corpus:** 254,630 poems, 1,609,805,824 bytes raw, compressed to 528,781,601 bytes (504 MB, 33%) in 63 seconds. The SHA-256 of the raw database is `0c1cc1d0…3296`.

**Import** (`src/main/services/poetry/pack.ts`, `PoetryProvisioner.importPack`). The Bayan tab's "Import a local poetry pack…" opens a picker filtered to `.pack.json`. The import then:
1. checks that free disk space covers the raw size plus 256 MiB;
2. gunzips into a staging file in `partitions/` while hashing, reporting progress as `unpacking` (bytes written of the total);
3. checks the size and SHA-256, then opens the database read-only to count poems;
4. publishes with a hard link, so an existing database is never replaced.

Cancel and every failure remove the staging file and its SQLite `-wal`/`-shm` side files. Errors map to localized messages: no space, invalid pack, integrity, and cancelled.

**Verified:**
- `tests/services/poetry-pack.test.ts`: 4 tests, 4 passing.
- `scripts/poetry-pack-live` (development, picker stubbed) in ar and en.
- `scripts/packaged-poetry-live` on `release/win-unpacked` with a clean offline profile and the real Windows picker. The picker is driven only through its own windows: UI Automation to find it, then `WM_SETTEXT` and `IDOK`.
- Results in both: a cancel leaves nothing behind; the retry imports in 9–10 seconds; search returns 40 poems in Arabic and English.

**Not decided here:** whether the pack ships inside the installer. KEY-267's real installer size decides that.
