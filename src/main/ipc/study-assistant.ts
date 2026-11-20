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
import { providerErrorCode, providerErrorDetail } from '../../shared/ai-errors';
import { isLocalAi, aiPrivacyError } from '../../shared/ai-consent';
import { applyHintsPrompt, moduleFromStudyTarget, resolveLearningMode } from '../../shared/ai-learning-mode';
import { runAssistantChat } from '../services/ai/assistant-chat';
import { assistantResponseSchema, assistantSystemPrompt, budgetSources, validateAssistantAnswer, validateAssistantRequest, type AssistantAnswer, type AssistantSource } from '../../shared/study-assistant';

import { translations } from '../../renderer/translations';

type Result<T> = { ok: true; data: T } | { ok: false; error: string; target?: string; detail?: string };
/** A known code stays as it is; a provider failure becomes provider-quota / -busy / -auth / -error with a short detail. */
const failure = (error: unknown, known: string[]) => {
  const message = (error as Error)?.message ?? String(error);
  if (known.includes(message)) return { error: message };
  if (/^provider-|Gemini|OpenAI|Claude|Ollama|HTTP \d{3}|fetch failed|aborted|no answer within|API key/i.test(message)) return { error: providerErrorCode(message), detail: providerErrorDetail(message) };
  return { error: 'engine-failed', detail: providerErrorDetail(message) };
};
const KNOWN = ['invalid-request', 'permission-denied', 'learning-mode-off', 'invalid-output', 'busy', 'no-sources', 'ai-disabled', 'warsh-not-installed', 'invalid-resource', 'ambiguous-alignment', 'missing-source', 'missing-page', 'no-text-layer'];

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

/** A local Ollama on this computer needs no transfer consent; any other provider or address does. */
export function isLocalProvider(settings: import('../../shared/ai-consent').ConsentSettings): boolean {
  return isLocalAi(settings);
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
    if(aiPrivacyError(settings, request.allowRemote))throw new Error('permission-denied');
    return AIProviderService.getInstance().generateChatCompletion({temperature:0,json:true,preventRedirect:!request.allowRemote,systemPrompt:explainPrompt(request.language),userPrompt:JSON.stringify({claims,sources:[source]})},settings);
  });
  ipcMain.handle('study-assistant:explain-back',async(event,input:unknown)=>{
    let owned=false;
    try {
      authorize(event);const request=validateExplainRequest(input);
      const settings=AIResearchService.getInstance().getSettings();
      if(!settings.enabled)throw new Error('ai-disabled');
      const learningMode=resolveLearningMode(settings,moduleFromStudyTarget(request.target)??'notes',{legacyMode:settingsRepository.get('ai.learningMode')});
      if(learningMode==='off')throw new Error('learning-mode-off');
      if(aiPrivacyError(settings, request.allowRemote))throw new Error('permission-denied');
      if(running)throw new Error('busy');running=true;owned=true;
      return {ok:true,data:await service().check(request)};
    } catch(error){return {ok:false,...failure(error,[...KNOWN,'passage-too-short','passage-too-long']),...(error instanceof AssistantBookError?{target:error.target}:{})};}
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
      const learningModule = request.module ?? moduleFromStudyTarget(request.readerSource?.target ?? request.passages[0]?.target) ?? 'notes';
      const learningMode = resolveLearningMode(settings, learningModule, {
        inRevisionOrTest: request.inRevisionOrTest,
        legacyMode: settingsRepository.get('ai.learningMode'),
      });
      if (learningMode === 'off') throw new Error('learning-mode-off');
      if (aiPrivacyError(settings, request.allowRemote)) throw new Error('permission-denied');
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
          schema: assistantResponseSchema(request.task),
          systemPrompt: applyHintsPrompt(assistantSystemPrompt(request.task, request.language), learningMode, { revealFullAnswer: request.revealFullAnswer }),
          userPrompt: JSON.stringify({
            question: request.question,
            ...(request.attempt ? { attempt: request.attempt } : {}),
            sources: fitted.sources.map(({ id, label, text }) => ({ id, label, text })),
          }),
        }, settings);
        return { ok: true, data: validateAssistantAnswer(output, fitted.sources, request.task, fitted.limited, request.language) };
      } finally { running = false; }
    } catch (error) {
      return { ok: false, ...failure(error, KNOWN), ...(error instanceof AssistantBookError ? { target: error.target } : {}) };
    }
  });

  // KEY-384: the app-wide assistant chat. Each attached source is read here from BagLib's own data.
  let chatting = false;
  ipcMain.handle('assistant:chat', async (event, input: unknown) => {
    try { authorize(event); } catch { return { ok: false, error: 'invalid-request' }; }
    if (chatting) return { ok: false, error: 'busy' };
    chatting = true;
    try {
      const db = getDatabase();
      return await runAssistantChat(input, {
        db,
        settings: AIResearchService.getInstance().getSettings(),
        legacyMode: settingsRepository.get('ai.learningMode'),
        complete: (prompt, settings) => AIProviderService.getInstance().generateChatCompletion(prompt, settings),
        resolve: async (target, label) => {
          if (target.startsWith('note:')) {
            const note = new StudyNotesService(settingsRepository, db).list(target.slice(5).split('#')[0])[0];
            return note ? [{ label: note.title || label, text: note.content }] : [];
          }
          if (target.startsWith('book:')) return (await readAssistantBookSources(target)).map(source => ({ label: source.label || label, text: source.text }));
          const quran = parseQuranTarget(target);
          if (quran) {
            const ayahs = await readAyahTexts(quran.surah, quran.from, quran.to, { profile: quran.profile });
            return ayahs.length ? [{ label, text: ayahs.map(ayah => `${ayah.text} (${ayah.number})`).join('\n') }] : [];
          }
          const sunnah = /^sunnah:([^:]+):(\d+):(.+)$/u.exec(target);
          const hadith = sunnah ? await readHadithText(sunnah[1], +sunnah[2], sunnah[3]).catch(() => null) : null;
          return hadith?.text ? [{ label, text: hadith.text }] : [];
        },
      });
    } finally { chatting = false; }
  });
}
