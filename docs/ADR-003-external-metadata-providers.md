# ADR-003: External Bibliographic Metadata Providers Layer

## Status
Accepted

## Context
Baglib needs a way to fetch external bibliographic metadata for its catalog without compromising its internal domain model, which separates Works, Editions, and Sources. We also need to avoid hard-coded requests that violate rate limits or provider policies, such as anonymous requests to Open Library or exhausting Google Books quotas. Additionally, network requests in an Electron application are best handled from the Main process to avoid CORS issues and ensure security.

## Decision
We implemented a dedicated external bibliographic metadata provider layer within the main process (`src/main/services/metadata/providers/`). 
1. **Domain Model Normalization:** The layer adheres to Baglib's intellectual model by mapping external payloads into normalized structures (`BibliographicWork`, `BibliographicEdition`, `BibliographicSource`), explicitly preventing the collapse of Work and Edition concepts into a single generic record.
2. **Provider Adapters:** We created provider-independent interfaces and implemented specific adapters:
   - `OpenLibraryProvider`: The primary provider. Maps Open Library's Works and Editions appropriately.
   - `GoogleBooksProvider`: The secondary provider. Acts as a keyless fallback. Google Books collapses Work/Edition into a single `Volume`, which our adapter intelligently splits into a unified `Work` containing a single `Edition`.
3. **Orchestration & Fallback:** `BibliographicMetadataService` orchestrates these providers, employing a waterfall fallback strategy. If Open Library fails or returns empty, the service falls back to Google Books seamlessly.
4. **Centralized HTTP Configuration:** We implemented a `HttpClient` (`http-client.ts`) that standardizes network requests across providers. This ensures:
   - Consistent, identifying `User-Agent` headers containing the application name, version, and a valid contact email address, complying with Open Library guidelines.
   - Built-in throttling and rate-limiting (e.g., 1 request/second for Open Library) to prevent getting IP banned or blocked.
5. **IPC Communication:** The entire layer operates securely in the Main process and is exposed to the Renderer process via standard IPC handles (`library:search-bibliographic`, `library:get-bibliographic-details`, `library:search-bibliographic-isbn`).

## Consequences
- **Positive:** Baglib's cataloging system remains conceptually pure and aligned with its domain model, regardless of which external provider supplies the data.
- **Positive:** Safe, throttling-aware network requests protect the application from provider blocks.
- **Positive:** Bypassing CORS by using main-process networking guarantees reliable fetching.
- **Negative:** Additional mapping logic is required whenever a new provider is added.
