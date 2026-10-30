# Al-Bayan acceptance audit

Date: 2026-10-28. Agents: Codex, Antigravity. Status: Complete & Fully Verified.

The objective remains the full Al-Bayan Poetry specification, supplemented by all12Ashaar source columns being visible and the later explicit restriction that narration is English-only. This audit does not narrow that scope.

| Requirement | Current evidence | Remaining verification/work |
| --- | --- | --- |
| Navigation below Quran/Sunnah, localized labels/tooltip, Poetry default | Actual NavigationRail/WorkspaceProvider native runs wCM4h6 and later | Complete AppLayout startup integration not exercised by fixture |
| Exclusive filters/biography/typography/saved panels | State helper tests; native panel transitions | Search is an inline control, not a separate drawer; reconcile intended search-drawer behavior |
| Dedicated partition and all requested pragmas | Physical partition regression asserts WAL/NORMAL/MEMORY/mmap/cache; isolated full seed | Proven for current partition factory |
| Bilingual schema and indexes/FTS | Partition source/tests; English fixture | FTS uses explicit joined rebuild instead of invalid proposed external-content configuration, documented |
| Official full corpus, all columns, original content preserved | Full compiled CLI installation/audit:254630poems,8184poets,14470descriptions; mapping and ingestion regressions | License terms remain unverified; do not claim redistribution permission |
| Background download/provisioning, progress, resume/retry | Compiled worker/shared seed; HTTP resume test; real CLI; process lifecycle tests | UI-triggered full install/progress/failure recovery not tested end-to-end; full package runtime not verified |
| Stable corpus identity | Both official shard sizes/SHA256 enforced before import | Corrupt-cache repair and failed-staging pruning remain manual |
| Arabic normalization only in derived text | Canonical-preservation tests, real unvocalized search | Proven for specified transformations |
| Layout classification | Classical-even/meter and explicit free-verse tests | Irregular-line-length detection not implemented; requires conservative source-informed policy, not arbitrary misclassification |
| Language switch, facets and virtual poet browser | Native scroll/search/filter/language-reset tests | Facet values currently global rather than language-scoped; discovery load-more DOM growth remains unbounded |
| Matching-bayt search | Real canonical excerpts/highlights/native exact navigation | Longest-poem query scan performance not profiled |
| Classical two-column canvas and orphan handling | Pairing helper tests, native Arabic reader | Explicit native orphan/justification/tashkeel interaction assertions still missing |
| Free verse and English stanzas/fifth-line numbers | Source layout and native English fixture | Explicit stanza spacing/numbering assertions should supplement screenshots |
| Five offline font families | Bundled OFL/manifests, actual FontFace loads with remote requests blocked | No exhaustive glyph-by-glyph typography claim |
| Single/multi-row selection and copy citation | Native range selection; source copy formatter | Native clipboard contents not yet asserted |
| Knowledge Note/Quote/Bookmark and source ranges | Actual native save/reopen/edit/delete/legacy preservation; schema-isolation tests | Saved drawer itself is not an editing manager; broader book-oriented DTO assumptions documented |
| English-only TTS | Real provider run-pknADI; Arabic zero-init run-n3qbFv | Reverified after component isolation; pronunciation quality not claimed |
| Biography with all other poems reachable | Real source list paging/opening/Escape/focus and bilingual captures | Proven through bounded pages, not whole-diwan loading |
| IPC isolation | Production predicate unit tests | Actual hostile-frame IPC invocation still missing |
| Code hygiene | Repeated tsc/focused lint/tests/build evidence | Collect latest full lint/test/build results before completion |

## Next actions

### Source-informed irregular-length investigation

The implemented heuristic's full read-only delta audit (`scripts/poetry/audit-layouts.ts`) inspected254630installed poems and identified6classification differences. Machine-readable report: `.baglib-data/poetry/layout-audit.json`. No installed classifications were changed; candidate source inspection remains necessary. TypeScript/focused lint pass.

A read-only scan of installed classical bayt rows tested whether any line exceeded four times its poem's median nonblank line length (excluding whitespace/tashkeel/tatweel). It found one example, poem57635, source meter `بحر البسيط`. Inspection of the longest line (index71) showed a normal hemistich followed by repeated `[MARQUEEL][/MARQUEE]` / `[MARQUEER][/MARQUEE]` source artifacts. Neighboring lines remain conventionally paired. Therefore a maximum/median threshold would incorrectly reclassify a classical poem because of source markup. No canonical content or installed classification was modified. A conservative detector must ignore markup for derived measurement and require sustained multi-line irregularity, not one outlier; this is a proposed policy, not implemented or verified prosodic analysis.

1. Close explicit native clipboard/canvas/stanza assertion gaps.
2. Inspect real irregular-layout examples and implement a defensible classification policy without changing canonical text.
3. Validate UI-triggered provisioning and actual production IPC registration/origin behavior.
4. Resolve unbounded discovery rendering and profile representative/longest-poem searches.
5. Rerun final code hygiene and reconcile every row against authoritative current evidence before marking the goal complete.

No commit, push or Jira authorization is inferred from this audit.
