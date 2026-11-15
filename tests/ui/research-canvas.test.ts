/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  classifyBlock,
  SOURCE_FRAME_TITLES,
  arrangeSourcesOnCanvas,
  undoArrangeSources,
} from '../../research-editor/app/src/canvas/arrange';
import {
  DEFAULT_KANBAN_TASKS,
  DEFAULT_KANBAN_TITLES,
} from '../../research-editor/app/src/canvas/kanban-constants';
import {
  createResearchEditorHost,
} from '../../src/renderer/components/research/editor-host';
import {
  researchSettings,
  validateResearchSettings,
} from '../../src/shared/research-editor-apparatus';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { translations } from '../../src/renderer/translations';
import type { BlockModel } from '@blocksuite/affine/store';
import type { ManuscriptDocument, ManuscriptsAPI } from '../../src/shared/manuscripts';
import type { ResearchEditorAssets } from '../../src/shared/research-editor';

test('classifyBlock classifies solely by flavour without text guessing', () => {
  const ayah = { flavour: 'baglib:ayah', id: 'b1' } as BlockModel;
  const hadith = { flavour: 'baglib:hadith', id: 'b2' } as BlockModel;
  const verse = { flavour: 'baglib:verse', id: 'b3' } as BlockModel;
  const quote = { flavour: 'baglib:book-quote', id: 'b4' } as BlockModel;
  const paragraph = {
    flavour: 'affine:paragraph',
    id: 'b5',
    text: { toString: () => 'قال الله تعالى: سورة البقرة' },
  } as unknown as BlockModel;
  const list = {
    flavour: 'affine:list',
    id: 'b6',
    text: { toString: () => 'حديث شريف في صحيح البخاري' },
  } as unknown as BlockModel;

  assert.equal(classifyBlock(ayah), 'quran');
  assert.equal(classifyBlock(hadith), 'sunnah');
  assert.equal(classifyBlock(verse), 'poetry');
  assert.equal(classifyBlock(quote), 'books');
  assert.equal(classifyBlock(paragraph), null, 'Standard paragraph must not be classified as quran');
  assert.equal(classifyBlock(list), null, 'Standard list must not be classified as sunnah');
});

test('SOURCE_FRAME_TITLES and DEFAULT_KANBAN are defined for ar and en', () => {
  assert.equal(SOURCE_FRAME_TITLES.ar.quran, 'القرآن الكريم');
  assert.equal(SOURCE_FRAME_TITLES.ar.sunnah, 'السنة النبوية');
  assert.equal(SOURCE_FRAME_TITLES.ar.poetry, 'الشعر العربي');
  assert.equal(SOURCE_FRAME_TITLES.ar.books, 'المقتطفات والمراجع');

  assert.equal(SOURCE_FRAME_TITLES.en.quran, 'Noble Quran');
  assert.equal(SOURCE_FRAME_TITLES.en.sunnah, 'Prophetic Sunnah');
  assert.equal(SOURCE_FRAME_TITLES.en.poetry, 'Arabic Poetry');
  assert.equal(SOURCE_FRAME_TITLES.en.books, 'Book Quotes');

  assert.equal(DEFAULT_KANBAN_TITLES.ar, 'مهام البحث والتحقيق');
  assert.equal(DEFAULT_KANBAN_TITLES.en, 'Research Tasks');
  assert.equal(DEFAULT_KANBAN_TASKS.ar.length, 3);
  assert.equal(DEFAULT_KANBAN_TASKS.en.length, 3);
});

