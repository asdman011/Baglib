# Anki add-ons, native replacements and an AnkiConnect-compatible API (TBD-2, KEY-403)

- **Status:** a design note for the user's decision. Nothing is chosen and nothing is built.
- **Written:** 2026-11-18 by Claude Code.
- **Related:**
  - `feature - Revision System Investigation.md` §5 TBD-2;
  - KEY-387 (revision epic);
  - KEY-391 (image occlusion and card media);
  - KEY-392 (lossless `.apkg`, waiting for the `fzstd` approval).

## Verified on this computer (read-only, 2026-11-18)

**Installed add-ons**, read from the `meta.json` files in `%APPDATA%\Anki2\addons21`. Nothing was changed.

| Id | Add-on | Relevance to BagLib |
|---|---|---|
| 111623432 | Hyper TTS | TTS on cards |
| 1436550454 | AwesomeTTS | TTS on cards |
| 1784714388 | Forvo Pronunciation Downloader | Recorded pronunciations, fetched online |
| 647779979 | Anki Image Picker | Image search into a field |
| 24411424 | Customize Keyboard Shortcuts | Review keybindings |
| 2055492159 | **Anki-Connect** | A local HTTP API, used by browser tools such as Yomitan |
| 1250448937, 678316993 | Kakijun, JapaneseFurigana | Japanese only; out of scope |

**AnkiConnect, as installed:**
- **Settings** (`config.json`):
  - `webBindAddress` `127.0.0.1`, port `8765`;
  - `webCorsOriginList` `["http://localhost"]`;
  - **`apiKey: null`**, so any program on this computer can call it without a key.
- **Source:**
  - `__init__.py` registers 122 `@util.api()` actions;
  - origins are granted through `requestPermission`, which asks the user and remembers the answer in its settings;
  - the key is checked only when one is set (line ~180).
- **`storeMediaFile(filename, data, path, url, …)`** can read **any local file** (`path`) or **fetch any URL** (`url`) into the collection. Any compatible API that BagLib builds must not copy that.

**BagLib today:**
- `{{tts lang:Field}}` and `{{tts lang:cloze-only:Field}}` are parsed by `template-engine.ts`, which renders a play button. BagLib has its own TTS providers.
- The review shortcuts in `actions/shortcuts.ts` are fixed: Space reveals, 1-4 grade, Esc closes. They can't be customised.
- There is no image search, and no local HTTP API.

## Finding: native add-on compatibility isn't realistic (unchanged)

- An add-on is a Python package that runs inside Anki's own process and drives its Qt interface (`aqt`, `mw`, hooks).
- Running one inside BagLib would mean embedding Python, PyQt and Anki's backend in Electron: hundreds of MB, plus third-party code with full access to the computer.
- **Recommendation:** don't attempt it.

## Decision 1: native replacements, ordered by the user's own add-ons

| Priority | Replaces | BagLib version | Privacy | Cost | Notes |
|---|---|---|---|---|---|
| 1 | Hyper TTS, AwesomeTTS | Already mostly there: `{{tts}}` plus BagLib TTS. What's missing: <ul><li>playing it automatically when a card is shown or answered;</li><li>choosing a voice per deck;</li><li>caching the audio in `card-media/`.</li></ul> | Local TTS needs none. A cloud voice needs the same consent as the AI provider. | Low | `.apkg` files made with these add-ons usually carry their audio as `[sound:…]` files, which import keeps (decision 3). |
| 2 | Customize Keyboard Shortcuts | Let the user rebind the review keys (reveal, grades, bury, suspend, undo), stored as one setting with a reset. | None | Low | It fits the existing `shortcuts.ts` registry. |
| 3 | Anki Image Picker | "Find an image" in the note editor. It saves into `card-media/` (KEY-391), always naming the source. | An online search sends the query to the search provider. It needs a consent choice and should be off until the user turns it on. | Medium | Licensing: show each image's source page and licence where the provider gives them. |
| 4 | Forvo | Fetch a recorded pronunciation for a word into a field. | It sends the word to Forvo, and the Forvo API needs a key from the user. | Medium | Useful for Arabic vocabulary decks (KEY-400). It could wait until lexicon decks exist. |

