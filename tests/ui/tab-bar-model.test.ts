import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dropIndex, shortcutTarget, tabIcon, tabLabel, tabShortcut } from '../../src/renderer/components/layout/tab-bar-model';
import { planKeepAlive } from '../../src/renderer/components/layout/use-tab-keep-alive';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { EMPTY_TABS, newTab, tabsReducer, type TabsState } from '../../src/shared/workspace-tabs';

const key = (k: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {}, code?: string) =>
  ({ key: k, code, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt, metaKey: !!mods.meta });

function tabs(count: number): TabsState {
  let state = EMPTY_TABS;
  for (let n = 1; n <= count; n += 1) state = tabsReducer(state, { type: 'open', id: `t${n}`, location: { view: 'library', title: '' }, now: n });
  return state;
}

describe('tabShortcut', () => {
  it('reads the browser tab shortcuts', () => {
    assert.deepEqual(tabShortcut(key('t', { ctrl: true }, 'KeyT')), { type: 'new' });
    assert.deepEqual(tabShortcut(key('T', { ctrl: true, shift: true }, 'KeyT')), { type: 'reopen' });
    assert.deepEqual(tabShortcut(key('w', { ctrl: true }, 'KeyW')), { type: 'close' });
    assert.deepEqual(tabShortcut(key('F4', { ctrl: true }, 'F4')), { type: 'close' });
    assert.deepEqual(tabShortcut(key('Tab', { ctrl: true }, 'Tab')), { type: 'next' });
    assert.deepEqual(tabShortcut(key('Tab', { ctrl: true, shift: true }, 'Tab')), { type: 'previous' });
    assert.deepEqual(tabShortcut(key('PageDown', { ctrl: true }, 'PageDown')), { type: 'next' });
    assert.deepEqual(tabShortcut(key('3', { ctrl: true }, 'Digit3')), { type: 'index', index: 2 });
    assert.deepEqual(tabShortcut(key('9', { ctrl: true }, 'Digit9')), { type: 'last' });
    assert.deepEqual(tabShortcut(key('t', { meta: true }, 'KeyT')), { type: 'new' });
  });

  it('works on an Arabic keyboard layout through the key code', () => {
    assert.deepEqual(tabShortcut(key('ف', { ctrl: true }, 'KeyT')), { type: 'new' });
    assert.deepEqual(tabShortcut(key('ص', { ctrl: true }, 'KeyW')), { type: 'close' });
  });

  it('ignores keys without Ctrl, with Alt, and Ctrl+Shift+PageUp/PageDown (they move a tab)', () => {
    assert.equal(tabShortcut(key('t', {}, 'KeyT')), null);
    assert.equal(tabShortcut(key('t', { ctrl: true, alt: true }, 'KeyT')), null);
    assert.equal(tabShortcut(key('PageDown', { ctrl: true, shift: true }, 'PageDown')), null);
    assert.equal(tabShortcut(key('w', { ctrl: true, shift: true }, 'KeyW')), null);
  });
});

describe('shortcutTarget', () => {
  it('wraps around and jumps by index', () => {
    const state = tabs(3);
    assert.equal(shortcutTarget(state, { type: 'next' }), 't1');
    assert.equal(shortcutTarget(state, { type: 'previous' }), 't2');
    assert.equal(shortcutTarget(state, { type: 'index', index: 0 }), 't1');
    assert.equal(shortcutTarget(state, { type: 'index', index: 7 }), null);
    assert.equal(shortcutTarget(state, { type: 'last' }), 't3');
    assert.equal(shortcutTarget(tabs(1), { type: 'next' }), null);
  });
});

describe('dropIndex', () => {
  const spans = [{ id: 'a', start: 0, width: 100 }, { id: 'b', start: 100, width: 100 }, { id: 'c', start: 200, width: 100 }];

  it('finds the landing index from the pointer in LTR', () => {
    assert.equal(dropIndex(10, spans, 'c', 'ltr'), 0);
    assert.equal(dropIndex(160, spans, 'a', 'ltr'), 1);
    assert.equal(dropIndex(290, spans, 'a', 'ltr'), 2);
  });

  it('mirrors in RTL, where the first tab is on the right', () => {
    const rtl = [{ id: 'a', start: 200, width: 100 }, { id: 'b', start: 100, width: 100 }, { id: 'c', start: 0, width: 100 }];
    assert.equal(dropIndex(290, rtl, 'c', 'rtl'), 0);
    assert.equal(dropIndex(10, rtl, 'a', 'rtl'), 2);
    assert.equal(dropIndex(140, rtl, 'a', 'rtl'), 1);
  });
});

describe('tabLabel and tabIcon', () => {
  for (const lang of ['ar', 'en'] as const) {
    const t = (k: TranslationKey) => translations[lang][k];
    it(`uses the tab's title, else the view's name (${lang})`, () => {
      assert.equal(tabLabel(newTab('x', { view: 'quran', title: 'البقرة ٢٥٥' }, 0), t), 'البقرة ٢٥٥');
      assert.equal(tabLabel(newTab('x', { view: 'library', title: '  ' }, 0), t), translations[lang].navLibrary);
      assert.ok(tabLabel(newTab('x', { view: 'islamic', title: '' }, 0), t));
    });
  }

  it('has an icon for every view', () => {
    for (const view of ['dashboard', 'library', 'reader', 'quran', 'sunnah', 'bayan', 'notes', 'notes-editor', 'settings', 'islamic'] as const) assert.ok(tabIcon(view));
  });
});

describe('planKeepAlive', () => {
  it('wakes the focused tab and sleeps the 7th and later least recently used tabs', () => {
    const state = tabs(8);
    const awake = new Set(state.tabs.map(tab => tab.id));
    const plan = planKeepAlive(state, awake, new Set(), new Set());
    assert.deepEqual(plan.sleep.sort(), ['t1', 't2']);
    assert.deepEqual(plan.wake, []);
  });

  it('keeps exempt and failed-save tabs awake', () => {
    const state = tabs(10);
    const awake = new Set(state.tabs.map(tab => tab.id));
    const plan = planKeepAlive(state, awake, new Set(['t1']), new Set(['t2']));
    assert.deepEqual(plan.sleep.sort(), ['t3', 't4']);
  });

  it('wakes a sleeping tab when it is focused', () => {
    const state = tabsReducer(tabs(8), { type: 'activate', id: 't1', now: 100 });
    const plan = planKeepAlive(state, new Set(['t3', 't4', 't5', 't6', 't7', 't8']), new Set(), new Set());
    assert.deepEqual(plan.wake, ['t1']);
    assert.deepEqual(plan.sleep, ['t3']);
  });
});