test('arrangeSourcesOnCanvas and undoArrangeSources work on document models', () => {
  const blocksMap = new Map<string, any>();
  let blockCounter = 1;

  const root = { id: 'root', flavour: 'affine:page', children: [] as any[] };
  blocksMap.set('root', root);

  const surface = { id: 'surface-1', flavour: 'affine:surface', children: [] as any[] };
  blocksMap.set('surface-1', surface);
  root.children.push(surface);

  const pageNote = {
    id: 'doc-note',
    flavour: 'affine:note',
    displayMode: 0,
    children: [] as any[],
  };
  blocksMap.set('doc-note', pageNote);
  root.children.push(pageNote);

  const ayahBlock = { id: 'ayah-1', flavour: 'baglib:ayah', children: [] };
  const hadithBlock = { id: 'hadith-1', flavour: 'baglib:hadith', children: [] };
  const paraBlock = { id: 'para-1', flavour: 'affine:paragraph', children: [] };

  blocksMap.set('ayah-1', ayahBlock);
  blocksMap.set('hadith-1', hadithBlock);
  blocksMap.set('para-1', paraBlock);
  pageNote.children.push(ayahBlock, hadithBlock, paraBlock);

  const mockDoc: any = {
    root,
    captureSync: () => {},
    getModelsByFlavour: (flavour: string) => {
      return Array.from(blocksMap.values()).filter(b => b.flavour === flavour);
    },
    getBlock: (id: string) => {
      const b = blocksMap.get(id);
      return b ? { model: b } : null;
    },
    getModelById: (id: string) => {
      return blocksMap.get(id);
    },
    addBlock: (flavour: string, props: any, parentId?: string) => {
      const id = `${flavour.split(':')[1]}-${blockCounter++}`;
      const newBlock = { id, flavour, ...props, children: [] };
      blocksMap.set(id, newBlock);
      const parent = blocksMap.get(parentId || 'root');
      if (parent) {
        parent.children.push(newBlock);
      }
      return id;
    },
    deleteBlock: (block: any) => {
      blocksMap.delete(block.id);
      for (const parent of blocksMap.values()) {
        if (parent.children) {
          const idx = parent.children.findIndex((c: any) => c.id === block.id);
          if (idx !== -1) parent.children.splice(idx, 1);
        }
      }
    },
    moveBlocks: (blocks: any[], targetParent: any) => {
      for (const b of blocks) {
        for (const p of blocksMap.values()) {
          if (p.children) {
            const idx = p.children.findIndex((c: any) => c.id === b.id);
            if (idx !== -1) p.children.splice(idx, 1);
          }
        }
        targetParent.children.push(b);
      }
    },
  };

  let editorMode = 'page';
  const mockEditor: any = {
    mode: 'page',
    setMode: (m: string) => {
      editorMode = m;
      mockEditor.mode = m;
    },
    switchEditor: (m: string) => {
      editorMode = m;
      mockEditor.mode = m;
    },
    querySelector: () => null,
    viewport: {
      viewportBounds: { x: 0, y: 0, w: 1000, h: 800 },
      setViewport: () => {},
    },
  };

  // 1. Arrange sources
  const result = arrangeSourcesOnCanvas(mockDoc, mockEditor, { lang: 'ar' });
  assert.equal(result.arranged, true);
  assert.equal(result.counts.quran, 1);
  assert.equal(result.counts.sunnah, 1);
  assert.equal(result.counts.poetry, 0);
  assert.equal(result.counts.books, 0);
  assert.equal(result.frameIds.length, 2);
  assert.equal(editorMode, 'edgeless');

  // Verify frames exist
  const frames = mockDoc.getModelsByFlavour('affine:frame');
  assert.equal(frames.length, 2);
  for (const f of frames) {
    assert.ok(f.title, 'Frame must have a title');
    assert.ok(f.title.length > 0, 'Frame title must not be empty');
    assert.ok(f.childElementIds && Object.keys(f.childElementIds).length > 0, 'Frame must contain child elements');
  }

  // 2. Undo arrange
  const undoResult = undoArrangeSources(mockDoc, mockEditor);
  assert.equal(undoResult, true);
  assert.equal(editorMode, 'page');

  // Verify frames were removed
  const remainingFrames = mockDoc.getModelsByFlavour('affine:frame');
  assert.equal(remainingFrames.length, 0);

  // Verify all 3 blocks are back in page note
  assert.equal(pageNote.children.length, 3);
  assert.ok(pageNote.children.some((c: any) => c.id === 'ayah-1'));
  assert.ok(pageNote.children.some((c: any) => c.id === 'hadith-1'));
  assert.ok(pageNote.children.some((c: any) => c.id === 'para-1'));
});

