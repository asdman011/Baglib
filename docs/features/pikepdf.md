# pikepdf — PDF password encryption

Investigated and exercised 2026-10-26; installed 10.17.0. Evidence: public [security documentation](https://pikepdf.readthedocs.io/en/latest/topics/security.html), [encryption API](https://pikepdf.readthedocs.io/en/stable/api/models.html), `assets/pdf-editor/engine.py`, and `scripts/verify-pdf-engine.py`.

Baglib writes revision 6 AES-256 or revision 4 AES-128 using distinct user/owner passwords. It exposes copy, print, modification, annotation and form permissions. Existing encrypted files require the owner password for security changes/decryption. Passwords travel through an anonymous subprocess stdin pipe and are absent from argv, job status and persisted audit records.

Verified on disposable fixtures: AES-256 revision, wrong-password rejection, disabled extraction/printing and rejection of non-owner decryption. AES-128 is implemented but is not covered by that initial fixture. Reader permissions depend on enforcement; encryption is not signature integrity and is not DRM. pikepdf does not implement Baglib's signing or PDF/A certification.

See [Document Workstation](feature%20-%20Document%20Workstation.md). No external implementation reverse engineering is claimed.
