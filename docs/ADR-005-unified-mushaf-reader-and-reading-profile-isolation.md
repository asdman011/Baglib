# ADR-005: Unified Mushaf Reader Architecture, Vector Glyph Adapters, and Reading Profile Isolation

## Status
Accepted

## Context
Baglib requires a high-fidelity, local-first research platform for the Holy Quran that honors the sacred nature of the text while providing modern digital reading capabilities. During development, several core challenges and architectural tensions arose:

1. **Multiple Reading Traditions (Qira'at & Riwayat):** The Quran possesses authentic, mutawatir transmission traditions. The two most widely read traditions are **Hafs 'an 'Asim** (Kufi numbering, 6,236 verses) and **Warsh 'an Nafi'** (Madani First numbering, 6,214 verses). Most existing digital applications hardcode Hafs verse numbering as a universal primary key, causing index corruption, verse misalignment, or outright failure when attempting to display Warsh.
2. **Page-Fidelity vs. Digital Text Fluidity:** Traditional Mushaf reading relies heavily on the standard 604-page Madani layout (15 lines per page). Simple reflowing HTML paragraphs break the memorization landmarks (ayah endings, page start/end words). Conversely, raster page scans (images/PDFs) prevent sharp vector zooming, dynamic dark mode adjustments, word-by-word hover, and text selection.
3. **Split vs. Unified Workspace:** Earlier prototypes split the reader into fragmented views (text viewer vs. translation panel vs. tafsir drawer vs. recitation player), causing visual clutter, high memory usage, and desynchronized scrolling.
4. **Recitation Audio Synchronization:** Global audio indices (e.g. 1 to 6,236) diverged from per-surah local audio file names (`001001.mp3`), and segment timing data varied across reciter corpora.

---

## Decision

### 1. Strict Reading Profile Isolation (`QuranReadingProfile`)
We rejected any single global verse indexing schema across reading traditions.
- **Explicit Profile Keys:** Introduced canonical profile identities: `'hafs-kufi'` (6,236 ayahs) and `'warsh-madani'` (6,214 ayahs).
- **Query Boundary Protection:** All core Quran reader queries (`getAyah`, `getPage`, `getTafsir`, `getAudio`) require an explicit `profileKey`.
- **Cross-Profile Joining Safeguards:** Reader services reject cross-profile joins unless an authentic, validated verse-correspondence map is explicitly loaded. Hafs-only study companions (e.g., specific Tafsirs or English translations aligned to Hafs numbering) remain isolated and are not erroneously displayed against Warsh pages.

---

### 2. Unified Page-Centered Mushaf Workspace
We unified the reader interface into a single, page-centered workspace that balances physical Mushaf fidelity with interactive digital tools:
- **Vector Glyph & Font Stack:** Integrated the King Fahd Complex for the Printing of the Holy Quran (KFGQPC) V4 glyph font stack alongside standard Uthmanic SVG line rendering.
- **Shared Line-Slot Templating with Adapted Breaks:** Standard Madani Mushaf page templates (15 lines per page) are reused as geometry slots. For Warsh script, text renders with authentic Warsh WOFF2 fonts and explicitly adapted line and page breaks, avoiding blanket rendering blocks without falsely claiming to be a certified printed facsimile.
- **Interactive Word-Hit Testing:** High-precision SVG/glyph hit boundaries enable instant word hover, root/lemma inspection, audio pronunciation, and translation lookup without full re-renders.
- **Non-Modal Inspector & Stacked Cards:** Replaced modal dialogs with resizable, simultaneous side cards:
  - Whole-page translation, Tafsir, and topic concept hierarchies.
  - Page-adjacent ayah theme brackets with display-only deduplication of identical theme labels across contiguous ranges.
  - Right-click and double-click study drawers for similar ayahs (Mutashabihat).

---

### 3. Gapless Recitation Synchronization & Audio Pipeline
- **Global vs. Local Reference Normalization:** Mapped global verse indices into standardized per-surah files (`${surahNumber.padStart(3,'0')}${ayahNumber.padStart(3,'0')}.mp3`), allowing offline caching in app-private directories.
- **Segment Timing Parser:** Parsed word-level segment millisecond boundaries `[[wordIndex, startMs, endMs], ...]`, synchronizing real-time active ayah card highlighting and auto-scrolling during playback.
- **Gapless Surah Transitions:** Playback seamlessly traverses surah boundaries (e.g. Al-Fatihah 1:7 to Al-Baqarah 2:1) while gracefully cancelling stale asynchronous audio loads upon rapid user navigation.

---

### 4. Local Settings & State Storage (`app_settings`)
All user preferences, active reader state, and study progress are stored in the core library SQLite database under `app_settings`, strictly leaving Quran corpus packs immutable:
- **Khatmah Reading Plans (`quran.khatmah.v1`):** Supports up to 20 independent plans with customizable pacing (Juz/day, pages/session, target dates). Pacing schedules map authentic Hafs Juz boundaries, while Warsh plans explicitly use adapted pagination.
- **Dwell Tracking:** Opt-in 20-second active visible page tracking marks reading progress automatically without human reading falsification.

---

## Consequences

### Positive
- Authoritative preservation of Quranic Qira'at traditions without data distortion or artificial verse flattening.
- Crystal-clear typography across all zoom levels and display resolutions in both light and dark themes.
- Fluid bilingual interaction (Arabic RTL and English LTR) with zero layout shifting or text clipping.
- Seamless, offline-capable audio recitation with word-level and verse-level highlight synchronization.
- Sacred Quran corpus databases remain completely immutable and cryptographically verifiable.

### Negative / Trade-offs
- Warsh pagination relies on adapted line/page breaks within the shared SVG slots rather than an authentic certified printed Warsh facsimile scan.
- Secondary metadata packs (e.g. detailed morphology, specific tafsir works) currently exist predominantly for Hafs; Warsh-specific tafsirs must be provisioned independently.
