# Feature: Text-to-Speech (TTS), Audiobook Playback & Synchronized Read-Along Narration

## 1. Overview & Objectives

In modern electronic reading applications, combining visual reading with auditory narration significantly increases retention, accessibility, and engagement. For Baglib—which prioritizes multilingual scholarship, classical Arabic literature (*Turath*), and bilingual academic research—the audio narration system must support three core paradigms:
1. **Multilingual Text-to-Speech (TTS) with Script Auto-Switching:** Seamlessly switching between Arabic and English synthesis voices within a single mixed-script sentence or paragraph without playback interruption.
2. **EPUB 3 Media Overlays:** Real-time synchronized read-along highlighting driven by embedded SMIL (`.smil`) timecodes.
3. **5-Step Audiobook Pairing Wizard:** Pairing reflowable eBooks with external DRM-free audiobooks or Audiobookshelf (ABS) streams using Continuum-style ordinal anchor alignment.

---

## 2. Cross-Application Comparative Analysis

| Dimension | Readest | Foliate (Original) | Audiobookshelf (ABS) | Baglib (Implemented) |
| :--- | :--- | :--- | :--- | :--- |
| **TTS Engine** | Web Speech API + SpeechSynthesis | Native Linux `eSpeak` / `speech-dispatcher` | Server-side transcode / streaming | Web Speech API with Regex-based Script Auto-Switching (`ar` / `en`) |
| **Mixed-Script Support** | Single selected voice per session | Single voice per document | Pre-recorded audio only | Dynamic segment-level voice auto-switching within sentences |
| **Media Overlays** | SMIL 3.0 parsing with custom clock math | Basic SMIL support via Foliate-js | Not applicable | Isomorphic Regex-based SMIL parser supporting clock formats and unit timecounts |
| **Audiobook Pairing** | Continuum anchor mapping with 5-step wizard | Manual chapter index matching | Native server library item matching | 5-Step Wizard (`summary`, `select`, `abs`, `anchor`, `review`) with SQLite persistence |
| **Persistence Model** | Browser IndexedDB / Dexie | Local JSON configuration | PostgreSQL / SQLite server-side | SQLite table `audiobook_pairing` & `audiobook_playback_progress` |
| **Player UI** | Auto-hiding mini-card + lyrics view | Static toolbar widget | Dedicated full-page mobile/web audio player | Auto-hiding floating card with linger timers, speed scrubber (0.5x–3.0x), and karaoke overlay |

---

## 3. Investigated Architecture & Key Patterns

### A. Continuum Ordinal Anchor Alignment Algorithm
*Source:* `readest/apps/readest-app/src/services/audiobook/mapping.ts`
- **The Challenge:** Reflowable eBooks and audiobook files rarely have identical chapter counts. Audiobooks frequently include publisher bumpers, intros, disclaimers, or split long chapters into multiple audio files.
- **The Solution:** Rather than requiring tedious manual drag-and-drop matching for dozens of chapters, the user identifies a single reliable "Anchor" (e.g. eBook "Chapter 1" matches Audio "Track 02 - Chapter 1").
- **Mathematical Offset:**
  $$\text{offset} = \text{index}_{\text{ebookAnchor}} - \text{index}_{\text{audioAnchor}}$$
  For each audio track $i$, its target eBook chapter index is computed as:
  $$\text{targetEbookIndex} = i + \text{offset}$$
  If $\text{targetEbookIndex} \ge 0$ and $\text{targetEbookIndex} < \text{totalEbookChapters}$, the mapping is created. Tracks prior to or exceeding the range remain unaligned and are clearly reported in the Review step.

### B. Auto-Hiding Floating Mini Player (`TTSMiniPlayer`)
*Source:* `readest/apps/readest-app/src/app/reader/components/tts/useMiniPlayerAutoHide.ts`
- **Linger Duration:** Keeps the card visible for 5,000ms after user interaction ceases.
- **Buffering Guard:** Delays reappearance on transient stalls by 500ms to avoid flashing the card during normal paragraph transitions.
- **Persistent Visibility:** The card remains fully visible if hovered, during configuration popovers, or while playback is paused.

### C. Multilingual Sentence & Script Auto-Switching
*Source:* `Baglib/src/shared/utils/tts-language-segmenter.ts`
- Classical Arabic academic texts and Islamic studies literature often interleave English analysis with Arabic Quranic or Hadith citations. Standard browser TTS engines either attempt to read Arabic text using English phonetics (resulting in unintelligible speech) or error out.
- Baglib's `segmentMixedTextForTTS` scans characters with Unicode block regexes (`[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]`), segmenting text into contiguous Arabic and Latin runs while cleanly grouping neutral punctuation (spaces, commas, quotes) into the preceding active language run.
- When executing the speech queue, the audio engine switches between the user's preferred Arabic voice (`voiceAr`) and English voice (`voiceEn`) on the fly.

---

## 4. Baglib Implementation & Architectural Alignment

### Schema & Persistence (Migration 013)
All audiobook pairings and reading playback sessions are stored in SQLite:
- `audiobook_pairing`: Stores `book_id`, `title`, `narrator`, `source_type` (`local` | `audiobookshelf` | `epub_smil`), `audio_files` (JSON array), and `chapter_mappings` (JSON array).
- `audiobook_playback_progress`: Stores `book_id`, `current_file_id`, `current_time_seconds`, `playback_rate`, and `is_completed`.

### User Interface & Bilingual Accessibility
- Built using CSS logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`).
- Fully localized in both Arabic (RTL) and English (LTR) across all 5 wizard steps, transport controls, speed rulers, and lyrics overlays without hardcoded strings.
- Arabic typography preserves Tashkeel diacritics without line-height clipping in both the lyrics view and mini player.

---

## 5. Verification & Tests
- Comprehensive unit tests in `tests/utils/audio.test.ts` (14/14 passing) and `tests/services/audiobook.service.test.ts` (7/7 passing).
- Zero regressions across the full repository test suite (580/580 passing).
