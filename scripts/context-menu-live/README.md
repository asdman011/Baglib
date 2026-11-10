# KEY-316 context menus and shortcuts

Run `node scripts/context-menu-live/run.mjs` after `npx tsup`. The runner launches one real BagLib window, uses a disposable profile under `.baglib-data/k316-*`, reads the real-file manifest, and copies installed packs through `scripts/lib/corpus-copy.mjs`. The Sunnah research database is also copied before the app opens. Original PDFs and EPUBs are opened with manual saving. Corpus and document hashes are checked during cleanup.

The matrix covers Arabic RTL and English LTR, light and dark, and 1280px and 480px. Evidence is saved under `.baglib-data/KEY-316-evidence/<run>/`. Clipboard payloads are captured inside the renderer. Production native editor menu templates and popup invocations are intercepted for verification, preserving the system clipboard. OS menu interaction is outside this check. No messages are sent to sharing targets.

## Default shortcuts

`src/renderer/components/actions/shortcuts.ts` is the registry used for matching, help, palette hints and menu hints. Poetry contributes its existing shared line-action declarations. The `?` sheet includes each scope. These defaults apply outside text inputs and editors. Ctrl also accepts Cmd.

| Scope | Defaults |
|---|---|
| Global | Ctrl+K command palette, Ctrl+Shift+N new note, Ctrl+B pin navigation, ? shortcut help, Shift+F10 or Menu context actions |
| Reader, Quran, Sunnah, poetry | Ctrl+Shift+M companion note |
| Reader | Alt+M toolbar, H highlighter, U underline, C comment, 1–5 highlight colours, Ctrl+F find, Ctrl+S save, F11 focus, Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo, Escape stop markup |
| Reader and Quran | PageUp/PageDown, Space/Shift+Space, direction-aware inline arrows |
| Reader | Up/Down, Home/End |
| Focused poetry line | Enter select, C copy, S share, N note, Up/Down move focus |
| SRS review | Space reveal, 1–4 grade, Escape close |
| Board item | Delete remove, arrows move by 10px, Shift+arrows move by 50px |

Right-click, keyboard context actions, and a stationary 550ms touch use the same menu primitive. Moving more than 10px cancels a pending touch menu. Text fields and CodeMirror keep localized native undo, redo, cut, copy, paste and select-all roles. Direction-aware menu arrows mirror in RTL. Disabled entries remain keyboard-readable when they include a reason.

Library cards, featured books, rows and their overflow triggers share `library-card-actions.ts`. Selected books expose the existing bulk category, tags, reading-status and trash dialogs plus metadata export. Opening a book uses the persisted reading position. Physical-copy metadata opens its existing editor for confirmation. Wishlist uses the existing tag representation. Export produces selected-book metadata JSON through the browser download path.

Quran bookmarks use linked study notes tagged `bookmark`. Personal comments reuse the existing commentary editor and source keys. Hadiths without a research identifier capture a linked note. SRS creates a recall card and enables memorizing through the existing APIs, preserving a reused or newly saved card for retry if scheduling fails. No schema or dependency is added.
