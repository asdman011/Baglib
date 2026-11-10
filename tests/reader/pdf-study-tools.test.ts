import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAMPS, measureValue, formatMeasurement, calibratedScale, measurementLabel } from '../../src/shared/pdf-study-tools';
import { parseShapeMark, shapeLocation } from '../../src/shared/pdf-markup';
import { collectAdditions, filterForExport } from '../../src/shared/material-save';
import { translations } from '../../src/renderer/translations';

test('ten bilingual stamps keep placement language and selective export category', () => {
  assert.equal(STAMPS.length, 10);
  assert.equal(new Set(STAMPS.map(stamp => stamp.id)).size, 10);
  for (const stamp of STAMPS) for (const language of ['ar', 'en'] as const) {
    assert.ok(translations[language][stamp.label]);
    const location = JSON.stringify({ page: 1, shape: 'stamp', stampId: stamp.id, language, color: stamp.color, box: { x: 10, y: 10, width: 35, height: 8 } });
    const mark = parseShapeMark(location)!;
    assert.equal(mark.stampId, stamp.id);
    assert.equal(mark.language, language);
    assert.deepEqual(parseShapeMark(shapeLocation(mark)), mark);
    const payload = collectAdditions([{ id: stamp.id, type: 'note', location, createdAt: null, updatedAt: null, color: null, quote: null, note: translations[language][stamp.label], question: null, label: null }], []);
    assert.equal(payload.items[0].kind, 'stamp');
    assert.equal(payload.items[0].text, translations[language][stamp.label]);
    assert.equal(filterForExport(payload, { categories: ['shapes'] }).items.length, 0);
    assert.equal(filterForExport(payload, { categories: ['stamps'] }).items.length, 1);
  }
  assert.equal(new Set(STAMPS.filter(stamp => stamp.group === 'grades').map(stamp => stamp.color)).size, 4);
});

test('calibrated physical distance and rectangular area are zoom independent', () => {
  const from = { x: 10, y: 20 }, to = { x: 60, y: 20 };
  const page = { width: 600, height: 900 };
  const scale = calibratedScale(from, to, page, 10);
  assert.equal(measureValue('distance', from, to, page, scale), 10);
  assert.equal(measureValue('area', from, { x: 60, y: 40 }, page, scale), 60);
  assert.throws(() => calibratedScale(from, from, page, 10));
  assert.match(formatMeasurement(10, 'pt', true, 'en'), /pt\u00b2/u);
  assert.match(formatMeasurement(10, 'cm', false, 'ar'), /١٠/u);
  assert.match(formatMeasurement(10, 'cm', false, 'en'), /10/u);
});

test('stamp metadata rejects invalid IDs and measurement geometry survives a round trip', () => {
  for (const stamp of STAMPS) assert.match(translations.ar[stamp.label], /[\u0600-\u06ff]/u);
  const measurement = { page: 3, shape: 'measure', color: 'sky', box: { x: 10, y: 20, width: 50, height: 30 }, from: { x: 10, y: 20 }, to: { x: 60, y: 50 }, measurement: { mode: 'area', unit: 'cm', page: { width: 600, height: 900 }, pointsPerUnit: 30, language: 'ar' } };
  assert.match(measurementLabel(parseShapeMark(JSON.stringify(measurement))!, 'ar'), /[\u0660-\u0669]/u);
  assert.doesNotMatch(measurementLabel(parseShapeMark(JSON.stringify(measurement))!, 'en'), /[\u0660-\u0669]/u);
  assert.deepEqual(JSON.parse(shapeLocation(parseShapeMark(JSON.stringify(measurement))!)), measurement);
  assert.equal(parseShapeMark(JSON.stringify({ ...measurement, measurement: { ...measurement.measurement, pointsPerUnit: 0 } })), null);
  assert.equal(parseShapeMark(JSON.stringify({ ...measurement, shape: 'stamp', stampId: 'unknown', language: 'ar' })), null);
});
