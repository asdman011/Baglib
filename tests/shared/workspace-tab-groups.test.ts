import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_TABS, awakeTabIds, findGroup, groupTabIds, parseTabs, pushClosed, serializeTabs, startupTabs, tabsReducer,
  DEFAULT_WORKSPACE_PREFS, type TabsState,
} from '../../src/shared/workspace-tabs';

/** Tabs t1…t`count` on Library, the last one focused. */
function tabs(count: number): TabsState {
  let state = EMPTY_TABS;
  for (let n = 1; n <= count; n += 1) state = tabsReducer(state, { type: 'open', id: `t${n}`, location: { view: 'library', title: `Tab ${n}` }, now: n });
  return state;
}

const order = (state: TabsState) => state.tabs.map(tab => tab.groupId ? `${tab.id}@${tab.groupId}` : tab.id);

describe('tab groups', () => {
  it('grouping gathers the tabs where the first of them is', () => {
    const state = tabsReducer(tabs(5), { type: 'group', ids: ['t4', 't2'], groupId: 'g1', name: 'تفسير البقرة', color: 'green' });
    assert.deepEqual(order(state), ['t1', 't2@g1', 't4@g1', 't3', 't5']);
    assert.deepEqual(state.groups, [{ id: 'g1', name: 'تفسير البقرة', color: 'green', collapsed: false }]);
    assert.deepEqual(groupTabIds(state, 'g1'), ['t2', 't4']);
  });

  it('refuses an empty selection, a taken id, and falls back to grey for an unknown colour', () => {
    const state = tabsReducer(tabs(3), { type: 'group', ids: ['t1'], groupId: 'g1', name: 'A', color: 'blue' });
    assert.equal(tabsReducer(state, { type: 'group', ids: ['t2'], groupId: 'g1', name: 'B', color: 'red' }), state);
    assert.equal(tabsReducer(state, { type: 'group', ids: ['nope'], groupId: 'g2', name: 'B', color: 'red' }), state);
    const odd = tabsReducer(state, { type: 'group', ids: ['t3'], groupId: 'g2', name: 'B', color: 'magenta' as never });
    assert.equal(findGroup(odd, 'g2')!.color, 'grey');
  });

  it('adds tabs after the group and takes them out to just after it', () => {
    let state = tabsReducer(tabs(5), { type: 'group', ids: ['t1', 't2'], groupId: 'g1', name: 'A', color: 'blue' });
    state = tabsReducer(state, { type: 'addToGroup', ids: ['t5'], groupId: 'g1' });
    assert.deepEqual(order(state), ['t1@g1', 't2@g1', 't5@g1', 't3', 't4']);
    state = tabsReducer(state, { type: 'removeFromGroup', ids: ['t1'] });
    assert.deepEqual(order(state), ['t2@g1', 't5@g1', 't1', 't3', 't4']);
  });

  it('a group with no tabs left disappears, from removing, closing or ungrouping', () => {
    let state = tabsReducer(tabs(3), { type: 'group', ids: ['t1'], groupId: 'g1', name: 'A', color: 'blue' });
    assert.equal(tabsReducer(state, { type: 'removeFromGroup', ids: ['t1'] }).groups, undefined);
    assert.equal(tabsReducer(state, { type: 'close', id: 't1', homeId: 'h', now: 9 }).groups, undefined);
    state = tabsReducer(state, { type: 'ungroup', groupId: 'g1' });
    assert.equal(state.groups, undefined);
    assert.deepEqual(order(state), ['t1', 't2', 't3']);
    assert.ok(!('groups' in state), 'no empty groups key, so saved states compare equal');
  });

  it('dragging a tab out of a group leaves it; dropping one between two grouped tabs joins', () => {
    let state = tabsReducer(tabs(5), { type: 'group', ids: ['t1', 't2', 't3'], groupId: 'g1', name: 'A', color: 'blue' });
    state = tabsReducer(state, { type: 'move', id: 't1', toIndex: 4 });
    assert.deepEqual(order(state), ['t2@g1', 't3@g1', 't4', 't5', 't1']);
    state = tabsReducer(state, { type: 'move', id: 't5', toIndex: 1 });
    assert.deepEqual(order(state), ['t2@g1', 't5@g1', 't3@g1', 't4', 't1']);
    // Reordering inside the group keeps membership.
    state = tabsReducer(state, { type: 'move', id: 't2', toIndex: 2 });
    assert.deepEqual(order(state), ['t5@g1', 't3@g1', 't2@g1', 't4', 't1']);
  });

  it('a tab opened or duplicated inside a group joins it; one opened after the group does not', () => {
    let state = tabsReducer(tabs(3), { type: 'group', ids: ['t1', 't2'], groupId: 'g1', name: 'A', color: 'blue' });
    state = tabsReducer(state, { type: 'open', id: 'n1', location: { view: 'quran', title: '' }, now: 20, afterId: 't1' });
    assert.deepEqual(order(state), ['t1@g1', 'n1@g1', 't2@g1', 't3']);
    state = tabsReducer(state, { type: 'open', id: 'n2', location: { view: 'quran', title: '' }, now: 21, afterId: 't2' });
    assert.deepEqual(order(state), ['t1@g1', 'n1@g1', 't2@g1', 'n2', 't3']);
    state = tabsReducer(state, { type: 'duplicate', id: 't2', newId: 'd1', now: 22 });
    assert.deepEqual(order(state), ['t1@g1', 'n1@g1', 't2@g1', 'd1@g1', 'n2', 't3']);
  });

  it('moves a whole group by its label, never into the middle of another group', () => {
    let state = tabsReducer(tabs(6), { type: 'group', ids: ['t1', 't2'], groupId: 'g1', name: 'A', color: 'blue' });
    state = tabsReducer(state, { type: 'group', ids: ['t4', 't5'], groupId: 'g2', name: 'B', color: 'red' });
    const end = tabsReducer(state, { type: 'moveGroup', groupId: 'g1', toIndex: 99 });
    assert.deepEqual(order(end), ['t3', 't4@g2', 't5@g2', 't6', 't1@g1', 't2@g1']);
    const inside = tabsReducer(state, { type: 'moveGroup', groupId: 'g1', toIndex: 2 });
    assert.deepEqual(order(inside), ['t3', 't4@g2', 't5@g2', 't1@g1', 't2@g1', 't6']);
  });

  it('renames, recolours and collapses; a collapsed group\'s tabs sleep unless exempt', () => {
    let state = tabsReducer(tabs(4), { type: 'activate', id: 't4', now: 50 });
    state = tabsReducer(state, { type: 'group', ids: ['t1', 't2'], groupId: 'g1', name: 'A', color: 'blue' });
    state = tabsReducer(state, { type: 'updateGroup', groupId: 'g1', patch: { name: 'أحاديث الصيام', color: 'purple', collapsed: true } });
    assert.deepEqual(findGroup(state, 'g1'), { id: 'g1', name: 'أحاديث الصيام', color: 'purple', collapsed: true });
    assert.deepEqual([...awakeTabIds(state)].sort(), ['t3', 't4']);
    assert.deepEqual([...awakeTabIds(state, new Set(['t2']))].sort(), ['t2', 't3', 't4'], 'a playing tab stays awake');
  });

  it('collapsing the focused tab\'s group moves focus outside; focusing a hidden tab opens its group', () => {
    let state = tabsReducer(tabs(4), { type: 'group', ids: ['t3', 't4'], groupId: 'g1', name: 'A', color: 'blue' });
    assert.equal(state.activeId, 't4');
    state = tabsReducer(state, { type: 'updateGroup', groupId: 'g1', patch: { collapsed: true } });
    assert.equal(state.activeId, 't2');
    state = tabsReducer(state, { type: 'activate', id: 't3', now: 60 });
    assert.equal(findGroup(state, 'g1')!.collapsed, false);
  });

  it('groups survive save and restore; broken groups and links are dropped', () => {
    let state = tabsReducer(tabs(4), { type: 'group', ids: ['t1', 't2'], groupId: 'g1', name: 'Tafsir', color: 'yellow' });
    state = tabsReducer(state, { type: 'updateGroup', groupId: 'g1', patch: { collapsed: true } });
    assert.deepEqual(parseTabs(JSON.stringify(serializeTabs(state))), state);
    const raw = JSON.parse(JSON.stringify(serializeTabs(state)));
    raw.tabs[2].groupId = 'ghost';
    raw.groups.push({ id: 'g2', name: 'empty', color: 'red' }, { id: 7 }, { id: 'g1', name: 'dup' });
    const parsed = parseTabs(raw);
    assert.deepEqual(parsed.groups, state.groups);
    assert.equal(parsed.tabs[2].groupId, undefined);
  });

  it('a saved group whose tabs were split apart comes back whole', () => {
    const raw = JSON.parse(JSON.stringify(serializeTabs(tabs(4))));
    raw.tabs[0].groupId = 'g1';
    raw.tabs[2].groupId = 'g1';
    raw.groups = [{ id: 'g1', name: 'A', color: 'cyan', collapsed: false }];
    assert.deepEqual(order(parseTabs(raw)), ['t1@g1', 't3@g1', 't2', 't4']);
  });

  it('restoring with a focused tab in a collapsed group opens the group', () => {
    const raw = JSON.parse(JSON.stringify(serializeTabs(tabsReducer(tabs(3), { type: 'group', ids: ['t3'], groupId: 'g1', name: 'A', color: 'blue' }))));
    raw.groups[0].collapsed = true;
    assert.equal(findGroup(parseTabs(raw), 'g1')!.collapsed, false);
  });

  it('startup keeps the groups beside the new Home tab; a reopened tab does not bring back a dead group', () => {
    const state = tabsReducer(tabs(3), { type: 'group', ids: ['t1', 't2'], groupId: 'g1', name: 'A', color: 'blue' });
    const started = startupTabs(state, DEFAULT_WORKSPACE_PREFS, 'home', 100);
    assert.deepEqual(started.groups, state.groups);
    assert.equal(started.activeId, 'home');
    const closed = pushClosed([], state.tabs[0]);
    let gone = tabsReducer(state, { type: 'ungroup', groupId: 'g1' });
    gone = tabsReducer(gone, { type: 'close', id: 't1', homeId: 'h', now: 101 });
    const back = tabsReducer(gone, { type: 'reopen', tab: closed[0], id: 'r1', now: 102 });
    assert.equal(back.tabs.find(tab => tab.id === 'r1')!.groupId, undefined);
  });
});