## Decision 2: an optional AnkiConnect-compatible local API

**Goal.** Tools that already speak AnkiConnect, chiefly Yomitan, can add cards to BagLib without any change on their side.

**Proposed subset.** Only what card-adding tools need. The exact list should be checked against Yomitan's source before building.

| Action | BagLib behaviour |
|---|---|
| `version` | Reports AnkiConnect API version 6. |
| `requestPermission` | Shows a BagLib dialog: "Allow `<origin>` to add cards?" It remembers allow or deny per origin, and the user can withdraw it in Settings. |
| `deckNames`, `modelNames`, `modelFieldNames` | Read-only lists of BagLib decks and note types, using their stored English names, which match Anki's. |
| `findNotes`, `notesInfo`, `canAddNotes`, `canAddNotesWithErrorDetail` | Duplicate checks: a small query subset (`deck:`, `note:`, `"field:value"`) only. |
| `addNote`, `addNotes` | Make notes through `CardNoteRepository.saveNote`, with the `anki-connect` tag and the origin recorded. |
| `storeMediaFile` | **`data` (base64) only**, with an image or audio type, a size limit and a SHA-1 name in `card-media/`. **`path` and `url` are refused.** |
| `guiBrowse` | Optional: opens BagLib's card browser on the query. |
| `multi` | Runs the allowed actions above only. |

Every other action, such as `deleteNotes`, `updateNoteFields`, `deleteDecks`, `sync` or `exportPackage`, returns AnkiConnect's usual "unsupported action" error.

**Server design:**
- **Off by default.** A Settings switch turns it on, and its consent text says exactly what the API allows.
- Bound to `127.0.0.1` only, never `0.0.0.0`.
- A **different default port (8766)**, so it never clashes with a running Anki on 8765. The user points Yomitan at it.
- **A key is always required.** BagLib generates one and shows it for copying. This differs from the user's current AnkiConnect, which has none.
- **Origin checks:**
  - a request with a browser origin must be an origin the user allowed;
  - CORS is answered only for allowed origins;
  - a request with no origin (a local script) needs the key.
- **Limits:**
  - request size (for example 2 MB);
  - a rate limit;
  - card fields go through the same text limits as the note editor;
  - templates and fields render in the sandboxed card frame, as imports do.
- Runs in the main process, with the same validators as IPC, and shares no state with the renderer.
- A short log of what was added, from which origin, visible in Settings.

**Threat model:**

| Threat | Mitigation |
|---|---|
| A website the user visits calls `http://127.0.0.1:8766` to add or read cards | Off by default; origin allow-list; required key; CORS only for allowed origins |
| DNS rebinding (a site resolving to 127.0.0.1) | Check the `Host` header is `127.0.0.1:<port>` or `localhost:<port>`; require the key |
| Another local program misusing it | Required key; read actions limited to deck, type and field names plus duplicate checks; no delete or export |
| Reading or uploading local files through media | `path` and `url` refused; `data` only; type and size checked |
| Flooding the collection | Rate and size limits; every added note is tagged `anki-connect` so it can be found and trashed |
| A port clash with Anki | A different default port, which is configurable |

**Cost:** medium. A small HTTP server, a dispatcher for about 12 actions, a permission dialog, a Settings panel, and tests, including a security test for each mitigation.

## Decision 3 (already the plan): import tolerance

`.apkg` import (KEY-392) keeps what add-ons generated:
- media files, such as `[sound:…]` audio and images;
- extra fields;
- custom templates, rendered in the sandboxed card frame (KEY-390).

Template JavaScript that depends on an add-on simply does nothing in BagLib.

## For the user to decide

1. **Native replacements:** which of the four, and in what order? The suggestion is TTS autoplay, then shortcuts, then the image picker, then Forvo.
2. **AnkiConnect-compatible API:** build it (off by default, key required, port 8766), or not?
3. **Image picker and Forvo:** is an online lookup acceptable once the user turns it on and agrees, and which providers?
