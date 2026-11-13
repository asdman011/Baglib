import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';

// Keys composed at runtime from a value, such as `status${state}`.
// KEY-343 replaces the transcript placeholder. Keep existing shared keys available while retiring their UI.
const retiredKeys = new Set(['lectureTranscriptPending']);
const dynamicPrefixes = ['status', 'stirlingOptSize', 'stirlingOptPerSheet'];

const sources = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(directory, entry.name);
  if (entry.isDirectory()) return ['.next', 'out', 'node_modules'].includes(entry.name) ? [] : sources(full);
  return /\.tsx?$/.test(entry.name) && entry.name !== 'translations.ts' ? [full] : [];
});

test('Arabic and English define the same keys', () => {
  assert.deepEqual(Object.keys(translations.ar).sort(), Object.keys(translations.en).sort());
});

// Tests count as references: some suites pin keys no screen shows yet. See docs/features/Dataset UI coverage audit.md.
test('every translation key is referenced', () => {
  const code = [...sources(path.resolve('src')), ...sources(path.resolve('tests'))].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const quoted = new Set([...code.matchAll(/['"`]([A-Za-z_][A-Za-z0-9_]*)(?=['"`])/g)].map(match => match[1]));
  const accessed = new Set([...code.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(match => match[1]));
  const unused = Object.keys(translations.en).filter(key => !quoted.has(key) && !accessed.has(key) && !dynamicPrefixes.some(prefix => key.startsWith(prefix)) && !retiredKeys.has(key));
  assert.deepEqual(unused, []);
});
