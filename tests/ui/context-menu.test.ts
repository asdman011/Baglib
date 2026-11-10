import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { ContextMenu } from '../../src/renderer/components/ui/ContextMenu';
import { Menu } from '../../src/renderer/components/ui/Menu';
import { isTextEntry } from '../../src/renderer/components/actions/context-actions';
import { addPassageToSrs } from '../../src/renderer/components/actions/passage-actions';
import { parseHighlightLocation } from '../../src/renderer/components/reader/PdfNativeViewer';

test('saved PDF shapes retain their page for the mark context target', () => {
    assert.deepEqual(parseHighlightLocation(JSON.stringify({ page: 200, shape: 'pin', box: { x: 45, y: 30, width: 2, height: 2 } })), { page: 200, rects: [] });
    assert.deepEqual(parseHighlightLocation('7'), { page: 7, rects: [] });
});
function setup() {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    window.HTMLElement.prototype.focus = function () { window.document.activeElement = this; };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 20, y: 40, left: 20, right: 280, top: 40, bottom: 200, width: 260, height: 160, toJSON() { } });
    Object.assign(window, { innerWidth: 480, innerHeight: 900 });
    for (const [key, value] of Object.entries({ window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true }))
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [] } });
    const root = createRoot(window.document.getElementById('root')!);
    const event = (type: string, fields: Record<string, unknown> = {}) => Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), fields);
    return { window, root, event };
}
test('context menu binds only on opening, portals outside clipped surface, navigates and restores focus', async () => {
    const { window, root, event } = setup();
    let bindings = 0, actions = 0;
    await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(ContextMenu, { id: 'surface', onOpenMenu: () => { bindings++; return [{ id: 'copy', label: 'Copy', onClick: () => { actions++; } }, { id: 'disabled', label: 'Unavailable', disabled: true, disabledReason: 'No source' }]; } }, 'العِلْم Knowledge'))));
    assert.equal(bindings, 0);
    const surface = window.document.getElementById('surface')!;
    await act(async () => surface.dispatchEvent(event('contextmenu', { clientX: 478, clientY: 898 })));
    const menu = window.document.querySelector('[role=menu]')!;
    assert.equal(menu.parentElement, window.document.body);
    assert.equal(surface.querySelector('[role=menu]'), null);
    assert.equal(bindings, 1);
    assert.equal(actions, 0);
    assert.ok(menu.querySelector('[aria-disabled=true]')?.textContent?.includes('No source'));
    await act(async () => window.dispatchEvent(event('keydown', { key: 'Enter' })));
    assert.equal(actions, 1);
    assert.equal(window.document.activeElement, surface);
    await act(async () => root.unmount());
});
test('Shift F10 and Menu key open a surface, text entries retain their native menu', async () => {
    const { window, root, event } = setup();
    await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(ContextMenu, { id: 'surface', items: [{ label: 'Open' }] }, createElement('input', { id: 'input' })))));
    const surface = window.document.getElementById('surface')!;
    for (const fields of [{ key: 'F10', shiftKey: true }, { key: 'ContextMenu' }]) {
        await act(async () => surface.dispatchEvent(event('keydown', fields)));
        assert.ok(window.document.querySelector('[role=menu]'));
        await act(async () => window.dispatchEvent(event('keydown', { key: 'Escape' })));
    }
    const native = event('contextmenu', { clientX: 10, clientY: 10 });
    await act(async () => window.document.getElementById('input')!.dispatchEvent(native));
    assert.equal(native.defaultPrevented, false);
    assert.equal(window.document.querySelector('[role=menu]'), null);
    assert.equal(isTextEntry({ isContentEditable: true }), true);
    assert.equal(isTextEntry({ closest: () => ({}) }), true);
    await act(async () => root.unmount());
});
test('RTL submenu opens and nested actions close the whole menu', async () => {
    const { window, root, event } = setup();
    let selected = false;
    await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(Menu, { portal: true, anchor: { x: 460, y: 40 }, items: [{ label: 'Colours', children: [{ label: 'Amber', onClick: () => { selected = true; } }] }] }))));
    await act(async () => window.dispatchEvent(event('keydown', { key: 'ArrowLeft' })));
    assert.equal(window.document.querySelectorAll('[role=menu]').length, 2);
    const child = window.document.querySelectorAll('[role=menu]')[1];
    await act(async () => child.querySelector('button')!.click());
    assert.equal(selected, true);
    await act(async () => root.unmount());
});
test('SRS scheduling failure preserves the saved card for an idempotent retry', async () => {
    const { window, root } = setup();
    const calls: string[] = [];
    const input = { text: 'العِلْم Knowledge', sourceKind: 'poetry' as const, sourceRef: 'poetry:ashaar:1:0:1', sourceLabel: 'Poem', language: 'ar' };
    Object.assign(window.electronAPI, { knowledgeCards: { save: async (payload: {
                back: string;
            }) => { assert.equal(payload.back, input.text); calls.push('save'); return { id: 'card' }; }, setMemorizing: async () => { calls.push('schedule'); throw Error('failed'); }, remove: async () => { calls.push('rollback'); } } });
    await assert.rejects(addPassageToSrs(input));
    assert.deepEqual(calls, ['save', 'schedule']);
    await act(async () => root.unmount());
});

