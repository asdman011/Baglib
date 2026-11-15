import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';

export { translations } from '../../src/renderer/translations';

export function initializeProfile() {
  const db = getDatabase();
  runMigrations(db, migrations);
  const repo = new ManuscriptRepository(db);

  // 1. Create a quick note in knowledge/study_note_detail for import test
  const noteId = 'quick-note-tafsir-1';
  db.prepare(`
    INSERT OR IGNORE INTO knowledge(id, knowledge_type, location, created_at, updated_at)
    VALUES(?, 'study_note', '1', datetime('now'), datetime('now'))
  `).run(noteId);

  db.prepare(`
    INSERT OR IGNORE INTO study_note_detail(knowledge_id, title, content, aliases_json)
    VALUES(?, 'فوائد في التفسير واللغة', '# فوائد لغوية\\n\\nالبيان القرآني والإعجاز في سورة البقرة.\\n\\n- فائدة أولى\\n- فائدة ثانية', '[]')
  `).run(noteId);

  // 2. Create the seed manuscript
  const m = repo.create('دراسة بلاغية — Rhetorical Research', 'book');

  // Create Chapter 1 (Arabic)
  const doc1 = repo.createDocument(m.id, 'الفصل الأول: الشواهد القرآنية والأدبية');
  const base1 = {
    type: 'page',
    meta: { id: doc1.id, title: doc1.title, createDate: Date.now(), tags: [] },
    blocks: {
      type: 'block', id: doc1.id + '-page', flavour: 'affine:page', version: 2,
      props: { title: { '$blocksuite:internal:text$': true, delta: [{ insert: doc1.title }] } },
      children: [
        { type: 'block', id: doc1.id + '-surface', flavour: 'affine:surface', version: 5, props: { elements: {} }, children: [] },
        {
          type: 'block', id: doc1.id + '-note', flavour: 'affine:note', version: 1, props: {},
          children: [
            {
              type: 'block', id: 'h1-1', flavour: 'affine:paragraph', version: 1,
              props: { type: 'h1', text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'مقدمة في البلاغة القرآنية' }] } },
              children: []
            },
            {
              type: 'block', id: 'p-1', flavour: 'affine:paragraph', version: 1,
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    { insert: 'الاستشهاد بالآيات الكريمة في مصنفات البلاغة' },
                    { insert: ' ', attributes: { footnote: { label: '1', reference: { type: 'url', url: 'quran:hafs:2:255', title: 'البقرة ٢٥٥' } } } },
                    { insert: '، وهو أصل من أصول التحقيق.' }
                  ]
                }
              },
              children: []
            },
            {
              type: 'block', id: 'ayah-1', flavour: 'baglib:ayah', version: 1,
              props: {
                kind: 'ayah',
                text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ',
                label: 'سورة البقرة: ٢٥٥',
                url: 'quran:hafs:2:255'
              },
              children: []
            },
            {
              type: 'block', id: 'hadith-1', flavour: 'baglib:hadith', version: 1,
              props: {
                kind: 'hadith',
                text: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
                label: 'صحيح البخاري: 1',
                url: 'sunnah:bukhari:1',
                grade: 'صحيح'
              },
              children: []
            },
            {
              type: 'block', id: 'verse-1', flavour: 'baglib:verse', version: 1,
              props: {
                kind: 'verse',
                verses: [
                  { sadr: 'عَلى قَدْرِ أَهْلِ العَزْمِ تَأْتِي العَزائِمُ', ajuz: 'وَتَأْتِي عَلَى قَدْرِ الكِرامِ المَكارِمُ' },
                  { sadr: 'وَتَعْظُمُ في عَيْنِ الصَّغِيرِ صِغارُها', ajuz: 'وَتَصْغُرُ في عَيْنِ العَظِيمِ العَظائِمُ' }
                ],
                label: 'المتنبي · سيف الدولة',
                url: 'poetry:mutanabbi:1'
              },
              children: []
            },
            {
              type: 'block', id: 'quote-1', flavour: 'baglib:book-quote', version: 1,
              props: {
                kind: 'book-quote',
                text: 'اعلم أن فن التاريخ فن عزيز المذهب، جم الفوائد، شريف الغاية.',
                label: 'ابن خلدون، المقدمة، ص 10',
                url: 'book:ibn-khaldun:muqaddimah:10'
              },
              children: []
            },
            {
              type: 'block', id: 'img-1', flavour: 'affine:image', version: 1,
              props: {
                sourceId: 'sample-manuscript-asset',
                caption: 'لوحة توضيحية من المخطوط'
              },
              children: []
            }
          ]
        }
      ]
    }
  };
  repo.save({ id: doc1.id, snapshot: JSON.stringify(base1) });

  // Create Chapter 2 (English)
  const doc2 = repo.createDocument(m.id, 'Chapter 2: Literary Parallels and Notes');
  const base2 = {
    type: 'page',
    meta: { id: doc2.id, title: doc2.title, createDate: Date.now(), tags: [] },
    blocks: {
      type: 'block', id: doc2.id + '-page', flavour: 'affine:page', version: 2,
      props: { title: { '$blocksuite:internal:text$': true, delta: [{ insert: doc2.title }] } },
      children: [
        { type: 'block', id: doc2.id + '-surface', flavour: 'affine:surface', version: 5, props: { elements: {} }, children: [] },
        {
          type: 'block', id: doc2.id + '-note', flavour: 'affine:note', version: 1, props: {},
          children: [
            {
              type: 'block', id: 'h1-2', flavour: 'affine:paragraph', version: 1,
              props: { type: 'h1', text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'Cross-Cultural Perspectives' }] } },
              children: []
            },
            {
              type: 'block', id: 'p-2', flavour: 'affine:paragraph', version: 1,
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    { insert: 'Comparing classical Arabic prosody with contemporary literary criticism' },
                    { insert: ' ', attributes: { footnote: { label: '2', reference: { type: 'url', url: 'book:new-scientist:42', title: 'New Scientist 2016' } } } },
                    { insert: ' yields intriguing insights.' }
                  ]
                }
              },
              children: []
            }
          ]
        }
      ]
    }
  };
  repo.save({ id: doc2.id, snapshot: JSON.stringify(base2) });

  closeDatabase();
}
