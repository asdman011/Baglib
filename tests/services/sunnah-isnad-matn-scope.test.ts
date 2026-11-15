import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';
import { searchCorpus, getSunnahIsnadScope, setSunnahIsnadScope, SUNNAH_ISNAD_STORAGE_KEY } from '../../src/renderer/utils/corpus-lookup';
import { formatHadith } from '../../src/renderer/components/sunnah/HadithActions';
import { parseSlashCommand } from '../../src/shared/slash-command';
import type { SunnahChapter, SunnahHadith } from '../../src/shared/types/sunnah';

const dbPath = resolve(__dirname, '../../tools/hadith-alignment/data/output/sunnah_merged_quranlab_v1.sqlite');

describe('KEY-358: Sunnah search and insertion scope (matn only vs isnad and matn)', () => {
  const corpus = new SunnahResearchCorpus(dbPath);

  it('filters out isnad-only matches when isnadScope is matn_only', () => {
    // "الحميدي" is in the isnad of Bukhari 1:1, and "الأعمال بالنيات" is in the matn
    const allHits = corpus.search({ collection: 'Bukhari', text: 'الحميدي الأعمال بالنيات', requestId: 'req-all', isnadScope: 'all', limit: 5 });
    assert.ok(allHits.length > 0, 'Expected matches for isnad + matn search with scope all');
    assert.equal(allHits[0].hadith.number, '1');

    const matnOnlyHits = corpus.search({ collection: 'Bukhari', text: 'الحميدي الأعمال بالنيات', requestId: 'req-matn', isnadScope: 'matn_only', limit: 5 });
    // In matn_only, Bukhari 1:1 must NOT match because "الحميدي" is solely in its isnad
    assert.equal(matnOnlyHits.find(h => h.hadith.number === '1'), undefined);
  });

  it('matches matn queries under both isnadScope all and matn_only', () => {
    // "الأعمال بالنيات" is in the matn of Bukhari 1:1
    const allHits = corpus.search({ collection: 'Bukhari', text: 'إنما الأعمال بالنيات', requestId: 'req-all-matn', isnadScope: 'all', limit: 5 });
    assert.ok(allHits.length > 0);
    assert.equal(allHits[0].hadith.number, '1');

    const matnOnlyHits = corpus.search({ collection: 'Bukhari', text: 'إنما الأعمال بالنيات', requestId: 'req-matn-matn', isnadScope: 'matn_only', limit: 5 });
    assert.ok(matnOnlyHits.length > 0);
    assert.equal(matnOnlyHits[0].hadith.number, '1');
  });

  it('inserts only the matn when isnadScope is matn_only for cleanly separated hadiths', async () => {
    const mockWindow = {
      electronAPI: {
        sunnah: {
          search: async () => ({
            ok: true,
            data: [{
              chapter: { collection: 'Bukhari', number: 1 },
              hadith: {
                id: 'Bukhari:1:1',
                number: '1',
                text: {
                  ar: {
                    full: 'حَدَّثَنَا الْحُمَيْدِيُّ قَالَ سَمِعْتُ رَسُولَ اللَّهِ يَقُولُ إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
                    isnad: 'حَدَّثَنَا الْحُمَيْدِيُّ',
                    matn: 'سَمِعْتُ رَسُولَ اللَّهِ يَقُولُ إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
                  },
                },
              },
            }],
          }),
        },
      },
    };

    (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;

    const [hit] = await searchCorpus(['hadith'], 'الأعمال', id => id, 5, 'hafs', {
      requestId: 'test-matn-quote',
      isnadScope: 'matn_only',
    });

    assert.ok(hit);
    // Quote must contain the matn and NOT the isnad
    assert.ok(!hit.quote.includes('الْحُمَيْدِيُّ'), 'Quote must not include isnad');
    assert.ok(hit.quote.includes('سَمِعْتُ رَسُولَ اللَّهِ يَقُولُ إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ'));
    assert.ok(hit.quote.includes('[[sunnah:Bukhari:1:Bukhari:1:1|Bukhari 1]]'));
  });

  it('inserts whole text with honest disclaimer when isnadScope is matn_only for unsegmented hadiths', async () => {
    // Unsegmented row (like HadeethEnc or Musnad Ahmad unsegmented rows: no separate isnad, matn equals full)
    const mockWindow = {
      electronAPI: {
        sunnah: {
          search: async () => ({
            ok: true,
            data: [{
              chapter: { collection: 'HadeethEnc', number: 1 },
              hadith: {
                id: 'HadeethEnc:1:100',
                number: '100',
                text: {
                  ar: {
                    full: 'عن أنس بن مالك رضي الله عنه قال: نهى رسول الله صلى الله عليه وسلم أن يشرب الرجل قائما',
                    isnad: '',
                    matn: 'عن أنس بن مالك رضي الله عنه قال: نهى رسول الله صلى الله عليه وسلم أن يشرب الرجل قائما',
                  },
                },
              },
            }],
          }),
        },
      },
    };

    (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;

    const [hit] = await searchCorpus(['hadith'], 'قائما', id => id, 5, 'hafs', {
      requestId: 'test-unsplit-quote',
      isnadScope: 'matn_only',
      unsplitNotice: 'نص الحديث كاملاً — الإسناد والمتن غير مفصولين في المصدر',
    });

    assert.ok(hit);
    // Quote must honestly include disclaimer and full text
    assert.ok(hit.quote.includes('[نص الحديث كاملاً — الإسناد والمتن غير مفصولين في المصدر]'));
    assert.ok(hit.quote.includes('عن أنس بن مالك رضي الله عنه قال: نهى رسول الله'));
  });

  it('inserts whole text without disclaimer when isnadScope is all', async () => {
    const mockWindow = {
      electronAPI: {
        sunnah: {
          search: async () => ({
            ok: true,
            data: [{
              chapter: { collection: 'Bukhari', number: 1 },
              hadith: {
                id: 'Bukhari:1:1',
                number: '1',
                text: {
                  ar: {
                    full: 'حَدَّثَنَا الْحُمَيْدِيُّ قَالَ سَمِعْتُ رَسُولَ اللَّهِ يَقُولُ إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
                    isnad: 'حَدَّثَنَا الْحُمَيْدِيُّ',
                    matn: 'سَمِعْتُ رَسُولَ اللَّهِ يَقُولُ إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
                  },
                },
              },
            }],
          }),
        },
      },
    };

    (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;

    const [hit] = await searchCorpus(['hadith'], 'الأعمال', id => id, 5, 'hafs', {
      requestId: 'test-all-quote',
      isnadScope: 'all',
    });

    assert.ok(hit);
    assert.ok(hit.quote.includes('الْحُمَيْدِيُّ'));
    assert.ok(!hit.quote.includes('غير مفصولين'));
  });

  it('formats hadith in reader with honest disclaimer when isnad=false and split is unsegmented', () => {
    const chapter: SunnahChapter = {
      collection: 'HadeethEnc',
      number: 1,
      title: { ar: 'كتاب الإيمان', en: 'Book of Faith' },
      hadithCount: 1,
    };
    const unsegmentedHadith: SunnahHadith = {
      id: 'HadeethEnc:1:100',
      number: '100',
      chapterNumber: 1,
      section: { number: '1', title: { ar: 'باب', en: 'Chapter' } },
      text: {
        ar: {
          full: 'عن أنس قال نهى رسول الله عن كذا',
          isnad: '',
          matn: 'عن أنس قال نهى رسول الله عن كذا',
        },
        en: {
          full: 'Narrated by Anas: The Prophet forbade such and such',
          isnad: '',
          matn: 'Narrated by Anas: The Prophet forbade such and such',
        },
      },
    };

    // Arabic format with isnad=false on unsegmented row
    const arOutput = formatHadith(chapter, unsegmentedHadith, false, false, true, {
      ar: 'تنبيه: الإسناد والمتن غير مفصولين في المصدر، أُدرج النص كاملاً',
      en: 'Note: Isnad and matn are unsegmented in source, full text included',
    });
    assert.ok(arOutput.includes('[تنبيه: الإسناد والمتن غير مفصولين في المصدر، أُدرج النص كاملاً]'));
    assert.ok(arOutput.includes('عن أنس قال نهى رسول الله'));

    // English format with isnad=false on unsegmented row
    const enOutput = formatHadith(chapter, unsegmentedHadith, true, false, true, {
      ar: 'تنبيه: الإسناد والمتن غير مفصولين في المصدر، أُدرج النص كاملاً',
      en: 'Note: Isnad and matn are unsegmented in source, full text included',
    });
    assert.ok(enOutput.includes('[Note: Isnad and matn are unsegmented in source, full text included]'));
    assert.ok(enOutput.includes('Narrated by Anas'));

    // Segmented hadith with isnad=false: returns ONLY matn without notice
    const segmentedHadith: SunnahHadith = {
      id: 'Bukhari:1:1',
      number: '1',
      chapterNumber: 1,
      section: { number: '1', title: { ar: 'باب', en: 'Chapter' } },
      text: {
        ar: {
          full: 'حدثنا فلان قال سمعت النبي يقول كذا',
          isnad: 'حدثنا فلان',
          matn: 'قال سمعت النبي يقول كذا',
        },
        en: {
          full: 'Narrated Fulān: I heard the Prophet say such',
          isnad: 'Narrated Fulān:',
          matn: 'I heard the Prophet say such',
        },
      },
    };
    const segmentedOutput = formatHadith(chapter, segmentedHadith, false, false, true);
    assert.ok(!segmentedOutput.includes('تنبيه'));
    assert.ok(!segmentedOutput.includes('حدثنا فلان'));
    assert.ok(segmentedOutput.includes('قال سمعت النبي يقول كذا'));
  });

  it('persists and retrieves user isnad scope via storage helpers', () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

    assert.equal(getSunnahIsnadScope(), 'all');
    setSunnahIsnadScope('matn_only');
    assert.equal(getSunnahIsnadScope(), 'matn_only');
    assert.equal(mockStorage.getItem(SUNNAH_ISNAD_STORAGE_KEY), 'matn_only');

    setSunnahIsnadScope('all');
    assert.equal(getSunnahIsnadScope(), 'all');
    assert.equal(mockStorage.getItem(SUNNAH_ISNAD_STORAGE_KEY), 'all');
  });

  it('parses :matn and :isnad slash command modifiers', () => {
    const matnEn = parseSlashCommand('/hadith:matn fasting');
    assert.ok(matnEn);
    assert.equal(matnEn.scope, 'sunnah');
    assert.equal(matnEn.modifier, 'matn_only');
    assert.equal(matnEn.query, 'fasting');

    const matnAr = parseSlashCommand('/حديث:متن الصيام');
    assert.ok(matnAr);
    assert.equal(matnAr.scope, 'sunnah');
    assert.equal(matnAr.modifier, 'matn_only');
    assert.equal(matnAr.query, 'الصيام');

    const isnadEn = parseSlashCommand('/sunnah:isnad الحميدي');
    assert.ok(isnadEn);
    assert.equal(isnadEn.scope, 'sunnah');
    assert.equal(isnadEn.modifier, 'all');
    assert.equal(isnadEn.query, 'الحميدي');

    const normal = parseSlashCommand('/hadith fasting');
    assert.ok(normal);
    assert.equal(normal.scope, 'sunnah');
    assert.equal(normal.modifier, undefined);
    assert.equal(normal.query, 'fasting');
  });
});