test('createResearchEditorHost handles canvas methods and delegates to session', async () => {
  const events: string[] = [];
  const doc = (id: string): ManuscriptDocument => ({
    id,
    manuscript_id: 'm1',
    title: 'Chapter 1',
    primary_mode: 'page',
    snapshot: '{"text":"test"}',
    position: 0,
    parent_id: null,
    plain_text: 'test',
    deleted_at: null,
    created_at: '100',
    updated_at: '100',
  });

  const api = {
    document: async (id: string) => doc(id),
    save: async (input: { id: string; snapshot: string; primary_mode?: string }) => {
      events.push(`save:${input.id}:${input.primary_mode || 'page'}`);
      return { ...doc(input.id), ...input } as any;
    },
    checkpoint: async (id: string) => {
      events.push(`checkpoint:${id}`);
      return true;
    },
  } as unknown as ManuscriptsAPI;

  const host = createResearchEditorHost(
    api,
    {} as ResearchEditorAssets,
    { theme: 'light', lang: 'ar', dir: 'rtl', fontScale: 1 },
    err => console.error(err)
  );

  let sessionMode = 'page';
  let arranged = false;
  let kanbanCalled = false;

  await host.bridge.connect({
    load: async () => {},
    flush: async () => {},
    dispose: () => {},
    setMode: async (m: string) => {
      sessionMode = m;
      events.push(`session:setMode:${m}`);
    },
    arrangeSources: async () => {
      arranged = true;
      events.push('session:arrange');
      return { arranged: true, counts: { quran: 1, sunnah: 0, poetry: 0, books: 0 }, frameIds: ['f1'] };
    },
    undoArrange: async () => {
      arranged = false;
      events.push('session:undo');
      return true;
    },
    insertKanban: async (title?: string) => {
      kanbanCalled = true;
      events.push(`session:kanban:${title}`);
      return 'db-1';
    },
  });

  await host.open(doc('one'));

  // Test setMode
  await host.setMode('edgeless');
  assert.equal(sessionMode, 'edgeless');

  // Test arrangeSources
  const arrResult = await host.arrangeSources();
  assert.equal(arrResult.arranged, true);
  assert.equal(arranged, true);

  // Test undoArrange
  const undoRes = await host.undoArrange();
  assert.equal(undoRes, true);
  assert.equal(arranged, false);

  // Test insertKanban
  const kId = await host.insertKanban('مهام التحقيق');
  assert.equal(kId, 'db-1');
  assert.equal(kanbanCalled, true);

  await host.close();
  host.dispose();
});

test('ManuscriptRepository persists and unlinks linkedBoardId via updateSettings', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);

  try {
    const repo = new ManuscriptRepository(db);
    const ms = repo.create('بحث في الحديث والآثار', 'research');
    const initSettings = JSON.parse(ms.settings_json);
    assert.equal(initSettings.linkedBoardId, undefined);

    // Link a study board
    repo.updateSettings(ms.id, { linkedBoardId: 'board-alpha-42' });
    const fresh = repo.list().find(m => m.id === ms.id)!;
    const settings = JSON.parse(fresh.settings_json);
    assert.equal(settings.linkedBoardId, 'board-alpha-42');

    // Unlink the study board
    repo.updateSettings(ms.id, { linkedBoardId: null });
    const afterUnlink = repo.list().find(m => m.id === ms.id)!;
    const settingsAfter = JSON.parse(afterUnlink.settings_json);
    assert.equal(settingsAfter.linkedBoardId, undefined);
  } finally {
    db.close();
  }
});

test('validateResearchSettings validates linkedBoardId safely', () => {
  const valid = validateResearchSettings({
    ...researchSettings({}),
    linkedBoardId: 'board-123',
  });
  assert.equal(valid.linkedBoardId, 'board-123');

  const validNull = validateResearchSettings({
    ...researchSettings({}),
    linkedBoardId: null,
  });
  assert.equal(validNull.linkedBoardId, null);

  assert.throws(() => {
    validateResearchSettings({
      ...researchSettings({}),
      linkedBoardId: 12345 as any,
    });
  }, /invalid-request/);
});

test('All 17 canvas and study board translation keys are bilingual', () => {
  const keys = [
    'editorModeDocument',
    'editorModeCanvas',
    'editorArrangeSources',
    'editorUndoArrange',
    'editorInsertKanban',
    'editorLinkedBoard',
    'editorLinkBoard',
    'editorNoLinkedBoard',
    'editorOpenLinkedBoard',
    'editorUnlinkBoard',
    'editorSelectBoardToLink',
    'editorCreateAndLinkBoard',
    'editorFitToScreen',
    'editorArrangeSuccess',
    'editorArrangeNoSources',
    'boardLinkedManuscript',
    'boardOpenLinkedManuscript',
  ] as const;

  for (const k of keys) {
    const arVal = translations.ar[k];
    const enVal = translations.en[k];
    assert.ok(arVal && typeof arVal === 'string' && arVal.trim().length > 0, `Missing ar translation for ${k}`);
    assert.ok(enVal && typeof enVal === 'string' && enVal.trim().length > 0, `Missing en translation for ${k}`);
    assert.match(arVal, /[\u0600-\u06ff]/u, `Arabic translation for ${k} should contain Arabic text`);
  }
});
