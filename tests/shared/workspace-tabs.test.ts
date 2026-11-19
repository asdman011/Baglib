import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DESTINATIONS, DEFAULT_WORKSPACE_PREFS, EMPTY_TABS, TAB_LIMITS, activeTab, awakeTabIds, backEntries, canGoBack,
  canGoForward, currentLocation, forwardEntries, linkOpensNewTab, parseClosed, parsePrefs, parseRecent, parseTabs, parseUsage,
  pushClosed, pushRecent, rankDestinations, readSnapshot, recordUsage, restoreFocusEnabled, sanitizeLocation, sanitizeSnapshot,
  serializeTabs, startupTabs, tabsReducer, tabsToSleep, type TabLocation, type TabsAction, type TabsState,
} from '../../src/shared/workspace-tabs';

const loc = (view: TabLocation['view'], target?: string, title = ''): TabLocation => (target ? { view, target, title } : { view, title });
const run = (state: TabsState, ...actions: TabsAction[]): TabsState => actions.reduce(tabsReducer, state);
const ids = (state: TabsState): string[] => state.tabs.map(tab => tab.id);

function openMany(count: number): TabsState {
  let state = EMPTY_TABS;
  for (let n = 1; n <= count; n += 1) state = tabsReducer(state, { type: 'open', id: `t${n}`, location: loc('library'), now: n });
  return state;
}

describe('tabsReducer: open, close, activate, move, duplicate', () => {
  it('opens a tab after the active tab and focuses it', () => {
    const state = run(EMPTY_TABS,
      { type: 'open', id: 'a', location: loc('library'), now: 1 },
      { type: 'open', id: 'b', location: loc('quran'), now: 2 },
      { type: 'activate', id: 'a', now: 3 },
      { type: 'open', id: 'c', location: loc('sunnah'), now: 4 });
    assert.deepEqual(ids(state), ['a', 'c', 'b']);
    assert.equal(state.activeId, 'c');
  });

  it('opens a background tab without taking focus', () => {
    const state = run(openMany(1), { type: 'open', id: 'bg', location: loc('reader', 'book:abc'), now: 5, background: true });
    assert.equal(state.activeId, 't1');
    assert.deepEqual(ids(state), ['t1', 'bg']);
  });

  it('focuses the existing tab for a single-instance view instead of opening another', () => {
    const state = run(EMPTY_TABS,
      { type: 'open', id: 's', location: loc('settings'), now: 1 },
      { type: 'open', id: 'l', location: loc('library'), now: 2 },
      { type: 'open', id: 's2', location: loc('settings'), now: 3 });
    assert.deepEqual(ids(state), ['s', 'l']);
    assert.equal(state.activeId, 's');
  });

  it('closing the active tab focuses the tab to its right, or to its left at the end', () => {
    let state = run(openMany(3), { type: 'activate', id: 't2', now: 10 }, { type: 'close', id: 't2', homeId: 'h', now: 11 });
    assert.equal(state.activeId, 't3');
    state = run(state, { type: 'close', id: 't3', homeId: 'h', now: 12 });
    assert.equal(state.activeId, 't1');
  });

  it('closing a background tab keeps the focus where it is', () => {
    const state = run(openMany(3), { type: 'close', id: 't1', homeId: 'h', now: 10 });
    assert.equal(state.activeId, 't3');
    assert.deepEqual(ids(state), ['t2', 't3']);
  });

  it('closing the last tab leaves a new Home tab', () => {
    const state = run(openMany(1), { type: 'close', id: 't1', homeId: 'home', now: 9 });
    assert.deepEqual(ids(state), ['home']);
    assert.equal(currentLocation(state.tabs[0]).view, 'dashboard');
    assert.equal(state.activeId, 'home');
  });

  it('moves a tab and clamps the index', () => {
    assert.deepEqual(ids(run(openMany(3), { type: 'move', id: 't3', toIndex: 0 })), ['t3', 't1', 't2']);
    assert.deepEqual(ids(run(openMany(3), { type: 'move', id: 't1', toIndex: 99 })), ['t2', 't3', 't1']);
  });

  it('duplicates a tab with its history, right after it', () => {
    const state = run(openMany(2),
      { type: 'activate', id: 't1', now: 5 },
      { type: 'navigate', id: 't1', location: loc('reader', 'book:x'), now: 6 },
      { type: 'duplicate', id: 't1', newId: 'copy', now: 7 });
    assert.deepEqual(ids(state), ['t1', 'copy', 't2']);
    assert.equal(state.activeId, 'copy');
    assert.equal(activeTab(state)!.history.length, 2);
    assert.notEqual(activeTab(state)!.history, state.tabs[0].history);
  });

  it('does not duplicate a single-instance view', () => {
    const state = run(EMPTY_TABS, { type: 'open', id: 's', location: loc('settings'), now: 1 }, { type: 'duplicate', id: 's', newId: 'x', now: 2 });
    assert.deepEqual(ids(state), ['s']);
  });
});

