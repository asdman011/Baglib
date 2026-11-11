import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// KEY-308 type sweep: in the Arabic interface, tiny arbitrary sizes step up so diacritics stay legible.
const css = fs.readFileSync(path.resolve('src/renderer/app/globals.css'), 'utf8');

test('Arabic interface lifts 8-10px text by one step', () => {
  assert.match(css, /:root\[dir="rtl"\] \.text-\\\[8px\\\],\s*:root\[dir="rtl"\] \.text-\\\[9px\\\]\s*\{\s*font-size: 10px;/);
  assert.match(css, /:root\[dir="rtl"\] \.text-\\\[10px\\\]\s*\{\s*font-size: 11px;/);
});

test('no component pairs a tiny size with a responsive text size the lift would override', () => {
  const dir = path.resolve('src/renderer/components');
  const offenders: string[] = [];
  const walk = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx') && fs.readFileSync(full, 'utf8').split('\n').some(line => /text-\[(8|9|10)px\][^"'`\n]*\b(sm|md|lg|xl):text-/.test(line))) offenders.push(path.relative(dir, full));
    }
  };
  walk(dir);
  assert.deepEqual(offenders, []);
});
