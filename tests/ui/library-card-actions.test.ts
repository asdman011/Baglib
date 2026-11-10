import test from 'node:test';
import assert from 'node:assert/strict';
import { getCardActions, CardActionHandlers } from '../../src/renderer/components/library/library-card-actions';
import type { BookItem } from '../../src/types/library';
import type { TranslationKey } from '../../src/renderer/translations';

const mockBook: BookItem = {
  id: 'book-1',
  title: 'مقدمة ابن خلدون',
  author: 'ابن خلدون',
  bookType: 'physical',
  categories: ['تاريخ'],
  readingStatus: 'unread',
  lendingHistory: [],
  tags: [],
};

const mockTranslations: Record<string, string> = {
  readBook: 'قراءة',
  bookDetailsBtn: 'تفاصيل الكتاب',
  readingStatus: 'حالة القراءة',
  statusUnread: 'لم يُقرأ',
  statusReading: 'قيد القراءة',
  statusCompleted: 'تمت قراءته',
  lendBookBtn: 'إعارة الكتاب',
  returnBookBtn: 'تسجيل الإرجاع',
  delete: 'حذف',
};

const t = (key: TranslationKey) => mockTranslations[key] || key;

test('Library Card Actions (KEY-310)', async (tSub) => {
  await tSub.test('generates expected baseline actions for resting book', () => {
    let readCalled = false;
    let detailsCalled = false;
    let statusCalled = false;
    let lendCalled = false;
    let deleteCalled = false;

    const handlers: CardActionHandlers = {
      onRead: () => { readCalled = true; },
      onOpenDetails: () => { detailsCalled = true; },
      onUpdateReadingStatus: () => { statusCalled = true; },
      onLend: () => { lendCalled = true; },
      onDelete: () => { deleteCalled = true; },
    };

    const actions = getCardActions(mockBook, handlers, t);
    assert.strictEqual(actions.length, 5);

    const readAction = actions.find((a) => a.id === 'read');
    assert.ok(readAction);
    assert.strictEqual(readAction.label, 'قراءة');
    readAction.onSelect();
    assert.strictEqual(readCalled, true);

    const detailsAction = actions.find((a) => a.id === 'details');
    assert.ok(detailsAction);
    detailsAction.onSelect();
    assert.strictEqual(detailsCalled, true);

    const statusAction = actions.find((a) => a.id === 'toggle-status');
    assert.ok(statusAction);
    assert.match(statusAction.label, /قيد القراءة/);
    statusAction.onSelect();
    assert.strictEqual(statusCalled, true);

    const lendAction = actions.find((a) => a.id === 'lend');
    assert.ok(lendAction);
    assert.strictEqual(lendAction.label, 'إعارة الكتاب');
    lendAction.onSelect();
    assert.strictEqual(lendCalled, true);

    const deleteAction = actions.find((a) => a.id === 'delete');
    assert.ok(deleteAction);
    assert.strictEqual(deleteAction.danger, true);
    deleteAction.onSelect();
    assert.strictEqual(deleteCalled, true);
  });

  await tSub.test('handles returning book when actively lent', () => {
    const lentBook: BookItem = {
      ...mockBook,
      lendingHistory: [
        {
          id: 'lend-1',
          borrowerName: 'محمد',
          borrowDate: new Date().toISOString(),
          dueDate: new Date().toISOString(),
          isReturned: false,
        },
      ],
    };

    const handlers: CardActionHandlers = {
      onRead: () => {},
      onOpenDetails: () => {},
      onLend: () => {},
    };

    const actions = getCardActions(lentBook, handlers, t);
    const lendAction = actions.find((a) => a.id === 'lend');
    assert.ok(lendAction);
    assert.strictEqual(lendAction.label, 'تسجيل الإرجاع');
  });

  await tSub.test('cycles reading status from reading to completed', () => {
    const readingBook: BookItem = {
      ...mockBook,
      readingStatus: 'reading',
    };

    let nextStatusResult = '';
    const handlers: CardActionHandlers = {
      onRead: () => {},
      onOpenDetails: () => {},
      onUpdateReadingStatus: (_id, s) => { nextStatusResult = s; },
    };

    const actions = getCardActions(readingBook, handlers, t);
    const statusAction = actions.find((a) => a.id === 'toggle-status');
    assert.ok(statusAction);
    assert.match(statusAction.label, /تمت قراءته/);
    statusAction.onSelect();
    assert.strictEqual(nextStatusResult, 'completed');
  });
});
