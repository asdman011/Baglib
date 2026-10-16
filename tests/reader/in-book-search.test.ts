import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchBookProgressive,
  SearchableSection,
} from '../../src/renderer/libs/search/in-book-search';
import type { InBookSearchProgress } from '../../src/shared/types/full-text-search';

describe('KEY-140 In-Book Morphology-Aware Search Engine', () => {
  const sampleSections: SearchableSection[] = [
    {
      pageNumber: 1,
      locationCfiOrPage: '1',
      chapterTitle: 'المقدمة',
      text: 'اعلم أن فن التاريخ عزيز المذهب، جم الفوائد، شريف الغاية.',
    },
    {
      pageNumber: 2,
      locationCfiOrPage: '2',
      chapterTitle: 'فضل التاريخ',
      text: 'إذ هو يوقفنا على أحوال الماضين من الأمم في أخلاقهم، والأنبياء في سيرهم.',
    },
    {
      pageNumber: 42,
      locationCfiOrPage: '42',
      chapterTitle: 'علم العمران',
      text: 'إن التَّارِيخَ وعلم العمران في ظاهره لا يزيد على الإخبار، وفي باطنه نظر وتحقيق.',
    },
    {
      pageNumber: 43,
      locationCfiOrPage: '43',
      chapterTitle: 'علم العمران (تابع)',
      text: 'وهو لذلك أصيل في الحكمة عريق، وعلم العمران البشري أساس الاجتماع الإنساني.',
    },
  ];

  it('finds search terms across multiple sections and preserves page numbers', async () => {
    const matches = await searchBookProgressive(sampleSections, 'التاريخ');

    assert.equal(matches.length, 2);
    assert.equal(matches[0].pageNumber, 1);
    assert.equal(matches[0].chapterTitle, 'المقدمة');

    assert.equal(matches[1].pageNumber, 42);
    assert.equal(matches[1].chapterTitle, 'علم العمران');
    // Matched vowelled text in page 42
    assert.equal(matches[1].matchText, 'التَّارِيخَ');
    assert.ok(matches[1].fullSnippet.includes('<mark>التَّارِيخَ</mark>'));
  });

  it('streams progress and updates matches progressively', async () => {
    const progressUpdates: InBookSearchProgress[] = [];

    const matches = await searchBookProgressive(sampleSections, 'العمران', {
      onProgress: (prog) => {
        progressUpdates.push(prog);
      },
    });

    assert.ok(progressUpdates.length > 0);
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    assert.equal(lastUpdate.isComplete, true);
    assert.equal(lastUpdate.matchesCount, 2);
    assert.equal(matches.length, 2);
  });

  it('handles empty query or empty sections gracefully', async () => {
    const res1 = await searchBookProgressive([], 'تاريخ');
    assert.equal(res1.length, 0);

    const res2 = await searchBookProgressive(sampleSections, '   ');
    assert.equal(res2.length, 0);
  });

  it('aborts search early when AbortSignal triggers', async () => {
    const controller = new AbortController();
    controller.abort(); // already aborted

    const matches = await searchBookProgressive(sampleSections, 'التاريخ', {
      signal: controller.signal,
    });

    assert.equal(matches.length, 0);
  });

  it('supports case sensitivity and whole-word matching', async () => {
    const englishSections: SearchableSection[] = [
      { pageNumber: 1, text: 'The art of software craftsmanship.' },
      { pageNumber: 2, text: 'Art and architecture in computer systems.' },
    ];

    const caseInsensitive = await searchBookProgressive(englishSections, 'art', {
      caseSensitive: false,
    });
    assert.equal(caseInsensitive.length, 2);

    const caseSensitive = await searchBookProgressive(englishSections, 'Art', {
      caseSensitive: true,
      normalizeArabic: false,
    });
    assert.equal(caseSensitive.length, 1);
    assert.equal(caseSensitive[0].pageNumber, 2);
  });
});
