# Archived Data and Reference Repositories

On 2026-10-31, 80.38 GB of files the app does not need at runtime moved out of this repository. Nothing was deleted. Every move is listed in `D:\Ammar's\Projects\Baglib\_archive_manifest.json`, and each item keeps its original relative path under its archive folder.

| Folder (under `D:\Ammar's\Projects\Baglib\`) | Size | Contents |
|---|---|---|
| `_archive_datasets\` | 18.27 GB | Hadith corpora and pipeline outputs, poetry shards, QUL audits, installer archives |
| `_archive_repos\` | 1.07 GB | Reference repositories and packed archives such as `Stirling-PDF-main.zip`, `repos\Itqan` and `repos\readest` |
| `_unused_files\` | 61.04 GB | Native test runs, logs, lint reports and build caches |

## What stayed, and why

- `repos/Quran/QUL Developer Resources`: read by `src/main/ipc/quran.ts` in development.
- `tools/hadith-alignment/data/output/sunnah_kutub_tisah_itqan.sqlite`: the Sunnah database used in development.
- `tools/hadith-alignment/.venv`: the development Python for poetry provisioning.
- `.baglib-data/pdf-engine`, `models`, `cache`, `covers`, `backups`, `data`, `qul-phase1`.
- `repos/readest/.../fixtures/data/dicts`: a copy kept because the dictionary tests read it from that path.
- `baglib_library_repository_interfaces_sprint_1.ts`: `src/shared/types` imports it, so it is not a stray file.

## Restore these before re-running a data pipeline

The app never uses these paths, but the rebuild tools do. Move the item back from its archive folder first.

| Tool | Needs |
|---|---|
| `tools/hadith-alignment/main.py`, `verify_outputs.py` | `Open-Hadith-Data` |
| `tools/hadith-alignment/master_main.py`, `verify_master_outputs.py` | `repos/Itqan`, `output-shamela`, `data/output/*` |
| `scripts/quran-metadata-arabic/*` | `.baglib-data/quran-arabic-translation`, `repos/hadith-json-main.zip` |
| `scripts/poetry/backfill_descriptions.py` | `.baglib-data/poetry/shards` |
| `scripts/setup-pdf-engine.ps1` | Downloads its installers again if they are missing |

Development auto-detection of `LK-Hadith-Corpus-master.zip` in `src/main/ipc/sunnah.ts` never matched, because that file lived in `repos/Sunnah/` and the code looks in `repos/` and `repos/Hadith/`.
