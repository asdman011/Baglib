# Application viewport containment

## Scroll escape fix — 2026-11-01, Codex

The reported screenshot shows the application footer near the top of the viewport with a large black region below it. Source inspection found a viewport-sized `AppLayout` inside a root document with no scroll containment. A synthetic escaped absolutely positioned element reproduced the outer-page movement: scrolling the document moved the shell and footer offscreen (`scrollY: 857`). This verifies a vulnerable containment boundary, not the identity of the exact intermittent overflow-producing element in the user's session.

`src/renderer/app/globals.css` now gives `html` and `body` explicit full viewport dimensions, clips overflow, suppresses root overscroll, and paints both with `--bg-canvas`. The body is fixed to its viewport bounds. Clipping the root alone still allowed programmatic document scrolling in the tested Chromium version; fixing the body also prevents descendant overflow from extending the root scroll area. Existing nested content scrollers are unchanged. No wheel handlers, scroll resets, schema, localization labels or dependencies were added.

## Verification

Run `node scripts/layout-scroll-live/run.mjs` for an isolated Electron regression using the actual compiled global stylesheet. It injects overflowing content, scrolls an internal panel to its end, attempts document scrolling, sends a wheel event and asserts a stationary shell/footer with a still-scrollable inner panel. Covers Arabic RTL/English LTR, dark/light and 480/1280 widths. The test failed before the CSS change and all eight cases passed after it.

With an existing dev server, set `BAGLIB_LAYOUT_TEST_URL=http://localhost:3000` to additionally load the actual application in an isolated Electron browser profile. Four locale/theme probes passed: document offset zero and footer bottom equal to viewport height. Arabic dark and English light screenshots were visually inspected. Results/screenshots: `.baglib-data/layout-scroll-VHOYKA/`. This profile has no production preload/database connection; it verifies the shared application shell, not the user's populated database or every modal/reader workflow.

`npx tsc --noEmit`, focused harness ESLint and the stylesheet diff whitespace check passed. No production renderer build was run against the shared active dev server.

## User experience

Scrolling is confined to content panels. The outer application cannot slide upward to expose an empty region below its status bar. The backing surface follows the selected theme. Typography, panel order and content are unchanged.
