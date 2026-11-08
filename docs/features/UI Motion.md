# UI motion

## Implementation — 2026-11-07, Codex

Shared styles live in `src/renderer/app/ui-motion.css`, imported by the existing global stylesheet. No animation package, downloaded assets, preference storage or data-model changes were added.

- Browse workspaces, named dialogs, menus and the minimized import control use a 180 ms opacity entrance.
- Active navigation icons get a brief scale settle; library ribbon and Settings buttons have a one-pixel hover lift on fine-pointer hover devices and gentle press feedback.
- Basic color/border/shadow transitions use 120 ms. Base-layer defaults do not override existing component utility transitions.
- The main workspace identifies Quran/PDF reader modes as reading surfaces: these are excluded from the shared view entrance. No scrolling, page-turn or canonical-text animation was introduced.
- No React keys, remounts, action delays, timers or animation-dependent saves/closes were added. Fixed overlays are not translated/scaled, avoiding changes to their coordinate systems.
- `prefers-reduced-motion: reduce` suppresses application animation/transition duration and delays, repeats only once, and disables smooth scrolling. Fine-pointer hover movement is enabled only with no reduced-motion preference.
- Motion is direction-independent and adds no user-facing text requiring localization.

## Verification

- Full suite: 1396/1396 passing. TypeScript and changed TSX lint pass; source diff check passes (existing CRLF notice only).
- Actual Electron run `.baglib-data/layout-live-7cb3eb6e`: Arabic/English dialog entrance names and reduced-motion durations verified with Chromium media emulation; changing the preference preserves focus. Native Tab/Shift+Tab, Escape, opener restoration and the Book Details unsaved-edit flow still pass; zero renderer console errors.
- Expanded actual-app run `.baglib-data/layout-live-dad3ad1b` passes real pointer hover lift, reduced-motion hover suppression and Quran workspace exclusion in both languages, along with the initial keyboard/media-preference checks. No new shared view animation or transform is applied to Quran content. Owned server stopped; port 3000 free. PDF exclusion uses the same explicit reading-mode condition but no actual PDF was opened in this pass.

No assistive speech, cross-platform frame-rate benchmarking or external embedded document animations were tested. Existing unrelated save-service initialization warning remains outside this styling task. Exit animations intentionally do not delay closing or retain stale dialogs.
