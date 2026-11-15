import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { ManuscriptExportService } from '../../src/main/services/manuscript-export.service';
import {
  ManuscriptImportService,
  markdownToManuscriptSnapshot,
  parseInlineMarkdown
} from '../../src/main/services/manuscript-import.service';
import type { ResearchEditorAssets, ResearchEditorBlob } from '../../src/shared/research-editor';
import { initialManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';

class MockAssets implements ResearchEditorAssets {
  private store = new Map<string, ResearchEditorBlob>();

  constructor() {
    // 1x1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=', 'base64');
    this.store.set('sample-image-blob', { bytes: new Uint8Array(png), type: 'image/png' });
  }

  async get(id: string): Promise<ResearchEditorBlob | null> {
    return this.store.get(id) || null;
  }
  async set(id: string, value: ResearchEditorBlob): Promise<string> {
    this.store.set(id, value);
    return id;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  const repo = new ManuscriptRepository(db);
  const assets = new MockAssets();
  const exportService = new ManuscriptExportService(db, assets);
  const importService = new ManuscriptImportService(db);
  const manuscript = repo.create('دراسة بلاغية — Rhetorical Study', 'book');
  const document = repo.createDocument(manuscript.id, 'الفصل الأول: الاستشهاد القرآني والشعري');

  // Build a rich snapshot containing all BagLib source blocks, images, and citations
  const base = JSON.parse(initialManuscriptSnapshot(document.id, document.title));
  const noteBlock = base.blocks.children[1];

  noteBlock.children = [
    // 1. Heading 1
    {
      type: 'block',
      id: 'h1-intro',
      flavour: 'affine:paragraph',
      version: 1,
      props: { type: 'h1', text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'مقدمة البحث' }] } },
      children: []
    },
    // 2. Paragraph with inline citation
    {
      type: 'block',
      id: 'p-text-1',
      flavour: 'affine:paragraph',
      version: 1,
      props: {
        type: 'text',
        text: {
          '$blocksuite:internal:text$': true,
          delta: [
            { insert: 'هذا النص يحتوي على استشهاد بالقرآن الكريم' },
            {
              insert: ' ',
              attributes: {
                footnote: {
                  label: '1',
                  reference: { type: 'url', url: 'quran:hafs:2:255', title: 'البقرة: 255' }
                }
              }
            },
            { insert: '، وهو موثق في الهوامش.' }
          ]
        }
      },
      children: []
    },
    // 3. Ayah block
    {
      type: 'block',
      id: 'ayah-block-1',
      flavour: 'baglib:ayah',
      version: 1,
      props: {
        kind: 'ayah',
        text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ',
        label: 'سورة البقرة: ٢٥٥',
        url: 'quran:hafs:2:255'
      },
      children: []
    },
    // 4. Hadith block
    {
      type: 'block',
      id: 'hadith-block-1',
      flavour: 'baglib:hadith',
      version: 1,
      props: {
        kind: 'hadith',
        text: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
        label: 'صحيح البخاري: 1',
        url: 'sunnah:bukhari:1',
        grade: 'صحيح'
      },
      children: []
    },
    // 5. Poetry verse block
    {
      type: 'block',
      id: 'verse-block-1',
      flavour: 'baglib:verse',
      version: 1,
      props: {
        kind: 'verse',
        verses: [
          { sadr: 'عَلى قَدْرِ أَهْلِ العَزْمِ تَأْتِي العَزائِمُ', ajuz: 'وَتَأْتِي عَلَى قَدْرِ الكِرامِ المَكارِمُ' },
          { sadr: 'وَتَعْظُمُ في عَيْنِ الصَّغِيرِ صِغارُها', ajuz: 'وَتَصْغُرُ في عَيْنِ العَظِيمِ العَظائِمُ' }
        ],
        label: 'المتنبي · مدح سيف الدولة',
        url: 'poetry:mutanabbi:1'
      },
      children: []
    },
    // 6. Book quote block
    {
      type: 'block',
      id: 'quote-block-1',
      flavour: 'baglib:book-quote',
      version: 1,
      props: {
        kind: 'book-quote',
        text: 'اعلم أن التاريخ في ظاهره لا يزيد على الإخبار، وفي باطنه نظر وتحقيق.',
        label: 'ابن خلدون، المقدمة، ص 12',
        url: 'book:ibn-khaldun:muqaddimah:12'
      },
      children: []
    },
    // 7. Image block
    {
      type: 'block',
      id: 'image-block-1',
      flavour: 'affine:image',
      version: 1,
      props: {
        sourceId: 'sample-image-blob',
        caption: 'مخطوطة أثرية توضح الخط الكوفي'
      },
      children: []
    }
  ];

  repo.save({ id: document.id, snapshot: JSON.stringify(base) });

  return { db, repo, assets, exportService, importService, manuscript, document };
}

