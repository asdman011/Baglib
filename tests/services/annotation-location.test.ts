import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotationPage } from '../../src/shared/annotation-location';

test('annotation page navigation handles numeric and PDF text-selection locations', () => {
  assert.equal(annotationPage('12'), 12);
  assert.equal(annotationPage('{"page":42,"rects":[]}'), 42);
  for (const location of ['0', '-1', '1.5', '{broken', '{"page":true}', 'epubcfi(/6/2)']) assert.equal(annotationPage(location), null);
});
