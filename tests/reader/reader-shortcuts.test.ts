import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readerShortcut } from '../../src/renderer/libs/reader/reader-shortcuts';

describe('reader single-key shortcuts', () => {
  it('toggles the highlighter with h in either case', () => {
    assert.deepEqual(readerShortcut({ key: 'h' }, false), { kind: 'toggle-highlighter' });
    assert.deepEqual(readerShortcut({ key: 'H' }, true), { kind: 'toggle-highlighter' });
  });

  it('maps Latin and Arabic-Indic digits 1-5 to the highlight colours', () => {
    assert.deepEqual(readerShortcut({ key: '1' }, false), { kind: 'color', color: 'amber' });
    assert.deepEqual(readerShortcut({ key: '5' }, false), { kind: 'color', color: 'violet' });
    assert.deepEqual(readerShortcut({ key: '٣' }, false), { kind: 'color', color: 'rose' });
    assert.equal(readerShortcut({ key: '0' }, false), null);
    assert.equal(readerShortcut({ key: '6' }, false), null);
  });

  it('stops the highlighter with Escape only while it is on', () => {
    assert.deepEqual(readerShortcut({ key: 'Escape' }, true), { kind: 'stop-highlighter' });
    assert.equal(readerShortcut({ key: 'Escape' }, false), null);
  });

  it('opens the sheet with ?', () => {
    assert.deepEqual(readerShortcut({ key: '?' }, false), { kind: 'shortcuts' });
  });

  it('ignores modified keys and typing in fields, editors and dialogs', () => {
    assert.equal(readerShortcut({ key: 'h', ctrlKey: true }, false), null);
    assert.equal(readerShortcut({ key: '1', altKey: true }, false), null);
    assert.equal(readerShortcut({ key: 'h', target: { tagName: 'input' } }, false), null);
    assert.equal(readerShortcut({ key: 'h', target: { tagName: 'TEXTAREA' } }, false), null);
    assert.equal(readerShortcut({ key: 'h', target: { tagName: 'DIV', isContentEditable: true } }, false), null);
    assert.equal(readerShortcut({ key: 'h', target: { tagName: 'BUTTON', closest: (s: string) => s.includes('dialog') ? {} : null } }, false), null);
    assert.equal(readerShortcut({ key: 'x' }, false), null);
  });
});
