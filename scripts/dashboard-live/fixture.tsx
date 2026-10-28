import React, { useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { AppLayout } from '../../src/renderer/components/layout/AppLayout';
import type { ElectronAPI } from '../../src/preload';
import { openStudyNote } from '../../src/renderer/utils/study-navigation';

const testWindow = window as Window & {
  dashboardLive: { call<T = unknown>(action: string, input?: unknown): Promise<T>; onAlert: ElectronAPI['athan']['onAlert'] };
  livePlays: number; liveAudio?: HTMLMediaElement; liveErrors: string[];
};
const live = testWindow.dashboardLive;
const empty = async () => [];
const api = {
  getAllBooks: () => live.call('books'), getAllNotes: () => live.call('book-notes'),
  categories: { getTree: empty }, tags: { getAll: empty },
  settings: { get: (key: string) => live.call('get', key), set: (key: string, value: unknown) => live.call('set', { key, value }) },
  knowledge: { getAll: () => live.call('knowledge-list'), getByWork: (id: string) => live.call('knowledge-by-work', id), save: (input: unknown) => live.call('knowledge-save', input), delete: (id: string) => live.call('knowledge-delete', id) },
  studyNotes: { list: () => live.call('list'), save: (input: unknown) => live.call('save', input), remove: (id: string) => live.call('remove', id), onChanged: () => () => {} },
  statistics: { getStreakStats: async () => ({ currentStreakDays: 3 }), getDailyHeatmap: empty, getAllBookStats: empty, startSession: async () => {}, endSession: async () => {}, turnPage: async () => {}, heartbeat: async () => {} },
  athan: { getState: () => live.call('athan'), onStateChanged: () => () => {}, onAlert: live.onAlert, triggerTestAlert: () => live.call('alert'), toggleMiniWidget: async () => ({ open: true }) },
  quran: { readerCatalog: async () => ({ ok: true, data: { sources: [{ id: 'script-test', title: 'Hafs', kind: 'script', profile: 'hafs' }], presets: [] } }), khatmahList: async () => ({ ok: true, data: { plans: [], notificationsSupported: false } }), onChanged: () => () => {}, searchAyahs: async () => ({ ok: true, data: [{ surah: 2, ayah: 255, text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ' }] }) },
  sunnah: { catalog: async () => ({ ok: true, data: { collections: [{ id: 'Bukhari', chapters: [{ number: 1 }] }] } }), chapter: async () => ({ ok: true, data: { hadiths: [{ id: 'Bukhari:1:1', number: '1', text: { ar: { full: 'إنما الأعمال بالنيات', matn: 'إنما الأعمال بالنيات' }, en: { full: 'Actions are by intentions' } } }] } }) },
};
Object.assign(window, { electronAPI: api as unknown as ElectronAPI, liveErrors: [], livePlays: 0 });
const stableCaptureStyle = document.createElement('style');
stableCaptureStyle.textContent = '* { transition: none !important; animation: none !important; }';
document.head.append(stableCaptureStyle);
const play = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function() { testWindow.livePlays++; testWindow.liveAudio = this; return play.call(this); };
function Probe() {
  const workspace = useWorkspace();
  useEffect(() => { Object.assign(window, { dashboardTest: { workspace, capture: openStudyNote } }); }, [workspace]);
  return null;
}
hydrateRoot(document.getElementById('root')!, <WorkspaceProvider><AppLayout /><Probe /></WorkspaceProvider>, { onRecoverableError: error => { testWindow.liveErrors.push(String(error)); } });
