# pikepdf: temporary PDF viewing derivatives

## Flat page-tree optimization — 2026-10-30

The final helper balances an already-flat root with more than32page children into32-page groups before saving. Root inherited attributes remain on the existing root; leaf page objects/order/content stay unchanged and parent references point to groups which inherit from that root. Nested page trees are not modified. The real641-page output retains21groups. Compared with linearization alone, native qoGN05 reduces~39MB/599requests to210,620bytes/five requests and~921ms to175.2ms cached paint, with exact first-page pixels/source SHA/page count preserved. An object-stream-generation experiment failed to materially reduce reads and was removed. Three real-pikepdf Python regressions pass; see PDF.js documentation for the verified worker call path and remaining speed-target gap.

## Scope and evidence — 2026-10-30

Baglib already provisions pikepdf10.17.0 in `assets/pdf-editor/requirements.txt`. This work uses its documented QPDF-backed save API; no new dependency or database entity was introduced. No claim is made that pikepdf internals were reverse-engineered.

`assets/pdf-editor/view_cache.py` opens originals read-only, refuses encrypted inputs, writes a separate exclusively created destination through a bounded output wrapper, linearizes without requesting Flate recompression, and verifies the resulting page count and linearization flag. It does not alter canonical files or replace signature verification inputs. A derivative is a viewing aid, not proof of preserved digital-signature validity.

Official API reference: https://pikepdf.readthedocs.io/en/latest/api/main.html . Linearization may enlarge some PDFs; outputs exceeding the configured budget are rejected and ordinary reading retains the source.

## Verified experiments

- Disposable two-page fixture: verified linearized output1,558bytes.
- Existing Avicenna PDF:86,588,927-byte source,641pages;45,428,298-byte derivative, helper elapsed0.601seconds on this run; SHA256 of the source unchanged.
- Native cached reload cu9iDC:641pages retained; offscreen first bitmap3102ms initially→981.8ms cached. This is useful improvement but not the requested instant-open target;39MB of range traffic remains. First-page pixel equality is under separate verification, not established by page count.

## Lifecycle and limitations

Stronger verification: native real-book run79HphF confirms exact first-page canvas pixel equality as well as641pages/source SHA, with initial2802.3ms→cached920.7ms. SyntheticfC1J2S confirms pixel equality,53.5ms cached paint,1558warm bytes/two requests and automatic source-edit reload. These supersede the earlier pixel-validation-pending note, but do not prove fidelity of every page or annotation/signature semantics. Read-only inspection of the real derivative shows2574objects and linearization `/E 9648`;599warm requests/39MB remains an unresolved reader/worker behavior, not proof that optimization alone solves startup.

`view-cache-runtime.ts` starts the existing Python runtime at below-normal priority when supported and cancels/time-limits its child. `view-cache.ts` deduplicates and serializes jobs, validates source identity before publication, validates output headers independently, caps published LRU storage at2GiB and protects active leases. Staging is a separately bounded single-job allowance, not included in the published-directory cap. Seven service tests validate fallback, identity, ownership, eviction, output rejection, concurrent edits and shutdown/startup behavior using an injected fake optimizer. Native tests exercise the real subprocess separately.

See [PDF.js](PDF.js.md) for rendering measurements and remaining acceptance gaps. No packaged-runtime, all-pages fidelity, all-file compatibility or sub100ms real-book claim is made.
