# Local PDF engines and cloud setup

The user approved the AGPL-compatible local toolchain on 2026-10-26. Engines run locally; installing them does not sign into cloud accounts. Distribution and licensing obligations need a separate release review.

## Development / local engine provisioning

Run `scripts/setup-pdf-engine.ps1 -PythonExecutable 'C:\path\to\python.exe'` with Python 3.12. This creates an isolated environment under ignored `.baglib-data/pdf-engine/venv`, installs the pinned requirements, and downloads checksum-verified OCR data, Poppler, WeasyPrint, Java 25, Stirling-PDF 3.2.2, Ghostscript, Tesseract and an embeddable Python. It does not modify global Python, require elevation or launch a browser. It does not install veraPDF. Add `-WithPaddleOcr` for torch and transformers, about 1 GB more.

Downloads use `curl.exe`. `Invoke-WebRequest` manages about 20 KB/s here, where `curl.exe` reaches 2.3 MB/s on the same file. Turning off its progress bar did not fix that.

## Setup wizard (verified 2026-11-01)

The Windows installer is an assisted wizard in Arabic and English. `assets/installer/installer.nsh` holds the custom parts, and `nsis` in `electron-builder.yml` holds the rest.

| Step | What the user chooses |
|---|---|
| Language | Arabic or English |
| Welcome | Nothing |
| Who it is for | Only me, or everyone on this computer |
| Install location | Any folder; the wizard shows space needed and available |
| Setup options | Desktop shortcut, Start menu shortcut, and adding Baglib to Open with for books |
| Finish | Start Baglib now |

- An update skips these pages and keeps the file type choice. The new version reads it at startup, before the old version is removed. It lives in `HKCU\Software\<guid>\Setup`.
- `/S` still installs silently with the defaults.
- Uninstalling keeps the user's library data.
- `APP_UNASSOCIATE` leaves `.ext` pointing at the class it deleted, so `baglibUnregisterFileType` clears that value too.
- electron-builder has no Arabic for the "who is it for" page. The strings in `customHeader` replace its English fallback, which NSIS reports as a warning, so `warningsAsErrors` is off.
- With warnings off, an unknown `$name` compiles to literal text. `baglibSkipAssociations` (22 characters) behaved this way although it was declared, and renaming it fixed that; the cause is not established. `tests/services/installer-script.test.ts` checks that variables are declared and at most 21 characters, and that the file type list matches `electron-builder.yml`.
- `src/renderer/public/logo.png` is a JPEG, so `assets/installer/icon.ico` was made from it.

Checked with a disposable test build under its own app ID and a fake file type, driving the real wizard windows: 16 of 16 passed. That covers Arabic and English, a chosen folder, unticking options, a `--updated` reinstall keeping the choice, and uninstall removing the app, shortcuts, file type and saved choice.

**Not verified:** "everyone on this computer", which needs an administrator prompt; Back and the Browse button; the production installer with its real file types; a machine other than this one.

## Installers (verified 2026-11-01)

The NSIS installer is 637 MB, and the unpacked app is 1.9 GB. `electron-builder.yml` copies the engine tools into `resources/pdf-engine`, and the OCR workers into `resources/ocr`. Build from a provisioned `.baglib-data/pdf-engine`. A missing folder is left out without failing the build.

| Tool | Size in the app |
|---|---|
| Embeddable Python 3.12.10 with OCRmyPDF, no torch | 328 MB |
| Tesseract | 205 MB |
| Java 25 JRE | 180 MB |
| Stirling-PDF 3.2.2 | 180 MB |
| Poppler | 122 MB |
| WeasyPrint | 63 MB |
| Ghostscript | 42 MB |
| `ocr-best` | 27 MB |
| veraPDF | 18 MB |
| `tessdata` | 5 MB |

- `pdfEngineRoot()` in `pdf-editor/engine-root.ts` prefers `resources/pdf-engine`, so development keeps using `.baglib-data/pdf-engine`.
- A venv stores the absolute path of its base Python, so installers carry the embeddable build. `python312._pth` adds `Lib\site-packages`.
- pip's `ocrmypdf.exe` holds an absolute Python path. `scripts/make-portable-launcher.py` rewrites it to `#!python.exe`, which resolves beside the launcher. Stirling needs this: on this machine it called `ocrmypdf` and failed with `CreateProcess error=2` when the launcher was missing.
- Stirling writes config and logs beside itself, so packaged builds use `<userData>/pdf-editor/stirling`.
- PaddleOCR-VL is not in installers. It reports as unavailable, and OCRmyPDF stays the default.

Packaged check on a throwaway profile, with the machine's tools removed from PATH: 18 of 18 passed. That covers the Arabic and English UI, clip to PDF, OCRmyPDF, and Hub compress, repair and OCR. Nothing was written into `resources`, and no process stayed running after the app was closed.

**Not verified:** running `setup-pdf-engine.ps1` from an empty folder past the OCR data step, running the NSIS installer, and a machine other than this one. The local `python` folder was built from the pinned zip with packages copied from the venv, not through the script's pip step. `ocrmypdf.exe` and the `Save-Url` helper were tested, but not through a full script run.

On this development machine the isolated Python environment, both OCR models, veraPDF CLI 1.30.3 and an Adoptium 21 JRE were actually installed and tested. These ignored binaries are not committed application resources.

Discovery in `src/main/services/pdf-editor/tools.ts`:

- Development root: `<appPath>/.baglib-data/pdf-engine`.
- Packaged root: `resources/pdf-engine`, or `<userData>/pdf-editor/runtime` if the app was built without it.
- Python: `venv/Scripts/python.exe` on Windows, then `python/python.exe`, or `venv/bin/python` elsewhere; `BAGLIB_PDF_PYTHON` overrides the executable.
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
