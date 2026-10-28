import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { makePagePdf } from '../helpers/pdf-pages';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { fileSha256, resolvePdfSource } from '../../src/main/services/pdf-editor/source';
import { inspectPdfFile, inspectionHtml } from '../../src/main/services/pdf-editor/inspection';
import { PdfEditorJobs } from '../../src/main/services/pdf-editor/jobs';
import { publishPdfOutput } from '../../src/main/services/pdf-editor/publication';
import { validatePdfJob, pdfCapabilities } from '../../src/shared/types/pdf-editor';

const cleanup = async (directory: string) => {
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(directory).startsWith('baglib-pdf-'));
  await rm(directory, { recursive: true, force: true });
};

test('PDF inspection uses the real parser and HTML safely preserves multilingual text', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-inspect-'));
  try {
    const filename = path.join(directory, 'source.pdf');
    await writeFile(filename, makePagePdf(2, Buffer.alloc(0)));
    const progress: number[] = [];
    const inspection = await inspectPdfFile(filename, undefined, current => progress.push(current));
    assert.equal(inspection.totalPages, 2);
    assert.match(inspection.pages[0].text, /PAGE 1/u);
    assert.deepEqual(progress, [1, 2]);
    assert.equal(inspection.signatureValidation, 'not-performed');
    inspection.pages[0].text = 'بِسْمِ الله — English <script>alert(1)</script>';
    for (const language of ['ar', 'en'] as const) {
      const html = inspectionHtml(inspection, language);
      assert.ok(html.includes('بِسْمِ الله'));
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(html.includes(`dir="${language === 'ar' ? 'rtl' : 'ltr'}"`));
      assert.ok(!html.includes('<script>'));
    }
  } finally { await cleanup(directory); }
});

test('PDF sessions bind work/edition/source, reject ambiguity and isolate job owners', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-jobs-'));
  const db = createTestDatabase();
  try {
    const filename = path.join(directory, 'source.pdf'); await writeFile(filename, makePagePdf(1, Buffer.alloc(0)));
    const works = new SqliteWorkRepository(db);
    works.addBook({ id: 'pdf-work', title: 'بحث — Research', author: 'Author', workType: 'book', bookType: 'digital', filePath: filename, digitalFormat: 'PDF' });
    const source = await resolvePdfSource(db, 'pdf-work');
    const controller = new PdfEditorJobs(db, path.join(directory, 'jobs'), async (input, signal, progress) => {
      if (signal.aborted) throw new Error('cancelled');
      return inspectPdfFile(input.filename, input.password, progress);
    });
    const session = await controller.open(10, 'pdf-work');
    assert.equal(session.sourceId, source.sourceId);
    const job = await controller.start(10, { sessionId: session.id, operation: 'inspect', language: 'ar' });
    assert.throws(() => controller.status(11, job.id), /invalid-request/u);
    for (let i = 0; i < 100 && controller.status(10, job.id).state === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(controller.status(10, job.id).state, 'completed');
    await writeFile(filename, makePagePdf(2, Buffer.alloc(0)));
    await assert.rejects(() => controller.start(10, { sessionId: session.id, operation: 'inspect', language: 'en' }), /source-changed/u);
    await controller.close(10, session.id);
    works.addEditionToWork('pdf-work', { filePath: filename, digitalFormat: 'PDF' });
    await assert.rejects(() => resolvePdfSource(db, 'pdf-work'), /source-required/u);
    assert.equal((await resolvePdfSource(db, 'pdf-work', source.sourceId)).sourceId, source.sourceId);
  } finally { db.close(); await cleanup(directory); }
});

test('publication preserves originals/backups and refuses stale or unconfirmed targets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-publish-'));
  try {
    const source = path.join(directory, 'source.pdf'), staged = path.join(directory, 'staged.pdf');
    await writeFile(source, makePagePdf(1, Buffer.alloc(0))); await writeFile(staged, makePagePdf(2, Buffer.alloc(0)));
    const original = await readFile(source), expected = await fileSha256(source), output = await fileSha256(staged);
    await assert.rejects(() => publishPdfOutput({ staged, target: source, stagedSha256: output }), /source-changed/u);
    await assert.rejects(() => publishPdfOutput({ staged, target: source, stagedSha256: output, expectedTargetSha256: '0'.repeat(64) }), /source-changed/u);
    assert.deepEqual(await readFile(source), original);
    const result = await publishPdfOutput({ staged, target: source, stagedSha256: output, expectedTargetSha256: expected });
    assert.equal(await fileSha256(source), output);
    assert.deepEqual(await readFile(result.backup!), original);
    const copy = path.join(directory, 'copy.pdf');
    await publishPdfOutput({ staged, target: copy, stagedSha256: output });
    assert.equal(await fileSha256(copy), output);
  } finally { await cleanup(directory); }
});

test('approved security/conversion operations are typed, while injected worker paths never pass validation', () => {
  for (const operation of ['redact', 'encrypt', 'sign', 'export-docx']) assert.equal(validatePdfJob({ sessionId: 'a', language: 'en', operation }).operation, operation);
  assert.throws(() => validatePdfJob({ sessionId: 'a', language: 'en', operation: 'inspect', filename: 'secret.pdf' }));
  assert.deepEqual(pdfCapabilities().filter(capability => capability.available).map(capability => capability.feature), ['inspect', 'export-html', 'cloud']);
  assert.throws(() => validatePdfJob({ sessionId: 'a', language: 'en', operation: 'redact', payload: { regions: [{ path: 'secret.pdf' }] } }));
});
