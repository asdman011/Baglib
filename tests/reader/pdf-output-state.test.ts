import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { outputAfterFailedJob } from '../../src/renderer/libs/reader/pdf-output-state';
import type { PdfJob, PdfOperation, PdfOutputFormat } from '../../src/shared/types/pdf-editor';

function job(operation: PdfOperation, format?: PdfOutputFormat): PdfJob {
  return {
    id: operation, sessionId: 'session', operation, state: format ? 'completed' : 'failed', current: 1, total: 1,
    ...(format ? { outputs: [{ filename: `document.${format}`, format, bytes: 1, sha256: 'hash' }] } : {}),
  };
}

describe('outputAfterFailedJob', () => {
  it('drops the previous export when the next export fails', () => {
    assert.equal(outputAfterFailedJob(job('export-docx', 'docx'), job('export-pptx')), null);
  });

  it('keeps a staged PDF because it is unsaved work', () => {
    const staged = job('organize', 'pdf');
    assert.equal(outputAfterFailedJob(staged, job('export-docx')), staged);
  });

  it('leaves the output alone when a job other than an export fails', () => {
    const exported = job('export-docx', 'docx');
    assert.equal(outputAfterFailedJob(exported, job('sanitize')), exported);
  });

  it('accepts having no previous output', () => {
    assert.equal(outputAfterFailedJob(null, job('export-docx')), null);
  });
});
