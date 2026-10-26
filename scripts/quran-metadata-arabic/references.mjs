import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.baglib-data/quran-arabic-translation');
const database = new DatabaseSync(path.join(root, 'qpc-hafs-word-by-word.db'), { readOnly: true });
const verses = {};
for (const word of database.prepare('SELECT surah,ayah,word,text FROM words ORDER BY surah,ayah,word').all()) {
  const key = `${word.surah}:${word.ayah}`;
  verses[key] = verses[key] ? `${verses[key]} ${word.text}` : word.text;
}
database.close();
for (const key of Object.keys(verses)) verses[key] = verses[key].replace(/\s+[٠-٩]+$/u, '');
const metadata = new DatabaseSync(path.join(root, 'quran-metadata-surah-name.sqlite'), { readOnly: true });
const chapters = metadata.prepare('SELECT id,name,name_simple,name_arabic,revelation_order,revelation_place FROM chapters ORDER BY id').all();
metadata.close();
if (Object.keys(verses).length !== 6236 || chapters.length !== 114) throw new Error('Incomplete canonical references');
fs.writeFileSync(path.join(root, 'canonical-ayahs.json'), JSON.stringify(verses, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'surah-names.json'), JSON.stringify(chapters, null, 2) + '\n');
console.log(JSON.stringify({ verses: Object.keys(verses).length, chapters: chapters.length, first: verses['1:1'] }));
const hadithFile = path.join(root, 'hadith-tirmidhi.json');
if (fs.existsSync(hadithFile)) {
  const book = JSON.parse(fs.readFileSync(hadithFile, 'utf8'));
  const selected = book.hadiths.filter(row => [3191, 3192, 3193, 3194, 3291, 3331].includes(row.idInBook));
  fs.writeFileSync(path.join(root, 'hadith-reference-excerpts.json'), JSON.stringify({ source: 'repos/hadith-json-main.zip / hadith-json-main/db/by_book/the_9_books/tirmidhi.json', rows: selected }, null, 2) + '\n');
  console.log(JSON.stringify({ hadithReferences: selected.map(row => row.idInBook) }));
}
