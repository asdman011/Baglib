# Lectures, OCR Benchmark and Modular Install

Waves 6 and 7: KEY-255 to KEY-261, under KEY-225, KEY-226 and KEY-2. Implemented in the working tree on 2026-11-02 by Claude Code. Not committed, not pushed and not updated in Jira. No new table, migration or dependency, and nothing was downloaded.

User decisions on 2026-11-02:

- Audiobooks stay in the reader.
- KEY-257 targets Coursera through its developer API.
- KEY-258 uses printed pages only.
- Skipped OCR parts come back by rerunning the installer.

## What each ticket got

| Ticket | Done in the app | Still open |
| --- | --- | --- |
| KEY-255 | A Lectures view in the navigation that plays local MP3, M4A, MP4, MOV, MKV, WebM and others. It reads sections from the file, lets you add your own, and saves speed and position. | Audiobooks stay in the reader, by decision. MKV with codecs other than VP8, VP9, H.264 and AAC was not tried. |
| KEY-256 | **Note at this moment** writes a `media:<lecture>:<seconds>` link into a study note. **Screenshot to note** saves the frame and embeds it in the note. Following a link opens the lecture at its moment, and each lecture lists its own notes. | Screen and voice recording were not built; the ticket's done-when needs only timestamps and screenshots. |
| KEY-257 | Coursera progress through an organisation's API app. Credentials are encrypted by the operating system, and progress is shown in Pathways with links to each course. | Udemy and edX are not covered. Coursera offers no notes. Not tried against the real API: no organisation account. |
| KEY-258 | A repeatable benchmark, a page-layout choice in the reader and the Hub, and an explanation of the PaddleOCR-VL gap. | Vocalized text misses the target. No manuscripts are in the set. |
| KEY-259 | **Compare with a reference text** in the OCR inspector. **From cover photo** in the Library proposes a physical book in the usual form for review before saving. | Shamela text is pasted by hand; Baglib does not fetch it. |
| KEY-260 | Book-site mirrors live in one file, updatable from a file or from a remembered https address. The installer can skip OCR, about 240 MB. | Python and the PDF engine cannot be skipped yet. Duplicity was evaluated and not adopted. |
| KEY-261 | A concept note only, below. | Needs an architecture decision and the user's approval. |

## KEY-255 and KEY-256: lectures

- **Storage.** Lectures sit outside the Work → Edition → Source library. The list is the `app_settings` row `media.lectures.v1`. Position and speed reuse migration 013's `audiobook_playback_progress`, keyed by lecture id. Screenshots are PNG files in `<userData>/lecture-shots`.
- **Sections.** These are read from MP3 ID3 CHAP frames, MP4 and M4A Nero `chpl` boxes (even when `moov` follows the media data), and Matroska `Chapters`. QuickTime chapter tracks are not read.
- **Playback.** Electron 32's own media stack plays all of these; no codec was added.
    - Verified live: MP3 (a copy of a cached recitation file with a chapter tag put in front), WebM VP9, MP4 H.264, the same MP4 renamed to MOV, and MKV H.264.
    - The served types are `.mov` as `video/mp4` and `.mkv` as `video/webm`, which Chromium accepts.
- **Bug found and fixed.** Local file addresses had the drive colon encoded (`D%3A`), which the asset protocol refuses. `localAssetUrl` in `file-path-helper.ts` now builds them for lectures, screenshot embeds and cover photos.

## KEY-257: Coursera

From dev.coursera.com, read on 2026-11-02:

- The API is for Coursera Business, Campus and Government customers. An organisation admin registers an app and gets a key and secret.
- The token comes from `POST https://api.coursera.com/oauth2/client_credentials/token` with Basic auth and `grant_type=client_credentials`, and is valid for 1800 seconds.
- `GET /ent/api/businesses.v1/{orgId}/enrollmentReports` returns `overallProgress`, `isCompleted`, `contentName`, `contentSlug`, `externalId` and `email`, with paging. There is no endpoint for notes and no individual-learner access.

Baglib reads every report page and keeps only rows whose `externalId` or `email` matches the learner. Credentials are encrypted with Electron `safeStorage` and refused when only basic text encryption exists. The page never receives them back. Development builds can point at a stand-in server through `BAGLIB_COURSERA_API`; installed builds cannot.