describe('tabsReducer: per-tab history', () => {
  const start = run(openMany(1),
    { type: 'navigate', id: 't1', location: loc('reader', 'book:a', 'A'), now: 2 },
    { type: 'navigate', id: 't1', location: loc('quran', 'quran:hafs:2:255', 'Al-Baqarah'), now: 3 });

  it('a new view or item makes an entry; back and forward move through them', () => {
    const tab = start.tabs[0];
    assert.equal(tab.history.length, 3);
    assert.ok(canGoBack(tab) && !canGoForward(tab));
    const back = run(start, { type: 'back', id: 't1', now: 4 });
    assert.equal(currentLocation(back.tabs[0]).target, 'book:a');
    const forward = run(back, { type: 'forward', id: 't1', now: 5 });
    assert.equal(currentLocation(forward.tabs[0]).view, 'quran');
  });

  it('the same item only updates the current entry (scroll, page turn, title)', () => {
    const state = run(start, { type: 'navigate', id: 't1', location: { ...loc('quran', 'quran:hafs:2:255', 'Updated'), scroll: 40 }, now: 6 });
    assert.equal(state.tabs[0].history.length, 3);
    assert.equal(currentLocation(state.tabs[0]).title, 'Updated');
    assert.equal(currentLocation(state.tabs[0]).scroll, 40);
  });

  it('update changes the current entry without a new entry', () => {
    const state = run(start, { type: 'update', id: 't1', patch: { scroll: 120, snapshot: { version: 1, data: { page: 3 } } } });
    assert.equal(state.tabs[0].history.length, 3);
    assert.deepEqual(currentLocation(state.tabs[0]).snapshot, { version: 1, data: { page: 3 } });
  });

  it('navigating after going back drops the forward entries', () => {
    const state = run(start, { type: 'back', id: 't1', now: 4 }, { type: 'navigate', id: 't1', location: loc('sunnah'), now: 5 });
    assert.deepEqual(state.tabs[0].history.map(entry => entry.view), ['library', 'reader', 'sunnah']);
    assert.ok(!canGoForward(state.tabs[0]));
  });

  it('lists back and forward entries nearest first, and jumps with go', () => {
    const middle = run(start, { type: 'back', id: 't1', now: 4 });
    assert.deepEqual(backEntries(middle.tabs[0]).map(entry => [entry.index, entry.location.view]), [[0, 'library']]);
    assert.deepEqual(forwardEntries(middle.tabs[0]).map(entry => [entry.index, entry.location.view]), [[2, 'quran']]);
    const top = run(start, { type: 'go', id: 't1', index: 0, now: 7 });
    assert.deepEqual(backEntries(top.tabs[0]), []);
    assert.deepEqual(forwardEntries(top.tabs[0]).map(entry => entry.index), [1, 2]);
    assert.equal(run(top, { type: 'go', id: 't1', index: 9, now: 8 }), top);
  });

  it('keeps at most 50 entries', () => {
    let state = openMany(1);
    for (let n = 0; n < 70; n += 1) state = tabsReducer(state, { type: 'navigate', id: 't1', location: loc('reader', `book:b${n}`), now: n + 2 });
    const tab = state.tabs[0];
    assert.equal(tab.history.length, TAB_LIMITS.maxHistory);
    assert.equal(tab.index, TAB_LIMITS.maxHistory - 1);
    assert.equal(currentLocation(tab).target, 'book:b69');
  });

  it('navigating to a single-instance view another tab holds focuses that tab', () => {
    const state = run(EMPTY_TABS,
      { type: 'open', id: 's', location: loc('settings'), now: 1 },
      { type: 'open', id: 'l', location: loc('library'), now: 2 },
      { type: 'navigate', id: 'l', location: loc('settings'), now: 3 });
    assert.equal(state.activeId, 's');
    assert.equal(currentLocation(state.tabs[1]).view, 'library');
  });
});

