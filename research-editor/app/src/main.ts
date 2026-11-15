import { MarkdownAdapter, HtmlAdapter } from '@blocksuite/affine/shared/adapters';
import { sourceSchemas, sourceStoreExtensions, sourceViewExtensions } from './blocks';
import { canvasExtensions, arrangeSourcesOnCanvas, undoArrangeSources, insertResearchKanban, fitEdgelessScreen } from './canvas';
import { apparatusSchemas, apparatusStoreExtensions, apparatusViewExtensions, loadApparatus, standaloneApparatus, refreshApparatus, prepareApparatusExport, flushApparatusSettings } from './apparatus';
// BagLib research editor entry (KEY-362).
//
// Mounts AFFiNE's BlockSuite editor (page and edgeless views of one document) fully offline.
// The same-origin host supplies persistence, appearance and filesystem-backed blobs (KEY-363).
import { bridge } from './bridge';
import { BaglibBlobSource } from './blob-source';
import './style.css';
import './host-style.css';
import type { ManuscriptDocument } from '../../../src/shared/manuscripts';

import type { DocMode } from '@blocksuite/affine/model';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import {
  DocModeProvider,
  EditorSettingExtension,
  type EditorSetting,
  FeatureFlagService,
  FontConfigExtension,
  GeneralSettingSchema,
  ParseDocUrlExtension,
} from '@blocksuite/affine/shared/services';
import {
  type ExtensionType,
  nanoid,
  Schema,
  type Store,
  Text,
  Transformer,
} from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { MemoryBlobSource } from '@blocksuite/affine/sync';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { effects as editorEffects } from '@blocksuite/integration-test/effects';
import { getTestStoreManager } from '@blocksuite/integration-test/store';
import { getTestViewManager } from '@blocksuite/integration-test/view';
import { Signal } from '@preact/signals-core';
import { Subject } from 'rxjs';

import { BaglibCanvasTextFonts } from './fonts';

editorEffects();

const viewManager = getTestViewManager();
const storeManager = getTestStoreManager();

