# pyHanko — certificate signing and offline validation

Investigated and exercised 2026-10-26; installed 0.38.0. Evidence: [validation documentation](https://pyhanko.readthedocs.io/en/latest/cli-guide/validation.html), `assets/pdf-editor/engine.py`, `src/main/services/pdf-editor/audit.ts`, and `scripts/verify-pdf-engine.py`.

Baglib loads a user-selected PKCS#12 certificate through a main-process asset capability, signs incrementally with an explicit visible field rectangle, and validates the cryptographic signature. Visual typed/image/ink signatures are separate marks with no identity assurance. Certificate subject/fingerprint come from the certificate, never from the user's display-name field.

Offline verification uses an optional selected trust root and disables certificate network fetching. Draft means no embedded signatures; Signed means intact without established trust; Verified requires the validator's full offline result; Tampered includes invalid signatures or disallowed content changes. Revocation/online timestamp validation is not certified. Encrypted-document signing is explicitly unsupported rather than silently stripping encryption.

The real fixture creates a disposable self-signed certificate, signs a bilingual PDF, establishes trust using that explicit root, blocks destructive edits to the signed document, and detects an incremental content alteration. It is not a legal-signature or identity certification.

The local audit stores timestamp, input/output SHA-256, certificate fingerprint and observed status in an HMAC chain. Its key and head use OS encryption. It detects changed/truncated records under the tested boundary; OS account compromise or deletion of the entire database remains outside that guarantee. No private keys, passphrases, access tokens or document text are in audit records.

See [Document Workstation](feature%20-%20Document%20Workstation.md). Public APIs and runtime experiments were used; no binary/source reverse engineering claimed.
