# Pocket TTS integration

## Debugging update — 2026-10-23

Pocket TTS is the intended default and starting point for future engine customization.
Browser speech remains a temporary fallback in the existing implementation; it must not
be mistaken for Kyutai inference. The default English voice now selects `pocket:alba`.
Browser voice refreshes preserve the Pocket catalog instead of overwriting it.

The reader toolbar now exposes a localized Arabic/English Read aloud action. It starts
at the first sentence of the current page and continues through the available extracted
pages. Selection playback starts at the containing sentence and continues through that
same queue, ending when stopped or when the available text ends. It does not repeat the
book indefinitely. Both paths use the same sentence segmentation as page tracking.

The earlier missing-package result is superseded: the default interpreter now has
Pocket TTS **4.0.1**, at
`C:/Users/Ammar's/AppData/Roaming/Python/Python314/site-packages/pocket_tts`.
Inspected `main.py::serve`, `main.py::health`, the `/tts` endpoint, and
`default_parameters.py::DEFAULT_VOICE_FOR_LANGUAGE`. The server loads the model and
default voice **before** Uvicorn starts listening. Initial model downloads therefore
cannot pass an HTTP health check until provisioning completes. Dutch defaults to `daan`.

Baglib now shares a single in-flight startup per language, allows ten minutes for
cold provisioning, bounds each health request to two seconds, drains both output pipes,
and includes recent process output in startup failures. Failed processes are removed
and killed; shutdown also waits for pending startups to settle.

Runtime experiment: started `py -3 -m pocket_tts serve --host 127.0.0.1 --port 18893
--language english --quantize`. Restricted-network DNS initially failed against
Hugging Face; with approved network access provisioning completed. `/health` returned
`{"status":"healthy"}` and a `/tts` request using Alba returned HTTP 200 with
90,284 bytes beginning with a RIFF/WAVE header. This verifies local synthesis, not
audible renderer playback or other languages. The test server was stopped afterward.

REA tools are now configured. `list_electron_targets` against port 9222 reported
`endpoint_unreachable`; no live Baglib renderer inspection was possible through REA.
Evidence above comes from installed source inspection and direct runtime HTTP tests,
not a successful REA runtime capture.

Reader stream fix: asset URL path segments are percent-encoded, preserving Arabic,
spaces, `%`, `#`, and `?` in filenames. Asset responses grant CORS only to Baglib's
`http://localhost:3000` and `app://-` origins, including range/preflight responses.
No wildcard origin permission is used. Six focused regression tests pass, covering
startup sharing/retry, filename preservation, and sentence cleanup/segmentation.
Live reader fetching and RTL/LTR visual verification remain to be checked in Baglib.

Baglib uses Kyutai's Pocket TTS as the primary local narration provider for the built-in reader.
Inference stays outside Chromium: Electron main starts one local `pocket-tts serve` process per
active model language, and the renderer receives PCM chunks over a narrow IPC bridge. The model
processes are CPU-only and do not require an external speech API.

## Runtime architecture

### Confirmed next-sentence stall and hardware investigation (2026-10-23)

**Root cause, reproduced:** the real provider benchmark delivered sentence 1 in
1.36 seconds, but sentence 2 completed its HTTP request in 1.79 seconds with **zero
PCM chunks**. `WavPcmParser.push` stopped parsing headers as soon as it found `fmt `.
When HTTP split the WAV header after byte 36, the later `data` header was never
processed. The renderer received a completion without audio, appearing to wait
forever. This was a Baglib parser defect, not evidence of a slow CPU or download.
Separate partial-sample handling also dropped odd bytes at HTTP chunk boundaries.

The parser now continues until the complete data header arrives, carries incomplete
PCM frames into the next chunk, and skips padded metadata chunks. It validates
16-bit PCM and rejects empty/truncated streams instead of silently completing.
It deliberately follows actual HTTP EOF rather than the streaming WAV's placeholder
data length. A 30-second **inactivity** watchdog aborts stalled requests; it resets
on received bytes and does not impose a 30-second maximum sentence duration or
apply to initial model provisioning. The existing renderer error/fallback path
handles failures. Successful requests still reuse the resident model and prefetch.
Failure/fallback toasts now use centralized Arabic/English translations; technical
diagnostics remain in the console rather than appearing untranslated in the reader.
No reader layout, database schema, or dependencies changed in this fix.