## KEY-258: Arabic OCR benchmark

`scripts/ocr-benchmark/benchmark.py` has three steps:

- **`build`** renders known Bukhari text from the local hadith corpus (read-only) into A4 pages at 300 DPI through WeasyPrint and Poppler. It makes four scan-like copies with rotation, blur, noise and JPEG artefacts.
- **`run --engine`** reads every page with one engine.
- **`score`** reports four measures:
    - letter error with marks, digits and punctuation removed
    - the same with digit-only rows dropped
    - word error, plus words read correctly in any order
    - for vocalized pages, error with marks kept

The set has 10 pages with ground truth: plain prose in three fonts, vocalized prose, two columns, and a verse layout. **These are synthetic print, not scans of real books, and there are no manuscripts.** The target is 10% letter error or lower on printed pages.

Letter error per page and engine. `hub-before` is OCRmyPDF with Tesseract's own segmentation and deskew, as Stirling calls it; `hub-psm6` is the new "lines" layout. PaddleOCR-VL ran on three pages only, at about 3 to 4.5 minutes each.

| Page | psm 3 | psm 4 | psm 6 | hub-before | hub-psm6 | PaddleOCR-VL |
|---|---|---|---|---|---|---|
| prose-arial | 0.7% | 0.7% | 0.7% | 0.7% | 0.7% | - |
| prose-arial-scan | 0.7% | 0.7% | 0.7% | 1.4% | 1.4% | - |
| prose-typesetting | 2.4% | 2.4% | 2.3% | 2.0% | 1.7% | - |
| prose-times | 0.7% | 0.7% | 0.7% | 0.9% | 0.9% | - |
| prose-vocalized | 20.5% | 20.1% | 17.9% | 28.3% | 14.5% | 12.2% |
| prose-vocalized-scan | 27.3% | 27.3% | 17.9% | 13.5% | 13.7% | - |
| two-column | 6.0% | 68.2% | 68.2% | 0.3% | 68.2% | - |
| two-column-scan | 0.4% | 68.4% | 68.4% | 0.4% | 68.2% | - |
| verse-layout | 57.8% | 11.2% | 1.5% | 58.3% | 3.0% | 48.1% |
| verse-layout-scan | 12.0% | 11.2% | 1.8% | 32.8% | 3.0% | 47.6% |

Findings:

- **Target met** for plain printed prose by every engine. **Missed** for vocalized text: best 12.2% (PaddleOCR-VL), Tesseract 14.5 to 28%.
- **No one page segmentation fits.** Automatic (psm 3) is the only mode that keeps two columns apart, and it fails verse. psm 6 reads verse best and wrecks two columns. Tesseract's mean word confidence could not tell them apart: it rated the scrambled two-column reading as high as the right one. So the layout is a choice the reader makes.
- **Reader default changed from psm 4 to psm 6.** psm 6 is as good or better than psm 4 on every page in this set. The OCR pill gains a **Lines / Columns** choice, stored as `ocr.layout.v1`.
- **The Hub fix.** Stirling cannot pass a page segmentation to Tesseract. The Hub's OCR tool now has a page layout option:
    - **Lines** runs OCRmyPDF directly with psm 6 (`layout-ocr.ts`), using the same tools and language data.
    - **Automatic or columns** keeps the Stirling path unchanged.
- **Hub fix, live.** On the verse page through the real pipeline, the OCR text scored 3.6% letter error (OCRmyPDF sidecar). Read back from the PDF with `pdftotext`, the text layer lists each hemistich column on its own: 62.3% in reading order, with 67.8% of words found. That is how OCRmyPDF lays out its text layer, and it applies to the Stirling path too.
- **Why PaddleOCR-VL scored 12.5% once and 25.9% the next time.** On the verse pages it read 87.8% of words in some order, the same as the best Tesseract mode, but letter error was 48%. Its output swaps hemistich order on some rows and not others, and the score depends on order. Section 10 of the OCR doc also notes invented number rows on the real page. **Unstable hemistich order plus stray digit rows explain the gap.** The original page's transcription was never saved, so that page itself could not be rescored.

