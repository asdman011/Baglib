import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeSparsePagePdf } from '../helpers/sparse-pdf';
import { inspectPdfFile } from '../../src/main/services/pdf-editor/inspection';

test('large-file benchmark fixture preserves valid xref offsets around sparse padding', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-sparse-pdf-'));
  try {
    const filename = path.join(directory, 'fixture.pdf');
    await writeSparsePagePdf(filename, 2, 1024 * 1024);
    assert.ok((await stat(filename)).size > 1024 * 1024);
    const result = await inspectPdfFile(filename, undefined, () => {});
    assert.equal(result.totalPages, 2);
    assert.deepEqual(result.pages.map(page => page.text), ['PAGE 1', 'PAGE 2']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
