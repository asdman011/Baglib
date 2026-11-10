import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import { Info } from 'lucide-react';
import { CONTEXT_ACTIONS, contextActions, type ContextSurface } from '../../src/renderer/components/actions/context-actions';

// KEY-308: actions without a mapped icon fell back to the placeholder Info icon.
test('every context-menu action on every surface has a real icon', () => {
  for (const surface of Object.keys(CONTEXT_ACTIONS) as ContextSurface[]) {
    const items = contextActions(surface, {}, key => key);
    for (const item of items) {
      const icon = item.icon as ReactElement;
      assert.ok(icon, `${surface}.${item.id} has no icon`);
      assert.notEqual(icon.type, Info, `${surface}.${item.id} still uses the placeholder icon`);
    }
  }
});
