import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readerPanelReducer, READER_PANELS, type ReaderPanelState } from '../../src/renderer/components/reader/useReaderPanels';

test('reader panels are mutually exclusive across all tools and closing stale panels preserves the current panel', () => {
  let state: ReaderPanelState = { activePanel: null, tocPinned: false, knowledgePinned: false };
  state = readerPanelReducer(state, { type: 'pin', panel: 'toc', value: true });
  for (const panel of READER_PANELS) {
    state = readerPanelReducer(state, { type: 'set', panel, value: true });
    assert.equal(state.activePanel, panel);
    if (panel !== 'toc') assert.equal(state.tocPinned, false);
    if (panel !== 'knowledge') assert.equal(state.knowledgePinned, false);
  }
  state = readerPanelReducer(state, { type: 'set', panel: 'ai', value: false });
  assert.equal(state.activePanel, 'document');
  state = readerPanelReducer(state, { type: 'set', panel: 'document', value: previous => !previous });
  assert.equal(state.activePanel, null);
});
