import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canOpenSideBySide, clickTab, copyLinksText, extendSelection, listableTargets, menuTargets, normalizeSelection,
  otherTabIds, rangeTo, singleSelection, tabIdsAfter, toggleTab, type TabSelection,
} from '../../src/shared/workspace-tab-selection';
import { formatDeepLink, parseDeepLink } from '../../src/shared/deep-link';
import { EMPTY_TABS, currentLocation, tabsReducer, type TabLocation, type TabsState } from '../../src/shared/workspace-tabs';

/** t1 Home, t2 Al-Baqarah 255, t3 Bukhari 1, t4 a book page, t5 Library; t3 focused. */
function five(): TabsState {
  const places: TabLocation[] = [
    { view: 'dashboard', title: '' },
    { view: 'quran', target: 'quran:hafs:2:255', title: 'البقرة ٢٥٥' },
    { view: 'sunnah', target: 'sunnah:Bukhari:1:1', title: 'Bukhari 1' },
    { view: 'reader', target: 'book:42@s1#p=17', title: 'صحيح البخاري' },
    { view: 'library', title: '' },
  ];
  let state = EMPTY_TABS;
  places.forEach((location, n) => { state = tabsReducer(state, { type: 'open', id: `t${n + 1}`, location, now: n + 1 }); });
  return tabsReducer(state, { type: 'activate', id: 't3', now: 10 });
}

const focus = (state: TabsState, id: string | null) => (id ? tabsReducer(state, { type: 'activate', id, now: 20 }) : state);

describe('tab selection', () => {
  it('a plain click selects only that tab; Esc leaves only the focused tab', () => {
    assert.deepEqual(clickTab('t2'), { selection: { ids: ['t2'], anchor: 't2' }, focus: 't2' });
    assert.deepEqual(singleSelection('t3'), { ids: ['t3'], anchor: 't3' });
  });

  it('Ctrl+click adds (and focuses) or removes a tab, keeping the bar order', () => {
    const state = five();
    let change = toggleTab(state, singleSelection('t3'), 't1');
    assert.deepEqual(change.selection.ids, ['t1', 't3']);
    assert.equal(change.focus, 't1');
    let next = focus(state, change.focus);
    change = toggleTab(next, change.selection, 't5');
    assert.deepEqual(change.selection.ids, ['t1', 't3', 't5']);
    next = focus(next, change.focus);
    change = toggleTab(next, change.selection, 't3');
    assert.deepEqual(change.selection.ids, ['t1', 't5']);
    assert.equal(change.focus, 't5', 'removing a tab that is not focused keeps focus');
  });

  it('removing the focused tab moves focus to the nearest selected tab; the last one stays', () => {
    const state = five();
    const selection: TabSelection = { ids: ['t1', 't3', 't4'], anchor: 't1' };
    const change = toggleTab(state, selection, 't3');
    assert.deepEqual(change.selection.ids, ['t1', 't4']);
    assert.equal(change.focus, 't4');
    assert.deepEqual(toggleTab(state, singleSelection('t3'), 't3').selection.ids, ['t3']);
  });

  it('Shift+click selects the range from the anchor, in either direction', () => {
    const state = five();
    assert.deepEqual(rangeTo(state, singleSelection('t3'), 't5'), { selection: { ids: ['t3', 't4', 't5'], anchor: 't3' }, focus: 't5' });
    assert.deepEqual(rangeTo(state, singleSelection('t3'), 't1').selection.ids, ['t1', 't2', 't3']);
    // The anchor stays put while Shift-clicks change the far end.
    const moved = focus(state, 't5');
    assert.deepEqual(rangeTo(moved, { ids: ['t3', 't4', 't5'], anchor: 't3' }, 't2').selection.ids, ['t2', 't3']);
  });

  it('Ctrl+Shift+arrow extends one tab at a time and stops at the ends', () => {
    let state = five();
    let selection = singleSelection('t3');
    for (let n = 0; n < 3; n += 1) {
      const change = extendSelection(state, selection, 1);
      selection = change.selection;
      state = focus(state, change.focus);
    }
    assert.deepEqual(selection.ids, ['t3', 't4', 't5']);
    assert.equal(state.activeId, 't5');
    const back = extendSelection(state, selection, -1);
    assert.deepEqual(back.selection.ids, ['t3', 't4']);
  });

  it('normalizing drops closed tabs and always includes the focused tab', () => {
    const state = tabsReducer(five(), { type: 'close', id: 't4', homeId: 'h', now: 30 });
    assert.deepEqual(normalizeSelection(state, { ids: ['t4', 't1'], anchor: 't4' }), { ids: ['t1', 't3'], anchor: 't3' });
  });
});

describe('tab menu helpers', () => {
  it('acts on the selection when the pointer is on it, else on the tab under the pointer', () => {
    const state = five();
    const selection: TabSelection = { ids: ['t2', 't3'], anchor: 't2' };
    assert.deepEqual(menuTargets(state, selection, 't2'), ['t2', 't3']);
    assert.deepEqual(menuTargets(state, selection, 't5'), ['t5']);
    assert.deepEqual(menuTargets(state, singleSelection('t3'), 'nope'), []);
  });

  it('close others and close to the right (bar order, so "to the left" in Arabic is the same list)', () => {
    const state = five();
    assert.deepEqual(otherTabIds(state, ['t2', 't3']), ['t1', 't4', 't5']);
    assert.deepEqual(tabIdsAfter(state, ['t2', 't3']), ['t4', 't5']);
    assert.deepEqual(tabIdsAfter(state, ['t5']), []);
  });

  it('side by side needs exactly two tabs', () => {
    assert.equal(canOpenSideBySide(['a', 'b']), true);
    assert.equal(canOpenSideBySide(['a']), false);
    assert.equal(canOpenSideBySide(['a', 'b', 'c']), false);
  });

  it('copies one line per tab with its baglib link; tabs without an item copy their title', () => {
    const state = five();
    const label = (tab: Parameters<Parameters<typeof copyLinksText>[2]>[0]) => currentLocation(tab).title || currentLocation(tab).view;
    const text = copyLinksText(state, ['t3', 't1', 't2'], label);
    const lines = text.split('\n');
    assert.equal(lines[0], 'dashboard');
    assert.equal(lines[1], 'البقرة ٢٥٥ baglib:quran:hafs:2:255');
    assert.equal(lines[2], 'Bukhari 1 baglib:sunnah:Bukhari:1:1');
    for (const line of lines.slice(1)) assert.ok(parseDeepLink(line.slice(line.lastIndexOf(' ') + 1)), line);
  });

  it('Add to list takes each item once and counts the tabs without one', () => {
    assert.deepEqual(listableTargets(five(), ['t1', 't2', 't4', 't5']), { targets: ['quran:hafs:2:255', 'book:42@s1#p=17'], skipped: 2 });
  });
});

describe('formatDeepLink', () => {
  it('round-trips study targets through parseDeepLink, including Arabic', () => {
    for (const target of ['quran:hafs:2:255', 'sunnah:Bukhari:1:1', 'book:42@s1#p=17', 'note:abc-123']) {
      assert.equal(parseDeepLink(formatDeepLink(target)), target, target);
    }
    assert.equal(formatDeepLink('quran:hafs:2:255'), 'baglib:quran:hafs:2:255');
  });
});
