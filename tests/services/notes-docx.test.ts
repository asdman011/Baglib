import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { notesToDocx } from '../../src/main/services/notes-docx';

/** One file from a zip, read through its central directory (enough for a .docx; no extra dependency). */
function zipEntry(zip: Buffer, name: string): string {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < zip.readUInt16LE(end + 10); index++) {
    const method = zip.readUInt16LE(offset + 10), size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    if (zip.toString('utf8', offset + 46, offset + 46 + nameLength) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error(`missing ${name}`);
}

const labels = { title: 'ملاحظات بغلب', exported: 'صُدِّرت في', book: 'الكتاب', tags: 'الوسوم', aliases: 'أسماء أخرى', updated: 'آخر تعديل', contents: 'المحتويات', relations: { supports: 'يؤيد' } };
const base = { aliases: [], tags: [], createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' };

test('notes become one Word document with RTL Arabic, internal links and relationships', async () => {
  const buffer = await notesToDocx([
    { ...base, id: 'a', title: 'الصبر', content: '# باب الصبر\nالصبر **ضياء** ^p1\n- [[supports::note:b|Gratitude]]\n> قال تعالى\nPlain English line with [[quran:hafs:2:153|2:153]]', tags: ['أخلاق'], workId: 'w1' },
    { ...base, id: 'b', title: 'Gratitude', content: '```\ncode line\n```\nThanks' },
  ], new Map([['w1', 'رياض الصالحين']]), labels, true, new Date('2026-11-05T10:00:00Z'));
  assert.equal(buffer.subarray(0, 2).toString(), 'PK', 'a zip container');
  const xml = zipEntry(buffer, 'word/document.xml');
  for (const text of ['ملاحظات بغلب', 'الصبر', 'باب الصبر', 'ضياء', 'Gratitude', 'قال تعالى', 'رياض الصالحين', 'أخلاق', 'code line', 'Thanks', 'يؤيد', '2026-11-05']) assert.ok(xml.includes(text), text);
  assert.ok(!xml.includes('^p1'), 'paragraph anchors are not printed');
  assert.ok(!xml.includes('quran:hafs'), 'link targets are not printed');
  assert.match(xml, /<w:bookmarkStart[^>]*w:name="note_2"/u);
  assert.match(xml, /<w:hyperlink[^>]*w:anchor="note_2"/u);
  assert.ok(xml.includes('<w:bidi/>'), 'Arabic paragraphs are right to left');
  assert.ok(xml.includes('<w:rtl/>'), 'Arabic runs are right to left');
  assert.match(xml, /<w:p>(?:(?!<\/w:p>).)*?Plain English line/su);
  const english = /<w:p>((?:(?!<\/w:p>).)*?Plain English line(?:(?!<\/w:p>).)*?)<\/w:p>/su.exec(xml)?.[1] ?? '';
  assert.ok(!english.includes('<w:bidi/>'), 'an English line stays left to right');
});

test('Word layout: table of contents, page size, margins and page numbers', async () => {
  const two = [
    { ...base, id: 'a', title: 'الصبر', content: 'نص' },
    { ...base, id: 'b', title: 'Gratitude', content: 'Text' },
  ];
  const withContents = zipEntry(await notesToDocx(two, new Map(), labels, true, new Date('2026-11-05T10:00:00Z'), { contents: true, pageSize: 'a5', margins: 'wide' }), 'word/document.xml');
  assert.ok(withContents.includes('المحتويات'));
  assert.equal((withContents.match(/<w:hyperlink[^>]*w:anchor="note_\d"/gu) || []).length, 2, 'each contents line links to its note');
  assert.match(withContents, /<w:pgSz[^>]*w:w="8391"[^>]*w:h="11906"/u);
  assert.match(withContents, /<w:pgMar[^>]*w:left="2880"/u);
  const footer = zipEntry(await notesToDocx(two, new Map(), labels, true), 'word/footer1.xml');
  assert.match(footer, /PAGE/u, 'page numbers in the footer');
  const without = zipEntry(await notesToDocx(two, new Map(), labels, true, new Date(), { contents: false, pageSize: 'letter', margins: 'narrow' }), 'word/document.xml');
  assert.ok(!without.includes('المحتويات'));
  assert.match(without, /<w:pgSz[^>]*w:w="12240"/u);
  assert.match(without, /<w:pgMar[^>]*w:top="720"/u);
});

test('Word layout input from the renderer falls back to safe values', async () => {
  const { wordLayout } = await import('../../src/shared/word-export');
  assert.deepEqual(wordLayout({ contents: false, pageSize: 'a5', margins: 'narrow' }), { contents: false, pageSize: 'a5', margins: 'narrow' });
  assert.deepEqual(wordLayout({ contents: 'yes', pageSize: 'huge', margins: 1 }), { contents: true, pageSize: 'a4', margins: 'normal' });
  assert.deepEqual(wordLayout(null), { contents: true, pageSize: 'a4', margins: 'normal' });
});
