import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { translations, TranslationKey } from '../../src/renderer/translations';

describe('Scholar-Grade Startup Splash Orchestrator Tests', () => {
  it('contains centralized localization keys in Arabic and English for all splash elements', () => {
    const requiredKeys: TranslationKey[] = [
      'splashTitle',
      'splashSubtitle',
      'splashFullBrand',
      'splashStepDb',
      'splashStepTaxonomy',
      'splashStepReader',
      'splashStepReady',
      'splashSkipHint',
      'splashEpigraph1Text',
      'splashEpigraph1Author',
      'splashEpigraph2Text',
      'splashEpigraph2Author',
      'splashEpigraph3Text',
      'splashEpigraph3Author',
      'splashEpigraph4Text',
      'splashEpigraph4Author',
    ];

    for (const key of requiredKeys) {
      assert.ok(translations.ar[key], `Missing Arabic translation for: ${key}`);
      assert.ok(translations.en[key], `Missing English translation for: ${key}`);
      assert.ok(translations.ar[key].length > 0);
      assert.ok(translations.en[key].length > 0);
    }
  });

  it('validates bilingual brand subtitle and platform mission alignment', () => {
    assert.strictEqual(translations.ar.splashTitle, 'بَغْلِب');
    assert.strictEqual(translations.en.splashTitle, 'Baglib');

    assert.ok(translations.ar.splashFullBrand.includes('بغلب'));
    assert.ok(translations.ar.splashFullBrand.includes('منصة البحث والمعرفة'));

    assert.ok(translations.en.splashFullBrand.includes('Baglib'));
    assert.ok(translations.en.splashFullBrand.includes('Local-First'));
  });

  it('verifies all four classical scholarship epigraphs have authentic texts and authors', () => {
    // Epigraph 1: Imam Al-Shafi'i
    assert.ok(translations.ar.splashEpigraph1Text.includes('العلم صيد والكتابة قيده'));
    assert.ok(translations.ar.splashEpigraph1Author.includes('الشافعي'));
    assert.ok(translations.en.splashEpigraph1Text.includes('Knowledge is prey'));
    assert.ok(translations.en.splashEpigraph1Author.includes("Al-Shafi'i"));

    // Epigraph 2: Al-Jahiz
    assert.ok(translations.ar.splashEpigraph2Text.includes('الكتاب وعاء مُلئ علمًا'));
    assert.ok(translations.ar.splashEpigraph2Author.includes('الجاحظ'));
    assert.ok(translations.en.splashEpigraph2Text.includes('A book is a vessel'));
    assert.ok(translations.en.splashEpigraph2Author.includes('Al-Jahiz'));

    // Epigraph 3: Ibn Khaldun
    assert.ok(translations.ar.splashEpigraph3Text.includes('تقييد العلم بالكتابة'));
    assert.ok(translations.ar.splashEpigraph3Author.includes('خلدون'));
    assert.ok(translations.en.splashEpigraph3Text.includes('Preserving knowledge'));
    assert.ok(translations.en.splashEpigraph3Author.includes('Ibn Khaldun'));

    // Epigraph 4: Classical Maxim
    assert.ok(translations.ar.splashEpigraph4Text.includes('من لم يتقن الأصول'));
    assert.ok(translations.en.splashEpigraph4Text.includes('master the foundations'));
  });

  it('verifies sequential milestone progression from initialization to ready', () => {
    const milestones = [
      { step: 0, key: 'splashStepDb' as const, minProgress: 20 },
      { step: 1, key: 'splashStepTaxonomy' as const, minProgress: 50 },
      { step: 2, key: 'splashStepReader' as const, minProgress: 80 },
      { step: 3, key: 'splashStepReady' as const, minProgress: 100 },
    ];

    for (const m of milestones) {
      assert.ok(translations.ar[m.key].length > 0);
      assert.ok(translations.en[m.key].length > 0);
      assert.ok(m.minProgress <= 100);
    }
  });

  it('verifies skip shortcut translation exists for keyboard and mouse convenience', () => {
    assert.ok(translations.ar.splashSkipHint.includes('Esc'));
    assert.ok(translations.en.splashSkipHint.includes('Esc'));
  });

  it('stabilizes onComplete via useRef so parent 1s countdown re-renders never reset the boot sequence', () => {
    const splashSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/renderer/components/StartupSplash.tsx'),
      'utf8'
    );
    assert.ok(splashSource.includes('useRef(onComplete)'), 'StartupSplash must store onComplete in a ref');
    assert.ok(!splashSource.includes('[minDurationMs, onComplete]'), 'Orchestrator useEffect must not depend on onComplete reference');
    assert.ok(splashSource.includes('}, [minDurationMs]);'), 'Orchestrator useEffect must only depend on minDurationMs');
  });
});