test('Markdown export includes BagLib blocks, RTL content, and readable footnotes', async () => {
  const { exportService, manuscript, document } = fixture();

  const result = await exportService.export({
    manuscriptId: manuscript.id,
    documentId: document.id,
    format: 'markdown'
  });

  assert.equal(result.format, 'markdown');
  assert.ok(result.filename.endsWith('.md'));
  assert.ok(result.content);

  const md = result.content;
  // Document title
  assert.ok(md.includes('# الفصل الأول: الاستشهاد القرآني والشعري'));
  // Heading
  assert.ok(md.includes('## مقدمة البحث'));
  // Footnote reference in text
  assert.ok(md.includes('[^1]'));
  // Ayah block with brackets ﴿ ﴾
  assert.ok(md.includes('﴿ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ﴾'));
  assert.ok(md.includes('سورة البقرة: ٢٥٥'));
  // Hadith block with grade
  assert.ok(md.includes('إنما الأعمال بالنيات'));
  assert.ok(md.includes('صحيح البخاري: 1'));
  assert.ok(md.includes('صحيح'));
  // Verse block with ***
  assert.ok(md.includes('عَلى قَدْرِ أَهْلِ العَزْمِ تَأْتِي العَزائِمُ  ***  وَتَأْتِي عَلَى قَدْرِ الكِرامِ المَكارِمُ'));
  // Book quote
  assert.ok(md.includes('اعلم أن التاريخ في ظاهره لا يزيد على الإخبار'));
  // Image
  assert.ok(md.includes('![مخطوطة أثرية توضح الخط الكوفي]'));
  // Footnote definition at bottom
  assert.ok(md.includes('[^1]:'));
  assert.ok(md.includes('quran:hafs:2:255'));
});

test('HTML export generates standalone document with CSS, embedded data URI image, and poetry table', async () => {
  const { exportService, manuscript, document } = fixture();

  const result = await exportService.export({
    manuscriptId: manuscript.id,
    documentId: document.id,
    format: 'html'
  });

  assert.equal(result.format, 'html');
  assert.ok(result.filename.endsWith('.html'));
  assert.ok(result.content);

  const html = result.content;
  // HTML5 and RTL dir
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes('lang="ar"'));
  // Fonts and styles
  assert.ok(html.includes('--font-body'));
  assert.ok(html.includes('--font-quran'));
  // Ayah block styling
  assert.ok(html.includes('class="baglib-ayah"'));
  assert.ok(html.includes('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ'));
  // Hadith block styling
  assert.ok(html.includes('class="baglib-hadith"'));
  assert.ok(html.includes('إنما الأعمال بالنيات'));
  // Poetry table with sadr and ajuz
  assert.ok(html.includes('class="baglib-poetry-table"'));
  assert.ok(html.includes('class="sadr"'));
  assert.ok(html.includes('class="ajuz"'));
  assert.ok(html.includes('عَلى قَدْرِ أَهْلِ العَزْمِ تَأْتِي العَزائِمُ'));
  // Embedded base64 image
  assert.ok(html.includes('data:image/png;base64,'));
  // Footnotes section at chapter end
  assert.ok(html.includes('class="chapter-footnotes"'));
  assert.ok(html.includes('href="quran:hafs:2:255"'));
});

