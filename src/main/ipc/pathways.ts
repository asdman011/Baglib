import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { getDatabase } from '../database/connection';
import { PathwayService } from '../services/pathways';
import { StudyPrerequisitesService } from '../services/study-prerequisites.service';
import { CurriculumExamService } from '../services/curriculum-exam.service';
import { AIResearchService } from '../services/ai/ai-research.service';
import { AIProviderService } from '../services/ai/ai-provider.service';
import { buildCurriculumDraftPrompt } from '../../shared/utils/ai-prompts';
import { parseOutline, pathwayId, validateItem, validatePathway, validateTemplate, type ReferenceFormat } from '../../shared/pathways';

const service = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
  return new PathwayService(getDatabase());
};
const prereqService = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
  return new StudyPrerequisitesService(getDatabase());
};
const examService = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
  return new CurriculumExamService(getDatabase());
};
const shortText = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid-request');
  return value.trim();
};

export function registerPathwayIpc(): void {
  ipcMain.handle('pathways:list', event => service(event).list());
  ipcMain.handle('pathways:get', (event, id: unknown) => service(event).get(pathwayId(id)));
  ipcMain.handle('pathways:save', (event, input: unknown) => service(event).save(validatePathway(input)));
  ipcMain.handle('pathways:remove', (event, id: unknown) => service(event).remove(pathwayId(id)));
  ipcMain.handle('pathways:add-item', (event, input: unknown) => service(event).addItem(validateItem(input)));
  ipcMain.handle('pathways:add-step', (event, id: unknown, section: unknown, title: unknown) => service(event).addStep(pathwayId(id), typeof section === 'string' ? section.trim().slice(0, 200) : '', shortText(title, 300)));
  ipcMain.handle('pathways:remove-item', (event, id: unknown) => service(event).removeItem(pathwayId(id)));
  ipcMain.handle('pathways:set-pinned', (event, id: unknown, pinned: unknown) => service(event).setPinned(pathwayId(id), pinned === true));
  ipcMain.handle('pathways:set-done', (event, id: unknown, done: unknown) => service(event).setDone(pathwayId(id), done === true));
  ipcMain.handle('pathways:reorder', (event, id: unknown, ids: unknown) => {
    if (!Array.isArray(ids)) throw new Error('invalid-request');
    service(event).reorder(pathwayId(id), ids.map(pathwayId));
  });
  ipcMain.handle('pathways:export', async (event, id: unknown, format: unknown) => {
    if (format !== 'bibtex' && format !== 'markdown') throw new Error('invalid-request');
    const { name, text } = service(event).exportText(pathwayId(id), format as ReferenceFormat);
    const extension = format === 'bibtex' ? 'bib' : 'md';
    const options = { defaultPath: `${name.replace(/[\\/:*?"<>|]/gu, ' ').trim() || 'references'}.${extension}`, filters: [{ name: format === 'bibtex' ? 'BibTeX' : 'Markdown', extensions: [extension] }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options));
    if (choice.canceled || !choice.filePath) return false;
    await writeFile(choice.filePath, text, 'utf8');
    return true;
  });
  ipcMain.handle('pathways:templates', event => service(event).templates());
  ipcMain.handle('pathways:save-template', (event, input: unknown) => service(event).saveTemplate(validateTemplate(input)));
  ipcMain.handle('pathways:remove-template', (event, id: unknown) => service(event).removeTemplate(pathwayId(id)));
  ipcMain.handle('pathways:draft', async (event, subject: unknown, language: unknown) => {
    service(event);
    const settings = new AIResearchService(getDatabase()).getSettings();
    if (!settings.enabled) throw new Error('ai-unavailable');
    const outline = await AIProviderService.getInstance().generateChatCompletion(buildCurriculumDraftPrompt(shortText(subject, 300), language === 'ar' ? 'ar' : 'en'), settings);
    const text = outline.replace(/```[a-z]*\s*/giu, '').trim();
    if (!parseOutline(text).length) throw new Error('ai-unavailable');
    return text;
  });
  ipcMain.handle('pathways:get-prerequisites', (event, id: unknown) =>
    prereqService(event).getPrerequisites(pathwayId(id))
  );
  ipcMain.handle('pathways:save-prerequisites', (event, id: unknown, map: unknown) =>
    prereqService(event).savePrerequisites(pathwayId(id), map)
  );
  ipcMain.handle(
    'pathways:rename-section',
    (event, id: unknown, oldSection: unknown, newSection: unknown) =>
      prereqService(event).renameSection(pathwayId(id), String(oldSection), String(newSection))
  );
  ipcMain.handle('pathways:delete-section', (event, id: unknown, section: unknown) =>
    prereqService(event).deleteSection(pathwayId(id), String(section))
  );
  ipcMain.handle('pathways:get-prerequisite-hints', (event) =>
    prereqService(event).getPrerequisiteHints()
  );
  ipcMain.handle(
    'pathways:dismiss-prerequisite-hint',
    (
      event,
      id: unknown,
      failingSection: unknown,
      weakestPrerequisite: unknown,
      currentFailureCount: unknown
    ) =>
      prereqService(event).dismissHint(
        pathwayId(id),
        String(failingSection),
        String(weakestPrerequisite),
        Number(currentFailureCount) || 0
      )
  );
  ipcMain.handle('pathways:get-exam-config', (event, id: unknown) =>
    examService(event).getExamConfig(pathwayId(id))
  );
  ipcMain.handle('pathways:save-exam-config', (event, config: unknown) =>
    examService(event).saveExamConfig(config)
  );
  ipcMain.handle('pathways:get-replan-preview', (event, id: unknown, lang: unknown) =>
    examService(event).getReplanPreview(pathwayId(id), lang === 'ar' ? 'ar' : 'en')
  );
  ipcMain.handle('pathways:apply-replan', (event, id: unknown, schedule: unknown) =>
    examService(event).applyReplan(pathwayId(id), schedule as { taskId: string; date: string }[])
  );
}