function applyLanguageFromQuery() {
  // Until the RE-2 host writes lang/dir itself, ?lang=ar lets the smoke test check RTL.
  const lang = new URLSearchParams(location.search).get('lang');
  if (lang === 'ar' || lang === 'en') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

const blobs = bridge ? new BaglibBlobSource(bridge.blobs) : undefined;

function createWorkspace() {
  const workspace = new TestWorkspace({
    id: 'baglib-research',
    idGenerator: nanoid,
    // Standalone smoke tests use memory. Hosted documents use the parent filesystem bridge.
    blobSources: { main: blobs ?? new MemoryBlobSource() },
  });
  workspace.storeExtensions = [...storeManager.get('store'), ...sourceStoreExtensions(), ...apparatusStoreExtensions()];
  workspace.start();
  workspace.meta.initialize();
  return workspace;
}

function createEmptyDoc(workspace: TestWorkspace, id: string): Store {
  const doc = workspace.createDoc(id);
  const store = doc.getStore({ id });
  doc.load(() => {
    const rootId = store.addBlock('affine:page', { title: new Text() });
    store.addBlock('affine:surface', {}, rootId);
    const noteId = store.addBlock('affine:note', {}, rootId);
    store.addBlock('affine:paragraph', {}, noteId);
  });
  store.resetHistory();
  return store;
}

function editorSettings() {
  const initial = Object.entries(GeneralSettingSchema.shape).reduce((acc, [key, schema]) => {
    (acc as Record<string, unknown>)[key] = schema.parse(undefined);
    return acc;
  }, {} as EditorSetting);
  return new Signal<EditorSetting>(initial);
}

function docModeProvider(editor: TestAffineEditorContainer): DocModeProvider {
  const primary = new Map<string, DocMode>();
  const changes = new Map<string, Subject<DocMode>>();
  const provider: DocModeProvider = {
    getPrimaryMode: docId => primary.get(docId) ?? 'page',
    setPrimaryMode: (mode, docId) => {
      primary.set(docId, mode);
      changes.get(docId)?.next(mode);
    },
    togglePrimaryMode: docId => {
      const mode = provider.getPrimaryMode(docId) === 'page' ? 'edgeless' : 'page';
      provider.setPrimaryMode(mode, docId);
      return mode;
    },
    onPrimaryModeChange: (handler, docId) => {
      if (!changes.has(docId)) changes.set(docId, new Subject());
      return changes.get(docId)!.subscribe(handler);
    },
    getEditorMode: () => editor.mode,
    setEditorMode: mode => editor.switchEditor(mode),
  };
  return provider;
}

async function mount() {
  if (!bridge) applyLanguageFromQuery();
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  let workspace = createWorkspace();
  const store = createEmptyDoc(workspace, 'doc:home');
  store.get(FeatureFlagService).setFlag('enable_advanced_block_visibility', true);

  const editor = document.createElement('affine-editor-container') as TestAffineEditorContainer;
  editor.autofocus = true;
  editor.doc = store;

  const common: ExtensionType[] = [
    ...sourceViewExtensions(),
    ...canvasExtensions(),
    ...apparatusViewExtensions(),
    FontConfigExtension(BaglibCanvasTextFonts),
    EditorSettingExtension({ setting$: editorSettings() }),
    ParseDocUrlExtension({ parseDocUrl: () => undefined }),
    { setup: di => di.override(DocModeProvider, docModeProvider(editor)) },
  ];

  editor.pageSpecs = [...viewManager.get('page'), ...common];
  editor.edgelessSpecs = [...viewManager.get('edgeless'), ...common];

  app.append(document.createElement('baglib-scholarly-toolbar'), editor, document.createElement('baglib-footnote-list'));
  await editor.updateComplete;
  standaloneApparatus(store);
  const stopApparatusAppearance = bridge?.subscribeAppearance(refreshApparatus);

  const schema = new Schema();
  schema.register([...AffineSchemas, ...sourceSchemas, ...apparatusSchemas]);

  const transformer = () => new Transformer({
    schema,
    blobCRUD: workspace.blobSync,
    docCRUD: {
      create: (id: string) => workspace.createDoc(id).getStore({ id }),
      get: (id: string) => workspace.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => workspace.removeDoc(id),
    },
  });
  let current: ManuscriptDocument | undefined;
  let loading = false;
  let scheduled: Promise<void> = Promise.resolve();
  const changed = () => {
    refreshApparatus();
    if (loading || !current || !bridge) return;
    const id = current.id;
    scheduled = scheduled.catch(() => undefined).then(() => {
      if (loading || current?.id !== id) return;
      const snapshot = transformer().docToSnapshot(editor.doc);
      if (!snapshot) throw new Error('snapshot-export-failed');
      bridge.change(id, JSON.stringify(snapshot), editor.mode);
    });
    void scheduled.catch(bridge.error);
  };
  let observedDoc = store.spaceDoc;
  observedDoc.on('update', changed);
  const session = {
    async load(value: ManuscriptDocument) {
      loading = true;
      const previous = workspace;
      observedDoc.off('update', changed);
      const next = createWorkspace();
      workspace = next;
      try {
        const snapshot = JSON.parse(value.snapshot);
        const loaded = await transformer().snapshotToDoc(snapshot);
        if (!loaded) throw new Error('snapshot-import-failed');
        workspace.meta.setDocMeta(value.id, snapshot.meta);
        loaded.get(FeatureFlagService).setFlag('enable_advanced_block_visibility', true);
        loaded.resetHistory();
        await loadApparatus(loaded, value.manuscript_id);
        editor.doc = loaded;
        editor.switchEditor(value.primary_mode);
        await editor.updateComplete;
        refreshApparatus();
        current = value;
        previous.forceStop(); previous.dispose();
        scheduled = Promise.resolve();
        observedDoc = loaded.spaceDoc;
        observedDoc.on('update', changed);
      } catch (error) {
        next.forceStop(); next.dispose(); workspace = previous; observedDoc.on('update', changed);
        throw error;
      } finally { loading = false; }
    },
    setReadonly(value: boolean) { editor.doc.readonly = value; },
    setMode(mode: DocMode) {
      editor.switchEditor(mode);
      return editor.updateComplete;
    },
    async arrangeSources(options?: { lang?: 'ar' | 'en' }) {
      const lang = options?.lang ?? bridge?.appearance?.()?.lang ?? ((document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl') ? 'ar' : 'en');
      return arrangeSourcesOnCanvas(editor.doc, editor, { ...options, lang });
    },
    async undoArrange() {
      return undoArrangeSources(editor.doc, editor);
    },
    async insertKanban(titleOrOptions?: string | { title?: string; lang?: 'ar' | 'en' }, maybeOptions?: { lang?: 'ar' | 'en' }) {
      const options = typeof titleOrOptions === 'object' ? titleOrOptions : maybeOptions;
      const title = typeof titleOrOptions === 'string' ? titleOrOptions : options?.title;
      const lang = options?.lang ?? bridge?.appearance?.()?.lang ?? ((document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl') ? 'ar' : 'en');
      return insertResearchKanban(editor.doc, undefined, { ...options, lang, title });
    },
    async flush() { await flushApparatusSettings(); await blobs?.flush(); await scheduled; },
    dispose() { stopApparatusAppearance?.(); observedDoc.off('update', changed); workspace.forceStop(); workspace.dispose(); editor.remove(); },
  };
  if (bridge) {
    window.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyS' || event.key.toLowerCase() === 's')) {
        event.preventDefault();
        void bridge.explicitSave().catch(bridge.error);
      }
    }, true);
    await bridge.connect(session);
  }

  // Retained for the isolated offline smoke test and native verification.
  (window as unknown as { __baglibResearchEditor: unknown }).__baglibResearchEditor = {
    ready: true,
    async exportSources() {
      const job = transformer();
      const original = job.docToSnapshot(editor.doc);
      const snapshot = original && prepareApparatusExport(original);
      if (!snapshot) throw new Error('snapshot-export-failed');
      return { markdown: (await new MarkdownAdapter(job, editor.doc.provider).fromDocSnapshot({ snapshot })).file, html: (await new HtmlAdapter(job, editor.doc.provider).fromDocSnapshot({ snapshot })).file };
    },
    editor,
    workspace,
    arrangeSources(options?: { lang?: 'ar' | 'en' }) {
      const lang = options?.lang ?? bridge?.appearance?.()?.lang ?? ((document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl') ? 'ar' : 'en');
      return arrangeSourcesOnCanvas(editor.doc, editor, { ...options, lang });
    },
    undoArrange() {
      return undoArrangeSources(editor.doc, editor);
    },
    insertKanban(titleOrOptions?: string | { title?: string; lang?: 'ar' | 'en' }, maybeOptions?: { lang?: 'ar' | 'en' }) {
      const options = typeof titleOrOptions === 'object' ? titleOrOptions : maybeOptions;
      const title = typeof titleOrOptions === 'string' ? titleOrOptions : options?.title;
      const lang = options?.lang ?? bridge?.appearance?.()?.lang ?? ((document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl') ? 'ar' : 'en');
      return insertResearchKanban(editor.doc, undefined, { ...options, lang, title });
    },
    fitToScreen() {
      fitEdgelessScreen(editor);
    },
    get mode() {
      return editor.mode;
    },
    setMode(mode: DocMode) {
      editor.switchEditor(mode);
      return editor.updateComplete;
    },
    async snapshot() {
      const job = new Transformer({
        schema,
        blobCRUD: workspace.blobSync,
        docCRUD: {
          create: (id: string) => workspace.createDoc(id).getStore({ id }),
          get: (id: string) => workspace.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => workspace.removeDoc(id),
        },
      });
      return job.docToSnapshot(editor.doc);
    },
  };
  document.documentElement.dataset.researchEditorReady = 'true';
}

mount().catch(error => {
  console.error(error);
  bridge?.error(error);
  document.documentElement.dataset.researchEditorReady = 'error';
});
