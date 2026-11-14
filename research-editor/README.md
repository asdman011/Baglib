# BagLib Research Editor

BagLib's rich research and book authoring editor runtime, built on an offline static build of [BlockSuite](https://github.com/toeverything/blocksuite) v0.27.4.

This workspace provides an isolated toolchain (outside BagLib's root Next.js / React 19 dependencies) that compiles the editor into an offline bundle (`research-editor/dist/`) packaged as an optional install component (gate R4).

---

## Attribution & License

- **BlockSuite v0.27.4**: Copyright (c) ToEverything Pte. Ltd., licensed under the MIT License. See [vendor/LICENSE-MIT](file:///D:/Ammar/Projects/Baglib/repo/Baglib/research-editor/vendor/LICENSE-MIT).
- **BagLib wrapper & extensions**: MIT License.

### Bundled Fonts & Licenses
All fonts are subsetted using [scripts/subset-fonts.py](file:///D:/Ammar/Projects/Baglib/repo/Baglib/research-editor/scripts/subset-fonts.py) (3,266 KB &rarr; 342 KB) and stored locally under `app/fonts/`:
- **Inter (Variable)**: SIL Open Font License 1.1 (Rasmus Andersson).
- **Kalam (Regular, Light, Bold)**: SIL Open Font License 1.1 (Indian Type Foundry).
- **IBM Plex Mono (Regular, Bold)**: SIL Open Font License 1.1 (IBM Corp.).
- **Noto Naskh Arabic**: SIL Open Font License 1.1 (Google LLC).
- **Poppins (Light, Regular, Medium, SemiBold)**: SIL Open Font License 1.1 (Indian Type Foundry, Jonny Pinhorn, source: https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/). Total subset size: 48 KB (12 KB per face).

Unbundled canvas fonts (falling back to system fonts): Satoshi, Lora, Bebas Neue, Orelega One.

---

## Directory Layout

```
research-editor/
├── .yarn/                # Bundled Yarn 4.18.0 standalone binary and patches
├── .yarnrc.yml           # Offline Yarn config (node-modules linker, scripts disabled)
├── package.json          # Yarn workspace root (resolutions and scripts)
├── yarn.lock             # Pruned offline lockfile for this workspace
├── app/                  # BagLib editor app shell
│   ├── src/              # Entry point (main.ts), style.css, font configs, stubs
│   ├── fonts/            # Subsetted local WOFF fonts and OFL license texts
│   ├── index.html        # Strict-CSP offline HTML container
│   ├── package.json      # @baglib/research-editor-app dependencies
│   └── vite.config.ts    # Standalone Vite config (alias stubs, wasm, vanillaExtract)
├── patches/              # Numbered diffs applied on top of pristine BlockSuite
│   ├── 0001-pr15215-per-block-direction.diff   # Upstream PR #15215 base RTL dir="auto"
│   ├── 0002-direction-override.diff           # Saved block model textDirection prop + shortcuts
│   ├── 0003-html-export-dir.diff              # HTML export writes dir="rtl|ltr|auto"
│   ├── 0004-frame-title-rtl.diff              # Edgeless frame titles positioned on right in RTL
│   ├── 0005-slash-menu-caret-anchor-rtl.diff  # Slash menu popper anchored to caret in RTL
│   ├── 0006-collapse-icon-and-autoscroll.diff # Heading collapse icon :dir(rtl) & bidirectional autoscroll
│   └── 0007-tables-and-database-rtl.diff      # Mirrored table & database columns in RTL
├── scripts/              # Maintenance scripts
│   ├── vendor.mjs        # check & rebuild commands for vendor guardrail
│   └── subset-fonts.py   # FontTools font subsetting pipeline
└── vendor/               # Pristine subset of BlockSuite v0.27.4 + applied patches
```

### Why Docs and Playground are Not Vendored
BlockSuite's upstream monorepo includes extensive documentation sites, demos, and playgrounds (`docs/`, `docs-site/`, `playground/`). BagLib embeds BlockSuite inside its own application frame with custom offline storage, Quran/Sunnah research bridges, and dark/light themes. Excluding these extraneous demo packages keeps the vendored tree minimal (2,899 files) and prevents bloat.

---

## Guardrails & The Patch Rule

> [!CAUTION]
> **Never edit files in `research-editor/vendor/` directly.**

All customizations to upstream BlockSuite code must be tracked as reproducible patches:
1. Create a numbered patch file in `research-editor/patches/`:
   `0002-my-fix-description.diff`
2. Rebuild the vendor directory:
   `node research-editor/scripts/vendor.mjs rebuild`
3. Verify that the vendor tree matches the pristine tag plus patches:
   `npm run check:vendor`

The integrity of `vendor/` is guarded automatically:
- Root `.ignore` skips `research-editor/vendor/` from ripgrep and editor scans.
- Root `.gitattributes` marks `research-editor/vendor/**` as `linguist-vendored -text`.
- Root `eslint.config.mjs` ignores `research-editor/**`.
- Root `tsconfig.json` excludes `research-editor`.
- Root script `npm run check:vendor` validates the vendor tree against the pinned tag sha256 (`3637540c...`).

---

## Commands

### 1. Offline Install
To install or focus dependencies using the local cache:
```bash
cd research-editor
$env:YARN_GLOBAL_FOLDER='D:\Ammar\Projects\Baglib\spike\yarn-global'
$env:YARN_ENABLE_NETWORK='0'
node .yarn/releases/yarn-4.18.0.cjs workspaces focus @baglib/research-editor-app
```

### 2. Build Editor App
From repository root:
```bash
npm run build:research-editor
```
Or from within `research-editor/app`:
```bash
node ../.yarn/releases/yarn-4.18.0.cjs build
```
Output is generated at `research-editor/dist/` (total size 9.34 MB / 9,797,194 bytes, 92 files; well under the 12 MB budget).

### 3. Verify Vendor Integrity
```bash
npm run check:vendor
```

### 4. Offline Smoke Test & Typing Verification
```bash
node scripts/research-editor-live/run.mjs
```
Runs an offline Electron smoke test verifying:
- Offline custom protocol serving (`editor://`).
- Zero console errors and zero blocked network requests.
- Correct page and edgeless mode rendering in English (LTR) and Arabic (RTL).
- Arabic text typing via CDP input simulation.
- Generates evidence screenshots and `result.json` in `.baglib-data/KEY-362-evidence/`.

### 5. RTL Live Verification (KEY-365)
```bash
node scripts/research-editor-live/run.mjs rtl
```
Runs an offline Electron RTL verification scenario testing:
- **Block direction override**: Block models (`paragraph`, `list`) declare property `textDirection: 'auto' | 'ltr' | 'rtl'` (default `'auto'`), persisting to snapshot JSON and surviving reloads.
- **Direction override shortcuts**:
  - Word-style shortcuts: `Ctrl+RightShift` sets `rtl`, `Ctrl+LeftShift` sets `ltr`.
  - BlockSuite keymaps: `Mod-Shift-r` (`rtl`), `Mod-Shift-l` (`ltr`), `Mod-Shift-a` (`auto`).
- **HTML export `dir` attributes**: Block adapters write `dir="rtl"`, `dir="ltr"`, or `dir="auto"` on paragraphs (`<p>`, `<h1>`..`<h6>`, `<blockquote>`), list items (`<li>`), and tables (`<table>`).
- **Edgeless frame titles**: Positioned on the right (`right: 0; left: auto; transformOrigin: top right / bottom right`) with `titleX` adjusted for RTL.
- **Slash menu caret anchoring**: Anchored to caret position on the right side in RTL paragraphs.
- **Heading collapse icon**: Styled for `:dir(rtl)` / `[dir="rtl"]` with mirrored chevron icon (`scaleX(-1)`).
- **Inline footnote citations**: Quran (`quran:hafs:2:255`) and Sunnah (`sunnah:bukhari:1`) citations with bidirectional caret navigation and selection.
- **Table and database blocks**: Column order mirrored in RTL with bidirectional coordinate calculations (`Math.min`/`Math.max`).
- Generates 9 screenshots, exported HTML (`export.html`), and `result.json` in `.baglib-data/KEY-365-evidence/`.
