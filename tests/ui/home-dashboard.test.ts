import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import {
  HomeDashboardView,
  AthanDashboardModule,
  CompanionMiniWidget,
  detectTextDirection,
  resolveJuzForPage,
} from '../../src/renderer/components/dashboard';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';
import { translations } from '../../src/renderer/translations';
import { localDate } from '../../src/shared/khatmah';
import {
  buildPrayerStatusSnapshot,
  DEFAULT_ATHAN_SETTINGS,
} from '../../src/shared/athan-calculator';
import type { BookItem } from '../../src/shared/types/work';
import type { AthanSettings } from '../../src/shared/types/athan';
import type { KhatmahMutation, KhatmahPlan, KhatmahState } from '../../src/shared/types/khatmah';

test('Helper Utilities: resolveJuzForPage and detectTextDirection work accurately for Arabic and English', () => {
  assert.equal(resolveJuzForPage(1), 1);
  assert.equal(resolveJuzForPage(20), 1);
  assert.equal(resolveJuzForPage(275), 14);
  assert.equal(resolveJuzForPage(604), 30);

  assert.equal(detectTextDirection('بسم الله الرحمن الرحيم', 'ltr'), 'rtl');
  assert.equal(detectTextDirection('In the name of Allah', 'rtl'), 'ltr');
  assert.equal(detectTextDirection('   ', 'rtl'), 'rtl');
});

