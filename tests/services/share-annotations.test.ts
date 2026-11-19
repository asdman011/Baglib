import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectNotesAndConnections,
  formatReadableTarget,
  formatWithAnnotations,
  type ShareAnnotationLabels,
} from '../../src/shared/share-annotations';
import { DEFAULT_WORKSPACE_PREFS, parsePrefs } from '../../src/shared/workspace-tabs';
import type { StudyNote } from '../../src/shared/study-notes';

const EN_LABELS: ShareAnnotationLabels = {
  myNotesHeading: 'My notes:',
  highlightsLabel: 'Highlights',
  commentsLabel: 'Comments',
  notesLabel: 'Notes',
  connectionsLabel: 'Connections',
};

const AR_LABELS: ShareAnnotationLabels = {
  myNotesHeading: 'ملاحظاتي:',
  highlightsLabel: 'التظليلات',
  commentsLabel: 'التعليقات',
  notesLabel: 'الملاحظات',
  connectionsLabel: 'الروابط',
};

test('KEY-429: WorkspacePrefs defaults shareSourceOnly to false and parses overrides', () => {
  assert.equal(DEFAULT_WORKSPACE_PREFS.shareSourceOnly, false);
  assert.equal(parsePrefs(undefined).shareSourceOnly, false);
  assert.equal(parsePrefs({ shareSourceOnly: true }).shareSourceOnly, true);
  assert.equal(parsePrefs({ shareSourceOnly: 'invalid' }).shareSourceOnly, false);
});

test('KEY-429: formatReadableTarget renders readable Quran, Sunnah, Book, and Note references', () => {
  assert.equal(
    formatReadableTarget('quran:hafs:2:153', { surahName: s => (s === 2 ? 'Al-Baqarah' : String(s)) }),
    'Al-Baqarah 2:153',
  );
  assert.equal(
    formatReadableTarget('sunnah:Bukhari:1:1', { collectionName: c => (c === 'Bukhari' ? 'Sahih al-Bukhari' : c) }),
    'Sahih al-Bukhari 1',
  );
  assert.equal(formatReadableTarget('book:w1#p=12', { pageLabel: 'p.' }), 'p. 12');
  assert.equal(
    formatReadableTarget('note:n-1', { noteTitles: new Map([['n-1', 'Patience in Trials']]) }),
    'Patience in Trials',
  );
});

test('KEY-429: collectNotesAndConnections collects linked notes and readable relations', () => {
  const notes: StudyNote[] = [
    {
      id: 'n1',
      title: 'Tawakkul Note',
      content: 'Reflection on [[supports::quran:hafs:2:153|2:153]] and [[explains::sunnah:Bukhari:1:1|Bukhari 1]]',
      aliases: [],
      tags: [],
      createdAt: '2026-11-19T00:00:00Z',
      updatedAt: '2026-11-19T00:00:00Z',
    },
  ];
  const res = collectNotesAndConnections(notes, ['quran:hafs:2:153'], {
    relationLabel: r => (r === 'supports' ? 'supports' : r === 'explains' ? 'explains' : r),
  });
  assert.equal(res.notes.length, 1);
  assert.equal(res.notes[0].title, 'Tawakkul Note');
  assert.ok(res.connections.some(c => c.relationLabel === 'supports' && c.targetLabel === 'Tawakkul Note'));
  assert.ok(res.connections.some(c => c.relationLabel === 'explains' && c.targetLabel === 'Bukhari 1'));
});

test('KEY-429: formatWithAnnotations includes annotations by default and omits when sourceOnly is true', () => {
  const plain = 'Verily, actions are by intentions.\n[Sahih al-Bukhari · 1]';
  const annotations = {
    highlights: [{ quotedText: 'actions are by intentions', colorLabel: 'Amber', comments: ['Key principle of sincerity'] }],
    comments: ['Personal reflection on intention'],
    notes: [{ title: 'Sincerity', excerpt: 'Applies to all deeds' }],
    connections: [{ relationLabel: 'supports', targetLabel: 'Al-Baqarah 2:153' }],
  };

  const withNotesEn = formatWithAnnotations(plain, annotations, EN_LABELS, false);
  assert.ok(withNotesEn.startsWith(plain));
  assert.ok(withNotesEn.includes('My notes:'));
  assert.ok(withNotesEn.includes('[Amber] "actions are by intentions"'));
  assert.ok(withNotesEn.includes('Key principle of sincerity'));
  assert.ok(withNotesEn.includes('Personal reflection on intention'));
  assert.ok(withNotesEn.includes('Sincerity: Applies to all deeds'));
  assert.ok(withNotesEn.includes('↔ supports Al-Baqarah 2:153'));

  const withNotesAr = formatWithAnnotations(plain, annotations, AR_LABELS, false);
  assert.ok(withNotesAr.includes('ملاحظاتي:'));
  assert.ok(withNotesAr.includes('التظليلات:'));
  assert.ok(withNotesAr.includes('التعليقات:'));
  assert.ok(withNotesAr.includes('الملاحظات:'));
  assert.ok(withNotesAr.includes('الروابط:'));

  assert.equal(formatWithAnnotations(plain, annotations, EN_LABELS, true), plain);
  assert.equal(
    formatWithAnnotations(plain, { highlights: [], comments: [], notes: [], connections: [] }, EN_LABELS, false),
    plain,
  );
});