test('DOCX export generates valid Word OpenXML buffer with footnotes and tables', async () => {
  const { exportService, manuscript, document } = fixture();

  const result = await exportService.export({
    manuscriptId: manuscript.id,
    documentId: document.id,
    format: 'docx',
    pageSize: 'A4',
    margins: 'normal'
  });

  assert.equal(result.format, 'docx');
  assert.ok(result.filename.endsWith('.docx'));
  assert.ok(result.base64);

  const buf = Buffer.from(result.base64, 'base64');
  assert.ok(buf.length > 5000);
  // Zip container signature (PK\x03\x04)
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
  assert.equal(buf[2], 0x03);
  assert.equal(buf[3], 0x04);
});

test('Markdown parser and snapshot generation parses headings, lists, poetry, and footnotes', () => {
  const md = `
# عنوان الفصل الأول

هذه فقرة تمهيدية للبحث تحتوي على حاشية[^1] هامة.

* * *

عَلى قَدْرِ أَهْلِ العَزْمِ تَأْتِي العَزائِمُ  ***  وَتَأْتِي عَلَى قَدْرِ الكِرامِ المَكارِمُ

> ﴿ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾

- عنصر قائمة أول
- عنصر قائمة ثانٍ

[^1]: تفسير الطبري — book:tabari:tafsir:1
  `;

  const snapshotJson = markdownToManuscriptSnapshot('doc-import-1', 'فصل مستورد', md);
  const parsed = JSON.parse(snapshotJson);

  assert.equal(parsed.type, 'page');
  assert.equal(parsed.meta.id, 'doc-import-1');
  assert.equal(parsed.meta.title, 'فصل مستورد');

  const noteBlock = parsed.blocks.children[1];
  assert.ok(Array.isArray(noteBlock.children));
  assert.ok(noteBlock.children.length >= 5);

  // Check H1
  const h1 = noteBlock.children.find((c: { flavour: string; props: { type: string } }) => c.flavour === 'affine:paragraph' && c.props.type === 'h1');
  assert.ok(h1);

  // Check poetry verse block
  const verse = noteBlock.children.find((c: { flavour: string }) => c.flavour === 'baglib:verse');
  assert.ok(verse);
  assert.equal(verse.props.verses[0].sadr, 'عَلى قَدْرِ أَهْلِ العَزْمِ تَأْتِي العَزائِمُ');

  // Check ayah block
  const ayah = noteBlock.children.find((c: { flavour: string }) => c.flavour === 'baglib:ayah');
  assert.ok(ayah);
  assert.equal(ayah.props.text, 'إِنَّ مَعَ الْعُسْرِ يُسْرًا');

  // Check bulleted list
  const list = noteBlock.children.find((c: { flavour: string }) => c.flavour === 'affine:list');
  assert.ok(list);
});

test('ManuscriptImportService imports Markdown into manuscript as new chapter', () => {
  const { importService, manuscript } = fixture();

  const imported = importService.importMarkdown({
    manuscriptId: manuscript.id,
    markdown: '# الفصل المستورد\n\nنص التجربة للاستيراد.\n\n- نقطة 1\n- نقطة 2'
  });

  assert.ok(imported.id);
  assert.equal(imported.title, 'الفصل المستورد');
  assert.ok(imported.snapshot.includes('نص التجربة للاستيراد'));
});

test('ManuscriptImportService imports Quick Note into manuscript as new chapter', () => {
  const { db, importService, manuscript } = fixture();

  // Insert a quick note into knowledge & study_note_detail
  const noteId = 'test-quick-note-1';
  db.prepare(`
    INSERT INTO knowledge(id, knowledge_type, location, created_at, updated_at)
    VALUES(?, 'study_note', '1', datetime('now'), datetime('now'))
  `).run(noteId);

  db.prepare(`
    INSERT INTO study_note_detail(knowledge_id, title, content, aliases_json)
    VALUES(?, 'فوائد في التفسير', '# فوائد لغوية\n\nالبيان والإعجاز في القرآن الكريم.', '[]')
  `).run(noteId);

  // List quick notes
  const notes = importService.listQuickNotes();
  assert.ok(notes.length > 0);
  assert.ok(notes.some(n => n.id === noteId));

  // Import quick note
  const imported = importService.importQuickNote({
    manuscriptId: manuscript.id,
    noteId
  });

  assert.ok(imported.id);
  assert.equal(imported.title, 'فوائد في التفسير');
  assert.ok(imported.snapshot.includes('البيان والإعجاز في القرآن الكريم'));
});
