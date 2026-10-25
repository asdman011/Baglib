# QUL Phase 1 proof tools

Development-only access and data-contract proof. These scripts do not add the Quran tab, install into the user's library, or authorize redistribution of datasets. See `docs/features/QUL.md` and `docs/features/Quran Resource Contracts.md`.

## Requirements and verification

Use the existing workspace dependencies and Node 24.15+ for the development `node:sqlite` API. Production Baglib uses its existing Electron/better-sqlite3 driver, separately tested below.

```powershell
node --disable-warning=ExperimentalWarning --test tests/services/qul-phase1.test.mjs
npm test -- tests/services/qul-sqlite-runtime.test.ts
node --disable-warning=ExperimentalWarning scripts/qul-phase1/verify.mjs
```

`verify.mjs` requires the deliberately selected sample archives and their provenance sidecars in ignored `.baglib-data/qul-phase1/`. It performs no network requests. It validates source schemas/integrity, every relevant join and explicit compatibility gaps, creates a separate Arabic/English SQLite FTS index, and atomically publishes a unique `installed-*` proof directory. It never modifies original downloaded archives or an application database. Missing samples cause failure; source limitations are reported rather than fabricated away.

## Access probe

`node scripts/qul-phase1/access.mjs` reads JSON commands through stdin, with TTY echo disabled. Authentication input is supplied interactively through stdin, never CLI arguments, environment files or source constants. Do not pipe a credential file or transcript into it. Cookies remain in memory, no remember-me session is requested, and the process exits after use. Ctrl+C also clears the in-memory session and exits. Protect the terminal session from untrusted input.

Actions: `login` with user-supplied credentials; `catalog` with an optional category; `detail` with a first-party resource path; `unauthenticated-probe`; `download` using an index from the latest successful detail response and a safe output filename; `exit`. The output never includes passwords, cookies, raw authenticated HTML or signed storage URLs. Catalog/detail snapshots and download provenance contain public resource references only. This is a bounded research probe, not a production HTTP/cookie/download implementation.

Per-session limits are 20 MiB per download and 60 MiB total. The probe only follows HTTPS redirects, does not replay login POSTs across 307/308 redirects, sends cookies only to QUL, and refuses stale download selections after a failed detail request. Output names use exclusive creation so existing samples are not overwritten. Sampling is explicit, not a bulk resource downloader.

Known findings: QUL's JSON/SQLite/font samples are ZIP files; SQLite exports can contain JSON-encoded cells. Some word annotations are absent and one word count differs between resources. The report records these gaps. No full catalog completeness, source licensing, native authenticated browser download integration or every-resource compatibility is certified by this tool.
