# foliate-js

## MOBI artwork investigation, 2026-11-14, Codex KEY-48

Inspected the installed foliate-js 1.0.1 package at `node_modules/foliate-js`. REA `analyze_javascript_application` selected `mobi.js` and parsed its 46,799 bytes without executing the package. Parent evidence is `ev_05a4dc3043f5d427b0493b79a3152605d579ffef5d953a153d8fbc3c5f35748d`. Artifact inventory SHA-256 is `42cef5f3c83ea538efec419ad18b22e929bdcf7e84843f72a996efdcd7af7920`. The source-selection graph is partial, with 31 other inventoried files outside analysis scope. Dynamic behavior and package-wide equivalence remain unverified.

### Verified source findings

- `mobi.js:41` and `:50` define the first resource record at record-zero byte 108. Header offsets include the PalmDOC header.
- `mobi.js:135-136` map EXTH 201 to unsigned coverOffset and 202 to unsigned thumbnailOffset.
- `MOBI.loadResource` at line 607 reads record `resourceStart + index`.
- `MOBI.getCover` at line 633 prefers a cover offset below 0xffffffff, then the thumbnail. Zero is a valid resource-relative offset. Its reader-facing cover API is shared with the MOBI and KF8 readers.

### Application to Baglib

`src/main/services/digital/import-metadata.ts` uses those record/offset semantics while retaining Baglib's existing metadata extraction and Work → Edition → Source contracts. It opens the file once, reads the bounded Palm record table and record zero, then reads at most a 16 MiB cover record. Record-zero parsing is capped at 2 MiB, validates table ordering, file bounds and EXTH lengths, and closes its file handle on every path. Invalid, absent, oversized or unrecognized artwork falls through to a valid thumbnail. JPEG, PNG and GIF signatures determine the MIME type. Embedded metadata survives artwork failure. Existing metadata workers persist artwork through the existing cover directory.

The tests use generated Palm containers for MOBI/AZW3, offset zero, sentinel/out-of-range offsets, thumbnail fallback, malformed EXTH/table boundaries and oversized records. These establish Baglib behavior against the inspected offset convention. The real-file manifest contains no MOBI/AZW3 books, so this investigation supplies no real-book compatibility claim for those formats or hybrid KF7/KF8 containers.

### Related format investigation and limitations

Baglib's own `document-loader.ts` routes CBR to `archive-stream.ts`, whose current decoder is `fflate.unzipSync`. This verifies ZIP decoding through that route. A RAR decoder was absent from that call path. Genuine RAR/CBR import remains gated on a separately authorized decoder or dependency. DJVU is absent from both the approved DigitalFormat union and reader loader. KEY-48 enables CBZ and FB2 with existing yauzl and linkedom only.

[Cover retrieval comparison](feature%20-%20Cover%20Retrieval.md) and [import implementation](feature%20-%20Digital%20Library%20Import%20and%20Deduplication.md) record Baglib integration, scale evidence and limitations. No schema, persistent fields, dependencies or downloads were added.