#### Source and GitHub evidence

Inspected the local upstream tree `repos/pocket-tts/pocket-tts-main/` and installed
Pocket TTS 4.0.1. Installed and local `pocket_tts/main.py` have identical SHA-256
`E41748D62EA45B752976159E593CA352532E5A36E200DEB7EB249EC6787277A8`.
Relevant call paths:

- `pocket_tts/main.py`: `/tts`, `generate_data_with_state`, and `write_to_queue`
  stream a queue-backed WAV response; cancellation signals the generation worker.
- `pocket_tts/data/audio.py::StreamingWAVWriter` writes a streaming header with
  1,000,000,000 placeholder frames and adds 200 ms of ending silence. TCP/HTTP
  chunks must not be treated as WAV header or PCM sample boundaries.
- `pocket_tts/static/index.html::StreamingWavPlayer` accumulates the complete
  44-byte header and sample-aligned audio before scheduling through Web Audio.
  Its 16,384-byte initial buffer trades startup latency for underrun protection.
  Baglib retains lower-latency incremental delivery, a general chunk-scanning
  parser, and its existing sentence lookahead rather than copying the demo player.
- `pocket_tts/models/tts_model.py` sets PyTorch intra-operation threads to one;
  decoding also uses a worker. More logical processors do not imply linear speedup.

REA `analyze_javascript_application` successfully parsed the extracted upstream
inline player (1 file, 1,209 AST nodes, no parse failures). Summary evidence ID:
`ev_9a8fa86770688421fd3354359a99aa9e2def1d7df804f35dd7b3eb359d58ba04`.
This was static evidence, not a recording of browser behavior. REA process-scenario
capture was attempted but its Windows PTY adapter refused because descendant
cleanup could not be verified. Direct shell benchmarks and the isolated Electron
harness below supplied runtime evidence instead; no REA runtime capture is claimed.

