import { ExplainBackService } from '../services/explain-back';
import { explainPrompt, validateExplainRequest, type ExplainAcceptance } from '../../shared/explain-back';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { settingsRepository } from '../database/repositories/settings.repository';
import { StudyNotesService } from '../services/study-notes';
import { AIResearchService } from '../services/ai/ai-research.service';
import { AIProviderService } from '../services/ai/ai-provider.service';
import { AssistantBookError, readAssistantBookSources } from '../services/assistant-book-sources';
import { bookPdfFile } from '../services/book-files';
import { readAyahTexts, readQuranSources } from './quran';
import { readHadithText } from './sunnah';
import { bookStudyTarget, parseQuranTarget } from '../../shared/study-notes';
import { assistantSystemPrompt, budgetSources, validateAssistantAnswer, validateAssistantRequest, type AssistantAnswer, type AssistantSource } from '../../shared/study-assistant';

import { translations } from '../../renderer/translations';

type Result<T> = { ok: true; data: T } | { ok: false; error: string; target?: string };
const KNOWN = ['invalid-request', 'permission-denied', 'invalid-output', 'busy', 'no-sources', 'ai-disabled', 'warsh-not-installed', 'invalid-resource', 'ambiguous-alignment', 'missing-source', 'missing-page', 'no-text-layer'];

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

