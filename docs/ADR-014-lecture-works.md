# ADR-014 — Lecture media as library Works

## Status

Accepted for KEY-342 under the user's 2026-11-12 approval of the ten media DigitalFormat values. Implemented on 2026-11-13 by Codex. Existing Work → Edition → Source entities and metadata JSON are reused.

## Decision

Local MP4, M4V, MOV, MKV, WebM, MP3, M4A, OGG, OPUS and WAV files use a lecture Work, its Edition and digital Source. The TypeScript DigitalFormat values for these formats are lowercase. Existing book values retain their established case. file_source_detail.file_format is unconstrained TEXT, verified in migration001, so a format migration is unnecessary.

Both the normal digital-import pipeline and lecture path import create these records. Main validates absolute paths, existing regular files and extensions. The digital validator additionally checks container signatures. Embedded ID3 title/performer/date, MP4 ilst name/artist/day and Matroska Info/Tags supply title, speaker and recordingDate. Existing FilenameParser supplies title/speaker fallbacks. ISBN, edition, publisher and publication year are excluded from media extraction. The existing speaker contributor role and recordingDate metadata property are used.

Legacy media.lectures.v1 rows are converted transactionally once, retaining Work ids and their source paths. The operational settings marker media.lectures-works.v1 prevents repeated conversion. Legacy settings continue to hold section annotations. Playback progress, subtitle choices, screenshots and media note targets keep their original ids. Lecture removal uses the existing Work trash behavior and preserves files and notes.

The Lectures list projects active lecture Works, and opening a lecture Work through the shared workspace opener routes to the player. Library drops split media into lecture import and leave document drops in the existing book path. Mixed drops handle both.

## Evidence and limits

Inspected src/main/database/migrations/001_initial_schema.ts, shared/types/work.ts and metadata.ts, repositories/work.repository.ts, services/digital, services/lectures and renderer drop/navigation entry points. This work extends the local BagLib source. No third-party application was reverse engineered.

Tag reads are bounded to 16 MiB of ID3/header data and 64 MiB per MP4 moov or Matroska metadata element. MP4 top-level boxes and finite-length Matroska clusters are skipped by their declared lengths. Unknown-length Matroska clusters prevent discovering later tags. Encrypted/compressed ID3 frames and unusual vendor tag encodings remain outside the supported parser. Canonical names and diacritics remain unchanged.

The initial corpus lacked playable lecture videos. On2026-11-13 the user added real Arabic and English MP4s, registered in manifest2894c46. Native checks now import those originals read-only, verify filename fallback (the Arabic double-space title/speaker delimiter and the English title with no inferred speaker), playback and profile-only subtitle choices. Generated fixtures cover embedded tags, other containers and additional series members. Tests and native evidence are recorded in the local KEY-342 report.
