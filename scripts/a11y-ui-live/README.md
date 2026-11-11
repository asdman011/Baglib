# KEY-298 native keyboard checks

Run `node scripts/a11y-ui-live/run.mjs` after `npx tsup`. The harness uses one production Electron window, production preload/IPC and the production dialog components in an isolated renderer fixture. It seeds real Arabic and English PDFs from the manifest into a disposable profile, then checks ar/en, light/dark and 1280/480 px.

Each converted panel gets native Tab and Shift+Tab traversal, wrapping, forced-focus containment, Escape and opener-return assertions. Nested dirty prompts and storage confirmations get separate passes. Both shortcut sheets use the registry. Text-entry suppression and token focus rings are asserted. CDP `Emulation.setEmulatedMedia` enables reduced motion and computed animation/transition durations are inspected.

The online-editions response and storage results/groups are controlled IPC fixtures. No provider network search, file repair, deletion, export or save is executed. Original PDF hashes are checked after the run. The disposable profile and bundled fixture are removed in `finally`. Only the final evidence folder should be retained after successful verification.

Part 1 covers the panels listed in the local KEY-298 report. Remaining overlay migrations are recorded there for the next pass.