The GitHub search included streaming, hangs, Windows, and performance reports.
[Issue #229](https://github.com/kyutai-labs/pocket-tts/issues/229) documents the same
placeholder WAV lengths; a maintainer confirms they are intentional for streaming.
This corroborates the header contract, not the separate Baglib parsing bug.
[Issue #240](https://github.com/kyutai-labs/pocket-tts/issues/240) reports quantization
performance differences on ARM; it motivated a local comparison, not an assumption
that the same regression affects this Ryzen machine. Upstream source was not changed.

#### Measured hardware and performance

Windows reports an **AMD Ryzen 7 PRO 5750G**, 8 physical cores / 16 logical processors,
approximately 15.39 GiB OS-visible RAM (16 GB class), with about 5.24 GiB available
at inspection. Installed runtime: Python 3.14, Pocket TTS 4.0.1, PyTorch 2.14.1+cpu.
During the longer offline test, the Python server's sampled working set was
860.9 MiB and its reported peak working set was 1,011.4 MiB. This is one server,
not total Baglib/browser/system memory or a guarantee for multiple languages.

The [official model card](https://huggingface.co/kyutai/pocket-tts) and
[upstream README](https://github.com/kyutai-labs/pocket-tts) describe CPU inference,
roughly 200 ms first chunks and 6x real-time on a MacBook Air M4 using two cores.
That M4 result is not a minimum requirement or a promise for this Windows CPU.
The requested [launch blog](https://kyutai.org/blog/2026-01-13-pocket-tts/) was opened,
but the web reader returned navigation/footer without the article body; benchmark
claims were checked against the model card/README instead.

After the parser fix, three consecutive English sentences through Baglib's real
provider, using cached assets:

| Mode | Fresh process to ready | First PCM per request | Synthesis throughput |
| --- | --- | --- | --- |
| Quantized Alba (default) | 13.40 s | 128-148 ms | 2.47-2.51x real-time |
| Unquantized Alba | 13.22 s | 177-208 ms | 2.25-2.32x real-time |

The default quantization stays enabled. Generated lengths vary stochastically;
this is a small practical comparison, not a controlled quality study. These results
show adequate hardware for the tested English narration. Initial process/model
loading remains around 13 seconds; it is amortized across subsequent sentences.
Concurrent workloads, long inputs, other languages and cold caches can differ.

#### Actual Electron playback verification

`scripts/tts-live/` runs the actual `useTTSAudio` hook with React, a real isolated
Electron renderer, a narrow test IPC bridge, the real provider/Python server and
Chromium Web Audio. The window is hidden and muted, with its own disposable profile;
it does not open the user's library. `HF_HUB_OFFLINE=1` is forced, so cached Hub
assets are used without Hub requests. This is not an OS-level network capture.

| Offline test | Completed sentences | PCM buffers | Largest scheduled-buffer gap |
| --- | --- | --- | --- |
| Alba, 1x | 3 / 3 | 151 | 38.21 ms |
| Anna, 2x | 3 / 3 | 176 | 39.25 ms |
| Anna, 2x, extended run | 30 / 30 | 1,738 | 41.59 ms |

The extended run repeated the three-sentence passage ten times and scheduled
71.32 seconds of 2x playback (approximately 142.64 seconds of generated audio).
Another independent three-sentence Anna run passed with a 39.95 ms maximum gap.
Post-run process inspection found no remaining Pocket TTS server/test processes.

Gaps measure Web Audio scheduling, not embedded punctuation pauses or the upstream
200 ms ending silence. The tests verify progression, buffering and completion, not
subjective audible quality or full PDF/EPUB viewport/highlight behavior. They
supersede the earlier simulated-playback-only limitation for the synthesis/playback
pipeline. Arabic remains on the existing fallback; mixed Arabic/English segmentation
is covered by unit tests, but neither RTL/LTR layout nor Arabic speech was visually
or audibly tested by this headless harness. No layout changes were made.

Repeat after provisioning model/voice assets:

```powershell
npx tsx scripts/benchmark-pocket-tts.ts
npx tsx scripts/benchmark-pocket-tts.ts --float
npm run test:tts:live
$env:BAGLIB_TTS_TEST_RATE = '2'
$env:BAGLIB_TTS_TEST_VOICE = 'pocket:anna'
npm run test:tts:live
$env:BAGLIB_TTS_TEST_REPEAT = '10'
npm run test:tts:live
Remove-Item Env:BAGLIB_TTS_TEST_RATE, Env:BAGLIB_TTS_TEST_VOICE, Env:BAGLIB_TTS_TEST_REPEAT
```

Regression coverage includes every two-chunk WAV split, byte-at-a-time streams,
partial PCM frames, padded metadata, malformed/empty output, and a real loopback HTTP
stream that stalls. The focused parser/timeout/startup/prefetch/text/asset suite has
15 passing tests, including localized failure/fallback messages. The full repository
suite passes all 790 tests. TypeScript, targeted ESLint and the Electron main/preload build
pass; ESLint still emits the existing custom Next.js pages-location warning.

### Sentence prefetch and offline warm starts (2026-10-23)

`useTTSAudio` now requests the next sentence when the current sentence finishes
**generating**, while its buffered audio is still playing. A single lookahead slot
retains PCM chunks until the current sentence's audio sources end. Playback consumes
that slot without another synthesis request and then prepares the following sentence.
Only one future sentence is retained; very long sentences can still consume more memory.
If synthesis cannot keep up with playback, including high playback speeds, a buffer
underrun remains possible. This is not a guarantee of gapless output on every device.

Sentence highlighting advances when the prior audio finishes, not when prefetch starts.
Pause suspends the AudioContext; completion follows source-ended events instead of a
wall-clock timer. Stop, sentence seeking, book/voice changes and unmount cancel the
active/lookahead jobs and discard queued chunks. Renderer-assigned UUIDs are registered
before IPC dispatch so immediate chunk events are not lost. Provider cancellation is
registered before model startup so a stopped job cannot synthesize after startup ends.

`src/main/services/audio/pocket-cache.ts` checks the Hugging Face snapshot cache for
the selected language's model, tokenizer, and voice embedding. Warm starts set
`HF_HUB_OFFLINE=1`, avoiding Hub freshness requests. Cache roots respect `HF_HUB_CACHE`
and `HF_HOME`. Missing assets retain provisioning behavior. Selecting an uncached
voice on an offline server restarts that language server with provisioning enabled;
first use of a new voice still needs internet. The cache layout is based on the
installed Pocket TTS 4.0.1 package; other releases/layouts may require updating it.

Earlier verification: nine focused tests passed, including a React hook test with simulated
Web Audio/IPC verifying prefetch-before-playback-end, buffered reuse, pause/resume,
and rejection of stale chunks after stop; provider tests verify cache gating and
cancellation during model startup. TypeScript and the Electron build pass. These
tests do not constitute a live listening test or an offline network capture.

```text
Reader page text
  -> sentence segmentation and readable-text cleanup
  -> useTTSAudio
  -> preload tts IPC
  -> PocketTTSProvider (Electron main)
  -> local pocket-tts serve /tts WAV stream
  -> WAV header removal and PCM chunk IPC
  -> Web Audio scheduling and read-along highlight
```

`TTSProvider` is defined in `src/shared/types/tts-provider.ts`. Implementations must expose
`init`, `loadVoice`, `synthesize`, `stop`, and `release`, so another local provider can replace
Pocket TTS without changing the reader shell.

The provider keeps server processes alive for the duration of the Electron session. It aborts
active HTTP requests when narration is stopped and releases all jobs and child processes during
application shutdown. The renderer starts lookahead synthesis after the previous generation
completes, while scheduling received PCM buffers ahead of the playback clock. The earlier claim
that the server itself serializes all requests was incorrect: the inspected `/tts` route starts
generation threads without a request lock. Parallel independent clients should not be assumed
safe merely because Baglib's normal narration queue is sequential.

## Provisioning

Pocket TTS is intentionally not installed as an npm dependency. Provision one of these local
engines before using narration:

1. Install the official Python package with `python -m pip install pocket-tts`. Baglib discovers
   the `pocket_tts` module through `py -3`, `python`, or `python3`.
2. Install the official `pocket-tts` executable and put it on `PATH`.
3. Set `BAGLIB_POCKET_TTS_BIN` to the standalone executable path, or package it at
   `resources/pocket-tts/pocket-tts` (use `.exe` on Windows).
4. Set `BAGLIB_POCKET_TTS_PYTHON` to the Python executable or launcher that owns the installed
   package when it is not the default interpreter.

If no runtime is found, Baglib reports these provisioning options instead of attempting to spawn a
missing command and returning `ENOENT`.

Until Pocket TTS is provisioned, English and other supported non-Arabic narration falls back to
the local browser speech engine for the current session. Installing Pocket TTS and restarting
Baglib automatically restores the primary streaming provider.

The first model/voice use may download weights through Pocket TTS's own Hugging Face cache. After
provisioning and cache warm-up, narration is offline and Baglib does not call a hosted TTS API.
The server is bound to `127.0.0.1` on an ephemeral port and is not exposed to the LAN.

Pocket TTS currently provides official model variants for English, French, German, Portuguese,
Italian, Spanish, and Dutch. The reader exposes the catalog voices and accepts Pocket TTS voice
IDs through the voice settings panel.

## Arabic behavior

Arabic is not an official Pocket TTS language variant. Baglib detects Arabic sentences before
dispatch and uses the existing local browser speech provider as a temporary fallback, while
showing a notice. This keeps the provider boundary explicit and leaves room for a future Arabic
provider or a community-trained model. Community model weights must be reviewed for model-card,
voice-data, and redistribution terms before they are bundled or offered in the UI.

## Licensing and distribution

Pocket TTS source is distributed under the license in the upstream Pocket TTS repository. Baglib
must preserve that license and any notices for bundled binaries, model weights, and voice samples.
Voice samples can carry separate terms; a voice being available in the upstream catalog does not
automatically grant Baglib redistribution rights. Do not commit model weights, cached Hugging Face
files, or user voice recordings to the repository. Review the exact upstream release and voice
model cards before packaging a production build.

## Verification

- Start Baglib with a provisioned executable and confirm `tts:get-status` becomes available.
- Open a PDF or EPUB with extracted text, start narration, and confirm the first PCM buffers play
  without waiting for the entire chapter.
- Pause, resume, stop, change speed, switch voice, seek pages, and close the reader while audio is
  active; no stale job should continue.
- Confirm the active sentence highlight follows the rendered HTML or PDF text layer.
- Shut down Baglib and verify the Pocket TTS child processes are gone.
