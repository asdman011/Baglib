import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { PdfReviews } from '../../src/main/services/pdf-editor/reviews';
import { validatePdfAnswer } from '../../src/main/services/pdf-editor/cited-answer';
import { PdfAudit } from '../../src/main/services/pdf-editor/audit';
import type { PdfInspection } from '../../src/shared/types/pdf-editor';
import type { CloudStore } from '../../src/main/services/pdf-editor/cloud-vault';
import { validatePdfAnswerOptions } from '../../src/shared/types/pdf-collaboration';

test('AI summary modes and page ranges reject malformed IPC options', () => {
  assert.deepEqual(validatePdfAnswerOptions(undefined), { mode: 'summary' });
  assert.deepEqual(validatePdfAnswerOptions({ mode: 'chapters', fromPage: 2, toPage: 10 }), { mode: 'chapters', fromPage: 2, toPage: 10 });
  for (const value of [null, 'chapters', { mode: 'execute' }, { mode: 'summary', fromPage: 0 }, { mode: 'actions', fromPage: 10, toPage: 2 }, { mode: 'qa', path: 'private.pdf' }]) assert.throws(() => validatePdfAnswerOptions(value), /invalid-request/u);
});

test('review threads preserve source boundaries and canonical content, and reject stale concurrent edits', () => {
  const db = createTestDatabase();
  try {
    new SqliteWorkRepository(db).addBook({ id: 'work-review', title: 'بحث — Research', author: '', workType: 'book', bookType: 'physical' });
    const reviews = new PdfReviews(db), source = { workId: 'work-review', editionId: 'edition-review', sourceId: 'source-review', path: '', sha256: 'a'.repeat(64) };
    const first = reviews.add(source, { author: 'مراجع — Reviewer', text: 'هل الإسناد صحيح؟', page: 2, rect: [10, 10, 100, 100], kind: 'callout', status: 'open' });
    assert.equal(reviews.list({ ...source, sourceId: 'other-source' }).length, 0);
    const second = reviews.change(source, first.id, first.updatedAt, { author: 'Reviewer 2', text: 'Check the source.' });
    assert.equal(second.replies.length, 1);
    assert.throws(() => reviews.change(source, first.id, first.updatedAt, { status: 'resolved' }), /source-changed/u);
    const resolved = reviews.change(source, first.id, second.updatedAt, { status: 'resolved' });
    assert.equal(resolved.status, 'resolved');
    const accepted = reviews.change(source, first.id, resolved.updatedAt, { status: 'accepted' });
    assert.equal(accepted.status, 'accepted');
    assert.throws(() => reviews.change({ ...source, sha256: 'b'.repeat(64) }, first.id, resolved.updatedAt, { status: 'rejected' }), /source-changed/u);
    assert.equal((db.prepare('SELECT note_content FROM annotations WHERE id=?').get(first.id) as { note_content: string }).note_content, first.text);
  } finally { db.close(); }
});
test('cited AI refuses fabricated pages/quotes and uncited answers; accepts exact bilingual source text', () => {
  const inspection: PdfInspection = { totalPages: 1, pages: [{ page: 1, width: 595, height: 842, rotation: 0, text: 'بِسْمِ الله — Research evidence.', blocks: [] }], permissions: null, extraction: 'complete', signatureFields: 0, signatureValidation: 'not-performed' };
  const good = { answer: 'Supported summary', abstained: false, citations: [{ page: 1, quote: 'بِسْمِ الله' }] };
  assert.equal(validatePdfAnswer(JSON.stringify(good), inspection).citations[0].page, 1);
  assert.throws(() => validatePdfAnswer(JSON.stringify({ ...good, citations: [{ page: 2, quote: 'بِسْمِ الله' }] }), inspection), /invalid-output/u);
  assert.throws(() => validatePdfAnswer(JSON.stringify({ ...good, citations: [{ page: 1, quote: 'Invented quotation' }] }), inspection), /invalid-output/u);
  assert.throws(() => validatePdfAnswer(JSON.stringify({ ...good, citations: [] }), inspection), /invalid-output/u);
  assert.equal(validatePdfAnswer(JSON.stringify({ answer: 'Insufficient evidence.', abstained: true, citations: [] }), inspection).abstained, true);
});
test('keyed signature audit detects content alteration and truncation without recording secrets', () => {
  const values = new Map<string, unknown>();
  const store: CloudStore = { get: <T,>(key: string) => structuredClone(values.get(key)) as T, set: (key, value) => { values.set(key, structuredClone(value)); }, delete: key => values.delete(key) };
  // Unit cipher only; native integration independently exercises OS safeStorage.
  const cipher = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
  const audit = new PdfAudit(store, cipher);
  audit.append({ operation: 'sign', sourceHash: 'a'.repeat(64), outputHash: 'b'.repeat(64), status: 'Signed', certificateFingerprint: 'public-fingerprint' });
  assert.equal(audit.verify().valid, true);
  const records = values.get('private.pdf-audit.records.v1') as { status: string }[];
  const original = structuredClone(records);
  records[0].status = 'Verified';
  assert.equal(audit.verify().valid, false);
  values.set('private.pdf-audit.records.v1', original); assert.equal(audit.verify().valid, true);
  values.set('private.pdf-audit.records.v1', []); assert.equal(audit.verify().valid, false);
});
