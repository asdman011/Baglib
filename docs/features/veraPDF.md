# veraPDF — real conformance reporting

Investigated and exercised 2026-10-26; installed veraPDF CLI 1.30.3 with an isolated Adoptium Java 21 JRE. References: [installation](https://docs.verapdf.org/install/), [validation CLI](https://docs.verapdf.org/cli/validation/).

`assets/pdf-editor/engine.py::compliance` invokes the actual Java CLI with a bounded heap, deadline and fixed argument list, parses XML validation reports, and reports failed rules. Supported profiles are PDF/A-1b, PDF/A-2b and PDF/UA-1. A successful parse or metadata flag alone is never reported as compliance. Encrypted inputs are not passed through as if conformant.

The integration fixture verifies that an ordinary generated PDF fails PDF/A-2b and returns real failures. On 2026-10-27 a controlled Latin-text fixture with embedded font, PDF/A-2b XMP identification and a Pillow-generated sRGB output intent also passed actual veraPDF validation. This is a test fixture, not an arbitrary-document conversion feature or positive certification of PDF/A-1b/PDF/UA. Metadata repair is explicitly limited to title/language; it does not synthesize missing fonts, tagging, alternate text, semantic reading order or archival output intents. PDF/UA needs human accessibility review even when automated checks pass.

See [Document Workstation](feature%20-%20Document%20Workstation.md). This is documented-CLI integration, not reverse engineering of the validator.
