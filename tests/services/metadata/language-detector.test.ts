import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LanguageDetectorService,
  languageDetectorService,
} from '../../../src/main/services/metadata/language-detector.service';

describe('LanguageDetectorService (Material Language Auto-Detection)', () => {
  describe('1. ISO-639 Code and Name Normalization', () => {
    it('normalizes standard 2-letter ISO codes', () => {
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('ar'), {
        name: 'العربية',
        code: 'ar',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('en'), {
        name: 'English',
        code: 'en',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('fr'), {
        name: 'الفرنسية',
        code: 'fr',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('fa'), {
        name: 'الفارسية',
        code: 'fa',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('tr'), {
        name: 'التركية',
        code: 'tr',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('de'), {
        name: 'الألمانية',
        code: 'de',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('es'), {
        name: 'الإسبانية',
        code: 'es',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('ru'), {
        name: 'الروسية',
        code: 'ru',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('ur'), {
        name: 'الأردية',
        code: 'ur',
      });
      assert.deepStrictEqual(languageDetectorService.normalizeLanguageCode('it'), {
        name: 'الإيطالية',
        code: 'it',
      });
    });

    it('normalizes 3-letter bibliographic codes (ISO 639-2)', () => {
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('ara')?.name, 'العربية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('eng')?.name, 'English');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('fra')?.name, 'الفرنسية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('fre')?.name, 'الفرنسية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('fas')?.name, 'الفارسية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('per')?.name, 'الفارسية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('tur')?.name, 'التركية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('deu')?.name, 'الألمانية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('ger')?.name, 'الألمانية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('spa')?.name, 'الإسبانية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('rus')?.name, 'الروسية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('urd')?.name, 'الأردية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('ita')?.name, 'الإيطالية');
    });

    it('normalizes codes with regional sub-tags like en-US, ar-EG, fr-FR', () => {
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('en-US')?.name, 'English');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('en_GB')?.name, 'English');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('ar-EG')?.name, 'العربية');
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('fr-CA')?.name, 'الفرنسية');
    });

    it('returns undefined gracefully for unknown or placeholder codes', () => {
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('und'), undefined);
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('zxx'), undefined);
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('mul'), undefined);
      assert.strictEqual(languageDetectorService.normalizeLanguageCode('xyz123'), undefined);
      assert.strictEqual(languageDetectorService.normalizeLanguageCode(''), undefined);
    });
  });

  describe('2. Content-Based Statistical Language Detection', () => {
    it('reliably detects Arabic material from text sample', () => {
      const sample =
        'في هذا الكتاب يقدم المؤلف دراسة شاملة عن تاريخ الفكر الإسلامي وتطوره عبر العصور المختلفة، مع التركيز على المناهج العلمية.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'العربية');
      assert.strictEqual(result.languageCode, 'ar');
      assert.strictEqual(result.detectedFrom, 'content');
      assert.ok(result.confidence >= LanguageDetectorService.RELIABILITY_THRESHOLD);
    });

    it('reliably detects Persian (Farsi) text and distinguishes from Arabic', () => {
      const sample =
        'این کتاب درباره تاریخ و ادبیات فارسی است که برای پژوهشگران نوشته شده است و دیگر منابع را نیز معرفی می‌کند.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الفارسية');
      assert.strictEqual(result.languageCode, 'fa');
      assert.strictEqual(result.detectedFrom, 'content');
    });

    it('reliably detects Urdu text using exclusive letters and vocabulary', () => {
      const sample =
        'یہ کتاب اردو ادب اور تاریخ کے بارے میں ہے جو قارئین کے لیے بہت مفید ثابت ہو گی اور اس میں اہم معلومات ہیں۔';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الأردية');
      assert.strictEqual(result.languageCode, 'ur');
      assert.strictEqual(result.detectedFrom, 'content');
    });

    it('reliably detects English material from text content', () => {
      const sample =
        'This book provides a comprehensive introduction to modern software engineering and computer science principles for students.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'English');
      assert.strictEqual(result.languageCode, 'en');
      assert.strictEqual(result.detectedFrom, 'content');
      assert.ok(result.confidence >= LanguageDetectorService.RELIABILITY_THRESHOLD);
    });

    it('reliably detects French material from stopword density and accents', () => {
      const sample =
        'Ce livre présente une étude approfondie de l histoire et de la philosophie contemporaine dans la société moderne pour les étudiants.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الفرنسية');
      assert.strictEqual(result.languageCode, 'fr');
      assert.strictEqual(result.detectedFrom, 'content');
    });

    it('reliably detects German material from distinctive grammar and umlauts', () => {
      const sample =
        'Dieses Buch bietet eine Einführung in die Grundlagen der Philosophie und der Wissenschaft für Studenten an der Universität.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الألمانية');
      assert.strictEqual(result.languageCode, 'de');
      assert.strictEqual(result.detectedFrom, 'content');
    });

    it('reliably detects Spanish material', () => {
      const sample =
        'Este libro contiene un análisis detallado sobre el desarrollo de la literatura y el arte en el mundo moderno con una perspectiva histórica.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الإسبانية');
      assert.strictEqual(result.languageCode, 'es');
      assert.strictEqual(result.detectedFrom, 'content');
    });

    it('reliably detects Turkish material', () => {
      const sample =
        'Bu kitap modern bilim ve felsefe tarihi hakkında ayrıntılı bilgiler ve araştırmalar içeren önemli bir kaynaktır.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'التركية');
      assert.strictEqual(result.languageCode, 'tr');
      assert.strictEqual(result.detectedFrom, 'content');
    });

    it('reliably detects Russian material with Cyrillic script', () => {
      const sample =
        'Эта книга представляет собой исследование истории и литературы для широкого круга читателей и студентов университетов.';
      const result = languageDetectorService.detectLanguage({ contentSample: sample });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الروسية');
      assert.strictEqual(result.languageCode, 'ru');
      assert.strictEqual(result.detectedFrom, 'content');
    });
  });

  describe('3. Handling Uncertain or Unsupported Cases Gracefully', () => {
    it('returns undefined without assigning arbitrary defaults for empty content', () => {
      const result = languageDetectorService.detectLanguage({});

      assert.strictEqual(result.isReliable, false);
      assert.strictEqual(result.language, undefined);
      assert.strictEqual(result.languageCode, undefined);
      assert.strictEqual(result.detectedFrom, 'none');
    });

    it('returns undefined for extremely short text sample (< 20 chars)', () => {
      const result = languageDetectorService.detectLanguage({
        contentSample: '123 ABC !?',
      });

      assert.strictEqual(result.isReliable, false);
      assert.strictEqual(result.language, undefined);
    });

    it('returns undefined for random alphanumeric codes / punctuation', () => {
      const result = languageDetectorService.detectLanguage({
        contentSample: '48392 98402 18940 38291 99201 10293 84729 19284',
      });

      assert.strictEqual(result.isReliable, false);
      assert.strictEqual(result.language, undefined);
    });

    it('falls back to embedded language tag when content is unavailable', () => {
      const result = languageDetectorService.detectLanguage({
        embeddedLanguage: 'fra',
      });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'الفرنسية');
      assert.strictEqual(result.languageCode, 'fr');
      assert.strictEqual(result.detectedFrom, 'embedded_tag');
    });

    it('falls back to metadata fields when content and embedded tag are missing', () => {
      const result = languageDetectorService.detectLanguage({
        title: 'مقدمة في تاريخ الأندلس وحضارتها',
        description: 'دراسة مستفيضة في العمارة والثقافة الأندلسية عبر التاريخ',
      });

      assert.strictEqual(result.isReliable, true);
      assert.strictEqual(result.language, 'العربية');
      assert.strictEqual(result.detectedFrom, 'metadata');
    });
  });
});
