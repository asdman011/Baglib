# KEY-298 native keyboard checks

Run `node scripts/a11y-ui-live/run.mjs` after `npx tsup`. The harness uses one Electron window, production preload/IPC and production components. Arabic and English text-layer PDFs from `tests/real-files/manifest.json` populate a throwaway profile. The matrix covers ar/en, light/dark and 1280/480 px.

The component fixture covers the shared primitives, part 1 dialogs and the part 2 library/reader/import/study/Quran panels. Bulk, category/tag, Today settings, TOC import, graph and Stirling dialogs open through their production controls. Trash confirmations use an actual soft-deleted throwaway import. Reflow, paragraph and RSVP content comes from production extraction of the real PDFs. The study-draft editor opens from a real PDF selection through the whole application.

Every covered modal receives native forward/reverse Tab traversal, boundary wrapping, forced-focus containment, Escape and opener-return assertions. Dirty prompts, trash and storage confirmations receive nested checks. Actual Electron Shift-click selects four books in both grid and list, Space toggles their checkboxes and labels are checked against persisted original titles. Question-mark help lists every registry entry and is suppressed in text inputs. Focus-token outlines and CDP-emulated reduced motion are asserted.

Online-edition and storage responses are controlled IPC fixtures. Provider search, repair, permanent deletion, export and save operations are outside this keyboard pass. No OCR is run. The runner checks original hashes and removes the throwaway profile and bundle in `finally`. Retain only the final evidence run.

`BAGLIB_A11Y_DEBUG=1` limits diagnosis to ar/light/1280. `BAGLIB_A11Y_TAIL=1` runs the nested surfaces, selection and whole-app reader checks. Both variables must be absent for the final full matrix.
