# JPDFium runtime integration

Investigated 2026-10-29 by Codex for Baglib's Stirling integration.

## Verified evidence

- REA opened and inventoried the supplied executable JAR, SHA256 `370a4218624fa4b3cf5460c886f03de01bfcfd2d4893009202a81e53b5f3344d`. This was archive inspection, not Java decompilation.
- Central-directory inspection found `BOOT-INF/lib/jpdfium-1.1.6.jar` and only `jpdfium-natives-linux-x64-1.1.6.jar`, not the Windows module.
- Actual Windows merge and split requests failed with `NativeNotFoundException` for `windows-x64` in `live-verification/logs/info.log`.
- Selected `MergeController.java` in the supplied source archive uses `PdfDocument.open` and `mergeWithJpdfium`; controller prevalidation catches Exception, not the observed initialization Error.
- Downloaded the matching Windows module from [Maven Central](https://repo.maven.apache.org/maven2/com/stirling/jpdfium-natives-windows-x64/1.1.6/) and verified its published SHA256: `b0f70399bb0e2b670d83b0c24b84f8976b6fcc0ff21577ddfa6afee460f2b095`.

## Baglib implementation

`scripts/setup-stirling-pdf.py` reads the actual embedded JPDFium version, provisions the matching Windows x64 native JAR, verifies SHA256 before replacement, and reuses verified local cache without network access. The native JAR retains its bundled license resources; redistribution must preserve those notices and review the actual bundled components. See [upstream licensing](https://github.com/Stirling-Tools/JPDFium/blob/main/NOTICE).

`stirling.ts` uses Spring Boot PropertiesLauncher when external native modules exist, making resources visible to JPDFium's classloader. Simply putting extracted DLLs on PATH did not fix observed loading. No database/domain changes are involved.

## Verification and limitations

After classpath repair, actual merge/reorder/per-page rotation/blank insertion/split outputs pass independent PDF.js inspection; native split endpoint also returns ordered one-page parts. Original source hash remains unchanged. Provisioning tests cover version-matched offline cache and invalid-hash replacement protection.

Verified platform is Windows x64/Java25 and embedded JPDFium1.1.6. This does not establish ARM64, other engine versions, all native operations, or every redistribution license condition. Runtime downloading is confined to provisioning, not ordinary PDF reading.

Related: [Stirling-PDF](Stirling-PDF.md), [Spring Boot](Spring%20Boot.md), [Document Workstation](feature%20-%20Document%20Workstation.md).
