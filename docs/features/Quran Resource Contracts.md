# Quran resource contracts — approved boundary

Updated 2026-10-25. The user explicitly approved the Quran-specific boundary, these contracts, SQLite-first storage and implementation, with future Qira’at support. The resource manager and initial SQLite study reader now implement the catalog/install/query subset below. Work → Edition → Source and the library database remain unchanged. Evidence and source schemas: [QUL](QUL.md). Roadmap: [Quran Experience](feature%20-%20Quran%20Experience.md).

## Implemented study-query boundary

Follow-up: three local semantic-resource aliases resolve to verified official IDs without rewriting source manifests or introducing new database fields. Cleanup applies only to mutable catalog rows. Translation payloads optionally include source-derived `{offset, note}` anchors alongside display text and notes; these are transient query data, not a new canonical corpus representation. Header search uses existing catalog/FTS calls and an in-memory, validated script/surah/ayah handoff, not a new persistence schema.

The 2026-10-25 correction adds `inspectAyah`, batch-download, isolated sign-in and scoped-recitation-download operations to the existing typed Quran IPC boundary. Inspector canonical text comes from the script adapter and Imlaey from all relevant layout pages; missing text is explicit. Fullscreen/hover are presentation state, not new persisted domain entities.

Bulk work reuses existing job descriptors with `queued` state and optional file-count progress. Queued work is marked interrupted on restart. Resource exports transfer/install sequentially; recordings require a reciter and explicit surah/all-surahs scope. Cancellation aborts active network work and prevents publication, while complete audio files survive for retry. Metadata and audio transfers are bounded to 128 MiB and 30 MiB respectively, with five-minute transfer timeouts and per-hop HTTPS-origin validation. Electron's event-based incoming stream has no pause/resume API; its accumulated bytes are capped as well as the file writer. This is bounded transfer plumbing, not an unbounded parallel downloader.

`src/shared/types/quran.ts` defines typed catalog, bounded passage, search-hit, inert rich-text commentary and selected-setup contracts. The preload passes requests only to guarded main-frame IPC. Main resolves trusted installed packs; an isolated utility process owns read-only SQLite handles. Renderer-supplied file paths or SQL are never accepted. Copy IPC bounds text length and writes only to the system clipboard.

Derived indexed SQLite copies are disposable caches, not new canonical domain entities. Their keys include the source archive digest, adapter version and resource kind. They preserve immutable installed pack bytes and can be rebuilt. Original Quran text and the library database are not normalized or migrated. Removing a source makes its adapter unavailable; leftover derived caches are not currently garbage-collected and may be removed while the app is closed.

Adapter selection is a curated allowlist of resource IDs and exact original SQLite names. Hafs/Warsh compatibility here is an audited adapter decision, not fabricated verified profile metadata. Warsh supplements remain disabled until separately mapped and approved. Existing source profiles remain explicitly unverified where appropriate. No notes, bookmarks, new user-state tables or automatic cross-Qira’at joins are introduced.

Installer selection reuses already installed compatible presets, reports missing/failed files individually and uses the existing background installer sequentially. Updates remain explicit in the Resource Library. Arbitrary downloaded resource storage is not synonymous with reader-adapter support. Download authentication remains inside the isolated QUL source window; the application never embeds the user's credentials.

## Decision: SQLite first, not SQLite only

Use QUL's SQLite export when a supported adapter exists. It supports bounded queries, indexes, joins and local FTS without loading entire commentaries into renderer memory. Baglib's installed `better-sqlite3` driver already supports the required FTS5 and JSON operations, as verified in Electron. Do not add a Python server, Rails CMS, vector database or new driver for this work.

SQLite does not make arbitrary schemas compatible, add missing indexes, decode embedded JSON automatically, or prove text accuracy. Adapters still validate each resource type/version. If only JSON is offered, validate/import it into a derived SQLite query store off the UI thread, preserving the downloaded bytes and provenance. Fonts/audio/images remain files; no benefit comes from forcing them into database BLOBs. Small manifests/catalog caches can remain JSON where appropriate, but must not become a second canonical Quran data store.

