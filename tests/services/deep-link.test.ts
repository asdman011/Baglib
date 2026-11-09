import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepLink, protocolRegistrationArgs, MAX_DEEP_LINK_LENGTH } from '../../src/shared/deep-link';

test('deep links accept exactly existing study target grammar, including encoded Arabic and anchors', () => {
  for (const target of ['note:abc', 'note:تَأَمُّل#^paragraph-1', 'book:كتاب#p=3', 'book:abc', 'quran:hafs:2:255', 'quran:warsh:2:255-257', 'sunnah:Bukhari:1:Bukhari:1:1', 'poetry:ashaar:123:0:4', 'media:12345678-1234-1234-1234-123456789abc:42']) {
    assert.equal(parseDeepLink('baglib:' + target), target);
    assert.equal(parseDeepLink('baglib://' + encodeURIComponent(target)), target);
  }
});
test('deep links reject paths, foreign schemes, malformed encodings, control characters and invalid targets', () => {
  for (const value of ['', 'note:abc', '/tmp/note', 'C:\\notes.md', 'file:///notes', 'javascript:alert(1)', 'https://baglib:note:a', 'baglib:unknown:a', 'baglib:note:', 'baglib:book:a#p=0', 'baglib:quran:hafs:115:1', 'baglib:note:a%0a', 'baglib:note:%ZZ', 'baglib:note:a|Arabic label', 'baglib:note:a#^عربي', 'baglib:note:' + 'a'.repeat(MAX_DEEP_LINK_LENGTH)]) assert.equal(parseDeepLink(value), null, value);
});
test('registration is packaged-only unless explicitly opted in with the dev app path', () => {
  assert.equal(protocolRegistrationArgs(false, undefined, 'electron.exe', '/app/main.js'), null);
  assert.equal(protocolRegistrationArgs(false, '0', 'electron.exe', '/app/main.js'), null);
  assert.deepEqual(protocolRegistrationArgs(false, '1', 'electron.exe', '/app/main.js'), ['baglib', 'electron.exe', ['/app/main.js']]);
  assert.equal(protocolRegistrationArgs(false, '1', 'electron.exe', undefined), null);
  assert.deepEqual(protocolRegistrationArgs(true, undefined, 'Baglib.exe', undefined), ['baglib']);
});

import { exportableStudyNotes } from '../../src/shared/study-note-export';
import type { KnowledgeItemDTO } from '../../src/shared/types/knowledge';
test('card and bulk exports share canonical ordinary notes, reflections and study notes exactly once', () => {
 const base = { workId: null, location: '1', createdAt: '2026-11-09', updatedAt: '2026-11-09' };
 const personal = { id: 'study', title: 'Title', content: 'old', aliases: ['Alias'], tags: [], createdAt: base.createdAt, updatedAt: base.updatedAt };
 const items: KnowledgeItemDTO[] = [
  { ...base, id: 'study', knowledgeType: 'study_note', noteContent: 'canonical' },
  { ...base, id: 'reader', knowledgeType: 'note', noteContent: 'وَالصَّبْرُ ضِيَاءٌ — Patience' },
  { ...base, id: 'reflection', knowledgeType: 'reading_reflection', noteContent: 'Reflection' },
  { ...base, id: 'highlight', knowledgeType: 'highlight', quotedText: 'Not a note' },
 ];
 const notes = exportableStudyNotes([personal], items);
 assert.deepEqual(notes.map(n=>n.id).sort(), ['reader','reflection','study']);
 assert.equal(notes.find(n=>n.id==='study')?.content,'canonical');
 assert.deepEqual(notes.find(n=>n.id==='study')?.aliases,['Alias']);
 assert.equal(notes.find(n=>n.id==='reader')?.title,'وَالصَّبْرُ ضِيَاءٌ — Patience');
});