test('a long press does not consume a later normal activation, and movement cancels opening', async () => {
    const { window, root, event } = setup();
    let clicks = 0;
    await act(async () => root.render(createElement(WorkspaceProvider, null,
        createElement(ContextMenu, { id: 'touch', items: [{ label: 'Open' }] },
            createElement('button', { id: 'next', onClick: () => { clicks++; } }, 'More')))));
    const surface = window.document.getElementById('touch')!;
    await act(async () => {
        surface.dispatchEvent(event('pointerdown', { pointerType: 'touch', clientX: 20, clientY: 40 }));
        surface.dispatchEvent(event('pointermove', { pointerType: 'mouse', clientX: 90, clientY: 90 }));
        await new Promise(resolve => setTimeout(resolve, 600));
    });
    assert.ok(window.document.querySelector('[role=menu]'));
    await act(async () => {
        surface.dispatchEvent(event('pointerup', { pointerType: 'touch' }));
        const touchClick = event('click', { pointerType: 'touch' });
        window.document.getElementById('next')!.dispatchEvent(touchClick);
        assert.equal(touchClick.defaultPrevented, true);
        // LinkeDOM runs capture listeners after the target listener. Electron checks real capture ordering.
        clicks = 0;
        window.dispatchEvent(event('keydown', { key: 'Escape' }));
        window.document.getElementById('next')!.click();
    });
    assert.equal(clicks, 1);
    await act(async () => {
        surface.dispatchEvent(event('pointerdown', { pointerType: 'touch', clientX: 20, clientY: 40 }));
        surface.dispatchEvent(event('pointermove', { pointerType: 'touch', clientX: 60, clientY: 40 }));
        await new Promise(resolve => setTimeout(resolve, 600));
        surface.dispatchEvent(event('pointerup', { pointerType: 'touch' }));
    });
    assert.equal(window.document.querySelector('[role=menu]'), null);
    await act(async () => root.unmount());
});

test('the extended library action list binds callbacks without running them or changing the title', async () => {
    const { getCardActions } = await import('../../src/renderer/components/library/library-card-actions');
    const book = { id: 'menu-book', title: 'العِلْم Knowledge', author: 'Author', bookType: 'physical' as const, categories: [], tags: [], lendingHistory: [] };
    const calls: string[] = [];
    const items = getCardActions(book, {
        onRead: () => {}, onOpenDetails: () => {},
        onAction: id => { calls.push(id); },
    }, key => key);
    assert.deepEqual(calls, []);
    for (const id of ['read', 'last', 'details', 'metadata', 'category', 'tags', 'physical', 'wishlist', 'duplicates', 'folder', 'export']) {
        assert.ok(items.some(item => item.id === id), id);
    }
    assert.ok(items.find(item => item.id === 'folder')!.disabledReason);
    await items.find(item => item.id === 'metadata')!.onSelect();
    assert.deepEqual(calls, ['metadata']);
    assert.equal(book.title, 'العِلْم Knowledge');
});
