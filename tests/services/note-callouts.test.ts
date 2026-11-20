import test from 'node:test';
import assert from 'node:assert/strict';
import { findMarkdownCallouts, normalizeCalloutKind } from '../../src/shared/note-callouts';
import { matchSlashCommands } from '../../src/shared/note-slash-commands';

test('normalizes English and Arabic callout labels', () => {
  assert.equal(normalizeCalloutKind('note'), 'note');
  assert.equal(normalizeCalloutKind('TIP'), 'tip');
  assert.equal(normalizeCalloutKind('warning'), 'warning');
  assert.equal(normalizeCalloutKind('ملاحظة'), 'note');
  assert.equal(normalizeCalloutKind('فائدة'), 'tip');
  assert.equal(normalizeCalloutKind('تنبيه'), 'warning');
  assert.equal(normalizeCalloutKind('تحذير'), 'warning');
  assert.equal(normalizeCalloutKind('unknown-kind'), null);
});

test('finds English and Arabic callouts with line ranges and skips code fences', () => {
  const doc = [
    '> [!note] Title here',
    '> First body line',
    '> Second body line',
    '',
    '```markdown',
    '> [!warning] Ignored inside code fence',
    '```',
    '',
    '> [!تنبيه] تنبيه مهم',
    '> نص عربي',
  ].join('\n');

  const callouts = findMarkdownCallouts(doc);
  assert.equal(callouts.length, 2);

  assert.equal(callouts[0].kind, 'note');
  assert.equal(callouts[0].title, 'Title here');
  assert.equal(callouts[0].fromLine, 1);
  assert.equal(callouts[0].toLine, 3);
  assert.equal(doc.slice(callouts[0].start, callouts[0].headerMarkerEnd), '> [!note]');

  assert.equal(callouts[1].kind, 'warning');
  assert.equal(callouts[1].title, 'تنبيه مهم');
  assert.equal(callouts[1].fromLine, 9);
  assert.equal(callouts[1].toLine, 10);
});

test('slash commands include table and callouts in English and Arabic', () => {
  assert.ok(matchSlashCommands('table').some(c => c.id === 'table'));
  assert.ok(matchSlashCommands('جدول').some(c => c.id === 'table'));
  assert.ok(matchSlashCommands('callout').some(c => c.id === 'calloutNote'));
  assert.ok(matchSlashCommands('tip').some(c => c.id === 'calloutTip'));
  assert.ok(matchSlashCommands('warning').some(c => c.id === 'calloutWarning'));
  assert.ok(matchSlashCommands('تنبيه').some(c => c.id === 'calloutWarning'));
});
