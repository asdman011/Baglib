---
trigger: always_on
---

All Baglib interfaces must support Arabic and English as first-class languages.

Localization: Use the existing centralized i18n system for all user-facing strings. Never hardcode UI labels, placeholders, tooltips, or messages.
Directionality: Support both RTL and LTR layouts. Prefer CSS logical properties (margin-inline-start, padding-inline-end, inset-inline-start, text-align: start) over physical left/right properties. Mirror direction-dependent icons and navigation appropriately.
Typography: Use readable Arabic and Latin fonts appropriate to the content. Prevent Arabic diacritics from being clipped; validate line height, spacing, and mixed-script rendering.
Localized data: Preserve original titles and names. Do not add bilingual database columns or duplicate fields unless the approved schema or an explicit architectural decision requires them.
Arabic search: Normalize Arabic text in search queries and indexes, not in canonical stored content. Handle tashkeel and orthographic variants consistently, and apply potentially ambiguous substitutions—such as ة/ه—carefully to avoid false positives.
Verification: Test affected features in both Arabic RTL and English LTR, including mixed Arabic/Latin text and representative Arabic search queries.
Tell in what way that you did exactly changed the user experiance or the layout after you finish with the task.