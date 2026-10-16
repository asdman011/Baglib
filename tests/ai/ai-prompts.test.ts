import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAntiSpoilerSystemPrompt,
  buildContextualDictionaryPrompt,
  buildStructuredSummaryPrompt,
  buildBiographicalTarajimPrompt,
  buildTranslationPrompt,
} from '../../src/shared/utils/ai-prompts';
import type { BookPassage } from '../../src/shared/types/ai';

describe('KEY-143 Anti-Spoiler Prompts & Academic AI Architectures', () => {
  const samplePassages: BookPassage[] = [
    { pageNumber: 5, chapterTitle: 'المقدمة', text: 'إن أشرف العلوم وأعلاها رتبة...' },
    { pageNumber: 12, chapterTitle: 'فصل في الدلالات', text: 'دلالة اللفظ على المعنى تنقسم إلى ثلاثة أقسام...' },
    { pageNumber: 25, chapterTitle: 'خاتمة الكتاب', text: 'وهذا ما يسر الله جمعه في الخاتمة والنتائج النهائية...' },
  ];

  describe('Anti-Spoiler System Prompt (Readest Architecture)', () => {
    it('applies strict page boundary ceiling `<BOOK_PASSAGES page_limit="12">`', () => {
      const prompt = buildAntiSpoilerSystemPrompt({
        bookTitle: 'المستصفى من علم الأصول',
        authorName: 'أبو حامد الغزالي',
        currentPage: 12,
        passages: samplePassages,
        antiSpoilerCeiling: true,
      });

      assert.ok(prompt.includes('<BOOK_PASSAGES page_limit="12">'));
      assert.ok(prompt.includes('المستصفى من علم الأصول'));
      assert.ok(prompt.includes('أبو حامد الغزالي'));
      assert.ok(prompt.includes('Page 5'));
      assert.ok(prompt.includes('Page 12'));
      // Page 25 is ahead of currentPage (12), so it MUST be filtered out!
      assert.ok(!prompt.includes('Page 25'), 'Page 25 should NOT be included in anti-spoiler context');
      assert.ok(!prompt.includes('خاتمة الكتاب'), 'Future chapter should NOT be leaked');
    });

    it('contains polite natural refusal responses without spoilers', () => {
      const prompt = buildAntiSpoilerSystemPrompt({
        bookTitle: 'مقدمة ابن خلدون',
        currentPage: 40,
        passages: [],
      });

      assert.ok(prompt.includes('Natural Refusal'));
      assert.ok(prompt.includes('لم نصل إلى هذا الموضع من الكتاب بعد!'));
      assert.ok(prompt.includes('ABSOLUTE ANTI-SPOILER CONSTRAINTS'));
    });

    it('handles books with no indexed content gracefully', () => {
      const prompt = buildAntiSpoilerSystemPrompt({
        bookTitle: 'صيد الخاطر',
        currentPage: 1,
        passages: [],
      });

      assert.ok(prompt.includes('[No indexed content available'));
    });
  });

  describe('Contextual Dictionary Prompt (المعجم السياقي)', () => {
    it('builds specialized lexical and classical Fiqh/Usul prompts', () => {
      const prompt = buildContextualDictionaryPrompt(
        'الاستحسان',
        'والاستحسان عند أهل الرأي هو العدول عن موجب قياس إلى قياس أقوى منه...',
        'روضة الناظر'
      );

      assert.ok(prompt.includes('الاستحسان'));
      assert.ok(prompt.includes('روضة الناظر'));
      assert.ok(prompt.includes('المعنى اللغوي'));
      assert.ok(prompt.includes('المعنى الاصطلاحي والسياقي'));
      assert.ok(prompt.includes('الفائدة اللطيفة'));
    });
  });

  describe('Structured Summary Prompt (التلخيص المنهجي)', () => {
    it('enforces structured academic headings suitable for permanent research notes', () => {
      const prompt = buildStructuredSummaryPrompt(
        'اعلم أن العلوم النقلية كلها مستندة إلى الخبر عن الواضع الشرعي...',
        'مقدمة ابن خلدون',
        18
      );

      assert.ok(prompt.includes('مقدمة ابن خلدون'));
      assert.ok(prompt.includes('Page 18'));
      assert.ok(prompt.includes('Main Central Thesis (الأطروحة المركزية)'));
      assert.ok(prompt.includes('Key Arguments & Logical Points'));
      assert.ok(prompt.includes('Direct Supporting Quotes'));
      assert.ok(prompt.includes('Practical / Scholarly Takeaway'));
    });
  });

  describe('Biographical Tarajim Prompt (تراجم الأعلام)', () => {
    it('structures biographical extraction according to classical Ilm al-Rijal conventions', () => {
      const prompt = buildBiographicalTarajimPrompt(
        'سفيان الثوري',
        'قال سفيان الثوري: ما عالجت شيئاً أشد علي من نيتي'
      );

      assert.ok(prompt.includes('سفيان الثوري'));
      assert.ok(prompt.includes('علم التراجم والرجال'));
      assert.ok(prompt.includes('الاسم والنسب والطبقة'));
      assert.ok(prompt.includes('أبرز الشيوخ والتلاميذ'));
      assert.ok(prompt.includes('أهم المصنفات والآثار العلمية'));
      assert.ok(prompt.includes('مكانته العلمية وثناء العلماء عليه'));
    });
  });

  describe('Translation Prompt (الترجمة الرصينة)', () => {
    it('directs eloquent Arabic when translating to Arabic', () => {
      const prompt = buildTranslationPrompt('The library is a repository of wisdom.', 'ar');
      assert.ok(prompt.includes('classical, eloquent Arabic (عربية فصيحة رصينة)'));
    });

    it('directs idiomatic English when translating to English', () => {
      const prompt = buildTranslationPrompt('الكتاب أنيس لا يملك وجليس لا يملك.', 'en');
      assert.ok(prompt.includes('idiomatic, high-fidelity English'));
    });
  });
});
