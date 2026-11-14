# Feature: Cover Retrieval

## Online search thumbnails versus imported PDF covers — 2026-10-26

The public LibGen portal requires `covers=on` to expose result images. REA observed the current rating/image/title columns, actual fiction/comics cover paths and individual successful image responses; its JSON endpoint separately returned a provider-side HTTP 500. Baglib now uses inert header-aware HTML parsing, retains correlated row covers during JSON hydration and falls back to those rows when JSON fails. Unlike local PDF rendering, these images are lazy remote search thumbnails, not offline cached page renders. A stable icon remains if remote loading fails. Full evidence and limits: [LibGen](libgen.md).

These approaches serve different purposes: provider artwork helps choose search results; the first complete PDF page is still authoritative for automatic PDF imports. The change does not restore the old arbitrary embedded-image extraction or replace a manually chosen local cover. No book content was downloaded during the LibGen metadata/cover audit.

Updated 2026-10-24. This comparison concerns the installed PDF tooling and Baglib's inspected extraction paths, not a new investigation of external reader applications.

## Approaches and decision

| Approach | Verified behavior | Trade-off and Baglib policy |
| --- | --- | --- |
| Legacy PDF resource/image extraction alongside pdf-parse metadata | `embedded-metadata.extractor.ts` and the digital extractor formerly used `extractFirstPdfImage`; candidate order described images, not document pages. Logos and unreferenced resources could become covers, and text/vector pages could have no candidate. | Cheap image reuse cannot reproduce a page. Removed from automatic/manual cover paths; helpers remain for existing OCR consumers and legacy tests. pdf-parse still supplies metadata/text. |
| Installed PDF.js whole-page canvas rendering | `getPage`/`page.render` composites the actual page; a dedicated worker is explicitly initialized in a separate sandboxed renderer. | More CPU than image enumeration, but correct page semantics and isolation. Serial jobs, bounded canvas size and persisted JPEG paths limit transient cost. This is the selected PDF cover strategy. |
| EPUB manifest artwork and MOBI resource records | EPUB already identified manifest covers. The earlier description of existing MOBI artwork extraction was inaccurate. KEY-48 adds EXTH 201/202 resource-relative artwork with bounded reads, verified against installed Foliate source. | Format-specific artwork uses the existing cover storage. MOBI parsing now falls back to thumbnails when the cover record is invalid. |

## User experience and integration

- New PDFs use page 1 across digital imports, direct additions, linked files and downloaded PDF additions, instead of preferring provider thumbnails or embedded-image order. Rendering completes before a successful import result, not in a deferred cover job.
- Book Details → Extract Cover from PDF loads the first five complete pages, capped by document length. Thumbnail buttons or previous/next controls choose among cached pages. PDF previews contain the whole page rather than cropping it.
- Explicit manual choices use existing cover provenance (`user_override`) and survive saving. Existing curated covers are retained by non-destructive duplicate merges; this is not a retroactive library-wide rewrite.
- User-facing choices, success/error messages and page labels use centralized Arabic/English translations. Selection controls work in RTL/LTR; no localized database columns or schema changes were introduced.

## Evidence, limitations and open questions

See [PDF.js](PDF.js.md) for bounded REA evidence, source paths, runtime fixtures and resource/security policy; see [pdf-parse](pdf-parse.md) for the retained metadata parser and warning-filter investigation. The combined targeted suite passed 109 tests, including page selection in both languages. Native Electron tests verified actual pixels, first-five semantics, automatic import/addition and manual override persistence.

The new rendering path has not been benchmarked against hundreds of diverse production PDFs or certified in an installed package. The earlier import throughput measurements must not be treated as current rasterization benchmarks. Persistent cover-file garbage collection and automatic remediation of old incorrect covers were not added. Encrypted or unrenderable PDFs report failure instead of guessing at image resources. Future renderer replacement should preserve these page-based semantics, existing domain boundaries and explicit manual overrides.

Related: [Metadata Discovery](feature%20-%20Metadata%20Discovery.md), [Built-in Document Reader](feature%20-%20Built-in%20Document%20Reader.md), [Digital Library Import](feature%20-%20Digital%20Library%20Import%20and%20Deduplication.md).

## Local artwork formats, KEY-48, 2026-11-14

The installed Foliate source supplies a resource-record approach for MOBI artwork. PDF.js renders an entire page and therefore handles text/vector content through rasterization. EPUB resolves a manifest resource. FB2 references a base64 binary by XML id, and CBZ uses the first image in natural path order. Their identities and entry boundaries drive cover selection. These approaches reuse Baglib's existing cover storage and importer fields. [Foliate investigation](foliate-js.md)

MOBI reads a bounded Palm table, record zero and one cover or thumbnail record. FB2 reads at most 32 MiB including embedded binary artwork. CBZ enumerates ZIP entries lazily, reads at most 1 MiB of ComicInfo XML and 16 MiB of the first image, and closes the archive on success or error. Very large artwork retains the metadata and placeholder. CBZ's first-image convention can choose an interior page when the archive's filename order places it first. Foliate source inspection establishes MOBI offsets, while generated tests establish Baglib's fallback and bounds. Real MOBI/FB2/CBZ files are absent from the supplied manifest.

KEY-48 native stress checks combine generated FB2/CBZ covers with copied real Arabic/English PDFs, MP4s and a real large English EPUB. Full/cancel runs in both interface languages exercise the production wizard, preload, importer, metadata worker and cover storage. They establish mixed-format batch behavior for this corpus. They do not establish hundreds-of-large-PDF throughput. Detailed metrics and evidence are in the local KEY-48 report and `.baglib-data/KEY-48-evidence/`.
