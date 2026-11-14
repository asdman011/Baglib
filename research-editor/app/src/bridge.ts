import { applyResearchEditorAppearance, type ResearchEditorBridge } from '../../../src/shared/research-editor';

export function parentBridge(): ResearchEditorBridge | undefined {
  if (window.parent === window) return undefined;
  // Same origin is enforced by the host's URL. Cross-origin access fails closed.
  return (window.parent as Window & { __baglibResearchEditorBridge?: ResearchEditorBridge }).__baglibResearchEditorBridge;
}
export const bridge = parentBridge();
if (bridge) {
  applyResearchEditorAppearance(document.documentElement, bridge.appearance());
  bridge.subscribeAppearance(value => applyResearchEditorAppearance(document.documentElement, value));
}
