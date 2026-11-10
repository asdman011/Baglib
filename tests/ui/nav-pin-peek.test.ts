import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NAV_PIN_STATE,
  toggleNavPinned,
  setNavPinned,
  openNavPeek,
  closeNavPeek,
  shouldKeepPeekOpen,
  evaluateNavShortcut,
  type NavPinState,
} from '../../src/renderer/components/layout/nav-pin-model';

describe('Navigation Rail Pin-and-Peek Model (KEY-310)', () => {
  it('initializes in pinned state with peek closed', () => {
    assert.strictEqual(INITIAL_NAV_PIN_STATE.isPinned, true);
    assert.strictEqual(INITIAL_NAV_PIN_STATE.isPeekOpen, false);
  });

  it('toggles between pinned and unpinned', () => {
    const s1 = toggleNavPinned(INITIAL_NAV_PIN_STATE);
    assert.strictEqual(s1.isPinned, false);
    assert.strictEqual(s1.isPeekOpen, false);

    const s2 = toggleNavPinned(s1);
    assert.strictEqual(s2.isPinned, true);
    assert.strictEqual(s2.isPeekOpen, false);
  });

  it('allows opening peek only when unpinned', () => {
    // When pinned: cannot open peek
    const pinnedState: NavPinState = { ...INITIAL_NAV_PIN_STATE, isPinned: true };
    const peekAttempt1 = openNavPeek(pinnedState);
    assert.strictEqual(peekAttempt1.isPeekOpen, false);

    // When unpinned: can open peek
    const unpinnedState: NavPinState = { ...INITIAL_NAV_PIN_STATE, isPinned: false };
    const peekAttempt2 = openNavPeek(unpinnedState);
    assert.strictEqual(peekAttempt2.isPeekOpen, true);
  });

  it('closes peek correctly and deactivates peek when pinned', () => {
    const openState: NavPinState = {
      ...INITIAL_NAV_PIN_STATE,
      isPinned: false,
      isPeekOpen: true,
    };
    const closed = closeNavPeek(openState);
    assert.strictEqual(closed.isPeekOpen, false);

    // If pinned while peek was open, peek is reset to false
    const pinned = setNavPinned(openState, true);
    assert.strictEqual(pinned.isPinned, true);
    assert.strictEqual(pinned.isPeekOpen, false);
  });

  it('determines whether peek should remain open based on hover targets', () => {
    const unpinned: NavPinState = { ...INITIAL_NAV_PIN_STATE, isPinned: false, isPeekOpen: true };

    assert.strictEqual(
      shouldKeepPeekOpen({ ...unpinned, isHoveringEdge: true }),
      true
    );
    assert.strictEqual(
      shouldKeepPeekOpen({ ...unpinned, isHoveringRail: true }),
      true
    );
    assert.strictEqual(
      shouldKeepPeekOpen({ ...unpinned, isHoveringButton: true }),
      true
    );
    assert.strictEqual(
      shouldKeepPeekOpen({
        ...unpinned,
        isHoveringEdge: false,
        isHoveringRail: false,
        isHoveringButton: false,
      }),
      false
    );
  });

  it('recognizes Ctrl+B and Cmd+B as togglePinned shortcut', () => {
    const state: NavPinState = { ...INITIAL_NAV_PIN_STATE };

    const ctrlB = evaluateNavShortcut({ key: 'b', ctrlKey: true }, state);
    assert.strictEqual(ctrlB.handled, true);
    assert.strictEqual(ctrlB.action, 'togglePinned');

    const cmdB = evaluateNavShortcut({ key: 'B', metaKey: true }, state);
    assert.strictEqual(cmdB.handled, true);
    assert.strictEqual(cmdB.action, 'togglePinned');

    // With shift or alt, does not trigger
    const shiftCtrlB = evaluateNavShortcut({ key: 'b', ctrlKey: true, shiftKey: true }, state);
    assert.strictEqual(shiftCtrlB.handled, false);
  });

  it('closes peek overlay on Escape when unpinned and open', () => {
    const openState: NavPinState = { ...INITIAL_NAV_PIN_STATE, isPinned: false, isPeekOpen: true };
    const escResult = evaluateNavShortcut({ key: 'Escape' }, openState);
    assert.strictEqual(escResult.handled, true);
    assert.strictEqual(escResult.action, 'closePeek');

    // When pinned, Escape does not close rail
    const pinnedState: NavPinState = { ...INITIAL_NAV_PIN_STATE, isPinned: true };
    const escPinnedResult = evaluateNavShortcut({ key: 'Escape' }, pinnedState);
    assert.strictEqual(escPinnedResult.handled, false);
  });

  it('handles Enter on focused menu button when unpinned to open peek', () => {
    const unpinned: NavPinState = { ...INITIAL_NAV_PIN_STATE, isPinned: false, isPeekOpen: false };
    const enterResult = evaluateNavShortcut(
      { key: 'Enter' },
      unpinned,
      { isMenuButtonFocused: true }
    );
    assert.strictEqual(enterResult.handled, true);
    assert.strictEqual(enterResult.action, 'openPeek');

    // If button is not focused, plain Enter does not trigger openPeek
    const unfocusedResult = evaluateNavShortcut({ key: 'Enter' }, unpinned);
    assert.strictEqual(unfocusedResult.handled, false);
  });
});
