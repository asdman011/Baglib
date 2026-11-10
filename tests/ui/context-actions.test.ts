import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextActions, CONTEXT_ACTIONS, menuPosition } from '../../src/renderer/components/actions/context-actions';
import { SHORTCUTS, shortcutForEvent, shortcutCollisions } from '../../src/renderer/components/actions/shortcuts';
import { translations } from '../../src/renderer/translations';
test('each required surface declares unique translated actions in both languages', () => {
    for (const [surface, definitions] of Object.entries(CONTEXT_ACTIONS)) {
        assert.ok(definitions.length, surface);
        assert.equal(new Set(definitions.map(a => a.id)).size, definitions.length, surface);
        for (const action of definitions)
            for (const lang of ['ar', 'en'] as const)
                assert.ok(translations[lang][action.labelKey]);
    }
});
test('registry binds only the matching flow and unavailable actions expose a reason', () => {
    const called: string[] = [];
    const items = contextActions('hadith', { copy: () => called.push('copy') }, key => translations.en[key]);
    items.find(a => a.id === 'copy')!.onClick!();
    assert.deepEqual(called, ['copy']);
    assert.ok(items.find(a => a.id === 'srs')!.disabledReason);
});
test('menu placement clamps all edges in LTR and RTL including narrow windows', () => {
    for (const dir of ['ltr', 'rtl'] as const) {
        const p = menuPosition({ x: 478, y: 898 }, { width: 260, height: 400 }, { width: 480, height: 900 }, dir);
        assert.ok(p.left >= 8 && p.left + 260 <= 472);
        assert.ok(p.top >= 8 && p.top + 400 <= 892);
    }
});
test('shortcut registry has no collisions within overlapping scopes', () => {
    assert.deepEqual(shortcutCollisions(SHORTCUTS), []);
});
test('shortcuts are scoped and suppressed while typing, composing or repeating', () => {
    const event = { key: 'h', code: 'KeyH', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    assert.equal(shortcutForEvent(event, 'reader')?.id, 'reader-highlight');
    assert.equal(shortcutForEvent(event, 'library'), null);
    assert.equal(shortcutForEvent({ ...event, typing: true }, 'reader'), null);
    assert.equal(shortcutForEvent({ ...event, isComposing: true }, 'reader'), null);
    assert.equal(shortcutForEvent({ ...event, repeat: true }, 'reader'), null);
    assert.equal(shortcutForEvent({ ...event, key: 'ن', code: 'KeyH' }, 'reader')?.id, 'reader-highlight');
    assert.equal(shortcutForEvent({ ...event, key: 'ؤ', code: 'KeyC' }, 'poetry-line')?.id, 'poetry-copy');
});
