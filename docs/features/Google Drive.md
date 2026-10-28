# Google Drive — local-primary PDF connector

Implemented 2026-10-26 from [Google desktop OAuth documentation](https://developers.google.com/identity/protocols/oauth2/native-app) and the documented Drive v3 API. No live account login or external source reverse engineering was performed. User explicitly requested implementation now and will configure app IDs/sign in later.

Implementation: `cloud-oauth.ts`, `cloud-vault.ts`, `cloud-drive.ts`, `cloud-connector.ts` under `src/main/services/pdf-editor/`; `src/main/ipc/pdf-cloud.ts`; `PdfCloudPanel.tsx`.

Register a **Desktop app** OAuth client, enable Drive API, configure consent/test users as applicable, and enter its client ID in Baglib's PDF workstation → Cloud files. The native flow uses a random-port `http://127.0.0.1:<port>/baglib-oauth` redirect, system browser, S256 PKCE, random state, exact callback path/Host checks and a five-minute deadline. Saving setup does not start login. No client secret is embedded; Google's native documentation lists it as optional.

The requested Drive read/write scope supports browsing/editing existing files, and may require Google's verification process for wider distribution. The UI describes the scope before consent. Tokens are encrypted by Electron safeStorage in a main-only settings namespace; plaintext fallback is rejected. Disconnect removes local tokens and disables mappings; it does not claim to revoke Google's account grant remotely.

Drive browsing supports folders/pagination and PDF import. Import validates bytes in a local parser subprocess and creates a new Work or Edition/Source. Export accepts the saved PDF or an owned, hash-verified staged PDF/DOCX/XLSX/PPTX/HTML with its actual MIME type (extended 2026-10-27). Export creates a new file, potentially with the same display name; existing IDs are not replaced by export. Sync requires an explicit identical-content link and an additional enable action, checks every minute while the app runs, uses conditional revisions, imports remote updates as new editions and pauses conflicts. Reconnecting clears mappings so a different account cannot inherit them.

Verified with mocked HTTP and a real loopback listener: PKCE/state/cancellation, bounded transfer, token refresh rotation/singleflight, conditional conflicts and simultaneous-edit preservation. Native encrypted configuration was tested in isolated Electron without account credentials. Real Google consent, token exchange, ETag availability and user-data transfer remain deferred.

See [Microsoft OneDrive](Microsoft%20OneDrive.md) and [Document Workstation](feature%20-%20Document%20Workstation.md).
