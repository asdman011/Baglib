# Advanced settings

Implemented for KEY-64 on 2026-11-12 by Codex.

Settings / Advanced / Advanced tools exposes catalog export, search maintenance and database health through the existing Settings directory and shared Modal. Arabic and English copy lives in translations.ts. Logical alignment and wrapping support both directions and narrow windows.

## Catalog export

A native save dialog selects one JSON or CSV destination. A transaction reads every column from work_type, work, author, work_author, edition, source, file_source_detail, physical_source_detail, wishlist_source_detail, tag, work_tag, category, collection and work_collection. Soft-deleted catalog rows are included. Canonical Arabic text, names and relationships retain their stored values.

JSON has format baglib-catalog, version 1, exportedAt and tables keyed by the existing SQL table names. CSV has a UTF-8 BOM, CRLF record separators, a table column and the sorted union of stored column names. All cells are quoted and embedded quotes are doubled. Embedded newlines remain exact. NULL and missing fields become empty CSV cells. Empty tables appear in JSON. The export contains catalog records and local file references. Media bytes and knowledge/history/settings records have separate owners.

The main process validates the requesting top-level application frame and format/language. It writes a unique sibling temporary file and renames it into the selected destination, cleaning the temporary file on failure. Cancelling the dialog returns without writing.

## Search maintenance

The main catalog currently has one FTS5 virtual table, book_content_fts, introduced by migration 011. The existing content-bearing table supports SQLite's rebuild command. Rebuilding regenerates token postings from its stored content, preserving row identities and exact content. The action emits completed/total progress before and after the command and shows a localized result toast. Concurrent invocations share the pending promise. A short asynchronous yield lets the renderer paint progress. The SQLite command itself runs synchronously in the main process, so a large index can briefly delay other main-process operations. Progress is table-level. Extraction from media and partition/corpus search maintenance remain owned by their existing services.

## Database health

A read transaction returns all integrity_check messages, page_count, page_size, logical size in bytes and row counts for ordinary main-schema tables. FTS shadow tables and SQLite internal tables are excluded. The UI translates field labels and the healthy/review status, and displays exact technical table identifiers. Integrity diagnostic text remains verbatim. The action performs no repair or writes.

## Evidence and implementation

- Shared contract and CSV serializer in src/shared/catalog-export.ts.
- Catalog snapshot, diagnostics and rebuild in src/main/services/catalog-maintenance.ts.
- Authorized save dialog and IPC in src/main/ipc/advanced.ts, registered through setupDatabaseIPC.
- Typed bridge in src/preload/index.ts and UI in src/renderer/components/layout/AdvancedSettings.tsx.
- Regression coverage in tests/services/catalog-maintenance.test.ts and existing Settings directory tests.
- Serialized real-file live matrix in scripts/advanced-live, using the shared renderer and throwaway corpus helpers.

No schema changes or dependencies were introduced. Destructive maintenance remains outside this implementation.
