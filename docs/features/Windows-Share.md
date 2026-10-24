# Windows native sharing

Investigated and implemented 2026-10-24 for Sunnah exports. No Windows shell artwork or external application implementation was copied.

## Evidence

- Microsoft documents desktop sharing through `IDataTransferManagerInterop.GetForWindow` and `ShowShareUIForWindow`, with `DataTransferManager.DataRequested` supplying a `DataPackage`: [Display WinRT UI objects](https://learn.microsoft.com/en-us/windows/apps/develop/ui/display-ui-objects).
- REA `inspect_managed_artifact` inspected the installed `C:\Windows\System32\WinMetadata\Windows.ApplicationModel.winmd`. Summary evidence `ev_687bd0fb427a689a1a1596218aca3e2c7754ed61a1e1a8fca2ed5c639697305f`; SHA-256 `282743e47af55f19b5d1aebfe3ccc558663ee8d01ed646a0ba0868b2caf8595c`. Metadata inspection alone does not prove runtime behavior or decompile implementation.
- Actual local tests: the helper cannot use Electron's foreign-process HWND (`GetForWindow` returned access denied). A helper-owned window succeeds. Because the subprocess console is hidden, an explicit `ShowWindow`/foreground request is necessary before opening the share UI; without it the API returned but no DataRequested callback arrived.
- The final native smoke test received DataRequested after setting mixed Arabic/English text through actual Electron preload/IPC. It did not select a destination or transmit a message.

## Baglib implementation

- `HadithActions.tsx` formats a text-only payload; `sunnah:share` validates the main-frame sender and resolves its BrowserWindow.
- `src/main/services/sunnah/native-share.ts` validates nonempty text and a 256 KB UTF-8 limit, then launches the built-in Windows PowerShell/.NET helper with a hidden console. Only trusted bundled script code is encoded in command arguments; user text is base64 UTF-8 in JSON on stdin, never interpolated as executable code.
- `assets/native-share.ps1` compiles a small C# bridge against installed Windows metadata and .NET Framework assemblies. It creates a transparent, non-taskbar owner window, populates the Windows share DataPackage, and reports readiness only when Windows requests the data.
- `electron-builder.yml` packages the script outside ASAR through extraResources. No npm/native dependency, network call, database entity or persistent export file is introduced.
- The helper is replaced on another share request, killed when its originating window closes or the app quits, and bounded to two minutes (125-second parent failsafe). Failure to receive DataRequested within 20 seconds is reported as an error. The status says “Share menu opened”, not “sent”. The UI disables repeated clicks while opening.

## Limitations and verification

Windows-only bridge; Windows PowerShell, .NET Framework WinRT support and Windows metadata must be available. Enterprise application-control policies may block runtime compilation; errors remain explicit, with no clipboard fallback masquerading as sharing. Other platforms are not implemented by this bridge. Destination availability is controlled by Windows and installed apps; text sharing need not list the same apps as the screenshot's file-sharing example. A two-minute helper lifetime bounds resources but also limits a pending share session.

Run the opt-in native smoke test in PowerShell with `$env:BAGLIB_TEST_NATIVE_SHARE='1'; node scripts/sunnah-live/run.mjs`. It displays the real system share UI briefly and closes its test window without sending anything. Clear that environment variable before running the normal hidden layout suite. Packaged-install and destination-app delivery have not been tested.

See [Sunnah Reader](feature%20-%20Sunnah%20Reader.md) for export semantics and corpus limitations.