## Approved storage boundary

- A configurable Quran content directory, separate from the library database and Sunnah corpus. Prefer a user-selected data disk for large media; no hardcoded personal absolute paths.
- Immutable downloaded source artifacts, identified by local content hash, resource identity, source page, format and acquisition time. Keep rights information explicit, including unknown/restricted states. A local hash proves identity, not publisher authenticity.
- Versioned derived SQLite query/index files. Do not run `CREATE INDEX`, normalization or repair against original downloaded DBs. A disposable indexed working copy is an alternative to a normalized query store; choose per adapter after profiling. Scope derived keys by resource/profile rather than assuming QUL numeric IDs are globally interchangeable.
- Separate persistent user state for reading position, bookmarks, preferences and reflections, anchored by stable Quran references/profile. Do not store notes inside an updatable source database. The exact user-state schema and any bridge to Baglib Knowledge require approval against ADR-002.
- Download staging is invisible to readers. Validate completely, then atomically activate a version; failed installs keep the previous version. Keep a bounded rollback policy and dependency-aware removal. The Phase 1 isolated installer demonstrates staging/publication only, not the whole application's update manager.
- Work → Edition → Source, existing library annotations and Sunnah storage remain unchanged.

## Resource identity and compatibility

Resource descriptors should carry: QUL category and stable ID/slug; display name and source page; actual language/authorship where supplied; adapter/schema version; source version or hash; cardinality; available formats; rights/status; and known compatibility/dependencies. These are proposed domain contracts, not authorization for duplicated language-specific database columns.

A reading profile must distinguish riwayah, numbering, word segmentation and script/layout/font family. Use `surah:ayah` and `surah:ayah:word` only within a validated compatible profile. Different script records can include markers or grouped text tokens. Source titles and canonical text are preserved. Search normalization and any correspondence maps are separate derived data. Task 6.3 formalizes verified profiles `HAFS_READING_PROFILE` (Kufi numbering, 6,236 verses) and `WARSH_READING_PROFILE` (Madani-first numbering, 6,214 verses), and enforces strict isolation across query methods to reject cross-profile joins without explicit correspondence.

The selected resource pages associate QPC font 245 with scripts 86/312, and the sampled ayah joins pass. This does not prove every layout, recitation or word annotation is compatible. The `37:130` metadata discrepancy and three missing word translations must remain explicit; do not fix them by shifting offsets or generating content. Root coverage is optional per word and is not evidence that lemma/POS exist for that location.

## Adapter contracts

| Input family | Required behavior |
| --- | --- |
| QUL downloads | Resolve current first-party resource/format links at download time. Never persist credentials or signed URLs in catalog records. Cookies stay in an isolated authenticated session. |
| Containers | Distinguish advertised format, ZIP packaging and actual member signature. Validate paths, limits, expected schema and checksums where supplied. Reject HTML login/error pages as downloads. |
| Script/metadata SQLite | Validate expected tables/columns, identities, duplicate keys and structural counts before activation. Read originals with extension loading disabled and trusted schema off. Reject unknown executable schema rather than executing it. |
| Translation SQLite | For resource 193's sampled footnote export, decode the JSON string in `text` and JSON object in `footnotes`. This is an adapter-specific rule, not a blanket JSON parse of every translation. Preserve formatting; render only sanitized supported markup. |
| Tafsir SQLite | Resolve `group_ayah_key` into actual commentary; validate absent/cyclic targets and supplied ranges. Show grouped coverage and source, not duplicated commentary pretending to be independent per-ayah texts. |
| Word resources | Join by explicit compatible location; exclude ayah markers from lexical analysis. Missing root/translation/lemma/POS means unavailable, not an inferred annotation. |
| Search | Derived SQLite FTS, parameterized queries and bounded result sets. Keep source text unchanged; normalize Arabic marks/alef forms conservatively without equating `ة/ه` or `ى/ي` by default. Topic labels/relations come from sources, not AI generation. |
| Fonts/media | Validate signatures and compatible dependencies, use controlled app-local URLs, do not install OS fonts or execute active downloaded content. Audio timing manifests and actual offline media coverage are separate states. |

