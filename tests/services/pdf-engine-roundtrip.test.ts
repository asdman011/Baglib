import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runPythonPdf } from '../../src/main/services/pdf-editor/python';
import { inspectPdfFile } from '../../src/main/services/pdf-editor/inspection';
const python = path.resolve('.baglib-data/pdf-engine/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
test('generated bilingual PDFs open in the independent PDF.js reader engine', { skip: !existsSync(python) && 'Local Python engine is not provisioned on this host.' }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-roundtrip-'));
  try {
    const generated = await runPythonPdf({ python, script: path.resolve('assets/pdf-editor/engine.py'), tessdata: path.resolve('.baglib-data/pdf-engine/tessdata') }, { filename: '', expectedHash: '', output: path.join(directory, 'document.pdf'), operation: 'create', language: 'ar', payload: { pages: [{ text: 'Research — البحث العلمي', direction: 'rtl' }] } }, new AbortController().signal, () => {});
    assert.equal(generated.outputs?.length, 1);
    const read = await inspectPdfFile(path.join(directory, generated.outputs![0].filename), undefined, () => {});
    assert.equal(read.totalPages, 1); assert.match(read.pages[0].text, /Research/u); assert.match(read.pages[0].text, /البحث العلمي/u);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.ok(path.basename(directory).startsWith('baglib-pdf-roundtrip-'));
    await rm(directory, { recursive: true, force: true });
  }
});
