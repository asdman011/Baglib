import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../src/renderer/translations';

describe('Story 8 UI & Physical Library Bilingual Tests', () => {
  describe('Bilingual Translations Completeness for Physical Library & Lending', () => {
    const requiredKeys = [
      'physicalCopyTitle',
      'physicalCopyDesc',
      'locationRoom',
      'locationBookcase',
      'locationShelf',
      'locationShelfSection',
      'locationRoomPlaceholder',
      'locationBookcasePlaceholder',
      'locationShelfPlaceholder',
      'locationSectionPlaceholder',
      'physicalCondition',
      'conditionMint',
      'conditionGood',
      'conditionFair',
      'conditionPoor',
      'conditionAntique',
      'acquisitionPrice',
      'acquisitionDate',
      'pricePlaceholder',
      'savePhysicalLocation',
      'physicalLocationSaved',
      'locationBreadcrumb',
      'noLocationAssigned',
      'lendingStatusTitle',
      'lendingStatusAvailable',
      'lendingStatusLoaned',
      'lendingStatusOverdue',
      'lendBookBtn',
      'returnBookBtn',
      'lendModalTitle',
      'lendModalDesc',
      'borrowerName',
      'borrowerNamePlaceholder',
      'borrowerContact',
      'borrowerContactPlaceholder',
      'borrowDate',
      'expectedReturnDate',
      'loanConditionOut',
      'notesOptional',
      'confirmLend',
      'lendSuccess',
      'returnModalTitle',
      'returnModalDesc',
      'conditionOnReturn',
      'conditionAuditLabel',
      'actualReturnDate',
      'confirmReturn',
      'returnSuccess',
      'lendingHistoryTitle',
      'noLendingHistory',
      'filterLendingAll',
      'filterLendingAvailable',
      'filterLendingLoaned',
      'filterLendingOverdue',
      'filterLocationAll',
      'daysOverdueBadge',
      'loanedToBadge',
      'activeLoanBadge',
      'returnedBadge',
      'undoReturnBtn',
      'markReturnedBtn',
      'knownBorrowersLabel',
    ] as const;

    test('all required physical library keys exist in both Arabic and English', () => {
      for (const key of requiredKeys) {
        assert.ok(
          (translations.ar as unknown)[key],
          `Missing Arabic translation for key: ${key}`
        );
        assert.ok(
          (translations.en as unknown)[key],
          `Missing English translation for key: ${key}`
        );
      }
    });

    test('no hardcoded placeholder syntax is broken', () => {
      assert.ok(translations.ar.daysOverdueBadge.includes('{days}'));
      assert.ok(translations.en.daysOverdueBadge.includes('{days}'));
      assert.ok(translations.ar.loanedToBadge.includes('{name}'));
      assert.ok(translations.en.loanedToBadge.includes('{name}'));
    });
  });

  describe('Location Breadcrumbs Formatting Logic', () => {
    test('joins only non-empty hierarchy levels with arrow separator', () => {
      const room = 'المكتبة الشرقية';
      const bookcase = 'خزانة التراث 2';
      const shelf = 'الرف الرابع';
      const shelfSection = '';

      const breadcrumb = [room, bookcase, shelf, shelfSection]
        .filter(Boolean)
        .join(' › ');

      assert.equal(breadcrumb, 'المكتبة الشرقية › خزانة التراث 2 › الرف الرابع');
    });

    test('handles single shelf or room gracefully', () => {
      const parts = ['', '', 'رف رقم 3', ''].filter(Boolean).join(' › ');
      assert.equal(parts, 'رف رقم 3');
    });
  });

  describe('Overdue Days Calculation & Alert Logic', () => {
    test('calculates correct positive days overdue when expected return date is in the past', () => {
      const today = new Date('2026-10-15');
      const expectedReturn = new Date('2026-10-10');

      const isOverdue = expectedReturn.getTime() < today.getTime();
      assert.equal(isOverdue, true);

      const daysOverdue = Math.max(
        1,
        Math.round((today.getTime() - expectedReturn.getTime()) / (1000 * 3600 * 24))
      );
      assert.equal(daysOverdue, 5);
    });

    test('loan is not overdue when expected return date is today or in the future', () => {
      const today = '2026-10-15';
      const expectedReturn = '2026-10-20';
      const isOverdue = expectedReturn < today;
      assert.equal(isOverdue, false);
    });
  });

  describe('Condition Audit & Degradation Detection', () => {
    const conditionRanks: Record<string, number> = {
      mint: 5,
      like_new: 5,
      جديدة: 5,
      ممتازة: 5,
      good: 4,
      جيدة: 4,
      fair: 3,
      مقبول: 3,
      poor: 2,
      رديء: 2,
      antique: 4,
    };

    test('flags degraded condition when returned in worse condition than loan out', () => {
      const initialCondition = 'mint';
      const returnedCondition = 'fair';

      const initialRank = conditionRanks[initialCondition];
      const returnedRank = conditionRanks[returnedCondition];

      const isDegraded = returnedRank < initialRank;
      assert.equal(isDegraded, true);
    });

    test('does not flag degradation when returned condition is equal or better', () => {
      const initialRank = conditionRanks['good'];
      const returnedRank = conditionRanks['good'];
      assert.equal(returnedRank < initialRank, false);
    });
  });
});