## Proposed IPC surface

Preload should expose typed operations rather than raw SQL or arbitrary URLs/files:

- `catalog`: category, search/filter and cursor → bounded descriptors plus freshness/completeness status.
- `resourceDetails`: resource ID → formats, rights, known dependencies and source attribution.
- `download/install/cancel`: approved resource ID and format ID → job ID and progress events. Main resolves and validates actual destinations. No secrets in events.
- `installed/update/remove/repair`: local resource/version IDs → lifecycle results; protect resources in use and shared dependencies.
- `readAyahs`: compatible profile, surah/range/cursor and selected installed resources → bounded original passages with coverage warnings.
- `wordDetails`, `tafsir`, `search`: stable references and explicit installed resource IDs → bounded attributed results. Include cancellation/generation guards for stale queries.
- `readerState`: approved preference/bookmark/reflection operations, never arbitrary database mutation.

The full surface above remains a phased contract, not a claim that reader/word/tafsir APIs already exist. Phase 2 exposes `QuranAPI.library`, `refresh`, `download`, `importFile`, `cancel`, `remove`, `chooseDirectory` and `onChanged` through preload. Discriminated errors map to centralized Arabic/English messages; raw server errors/HTML are not shown in UI.

Phase 2 implements a sandboxed QUL window with no Baglib preload/Node integration, isolated in-memory session, permission denial, constrained navigation and first-party download-token validation. Native download capture was verified in a controlled Electron fixture using the observed QUL → Wasabi redirect shape and a real Phase 1 SQLite archive. This is not a new authenticated live-QUL browser test: live authentication was proven by the Phase 1 HTTP probe; a fresh interactive native sign-in remains an end-user acceptance check. No credentials are embedded or accepted by renderer IPC. A clearly labelled local-file import is available; no private API or authentication bypass is used.

## Phase 2 implemented details

- `src/shared/types/quran.ts`: 14 categories; separate `QuranReadingProfile` and profile-scoped `QuranLocation`. Qira’ah, riwayah, tariq, numbering, segmentation and script identity are independent nullable attributes. They are not inferred from a reciter's name. Unknown profiles have resource-scoped unverified keys, not a global Hafs default. Future variant mappings must be explicit; no cross-profile ayah/word joins are implemented here.
- `catalog.sqlite` is a separate, versioned SQLite catalog with `resources`, `packs` and `jobs`; indexes support category and resource lookup. Small resource/manifest descriptors are JSON values inside the catalog; canonical Quran content is not duplicated into bilingual application fields. Original per-resource SQLite databases are immutable pack files. No library migration or dependency was added.
- `packs/<UUID>/` stores original archive, validated extracted bytes and a manifest. SQLite schemas are inspected read-only with trusted schema off; views/triggers/virtual source tables are rejected. JSON is stored as an immutable source format in Phase 2, not yet exposed as a queryable Quran reader database. Resource-specific derived query indexes belong to the later reader/adaptor phase.
- `src/main/quran-worker.ts` runs package validation/extraction in an Electron utility process, one job at a time. A 768 MiB V8 old-generation bound and 120-second deadline supplement explicit archive limits; these are not a total resident-memory guarantee. The default import limit is 128 MiB compressed, 512 MiB expanded and 2,000 members. Unsupported formats are reported instead of silently treated as reader-ready.
- Jobs have progress, cancellation, restart interruption states and explicit retry via QUL. Retry starts a new transfer; partial-download resume is not implemented. Failed/new versions do not overwrite working packs. Independent versions can be removed without deleting the user's original import file. Automatic dependency installation/removal and old-version retention policies are not implemented yet.
- Catalog and installed-resource responses are paged at 60 records; job history is capped at the most recent 100 records. Canonical book contents never cross resource-list IPC. Download progress is throttled. Startup cleans manager-owned incomplete jobs/directories and orphaned pack publications. Data folder selection switches to a separate catalog without moving/deleting the prior folder.
- The download origin allowlist includes the verified QUL and Wasabi origins only. A changed storage deployment needs explicit review/configuration rather than blindly trusting redirects. The in-app source window is where the user signs in and selects an available format; SQLite is recommended, not silently forced. No resources are automatically downloaded or bundled.