for (const lang of ['ar', 'en'] as const) {
  test(`Home Dashboard Assembly, Active Reads Resume, Khatmah 30-Day Goal, and Quick Note Scratchpad in ${lang}`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    const storageMap = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: mockLocalStorage });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mockLocalStorage });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

    const sampleBook: BookItem = {
      id: 'work-fiqh-1',
      title: 'المغني في الفقه الإسلامي',
      author: 'ابن قدامة المقدسي',
      format: 'digital',
      digitalFormat: 'pdf',
      filePath: 'D:\\Library\\mughni.pdf',
      pageCount: 200,
      readingStatus: 'reading',
      readingProgress: 22,
      lastReadLocation: JSON.stringify({ page: 45 }),
      categories: ['Fiqh'],
      updatedAt: new Date().toISOString(),
    };

    const createdKnowledgeItems: unknown[] = [];
    const defaultSnapshot = buildPrayerStatusSnapshot(
      DEFAULT_ATHAN_SETTINGS,
      new Date('2026-03-20T10:00:00Z')
    );

    let khatmahState: KhatmahState = {
      plans: [],
      notificationsSupported: true,
    };

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getAllBooks: async () => [sampleBook],
        getAllNotes: async () => [],
        categories: {
          getTree: async () => [
            {
              id: 'cat-fiqh',
              parentId: null,
              nameAr: 'الفقه وأصوله',
              nameEn: 'Fiqh & Jurisprudence',
              displayOrder: 1,
              createdAt: '',
              children: [],
              directWorkCount: 1,
              totalWorkCount: 1,
            },
          ],
        },
        tags: { getAll: async () => [] },
        statistics: {
          getStreakStats: async () => ({
            currentStreakDays: 5,
            longestStreakDays: 12,
            totalReadingDays: 20,
            lastReadDate: '2026-03-20',
          }),
          getDailyHeatmap: async () => [
            { date: new Date().toISOString().slice(0, 10), totalSeconds: 1800, totalPages: 25, sessionsCount: 2 },
          ],
          getAllBookStats: async () => [
            {
              bookId: sampleBook.id,
              totalDurationSeconds: 3600,
              totalPagesRead: 45,
              lastReadAt: new Date().toISOString(),
              sessionsCount: 3,
              averageSecondsPerPage: 60,
            },
          ],
        },
        reader: {
          getLastLocation: async () => JSON.stringify({ page: 45 }),
        },
        knowledge: {
          getAll: async () => [
            {
              id: 'k-1',
              bookId: sampleBook.id,
              type: 'highlight',
              content: 'مسألة فقهية',
              plainText: 'مسألة فقهية',
              tags: ['فقه'],
              collectionIds: [],
              isorphan: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          create: async (input: unknown) => {
            createdKnowledgeItems.push(input);
            return { id: 'k-new', ...(input as object) };
          },
        },
        quran: {
          readerCatalog: async () => ({ ok: true, data: { sources: [] } }),
          khatmahList: async () => ({ ok: true, data: khatmahState }),
          khatmahMutate: async (mutation: KhatmahMutation) => {
            if (mutation.action === 'create') {
              const newPlan: KhatmahPlan = {
                id: 'plan-30',
                ...mutation.config,
                binding: {
                  script: mutation.config.script,
                  layout: mutation.config.layout,
                  profile: 'hafs',
                  adapted: false,
                  totalPages: 604,
                  juzPages: Array.from({ length: 30 }, (_, i) => i * 20 + 1),
                  juzEndPages: Array.from({ length: 30 }, (_, i) => (i === 29 ? 604 : (i + 1) * 20)),
                },
                paused: false,
                reads: [],
              };
              khatmahState = { ...khatmahState, plans: [newPlan] };
            } else if (mutation.action === 'mark') {
              const todayStr = localDate();
              khatmahState = {
                ...khatmahState,
                plans: khatmahState.plans.map((p) =>
                  p.id === mutation.id
                    ? {
                        ...p,
                        reads: [
                          ...p.reads,
                          ...mutation.pages.map((page) => ({ page, date: todayStr })),
                        ],
                      }
                    : p
                ),
              };
            }
            return { ok: true, data: khatmahState };
          },
          onChanged: () => () => {},
        },
        athan: {
          getState: async () => defaultSnapshot,
          updateSettings: async (partial: Partial<AthanSettings>) =>
            buildPrayerStatusSnapshot({ ...DEFAULT_ATHAN_SETTINGS, ...partial }),
          detectAutoLocation: async () => ({ ok: true, state: defaultSnapshot }),
          syncMawaqit: async () => ({ ok: true, state: defaultSnapshot }),
          triggerTestAlert: async () => ({
            id: 'test-1',
            type: 'athan',
            prayer: 'asr',
            scheduledTime: '15:40',
            timestamp: new Date().toISOString(),
          }),
          toggleMiniWidget: async () => ({ open: true }),
          onAlert: () => () => {},
          onStateChanged: () => () => {},
        },
      },
    });

    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() {
      workspace = useWorkspace();
      return createElement('div', null, createElement(NavigationRail), createElement(HomeDashboardView));
    }

    const root = createRoot(window.document.getElementById('root')!);
    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(Harness)));
      });
      if (lang === 'en') {
        await act(async () => workspace.toggleLanguage());
      }
      await act(async () => {
        await new Promise<void>((r) => setTimeout(r, 120));
      });

      // 1. Default viewMode on startup is 'dashboard'
      assert.equal(workspace.viewMode, 'dashboard');
      assert.ok(window.document.querySelector('[data-dashboard-view]'));
      assert.equal(
        window.document.querySelector('[data-dashboard-view]')?.getAttribute('dir'),
        lang === 'ar' ? 'rtl' : 'ltr'
      );

      // 2. Verify all 5 modules + Companion Widget rendered
      assert.ok(window.document.querySelector('[data-dashboard-module="active-reads"]'));
      assert.ok(window.document.querySelector('[data-dashboard-module="khatmah-tracker"]'));
      assert.ok(window.document.querySelector('[data-dashboard-module="reading-analytics"]'));
      assert.ok(window.document.querySelector('[data-dashboard-module="quick-note-scratchpad"]'));
      assert.ok(window.document.querySelector('[data-dashboard-module="athan-prayer-times"]'));
      assert.equal(window.document.querySelector('[data-companion-widget]'), null);
      await act(async () => {
        const toggle = [...window.document.querySelectorAll('button')].find(button => button.textContent?.includes(translations[lang].dashboardCompanionWidgetBtn));
        assert.ok(toggle); toggle.click();
      });
      assert.ok(window.document.querySelector('[data-companion-widget]'));

      // 3. Verify Module 2: Khatmah 30-day target creation & daily quota calculation
      const start30DayBtn = window.document.querySelector('[data-khatmah-dashboard-empty] button') as HTMLButtonElement | null;
      assert.ok(start30DayBtn, '30-day Khatmah start button should be visible initially');
      await act(async () => {
        start30DayBtn.click();
      });
      const quotaEl = window.document.querySelector('[data-khatmah-today-tracker]');
      assert.ok(quotaEl, 'Today quota banner should render after starting 30-day Khatmah');
      assert.ok(
        quotaEl.textContent?.includes('21'),
        `Expected 21 pages quota for day 1 of 30-day Khatmah, got: ${quotaEl.textContent}`
      );

      // Mark today's Khatmah target complete
      const markCompleteBtn = window.document.querySelector('[data-khatmah-mark-complete]') as HTMLButtonElement | null;
      assert.ok(markCompleteBtn);
      await act(async () => {
        markCompleteBtn.click();
      });
      assert.equal(khatmahState.plans[0].reads.length, 21);

      // 4. Verify Module 1: Active Reads card & Resume Reading action jumps to reader at page 45
      const resumeBtn = window.document.querySelector(`[data-resume-reading="${sampleBook.id}"]`) as HTMLButtonElement | null;
      assert.ok(resumeBtn, 'Resume Reading button should be present for active book');
      await act(async () => {
        resumeBtn.click();
      });
      assert.equal(workspace.viewMode, 'reader');
      assert.equal(workspace.activeBook?.id, sampleBook.id);
      assert.equal(workspace.readingPage, 45);

      // 5. Verify Module 4: Quick Note Scratchpad present
      const saveKbBtn = window.document.querySelector('[data-scratchpad-save]') as HTMLButtonElement | null;
      assert.ok(saveKbBtn);
      assert.equal(createdKnowledgeItems.length, 0);
    } finally {
      await act(async () => root.unmount());
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
}

