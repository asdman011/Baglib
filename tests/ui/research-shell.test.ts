import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocumentHeadings, calculateDocumentStats } from '../../src/shared/manuscript-headings';
import { MANUSCRIPT_TEMPLATES } from '../../src/shared/manuscript-templates';
import { translations } from '../../src/renderer/translations';
import { createResearchEditorHost } from '../../src/renderer/components/research/editor-host';
import type { ManuscriptsAPI } from '../../src/shared/manuscripts';
import type { ResearchEditorAssets, ResearchEditorSession } from '../../src/shared/research-editor';

test('extractDocumentHeadings extracts page title and nested headings with correct levels', () => {
  const snapshot = JSON.stringify({
    type: 'page',
    meta: { id: 'doc-1', title: 'مقدمة البحث — Research Introduction', createDate: 12345678, tags: [] },
    blocks: {
      type: 'block',
      id: 'page-block',
      flavour: 'affine:page',
      version: 2,
      props: {
        title: { '$blocksuite:internal:text$': true, delta: [{ insert: 'مقدمة البحث — Research Introduction' }] },
      },
      children: [
        { type: 'block', id: 'surface-block', flavour: 'affine:surface', version: 5, props: {}, children: [] },
        {
          type: 'block',
          id: 'note-block',
          flavour: 'affine:note',
          version: 1,
          props: {},
          children: [
            {
              type: 'block',
              id: 'h1-block',
              flavour: 'affine:paragraph',
              version: 1,
              props: {
                type: 'h1',
                text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'المبحث الأول: الإطار النظري' }] },
              },
            },
            {
              type: 'block',
              id: 'p-block',
              flavour: 'affine:paragraph',
              version: 1,
              props: {
                type: 'text',
                text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'نص عادي للمبحث الأول' }] },
              },
            },
            {
              type: 'block',
              id: 'h2-block',
              flavour: 'affine:paragraph',
              version: 1,
              props: {
                type: 'h2',
                text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'المطلب الأول: تعريف المفاهيم' }] },
              },
            },
            {
              type: 'block',
              id: 'h3-block',
              flavour: 'affine:paragraph',
              version: 1,
              props: {
                type: 'h3',
                text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'الفرع الأول: الرأي الراجح' }] },
              },
            },
          ],
        },
      ],
    },
  });

  const headings = extractDocumentHeadings(snapshot);
  assert.equal(headings.length, 4);

  assert.equal(headings[0].id, 'page-block');
  assert.equal(headings[0].level, 1);
  assert.equal(headings[0].text, 'مقدمة البحث — Research Introduction');

  assert.equal(headings[1].id, 'h1-block');
  assert.equal(headings[1].level, 1);
  assert.equal(headings[1].text, 'المبحث الأول: الإطار النظري');

  assert.equal(headings[2].id, 'h2-block');
  assert.equal(headings[2].level, 2);
  assert.equal(headings[2].text, 'المطلب الأول: تعريف المفاهيم');

  assert.equal(headings[3].id, 'h3-block');
  assert.equal(headings[3].level, 3);
  assert.equal(headings[3].text, 'الفرع الأول: الرأي الراجح');
});

test('extractDocumentHeadings handles invalid or empty snapshots gracefully', () => {
  assert.deepEqual(extractDocumentHeadings(''), []);
  assert.deepEqual(extractDocumentHeadings('invalid json'), []);
  assert.deepEqual(extractDocumentHeadings('{}'), []);
  assert.deepEqual(extractDocumentHeadings('{"blocks":{}}'), []);
});

test('calculateDocumentStats calculates word, char, paragraph and heading counts accurately', () => {
  const plainText = `مقدمة في علوم المخطوطات والتحقيق.
تحتوي هذه الصفحة على نصوص عربية وإنكليزية.

Chapter 1: Critical edition of classical manuscripts.
Discussion on variant readings and sigla.`;

  const snapshot = JSON.stringify({
    type: 'page',
    meta: { id: 'd', title: 'T', createDate: 0, tags: [] },
    blocks: {
      type: 'block',
      id: 'p',
      flavour: 'affine:page',
      props: { title: 'T' },
      children: [
        {
          type: 'block',
          id: 'n',
          flavour: 'affine:note',
          props: {},
          children: [
            { type: 'block', id: 'h1', flavour: 'affine:paragraph', props: { type: 'h1', text: 'Section 1' } },
            { type: 'block', id: 'h2', flavour: 'affine:paragraph', props: { type: 'h2', text: 'Section 2' } },
          ],
        },
      ],
    },
  });

  const stats = calculateDocumentStats(plainText, snapshot);
  assert.ok(stats.words >= 20);
  assert.ok(stats.chars >= 120);
  assert.equal(stats.paragraphs, 4); // 4 non-empty lines
  assert.equal(stats.headings, 3); // page title + h1 + h2
});

