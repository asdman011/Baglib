import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';

const root = path.resolve(process.env.BAGLIB_QURAN_TRANSLATION_ROOT || '.baglib-data/quran-arabic-translation');
const destination = path.resolve(process.argv[2] || 'repos/Quran/QUL Developer Resources/Arabic metadata - Baglib');
const report = JSON.parse(fs.readFileSync(path.join(root, 'validation.json'), 'utf8'));
if (!report.complete || report.sources.length !== 3) throw new Error('Translation incomplete; publication refused');
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const archives = JSON.parse(fs.readFileSync(path.join(root, 'source-archives.json'), 'utf8'));
for (const source of archives) assert.equal(hash(source.filename), source.sha256, 'Original archive changed');
const audit = JSON.parse(fs.readFileSync(path.join(root, 'audit.json'), 'utf8'));
fs.mkdirSync(destination, { recursive: true });
const files = [];
for (const source of report.sources) {
  const definition = audit.find(definition => definition.group === source.group);
  assert.ok(source.output && !source.issues.length && source.translatedRows === source.rows);
  assert.equal(hash(source.output.filename), source.output.sha256, 'Validated output changed');
  const target = path.join(destination, definition.target);
  if (fs.existsSync(target)) assert.equal(hash(target), source.output.sha256, 'Refusing to overwrite a different existing translation');
  else fs.copyFileSync(source.output.filename, target, fs.constants.COPYFILE_EXCL);
  files.push({ filename: definition.target, table: definition.table, rows: source.rows, translatedFields: definition.fields, sha256: source.output.sha256, originalSha256: source.sourceSha256 });
}
const manifest = { language: 'ar', status: 'ترجمة مكتملة للحقول المستهدفة مع حفظ بنية المصادر وأرقامها ونصوصها العربية السابقة', officialQulEdition: false, installedInBaglib: false, files, sources: archives, review: report.review || [] };
const readme = `# البيانات الوصفية القرآنية بالعربية\n\nتضم هذه الحزمة نسخًا عربية مشتقة من ملفات QUL التي قدمها المستخدم: معلومات السور، والموضوعات والمفاهيم، ومحاور الآيات وكلماتها المفتاحية.\n\nحُفظت بنية SQLite وأسماء الجداول والأعمدة والمفاتيح والمعرّفات والعلاقات والروابط والنصوص العربية السابقة دون تغيير. لم تُستكمل الخانات الفارغة أو المراجع المعيبة باجتهاد، ولم تُعدّل ملفات المصادر أو الموارد المثبتة في باجلب.\n\nاستُخدم النص العثماني لحفص من المورد المقدم للتحقق من الاقتباسات القرآنية، مع حذف زخارف أرقام الآيات من مرجع المطابقة وحده. النقول التاريخية والحديثية المترجمة عن معاني المصدر ليست تحقيقًا جديدًا لأسانيدها أو حكمًا بصحتها. تُراجع الملاحظات الخاصة بالمصدر في بيان المراجعة المرفق، إن وُجدت.\n\nأُنجزت الترجمة باستخدام نماذج لغوية مع فحوص بنيوية ونصية؛ ولا تُنسب إلى QUL بوصفها إصدارًا عربيًا رسميًا، ولا تُدّعى لها مراجعة علمية بشرية متخصصة. لم تُثبّت هذه النسخ في التطبيق تلقائيًا.\n`;
const payload = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2) + '\n'), 'README.md': strToU8(readme) };
for (const file of files) payload[file.filename] = new Uint8Array(fs.readFileSync(path.join(destination, file.filename)));
for (const [filename, bytes] of Object.entries(payload)) {
  const target = path.join(destination, filename);
  if (fs.existsSync(target)) assert.deepEqual(fs.readFileSync(target), Buffer.from(bytes), 'Refusing to overwrite an existing different artifact');
  else fs.writeFileSync(target, bytes, { flag: 'wx' });
}
const archive = path.join(destination, 'baglib-quran-arabic-metadata.zip');
if (!fs.existsSync(archive)) fs.writeFileSync(archive, zipSync(payload, { level: 6 }), { flag: 'wx' });
console.log(JSON.stringify({ destination, archive, files }));