describe('tabsReducer: reopen and side by side', () => {
  it('reopens a closed tab with its history under a new id', () => {
    const before = run(openMany(2), { type: 'navigate', id: 't2', location: loc('reader', 'book:z'), now: 5 });
    const closed = before.tabs[1];
    const state = run(before, { type: 'close', id: 't2', homeId: 'h', now: 6 }, { type: 'reopen', tab: closed, id: 'r', now: 7 });
    assert.equal(state.activeId, 'r');
    assert.equal(activeTab(state)!.history.length, 2);
  });

  it('shows a tab beside the active one, and clears it when that tab is focused or closed', () => {
    const split = run(openMany(3), { type: 'openBeside', id: 't1' });
    assert.equal(split.splitId, 't1');
    // Focusing the tab in the other pane moves the focus; both stay side by side, the panes stay put.
    const swapped = run(split, { type: 'activate', id: 't1', now: 9 });
    assert.equal(swapped.activeId, 't1');
    assert.equal(swapped.splitId, 't3');
    assert.equal(swapped.splitSwapped, true);
    assert.equal(run(swapped, { type: 'activate', id: 't3', now: 10 }).splitSwapped, undefined, 'back to the first pane');
    // Focusing a tab outside the pair, or opening a new one, ends side by side.
    assert.equal(run(split, { type: 'activate', id: 't2', now: 9 }).splitId, undefined);
    assert.equal(run(split, { type: 'open', id: 'n', location: { view: 'library', title: '' }, now: 9 }).splitId, undefined);
    // The divider size is kept between 0.2 and 0.8, saved and restored; it goes when the split ends.
    const sized = run(split, { type: 'setSplitRatio', ratio: 0.95 });
    assert.equal(sized.splitRatio, 0.8);
    assert.deepEqual(parseTabs(JSON.stringify(serializeTabs(run(sized, { type: 'activate', id: 't1', now: 11 })))).splitSwapped, true);
    assert.equal(parseTabs(JSON.stringify(serializeTabs(sized))).splitRatio, 0.8);
    assert.equal(run(sized, { type: 'closeSplit' }).splitRatio, undefined);
    assert.equal(run(openMany(3), { type: 'setSplitRatio', ratio: 0.4 }).splitRatio, undefined, 'no split, no size');
    assert.equal(run(split, { type: 'close', id: 't1', homeId: 'h', now: 9 }).splitId, undefined);
    assert.equal(run(split, { type: 'closeSplit' }).splitId, undefined);
    assert.equal(run(openMany(2), { type: 'openBeside', id: 't2' }).splitId, undefined);
  });

  it('closing the active tab in a split focuses the other pane', () => {
    const state = run(openMany(3), { type: 'openBeside', id: 't1' }, { type: 'close', id: 't3', homeId: 'h', now: 9 });
    assert.equal(state.activeId, 't1');
    assert.equal(state.splitId, undefined);
  });
});

