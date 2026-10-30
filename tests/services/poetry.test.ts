import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPoetryLayout, normalizeArabicForSearch, poetryBayts, poetryDisplayText, poetryDescriptionText, togglePoetryPanel, poetryHighlightedParts, poetrySearchExcerpt } from '../../src/shared/poetry';

test('search excerpts choose the matching bayt and preserve original spelling, tashkeel and source indices', () => {
  const verses = ['بعيد', 'عن الطلب', 'الخَيْلُ وَاللَّيْلُ وَالبَيْدَاءُ', 'تَعْرِفُنِي', 'الخيل', 'لاحق'];
  assert.deepEqual(poetrySearchExcerpt(verses, 'bayt', 'الخيل والليل والبيداء'), { from: 2, lines: verses.slice(2, 4) });
  assert.deepEqual(poetrySearchExcerpt(verses, 'free_verse', 'تعرفني'), { from: 3, lines: [verses[3]] });
  assert.equal(poetrySearchExcerpt(verses, 'bayt', 'عنوان غير موجود'), null);
  const original = 'رَحْمَةٌ، فَتًى! الخَيْلُ لا الخيول';
  const parts = poetryHighlightedParts(original, 'رحمه فتي الخيل');
  assert.equal(parts.map(part => part.text).join(''), original);
  assert.deepEqual(parts.filter(part => part.matched).map(part => part.text), ['رَحْمَةٌ', 'فَتًى', 'الخَيْلُ']);
  assert.deepEqual(poetrySearchExcerpt(['No match', 'A verse', '', 'Final verse'], 'stanza', 'VERSE'), { from: 1, lines: ['A verse'] });
  assert.equal(poetrySearchExcerpt([], 'bayt', 'الخيل'), null);
});
test('structured poem descriptions render source text without executing HTML attributes', () => {
  assert.equal(poetryDescriptionText([{ text: 'وصف', children: [{ text: 'تفصيل' }], attributes: { onclick: 'alert(1)' } }]), 'وصف\nتفصيل');
});
import { validStudyTarget, studyLinks } from '../../src/shared/study-notes';

test('poetry study references preserve poem and source-verse ranges without accepting reversed or unsafe IDs', () => {
  assert.equal(validStudyTarget('poetry:ashaar:254630:2:3'), true);
  assert.equal(validStudyTarget('poetry:ashaar:0:2:3'), false);
  assert.equal(validStudyTarget('poetry:ashaar:1:3:2'), false);
  assert.equal(validStudyTarget('poetry:ashaar:999999999999999999999:0:1'), false);
  assert.equal(studyLinks('[[poetry:ashaar:45:2:3|بيت]]')[0].target, 'poetry:ashaar:45:2:3');
});

test('poetry search normalization preserves canonical text and display spelling', () => {
  const original = 'أَلْفَـى فَتًى رَحْمَةً';
  assert.equal(normalizeArabicForSearch(original), 'الفي فتي رحمه');
  assert.equal(poetryDisplayText(original, true), original);
  assert.equal(poetryDisplayText('رَحْمَةٌ', false), 'رحمة');
  assert.equal(normalizeArabicForSearch('الخَيْلُ وَاللَّيْلُ وَالبَيْدَاءُ'), normalizeArabicForSearch('الخيل والليل والبيداء'));
});

test('poetry layouts keep hemistich order, orphan lines and English stanza readiness', () => {
  const verses = ['صدر', 'عجز', 'شطر يتيم'];
  assert.deepEqual(poetryBayts(verses), [{ index: 0, sadr: 'صدر', ajuz: 'عجز' }, { index: 1, sadr: 'شطر يتيم', ajuz: null }]);
  assert.equal(classifyPoetryLayout('ar', 'بحر الطويل', verses.slice(0, 2)), 'bayt');
  assert.equal(classifyPoetryLayout('ar', 'شعر التفعيلة', verses), 'free_verse');
  assert.equal(classifyPoetryLayout('en', null, ['A line', '', 'Another stanza']), 'stanza');
});

test('poetry drawer state allows only one active panel', () => {
  assert.equal(togglePoetryPanel('poet', 'filters'), 'filters');
  assert.equal(togglePoetryPanel('filters', 'filters'), null);
});

test('layout irregularity requires sustained variation and ignores isolated source markup', () => {
  const regular = Array.from({ length: 12 }, () => 'هذا شطر من قصيدة عربية موزونة');
  const source = [...regular];
  source[11] += '[MARQUEEL][/MARQUEE]'.repeat(20);
  assert.equal(classifyPoetryLayout('ar', 'بحر البسيط', source), 'bayt');
  source[11] += ' طويل'.repeat(30);
  assert.equal(classifyPoetryLayout('ar', 'بحر البسيط', source), 'bayt');
  const irregular = ['يا', 'أنت', 'هذا سطر طويل متصل يختلف عن بقية الأسطر القصيرة', 'وهذا سطر آخر طويل كذلك يمتد عبر كلمات كثيرة'];
  assert.equal(classifyPoetryLayout('ar', 'بحر الكامل', irregular), 'free_verse');
  assert.equal(classifyPoetryLayout('en', 'بحر الكامل', irregular), 'stanza');
  assert.deepEqual(regular, Array.from({ length: 12 }, () => 'هذا شطر من قصيدة عربية موزونة'));
});
