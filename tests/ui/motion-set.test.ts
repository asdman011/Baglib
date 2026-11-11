import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// KEY-308 motion set: every entry-animation class used by a component must be defined (the
// tw-animate plugin is not installed), and must sit behind prefers-reduced-motion: no-preference.
const motion = fs.readFileSync(path.resolve('src/renderer/app/ui-motion.css'), 'utf8');
const used = new Set<string>();
const walk = (folder: string) => {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.tsx')) for (const m of fs.readFileSync(full, 'utf8').matchAll(/(?<![\w-])(animate-in|animate-fade-in|fade-in|zoom-in-95|zoom-in|slide-in-from-[a-z]+(?:-\d+)?)(?![\w-])/g)) used.add(m[1]);
  }
};
walk(path.resolve('src/renderer/components'));

test('every entry-animation class used by components is defined', () => {
  assert.ok(used.has('animate-in'));
  for (const name of used) assert.match(motion, new RegExp(`\\.${name.replace(/-/g, '\\-')}[ ,{]`), `${name} is used but not defined`);
});

test('entry animations only run when motion is allowed', () => {
  const block = motion.slice(motion.indexOf('@keyframes baglib-enter'));
  const guarded = block.slice(block.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.ok(guarded.indexOf('.animate-in') > 0 && block.indexOf('.animate-in') >= block.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/);
});

test('logical drawer slides mirror in RTL', () => {
  assert.match(motion, /:root\[dir="rtl"\] \.slide-in-from-right \{ --baglib-enter-x: -1rem; \}/);
});