test('Athan Module UI: Mawaqit Mosque icon indicator, Active Prayer Window banner, and Force-Arabic/RTL override', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      quran: {
        khatmahList: async () => ({ ok: true, data: { plans: [], notificationsSupported: true } }),
        onChanged: () => () => {},
      },
    },
  });

  // Build snapshot where Mawaqit is connected, activeWindow is Asr, and forceArabicWidgets is enabled
  const mawaqitSettings: AthanSettings = {
    ...DEFAULT_ATHAN_SETTINGS,
    locationMode: 'mawaqit',
    localization: {
      forceArabicWidgets: true,
    },
  };
  const baseSnapshot = buildPrayerStatusSnapshot(
    mawaqitSettings,
    new Date('2026-03-20T12:00:00Z'),
    {
      id: 'mosque-1',
      name: 'Masjid Al-Nabawi',
      times: {
        fajr: '05:05',
        sunrise: '06:20',
        dhuhr: '12:25',
        asr: '15:50',
        maghrib: '18:25',
        isha: '19:55',
      },
      iqamah: {
        fajr: '05:25',
        dhuhr: '12:40',
        asr: '16:05',
        maghrib: '18:35',
        isha: '20:15',
      },
      fetchedAt: new Date().toISOString(),
    }
  );
  const snapshotWithActiveAsr = {
    ...baseSnapshot,
    activeWindow: {
      prayer: 'asr' as const,
      enteredAt: '15:50',
      iqamahTime: '16:05',
      elapsedMinutes: 4,
      windowMinutes: 20,
    },
  };

  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return createElement(
      'div',
      null,
      createElement(CompanionMiniWidget, {
        prayerSnapshot: snapshotWithActiveAsr,
        readingStreakDays: 7,
      }),
      createElement(AthanDashboardModule, {
        snapshot: snapshotWithActiveAsr,
        activeAlert: {
          id: 'alert-asr',
          type: 'athan',
          prayer: 'asr',
          scheduledTime: '15:50',
          iqamahTime: '16:05',
          timestamp: new Date().toISOString(),
        },
        syncing: false,
        statusMessage: null,
        onUpdateSettings: async () => snapshotWithActiveAsr,
        onDetectLocation: async () => ({}),
        onSyncMawaqit: async () => ({}),
        onTriggerTestAlert: async () => ({}),
        onDismissAlert: () => {},
      })
    );
  }

  const root = createRoot(window.document.getElementById('root')!);
  try {
    await act(async () => {
      root.render(createElement(WorkspaceProvider, null, createElement(Harness)));
    });
    // Switch global app language to English ('en' / 'ltr')
    await act(async () => {
      workspace.toggleLanguage();
    });
    assert.equal(workspace.lang, 'en');
    assert.equal(workspace.dir, 'ltr');

    // Even though app is in English LTR, forceArabicWidgets forces Arabic & RTL on Athan & Companion widgets
    const athanEl = window.document.querySelector('[data-dashboard-module="athan-prayer-times"]');
    const companionEl = window.document.querySelector('[data-companion-widget]');
    assert.equal(athanEl?.getAttribute('dir'), 'rtl');
    assert.equal(companionEl?.getAttribute('dir'), 'rtl');

    // Verify Mosque icon indicator when connected to Mawaqit
    const mosqueIcon = window.document.querySelector('[data-athan-mosque-icon]');
    const sourceIndicator = window.document.querySelector('[data-athan-source-indicator="mawaqit"]');
    assert.ok(mosqueIcon, 'Mosque icon indicator should be visible when connected to Mawaqit');
    assert.ok(sourceIndicator?.textContent?.includes('Masjid Al-Nabawi'));

    // Verify Active Prayer Window banner ("حان الآن وقت صلاة العصر")
    const activeBanner = window.document.querySelector('[data-athan-active-window="asr"]');
    assert.ok(activeBanner, 'Active prayer window banner should be displayed');
    assert.ok(activeBanner.textContent?.includes(translations.ar.athanTimeForPrayerBanner.replace('{prayer}', 'العصر')));

    // Verify in-app Athan Modal Dialog renders
    const modalDialog = window.document.querySelector('[data-athan-alert-modal]');
    assert.ok(modalDialog, 'In-app Athan modal dialog should render when activeAlert is present');
  } finally {
    await act(async () => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