## KEY-259: comparison and cover photo

- **Comparison** is word-level on normalized keys. Marks, tatweel and punctuation are ignored, and alif forms are merged. ة/ه and ى/ي stay distinct, so those reading errors still show. Both texts are shown as written and neither is changed. At most 4000 words per text are compared.
- **Cover photo.** The flow goes OCRmyPDF, then `proposeFromCover`, then the existing metadata lookup.
    - `proposeFromCover` takes the largest print as the title, joining a neighbouring line of near the same size, and takes the author after a marker such as تأليف.
    - The photo is copied into `<userData>/covers` and becomes the cover.
    - The add-book form opens filled in, as a physical book, and nothing is saved until the reader confirms.
    - Live: a rendered cover reading رياض الصالحين / تأليف: الإمام النووي was read, and the online metadata lookup then proposed «رياض الصالحين من حديث سيد المرسلين» by «الإمام أبو زكريا النووي».

## KEY-260: modular install and the mirror file

- **Mirror file.** `shared/source-urls.ts` holds the built-in list. A file imported or fetched from a user-given https address replaces it, and is stored as `sources.urls.v1`.
    - Only bare https origins are accepted: no path, login or port.
    - A stored file that stops validating falls back to the built-in list.
    - LibGen search, Anna's Archive search and the LibGen downloader all read from it.
    - **Still hard-coded:** the content shield's blocking patterns, and a few referer defaults in the downloader.
- **Installer.** A fourth checkbox on the options page: **Install text recognition (OCR) with Arabic and English data, about 240 MB**.
    - Unticked, the installer removes `pdf-engine/tesseract`, `ocr-best` and `tessdata` after copying, and saves `SkipOcr` beside the existing `SkipFileAssociations`.
    - Updates keep the choice. Rerunning the installer with the box ticked restores the folders.
    - The app already reports missing OCR and falls back to Windows OCR.
    - Python and the PDF engine stay, because other PDF tools need them.
- **Duplicity, evaluated against KEY-147.** Not adopted.
    - Duplicity is a POSIX tool built on Python and GnuPG; this claim comes from its documentation and was not tested here. It would need Cygwin or WSL on Windows.
    - Baglib already makes verified snapshot ZIPs, and Wave 4a added a verified backup before each migration.
    - Incremental encrypted backup is worth a later ticket of its own.

## KEY-261: book clubs, concept note

The board pairs book clubs with Goodreads. Baglib is local-first and has no accounts or server. Shared clubs would need at least one of:

1. A hosted service with accounts, which is new infrastructure, cost and privacy duties.
2. Peer-to-peer or shared-folder sync of a club file, which has no moderation and conflicts are hard.
3. Export and import of reading lists and notes that members exchange by any channel, with no live club.

Option 3 fits the current architecture and needs no approval beyond its UI. Options 1 and 2 need an ADR and the user's decision. Nothing is built.

## Verification

- **Live:** `scripts/wave6-live` passed in Arabic and English. It used the real main process, preload and dev renderer, a throwaway profile, media recorded by the app's own Chromium and a copied recitation MP3. Coursera ran against a local stand-in, and dialogs were stubbed.
    - Covered: all five formats, sections, speed and resume across a reload, the timestamp note, the screenshot note with its image, the jump back from the note, Coursera import with encrypted credentials, the cover photo, the mirror file, and Hub OCR with lines.
    - Latest run: `.baglib-data/wave6-live-Zf3bDq`.
    - Screenshots inspected: lectures at 1280 and 480, note screenshot, mirror panel and cover form.
- **Installer:** a throwaway build used a separate app ID, a fake file type and the cached Electron and NSIS. Its script differs only in the association list.
    - Silent install with OCR, reinstall with `SkipOcr` (OCR removed, app kept), reinstall with OCR (restored), uninstall (clean).
    - The real `.pdf` registration was unchanged.
    - The options page itself was not clicked.
- **Tests:** `tests/services/wave6.test.ts` and `tests/services/wave7.test.ts`, plus `libgen.provider.test.ts` now reading the shared list.
