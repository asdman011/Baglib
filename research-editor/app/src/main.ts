// BagLib research editor entry (KEY-362).
//
// Mounts AFFiNE's BlockSuite editor (page and edgeless views of one document) fully offline.
// Storage, the BagLib bridge, theme/language sync and BagLib blocks come later (RE-2, RE-3, RE-5);
// for now documents live in memory and a small test API is exposed for the smoke test.
import './style.css';

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

function createWorkspace() {
  const workspace = new TestWorkspace({
    id: 'baglib-research',
    idGenerator: nanoid,
    // In memory only: no BroadcastChannel, IndexedDB or cloud sources. RE-2 adds a bridge-backed
    // blob source that writes to manuscript-assets/.
    blobSources: { main: new MemoryBlobSource() },
  });
  workspace.storeExtensions = storeManager.get('store');
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
  applyLanguageFromQuery();
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  const workspace = createWorkspace();
  const store = createEmptyDoc(workspace, 'doc:home');
  store.get(FeatureFlagService).setFlag('enable_advanced_block_visibility', true);

  const editor = document.createElement('affine-editor-container') as TestAffineEditorContainer;
  editor.autofocus = true;
  editor.doc = store;

  const common: ExtensionType[] = [
    FontConfigExtension(BaglibCanvasTextFonts),
    EditorSettingExtension({ setting$: editorSettings() }),
    ParseDocUrlExtension({ parseDocUrl: () => undefined }),
    { setup: di => di.override(DocModeProvider, docModeProvider(editor)) },
  ];

  editor.pageSpecs = [...viewManager.get('page'), ...common];
  editor.edgelessSpecs = [...viewManager.get('edgeless'), ...common];

  app.append(editor);
  await editor.updateComplete;

  const schema = new Schema();
  schema.register(AffineSchemas);

  // Test-only surface for the offline smoke test and the typing helper. RE-2 replaces this with
  // the typed bridge to BagLib.
  (window as unknown as { __baglibResearchEditor: unknown }).__baglibResearchEditor = {
    ready: true,
    editor,
    workspace,
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
  document.documentElement.dataset.researchEditorReady = 'error';
});