describe('awakeTabIds: keep 6 alive, exemptions', () => {
  it('keeps the 6 most recently used tabs and sleeps the rest', () => {
    const awake = awakeTabIds(openMany(8));
    assert.equal(awake.size, 6);
    assert.ok(!awake.has('t1') && !awake.has('t2'));
    assert.ok(awake.has('t8'));
  });

  it('always keeps the active tab, even when it is the oldest', () => {
    const state = run(openMany(8), { type: 'activate', id: 't1', now: 0 });
    const awake = awakeTabIds({ ...state, tabs: state.tabs.map(tab => (tab.id === 't1' ? { ...tab, lastActiveAt: 0 } : tab)) });
    assert.ok(awake.has('t1'));
    assert.equal(awake.size, 6);
    assert.ok(!awake.has('t3'));
  });

  it('exempt tabs stay awake and do not count toward the 6', () => {
    const awake = awakeTabIds(openMany(9), new Set(['t1', 't2']));
    assert.ok(awake.has('t1') && awake.has('t2'));
    assert.equal(awake.size, 8);
    assert.ok(!awake.has('t3'));
  });

  it('exceeds the limit rather than putting an exempt tab to sleep', () => {
    const all = new Set(Array.from({ length: 9 }, (_, n) => `t${n + 1}`));
    assert.equal(awakeTabIds(openMany(9), all).size, 9);
  });

  it('keeps the split tab awake', () => {
    const state = run(openMany(8), { type: 'openBeside', id: 't1' });
    assert.ok(awakeTabIds(state).has('t1'));
  });

  it('lists the tabs that must save and sleep', () => {
    assert.deepEqual(tabsToSleep(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd'])), ['a']);
  });
});

describe('snapshots', () => {
  it('drops a snapshot without a valid version or data object', () => {
    assert.equal(sanitizeSnapshot(null), undefined);
    assert.equal(sanitizeSnapshot({ version: 0, data: {} }), undefined);
    assert.equal(sanitizeSnapshot({ version: 1.5, data: {} }), undefined);
    assert.equal(sanitizeSnapshot({ version: 1, data: [] }), undefined);
  });

  it('drops non-JSON fields', () => {
    const snapshot = sanitizeSnapshot({ version: 2, data: { page: 4, fn: () => 1, nan: NaN, nested: { ok: true, gone: undefined }, list: [1, Infinity] } });
    assert.deepEqual(snapshot, { version: 2, data: { page: 4, nested: { ok: true }, list: [1] } });
  });

  it('drops the largest fields until the snapshot fits', () => {
    const snapshot = sanitizeSnapshot({ version: 1, data: { page: 7, big: 'x'.repeat(20_000) } });
    assert.deepEqual(snapshot, { version: 1, data: { page: 7 } });
  });

  it('readSnapshot ignores another version and drops invalid fields', () => {
    const fields = { page: (value: unknown) => typeof value === 'number', panel: (value: unknown) => value === 'notes' || value === 'outline' };
    assert.deepEqual(readSnapshot({ version: 1, data: { page: 3, panel: 'bogus' } }, 1, fields), { page: 3 });
    assert.deepEqual(readSnapshot({ version: 1, data: { page: 3 } }, 2, fields), {});
    assert.deepEqual(readSnapshot(undefined, 1, fields), {});
  });

  it('a location with an unknown view is dropped, an invalid target is cleared', () => {
    assert.equal(sanitizeLocation({ view: 'bogus', title: 'x' }), undefined);
    assert.deepEqual(sanitizeLocation({ view: 'reader', target: 'nonsense', title: 'كتاب', scroll: -3 }), { view: 'reader', title: 'كتاب' });
    assert.deepEqual(sanitizeLocation({ view: 'quran', target: 'quran:hafs:2:255', title: 'البقرة', scroll: 10 }), { view: 'quran', target: 'quran:hafs:2:255', title: 'البقرة', scroll: 10 });
  });
});

describe('parseTabs and serializeTabs', () => {
  it('round-trips a saved state', () => {
    const state = run(openMany(3), { type: 'navigate', id: 't2', location: loc('sunnah', 'sunnah:Bukhari:1:1', 'صحيح البخاري 1'), now: 9 });
    assert.deepEqual(parseTabs(JSON.stringify(serializeTabs(state))), state);
  });

  it('never throws on bad input and drops broken tabs, duplicates and second single-instance tabs', () => {
    assert.deepEqual(parseTabs('{not json'), EMPTY_TABS);
    assert.deepEqual(parseTabs(42), EMPTY_TABS);
    const state = parseTabs({
      activeId: 'gone',
      tabs: [
        { id: 'a', openedAt: 1, history: [{ view: 'library', title: '' }], index: 0 },
        { id: 'a', openedAt: 2, history: [{ view: 'quran', title: '' }], index: 0 },
        { id: 'b', openedAt: 3, history: [{ view: 'bogus' }], index: 0 },
        { id: 's1', openedAt: 4, history: [{ view: 'settings', title: '' }], index: 0 },
        { id: 's2', openedAt: 5, history: [{ view: 'settings', title: '' }], index: 0 },
        'junk',
      ],
    });
    assert.deepEqual(ids(state), ['a', 's1']);
    assert.equal(state.activeId, 'a');
  });

  it('keeps the current entry when broken history entries are dropped', () => {
    const state = parseTabs({ tabs: [{ id: 'a', history: [{ view: 'library' }, { view: 'bogus' }, { view: 'quran' }, { view: 'sunnah' }], index: 2 }], activeId: 'a' });
    assert.equal(currentLocation(state.tabs[0]).view, 'quran');
    assert.equal(state.tabs[0].history.length, 3);
  });

  it('saves at most 30 tabs, always keeping the active one', () => {
    let state = openMany(35);
    state = { ...state, activeId: 't1', tabs: state.tabs.map(tab => (tab.id === 't1' ? { ...tab, lastActiveAt: 0 } : tab)) };
    const saved = serializeTabs(state);
    assert.equal(saved.tabs.length, TAB_LIMITS.maxSavedTabs);
    assert.ok(saved.tabs.some(tab => tab.id === 't1'));
    assert.ok(!saved.tabs.some(tab => tab.id === 't2'));
  });
});

describe('preferences and startup', () => {
  it('defaults to restore, a new Home tab in front and links in a new tab', () => {
    assert.deepEqual(parsePrefs(undefined), DEFAULT_WORKSPACE_PREFS);
    assert.deepEqual(DEFAULT_WORKSPACE_PREFS, { restoreTabs: true, restoreFocus: 'new', linkTarget: 'new' });
    assert.deepEqual(parsePrefs('{"restoreTabs":false,"restoreFocus":"bogus","linkTarget":"same"}'), { restoreTabs: false, restoreFocus: 'new', linkTarget: 'same' });
  });

  it('the "after restoring" option is disabled unless restoring is on', () => {
    assert.equal(restoreFocusEnabled(DEFAULT_WORKSPACE_PREFS), true);
    assert.equal(restoreFocusEnabled({ ...DEFAULT_WORKSPACE_PREFS, restoreTabs: false }), false);
  });

  it('Ctrl+click and middle-click do the opposite of the link setting', () => {
    assert.equal(linkOpensNewTab(DEFAULT_WORKSPACE_PREFS), true);
    assert.equal(linkOpensNewTab(DEFAULT_WORKSPACE_PREFS, { ctrl: true }), false);
    assert.equal(linkOpensNewTab({ ...DEFAULT_WORKSPACE_PREFS, linkTarget: 'same' }), false);
    assert.equal(linkOpensNewTab({ ...DEFAULT_WORKSPACE_PREFS, linkTarget: 'same' }, { middle: true }), true);
  });

  it('restores 9 tabs and puts a new Home tab in front by default', () => {
    const saved = openMany(9);
    const state = startupTabs(saved, DEFAULT_WORKSPACE_PREFS, 'home', 100);
    assert.equal(state.tabs.length, 10);
    assert.equal(state.activeId, 'home');
    assert.equal(currentLocation(activeTab(state)!).view, 'dashboard');
  });

  it('restores onto the last tab when chosen', () => {
    const saved = run(openMany(9), { type: 'activate', id: 't4', now: 50 });
    const state = startupTabs(saved, { ...DEFAULT_WORKSPACE_PREFS, restoreFocus: 'last' }, 'home', 100);
    assert.equal(state.tabs.length, 9);
    assert.equal(state.activeId, 't4');
  });

  it('start fresh, or nothing saved, opens one Home tab', () => {
    const fresh = startupTabs(openMany(9), { ...DEFAULT_WORKSPACE_PREFS, restoreTabs: false, restoreFocus: 'last' }, 'home', 100);
    assert.deepEqual(ids(fresh), ['home']);
    assert.deepEqual(ids(startupTabs(EMPTY_TABS, DEFAULT_WORKSPACE_PREFS, 'home', 100)), ['home']);
  });
});

describe('most used, recents and closed tabs', () => {
  const day = 24 * 60 * 60 * 1000;

  it('shows Library, Quran and Sunnah until enough use is recorded', () => {
    assert.deepEqual(rankDestinations({}, 0), [...DEFAULT_DESTINATIONS]);
    assert.deepEqual(rankDestinations(recordUsage({}, 'notes', 0), 0), [...DEFAULT_DESTINATIONS]);
  });

  it('ranks by use, with older use decaying', () => {
    let usage = {};
    for (let n = 0; n < 10; n += 1) usage = recordUsage(usage, 'quran', 0);
    for (let n = 0; n < 4; n += 1) usage = recordUsage(usage, 'library', 60 * day);
    assert.deepEqual(rankDestinations(usage, 60 * day).slice(0, 2), ['library', 'quran']);
    assert.deepEqual(rankDestinations(usage, 0 * day + 1).slice(0, 1), ['quran']);
  });

  it('parseUsage drops unknown destinations and bad counts', () => {
    assert.deepEqual(parseUsage('{"quran":{"count":3,"lastUsedAt":5},"bogus":{"count":1},"library":{"count":0}}'), { quran: { count: 3, lastUsedAt: 5 } });
    assert.deepEqual(parseUsage('nope'), {});
  });

  it('recents put the newest first, without duplicates, at most 30', () => {
    let list = pushRecent([], { view: 'reader', target: 'book:a', title: 'A', openedAt: 1 });
    list = pushRecent(list, { view: 'quran', target: 'quran:hafs:1:1', title: 'الفاتحة', openedAt: 2 });
    list = pushRecent(list, { view: 'reader', target: 'book:a', title: 'A', openedAt: 3 });
    assert.deepEqual(list.map(item => item.target), ['book:a', 'quran:hafs:1:1']);
    for (let n = 0; n < 40; n += 1) list = pushRecent(list, { view: 'reader', target: `book:n${n}`, title: '', openedAt: n });
    assert.equal(list.length, TAB_LIMITS.maxRecent);
    assert.deepEqual(parseRecent(JSON.stringify(list)), list);
    assert.deepEqual(parseRecent([{ view: 'bogus' }, { view: 'library', title: 'L', openedAt: 1 }, { view: 'library', title: 'L2', openedAt: 2 }]).length, 1);
  });

  it('keeps the last 10 closed tabs, newest first', () => {
    let list: ReturnType<typeof parseClosed> = [];
    for (const tab of openMany(12).tabs) list = pushClosed(list, tab);
    assert.equal(list.length, TAB_LIMITS.maxClosed);
    assert.equal(list[0].id, 't12');
    assert.deepEqual(parseClosed(JSON.stringify(list)), list);
    assert.deepEqual(parseClosed('bad'), []);
  });
});
