import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// KEY-308: dashboard modules sit in a two-column grid from 1280 px, so their inner grids must
// follow the slot's width (container queries), not the window's, or they cramp at desktop width.
const dir = path.resolve('src/renderer/components/dashboard');
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');

test('every dashboard slot is a size container', () => {
  const home = read('HomeDashboardView.tsx');
  const slots = [...home.matchAll(/data-dashboard-item="([A-Za-z]+)"\s+className="([^"]*)"/g)];
  assert.ok(slots.length >= 10, `found ${slots.length} slots`);
  for (const [, id, className] of slots) assert.match(className, /(^|\s)@container(\s|$)/, `${id} slot lacks @container`);
});

test('module grids use container breakpoints, not window breakpoints', () => {
  for (const name of ['StudyProgressPanel.tsx', 'TodayStudyPanel.tsx', 'StudyInsightsModule.tsx', 'AthanDashboardModule.tsx', 'ActiveReadsModule.tsx']) {
    const source = read(name);
    assert.doesNotMatch(source, /\b(sm|md|lg|xl|2xl):grid-cols-/, `${name} still sizes a grid by the window`);
    assert.match(source, /@min-\[\d+rem\]:grid-cols-/, `${name} has no container breakpoint`);
  }
});

test('light-theme accents meet text contrast', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const css = fs.readFileSync(path.resolve('src/renderer/components/sunnah/sunnah.css'), 'utf8');
  const narrator = css.match(/html:not\(\.dark\) \.sunnah-narrator \{ color: (#[0-9a-f]{6}); \}/i);
  assert.ok(narrator, 'light-theme narrator colour missing');
  assert.ok(ratio(narrator[1], '#f8f6f0') >= 4.5, 'narrator contrast on the light page');
  // White on pale-sky-600 (#387494) for the active page button.
  assert.ok(ratio('#ffffff', '#387494') >= 4.5);
  assert.match(fs.readFileSync(path.resolve('src/renderer/components/library/PaginationBar.tsx'), 'utf8'), /bg-pale-sky-600 text-white/);
});