/** A local Ollama on this computer needs no transfer consent; any other provider or address does. */
export function isLocalProvider(settings: { provider?: string; ollamaEndpoint?: string }): boolean {
  try {
    const url = new URL(settings.ollamaEndpoint || 'http://127.0.0.1:11434');
    return settings.provider === 'ollama' && ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function registerStudyAssistantIpc(): void {
  let running = false;
  const service = () => new ExplainBackService(getDatabase(), settingsRepository, async target => {
    if (target.startsWith('book:')) return readAssistantBookSources(target);
    const quran = parseQuranTarget(target);
    if (quran) {
      const ayahs = await readAyahTexts(quran.surah, quran.from, quran.to, {profile:quran.profile});
      if (ayahs.length !== quran.to-quran.from+1) throw new Error('missing-source');
      return [{id:'S1',label:target,target,text:ayahs.map(a=>a.text).join('\n')}];
    }
    const sunnah=/^sunnah:([^:]+):(\d+):(.+)$/u.exec(target);
    const hadith=sunnah?await readHadithText(sunnah[1],+sunnah[2],sunnah[3]):null;
    if(!hadith?.text)throw new Error('missing-source');
    return [{id:'S1',label:target,target,text:hadith.text}];
  }, async (request,claims,source) => {
    const settings=AIResearchService.getInstance().getSettings();
    if(!settings.enabled)throw new Error('ai-disabled');
    if(!isLocalProvider(settings)&&!request.allowRemote)throw new Error('permission-denied');
    return AIProviderService.getInstance().generateChatCompletion({temperature:0,preventRedirect:!request.allowRemote,systemPrompt:explainPrompt(request.language),userPrompt:JSON.stringify({claims,sources:[source]})},settings);
  });
  ipcMain.handle('study-assistant:explain-back',async(event,input:unknown)=>{
    let owned=false;
    try {
      authorize(event);const request=validateExplainRequest(input);
      const settings=AIResearchService.getInstance().getSettings();
      if(!settings.enabled)throw new Error('ai-disabled');
      if(!isLocalProvider(settings)&&!request.allowRemote)throw new Error('permission-denied');
      if(running)throw new Error('busy');running=true;owned=true;
      return {ok:true,data:await service().check(request)};
    } catch(error){const code=(error as Error).message;return {ok:false,error:[...KNOWN,'passage-too-short','passage-too-long'].includes(code)?code:'engine-failed',...(error instanceof AssistantBookError?{target:error.target}:{})};}
    finally {if(owned)running=false;}
  });
  ipcMain.handle('study-assistant:resume-explain-back',(event,id:unknown)=>{
    try{authorize(event);return {ok:true,data:service().resume(id)};}
    catch(error){const code=(error as Error).message;return {ok:false,error:['attempt-changed','invalid-request'].includes(code)?code:'engine-failed'};}
  });
  ipcMain.handle('study-assistant:accept-explain-back',(event,input:ExplainAcceptance)=>{
    try{authorize(event);return {ok:true,data:service().accept(input)};}
    catch(error){const code=(error as Error).message;return {ok:false,error:['attempt-changed','invalid-request'].includes(code)?code:'engine-failed'};}
  });
  ipcMain.handle('study-assistant:ask', async (event, input: unknown): Promise<Result<AssistantAnswer>> => {
    try {
      authorize(event);
      const request = validateAssistantRequest(input);
      const settings = AIResearchService.getInstance().getSettings();
      if (!settings.enabled) throw new Error('ai-disabled');
      if (!isLocalProvider(settings) && !request.allowRemote) throw new Error('permission-denied');
      if (running) throw new Error('busy');
      running = true;
      try {
        const sources: AssistantSource[] = [];
        const add = (label: string, target: string, text: string) => sources.push({ id: `S${sources.length + 1}`, label, target, text });
        const addBook = async (target: string, to?: number) => {
          for (const source of await readAssistantBookSources(target, to)) add(source.label, source.target, source.text);
        };
        if (request.readerSource) await addBook(request.readerSource.target);
        const notes = new StudyNotesService(settingsRepository, getDatabase()).list();
        for (const id of request.notes) {
          const note = notes.find(entry => entry.id === id);
          if (note) add(note.title || note.content.slice(0, 60), `note:${note.id}`, note.content);
        }
        for (const range of request.books) {
          const sourceId = range.sourceId ?? bookPdfFile(range.id)?.sourceId;
          if (!sourceId) throw new Error('missing-source');
          await addBook(bookStudyTarget({ id: range.id, sourceId }, range.from), range.to);
        }
        for (const passage of request.passages) {
          if (passage.target.startsWith('book:')) { await addBook(passage.target); continue; }
          // The text comes from the installed Quran and Sunnah data, never from the renderer.
          const quran = parseQuranTarget(passage.target);
          if (quran) {
            const ayahs = await readAyahTexts(quran.surah, quran.from, quran.to, { profile: quran.profile });
            if (ayahs.length) add(passage.label, passage.target, ayahs.map(ayah => `${ayah.text} (${ayah.number})`).join('\n'));
            for (const source of await readQuranSources({ ...quran, tafsir: passage.tafsir, translation: passage.translation })) {
              add(`${source.title} — ${source.surah}:${source.ayah} (${translations[request.language].assistantHafsNumbering})`, `quran:hafs:${source.surah}:${source.ayah}`, source.text);
            }
            continue;
          }
          const sunnah = /^sunnah:([^:]+):(\d+):(.+)$/u.exec(passage.target);
          const hadith = sunnah ? await readHadithText(sunnah[1], +sunnah[2], sunnah[3]).catch(() => null) : null;
          if (hadith?.text) add(passage.label, passage.target, hadith.text);
        }
        const fitted = budgetSources(sources);
        if (!fitted.sources.length) throw new Error('no-sources');
        const output = await AIProviderService.getInstance().generateChatCompletion({
          temperature: 0,
          preventRedirect: !request.allowRemote,
          systemPrompt: assistantSystemPrompt(request.task, request.language),
          userPrompt: JSON.stringify({ question: request.question, sources: fitted.sources.map(({ id, label, text }) => ({ id, label, text })) }),
        }, settings);
        return { ok: true, data: validateAssistantAnswer(output, fitted.sources, request.task, fitted.limited) };
      } finally { running = false; }
    } catch (error) {
      const code = (error as Error).message;
      return { ok: false, error: KNOWN.includes(code) ? code : 'engine-failed', ...(error instanceof AssistantBookError ? { target: error.target } : {}) };
    }
  });
}
