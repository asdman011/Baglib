/**
 * KEY-437 (AI Task 3, epic KEY-434): IPC handlers for "Explain it back".
 * Kept in a new file separate from ai.ts and study-assistant.ts.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { settingsRepository } from '../database/repositories/settings.repository';
import { AIResearchService } from '../services/ai/ai-research.service';
import { AIProviderService } from '../services/ai/ai-provider.service';
import { ExplainBackCheckService } from '../services/ai/explain-back.service';
import { readAssistantBookSources } from '../services/assistant-book-sources';
import { readAyahTexts, readQuranCatalog, readQuranSources } from './quran';
import { readHadithWithSharh } from './sunnah';
import { translations } from '../../renderer/translations';
import type { ExplainBackSaveNoteRequest, ExplainBackSourceItem } from '../../shared/ai-explain-back';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (
    url.username ||
    url.password ||
    !(
      (url.protocol === 'app:' && url.hostname === '-') ||
      (url.protocol === 'file:' && !url.hostname) ||
      url.origin === 'http://localhost:3000'
    )
  ) {
    throw new Error('invalid-request');
  }
};

export function registerExplainBackIpc(): void {
  let running = false;

  const createService = () =>
    new ExplainBackCheckService({
      db: getDatabase(),
      settingsRepo: settingsRepository,
      getAiSettings: () => AIResearchService.getInstance().getSettings(),
      complete: (request, settings) => AIProviderService.getInstance().generateChatCompletion(request, settings),
      readBookSources: async target => {
        const items = await readAssistantBookSources(target);
        return items.map((item, idx) => ({
          id: `S${idx + 1}`,
          kind: 'source' as const,
          title: item.label,
          ref: item.target,
          text: item.text,
        }));
      },
      readAyahWithTafsir: async (surah, ayah, profile) => {
        const out: ExplainBackSourceItem[] = [];
        const ayahs = await readAyahTexts(surah, ayah, ayah, { profile });
        if (ayahs.length) {
          out.push({
            id: `S${out.length + 1}`,
            kind: 'source',
            title: `${surah}:${ayah}`,
            ref: `quran:${profile}:${surah}:${ayah}`,
            text: ayahs.map(a => a.text).join('\n'),
          });
        }
        const catalog = await readQuranCatalog().catch(() => null);
        const tafsirs = (catalog?.sources ?? [])
          .filter(source => source.kind === 'tafsir')
          .slice(0, 2);
        for (const tafsir of tafsirs) {
          const sources = await readQuranSources({
            profile: 'hafs',
            surah,
            from: ayah,
            to: ayah,
            tafsir: tafsir.id,
          }).catch(() => []);
          for (const source of sources) {
            if (source.text.trim()) {
              out.push({
                id: `S${out.length + 1}`,
                kind: 'tafsir',
                title: source.title || tafsir.title,
                ref: tafsir.id,
                text: source.text,
              });
            }
          }
        }
        return out;
      },
      readHadithWithSharh: async (collection, chapter, id) => {
        const out: ExplainBackSourceItem[] = [];
        const hadith = await readHadithWithSharh(collection, chapter, id);
        if (!hadith?.text) return out;
        out.push({
          id: `S${out.length + 1}`,
          kind: 'source',
          title: `${collection} ${hadith.number}`.trim(),
          ref: `sunnah:${collection}:${chapter}:${id}`,
          text: hadith.text,
        });
        if (hadith.commentary?.text) {
          out.push({
            id: `S${out.length + 1}`,
            kind: 'sharh',
            title: hadith.commentary.title || 'Sharh',
            ref: hadith.commentary.reference,
            text: hadith.commentary.text,
          });
        }
        return out;
      },
    });

  ipcMain.handle('explain-back:evaluate', async (event, input: unknown) => {
    let owned = false;
    try {
      authorize(event);
      if (running) return { ok: false, error: 'busy' as const };
      running = true;
      owned = true;
      return await createService().evaluate(input);
    } catch {
      return { ok: false, error: 'invalid-request' as const };
    } finally {
      if (owned) running = false;
    }
  });

  ipcMain.handle('explain-back:save-note', async (event, input: ExplainBackSaveNoteRequest) => {
    try {
      authorize(event);
      const lang = input?.language === 'en' ? 'en' : 'ar';
      const t = translations[lang];
      const note = createService().saveNote(input, {
        titlePrefix: t.explainBackNoteTitlePrefix,
        userSection: t.explainBackUserSectionLabel,
        aiSection: t.explainBackAiSectionLabel,
        rightHeading: t.explainBackRightHeading,
        missingHeading: t.explainBackMissingHeading,
        followUpHeading: t.explainBackFollowUpHeading,
        uncertaintyHeading: t.explainBackUncertaintyHeading,
        noneRecorded: t.explainBackNoneRecorded,
      });
      return { ok: true as const, data: note };
    } catch {
      return { ok: false as const, error: 'invalid-request' as const };
    }
  });
}
