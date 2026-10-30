# Local PDF engines and cloud setup

The user approved the AGPL-compatible local toolchain on 2026-10-26. Engines run locally; installing them does not sign into cloud accounts. Distribution and licensing obligations need a separate release review.

## Development / local engine provisioning

Run `scripts/setup-pdf-engine.ps1 -PythonExecutable 'C:\path\to\python.exe'` with a supported Python interpreter. This creates an isolated environment under ignored `.baglib-data/pdf-engine/venv`, installs the pinned direct requirements, and downloads checksum-verified Arabic/English OCR traineddata. It does not modify global Python, require elevation or launch a browser. It does not install Java/veraPDF automatically.

On this development machine the isolated Python environment, both OCR models, veraPDF CLI 1.30.3 and an Adoptium 21 JRE were actually installed and tested. These ignored binaries are not committed application resources.

Discovery in `src/main/services/pdf-editor/tools.ts`:

- Development root: `<appPath>/.baglib-data/pdf-engine`.
- Packaged root: `<userData>/pdf-editor/runtime`.
- Python: `venv/Scripts/python.exe` on Windows or `venv/bin/python` elsewhere; `BAGLIB_PDF_PYTHON` overrides the executable.
- Worker: development `assets/pdf-editor/engine.py`, packaged `resources/pdf-editor/engine.py` (included by electron-builder).
- OCR data: `tessdata/ara.traineddata` and `eng.traineddata`.
- Java: one child under `java/` containing `bin/java.exe` or `bin/java`.
- veraPDF: `verapdf/bin/cli-*.jar` or `greenfield-apps*.jar`.
- Stirling-PDF (optional sidecar or loopback server):
  - JAR discovery: `stirling/Stirling-PDF-server*.jar` or `libs/Stirling-PDF-server*.jar` under the runtime root (selected via Stirling Desktop's `version_key` semver/prerelease ordering in `src/main/services/pdf-editor/stirling.ts`); `BAGLIB_STIRLING_JAR` overrides the JAR path.
  - Loopback URL: `BAGLIB_STIRLING_URL` (e.g. `http://127.0.0.1:8080`) connects to a running local Stirling-PDF server; non-loopback hosts and URLs containing credentials are rejected.
  - Note on Stirling-PDF `v3.2.2`: runs on Java 25 LTS (`.baglib-data/pdf-engine/java/jdk-25.0.5+8-jre/bin/java.exe`) with `Stirling-PDF-server.jar` under `.baglib-data/pdf-engine/stirling/`. PyMuPDF has been 100% purged; all operations route via Stirling-PDF v3.2.2 and PDF.js.

Existing settings key `pdf-editor.engine.v1` can override `python`, `tessdata`, `java`, `veraPdfJar`, `stirlingJar`, `stirlingUrl`, and `preferStirling`. The worker script is fixed by the application. Never set these paths from untrusted documents. Capabilities probe the installed runtime; unavailable tools remain labeled unavailable. PDF.js still supports inspection/text HTML fallback when the Python engine is absent.

For validation install the official [veraPDF CLI](https://docs.verapdf.org/install/) and a compatible Java runtime into those locations or configure their paths. Metadata repair only changes title/language; it does not convert arbitrary documents to conforming PDF/A/PDF/UA.

## Google Drive / OneDrive

Open a PDF → Document workstation → **Cloud files**. Save the registered desktop client ID; this does not open the browser. For Microsoft also specify `common`, `organizations`, `consumers` or the tenant UUID. Details and exact native redirect registration are in [Google Drive](features/Google%20Drive.md) and [Microsoft OneDrive](features/Microsoft%20OneDrive.md).

Only press **Connect and sign in through browser** when ready to review the provider's consent screen. The user deferred that step; no real account login was attempted during implementation. Tokens stay encrypted in main-process private settings and never enter renderer status. Disconnect removes local credentials and disables sync; revoke the account grant separately through the provider if needed.

Browse a folder, import as a new Work/Edition, or choose the saved local PDF or a staged PDF/DOCX/XLSX/PPTX/HTML in the export-version selector. Staged export does not require replacing the original. Sync is a separate opt-in per identical linked source and runs only while the app is open. Remote updates create new editions; concurrent edits pause sync and keep both files. Unlink removes the mapping without deleting either file. Reconnecting clears account mappings and requires linking again.

Live consent, actual remote API behavior and account-specific policies remain to be verified after the user supplies IDs and signs in. Mocked transport tests and native encrypted setup are not substitutes for those checks.

## Verification

- `node scripts/test-runner.js tests/services/pdf-stirling.test.ts tests/services/pdf-editor.test.ts tests/services/pdf-cloud.test.ts tests/services/pdf-collaboration.test.ts tests/ui/reader-panels.test.ts`
- `.baglib-data/pdf-engine/venv/Scripts/python.exe scripts/verify-pdf-engine.py`
- `npm run build:main`, then `node scripts/pdf-workstation-live/run.mjs` (isolated test profile; no cloud login).
- `npx tsc --noEmit`, complete production build and focused lint; full repo lint has separately recorded existing failures.

Safe Save keeps original backups, including any private/redacted material. Review the output before sharing and manage originals/backups intentionally. Local HMAC audit is tamper evidence within the OS-account boundary, not protection against whole-database deletion or account compromise.