test('MANUSCRIPT_TEMPLATES defines 4 scholarly templates with complete bilingual structure', () => {
  assert.equal(MANUSCRIPT_TEMPLATES.length, 4);

  const ids = MANUSCRIPT_TEMPLATES.map(t => t.id);
  assert.deepEqual(ids, ['research-paper', 'book-chapter', 'thematic-study', 'critical-edition']);

  for (const tpl of MANUSCRIPT_TEMPLATES) {
    assert.ok(tpl.titleKey in translations.ar);
    assert.ok(tpl.titleKey in translations.en);
    assert.ok(tpl.descKey in translations.ar);
    assert.ok(tpl.descKey in translations.en);

    assert.ok(tpl.defaultTitle.ar.length > 0);
    assert.ok(tpl.defaultTitle.en.length > 0);
    assert.ok(tpl.chapters.length >= 4);

    for (const ch of tpl.chapters) {
      assert.ok(ch.ar.length > 0);
      assert.ok(ch.en.length > 0);
    }
  }
});

test('AFFiNE shell translation keys are completely mirrored in Arabic and English', () => {
  const shellKeys = [
    'researchSidebarTitle',
    'researchSearchDocs',
    'researchAllDocs',
    'researchFavourites',
    'researchNoFavourites',
    'researchOrganize',
    'researchTemplates',
    'researchTrash',
    'researchImport',
    'researchNewManuscript',
    'researchNewChapter',
    'researchAddToFavourites',
    'researchRemoveFromFavourites',
    'researchToggleSidebar',
    'researchPageMode',
    'researchEdgelessMode',
    'researchDefaultToEdgeless',
    'researchViewInfo',
    'researchViewToc',
    'researchViewHistory',
    'researchDuplicate',
    'researchExport',
    'researchExportMarkdown',
    'researchExportHtml',
    'researchPresentation',
    'researchToggleRightPanel',
    'researchToolSelect',
    'researchToolFrame',
    'researchToolConnector',
    'researchToolLink',
    'researchToolText',
    'researchToolPen',
    'researchToolEraser',
    'researchToolShapes',
    'researchToolMindMap',
    'researchToolKanban',
    'researchZoomFit',
    'researchZoomOut',
    'researchZoomIn',
    'researchTocTitle',
    'researchNoHeadings',
    'researchAiButton',
    'researchAiTitle',
    'researchAiSubtitle',
    'researchAiPromptSummarize',
    'researchAiPromptCitations',
    'researchAiPromptOutline',
    'researchAiPromptReview',
    'researchAiPlaceholder',
    'researchAiSend',
    'researchAiClose',
    'researchDocInfoTitle',
    'researchWordsCount',
    'researchCharsCount',
    'researchBlocksCount',
    'researchCreatedAt',
    'researchUpdatedAt',
    'researchHistoryTitle',
    'researchCreateCheckpoint',
    'researchRestoreRevision',
    'researchNoHistory',
    'researchRevision',
  ] as const;

  for (const key of shellKeys) {
    assert.ok(key in translations.ar, `Missing Arabic key: ${key}`);
    assert.ok(key in translations.en, `Missing English key: ${key}`);
    assert.match(translations.ar[key], /[\u0600-\u06ff]/u, `Arabic key ${key} should contain Arabic text`);
    assert.match(translations.en[key], /[A-Za-z]/u, `English key ${key} should contain English text`);
  }
});

test('createResearchEditorHost exposes fitToScreen, exportSources, and scrollToBlock', async () => {
  let fitCalled = false;
  let scrollTarget = '';

  const mockSession: ResearchEditorSession = {
    async load() {},
    async flush() {},
    fitToScreen() {
      fitCalled = true;
    },
    async exportSources() {
      return { markdown: '# Title\n\nBody content', html: '<h1>Title</h1><p>Body content</p>' };
    },
    scrollToBlock(blockId: string) {
      scrollTarget = blockId;
    },
    dispose() {},
  };

  const mockApi = {} as ManuscriptsAPI;
  const mockBlobs = {} as ResearchEditorAssets;

  const host = createResearchEditorHost(
    mockApi,
    mockBlobs,
    { lang: 'ar', dir: 'rtl', theme: 'dark', fontScale: 1 },
    () => {}
  );

  await host.bridge.connect(mockSession);

  await host.fitToScreen();
  assert.equal(fitCalled, true);

  const exported = await host.exportSources();
  assert.equal(exported.markdown, '# Title\n\nBody content');
  assert.equal(exported.html, '<h1>Title</h1><p>Body content</p>');

  await host.scrollToBlock('block-123');
  assert.equal(scrollTarget, 'block-123');
});