The resource manager intentionally labels installations as **stored**. Phase 2 does not claim reader rendering, tafsir/word-study integration, playback, full catalog coverage, automatic compatibility/dependency resolution or Qira’at datasets. Those are later roadmap deliverables, not hidden capabilities of a saved archive.

## Verification required for production

### Representative-export clarifications — 2026-10-25

The [five-family QUL audit](QUL.md#five-family-developer-resource-audit--2026-10-25) refines adapter requirements, not the approved entity boundary. No application schema or API changed during that audit.

- **Identity adapters are format-specific:** the supplied recitation SQLite column `ayah_number` is a global `verse_id`; the JSON exporter uses a local verse number. Join the SQLite value through matching ayah metadata before constructing `QuranLocation`. Resource-page ID and reciter/export IDs are also distinct.
- **Numbering profiles are substantive:** supplied Warsh has 6,214 references, Hafs 6,236; their `1:1` contains different passages. Shared layouts do not authorize unqualified cross-reading verse/word joins.
- **Layout decision:** the user intends a shared ligature-based SVG layout for Hafs and Warsh. The QPC V4 15-line SQLite layout is Hafs-only; its accidental Warsh copy was reported deleted and must not be inspected/restored. SVG rendering infrastructure can be shared, but source paths/content and word correspondence require reading-specific verification. SVG word indices also differ from QPC tokenization in an inspected page.
- **Display versus text:** V4 glyph codes are presentation data. The supplied Hafs glyph and Unicode IDs/locations match completely, permitting an explicitly validated Unicode copy/search representation. Font identity includes page and resource version; standalone Unicode and page-glyph fonts are not interchangeable.
- **Typed rich text:** inline-footnote translation text is JSON-encoded; ayah transliteration text is not. Tafsir coverage is CSV. Word translations/transliterations have their own schemas, markup and coverage. Do not apply a generic decode or HTML-render rule to every text field.
- **Alignment gates:** plain translation has three missing lexical keys; colored translation and word transliteration have additional location/segmentation discrepancies. Preserve provenance and report unsupported word mappings rather than silently reindexing canonical data. Ayah-level alternatives may remain available where independently validated.
- **Audio shape and clock:** supplied legacy segments normalize from four numeric values to `[first + 1, third, fourth]`, supported by inspected source and tuple checks. Other three-value/metadata forms need distinct detection. Preserve repetitions, validate times against actual media and gate word highlights on segmentation compatibility. All sampled durations are NULL; source metadata installation is not offline audio availability.
- **Metadata:** six division/sajdah families have documentation but no inspected supplied payloads. Validate them before declaring navigation complete. Store source classifications as attributed data, not universal religious rulings. Keep search-only normalization separate from canonical text.
- **SVG safety and packaging:** the existing installer does not support SVG or ignore AppleDouble entries. A later dedicated importer must validate/sanitize active vector content, preserve semantic attributes and handle large archives without renderer-wide materialization. This audit does not certify that implementation.

Carry forward the 14 passing proof/runtime tests and the full sample join audit. Add pagination/catalog-completeness checks, real native authenticated download capture, restart/cancel/disk-full recovery, malformed package isolation, rendering/diacritic checks in Arabic RTL and English LTR, packaged asset/path tests, and performance measurements with large installed collections. No application schema or UI should be described as complete based solely on the development sample installer.
