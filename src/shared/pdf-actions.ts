import { validatePdfJob } from './types/pdf-editor';

export const PDF_ACTIONS_KEY = 'pdf.actions.v1';
export const ACTION_TOOLS = ['compress', 'page-numbers', 'watermark', 'ocr', 'repair-metadata'] as const;
export type ActionTool = typeof ACTION_TOOLS[number];
export interface PdfAction { id: string; name: string; steps: { tool: ActionTool; options: Record<string, unknown> }[] }
const OPTION_KEYS: Record<ActionTool, readonly string[]> = {
  compress: ['optimizeLevel', 'expectedOutputSize'],
  'page-numbers': ['pageNumberStyle', 'position', 'startingNumber', 'margin', 'pagesToNumber'],
  watermark: ['text', 'fontSize', 'opacity', 'rotation'],
  ocr: ['languages', 'deskew'],
  'repair-metadata': [],
};
/** Only bounded options of existing single-PDF tools can cross the main-process boundary. */
export function validatePdfAction(input: unknown): PdfAction {
  const value = input as PdfAction | null;
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !/^[\w-]{1,100}$/u.test(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120 || !Array.isArray(value.steps) || value.steps.length < 2 || value.steps.length > 12) throw new Error('invalid-request');
  const steps = value.steps.map(step => {
    if (!step || !ACTION_TOOLS.includes(step.tool) || !step.options || typeof step.options !== 'object' || Array.isArray(step.options) || Object.keys(step.options).some(key => !OPTION_KEYS[step.tool].includes(key))) throw new Error('invalid-request');
    if (Object.values(step.options).some(option => !['string', 'number', 'boolean'].includes(typeof option) || typeof option === 'string' && option.length > 4000)) throw new Error('invalid-request');
    validatePdfJob({ sessionId: 'action-validation', operation: step.tool, language: 'en', payload: step.options });
    if (step.tool === 'compress' && step.options.optimizeLevel !== undefined && ![1, 2, 3, 4, 5].includes(Number(step.options.optimizeLevel))) throw new Error('invalid-request');
    if (step.tool === 'ocr' && step.options.languages !== undefined && !/^(ara|eng)([+,](ara|eng))*$/u.test(String(step.options.languages))) throw new Error('invalid-request');
    return { tool: step.tool, options: structuredClone(step.options) };
  });
  return { id: value.id, name: value.name.trim(), steps };
}
