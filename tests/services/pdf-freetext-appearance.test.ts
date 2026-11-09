import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'js-yaml';

const python = path.resolve('.baglib-data/pdf-engine/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const helper = path.resolve('assets/pdf-editor/baglib_marks.py');
const available = existsSync(python);
const texts = ['بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ سُكُونۡ', 'English notes and readable text.', 'سورة 2:255 Al-Baqarah'];
const setup = `
import json, sys, pikepdf
from pikepdf import Array, Dictionary, Name, String
folder = sys.argv[1]
doc = pikepdf.Pdf.new()
page = doc.add_blank_page(page_size=(600, 600))
page.obj.Annots = Array([doc.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Text, Rect=Array([10,10,30,30]), Contents=String('Foreign note'), NM=String('outside'), F=4))])
doc.save(folder + '/source.pdf')
`;

async function fixture(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.resolve('.baglib-data/key270-test-'));
  try {
    execFileSync(python, ['-I', '-c', setup, directory], { windowsHide: true });
    await writeFile(path.join(directory, 'payload.json'), JSON.stringify({ items: texts.map((text, index) => ({ id: String(index), kind: 'text', page: 1, text, rtl: index !== 1, box: { x: 8, y: 8 + index * 24, width: 84, height: 20 } })), bookmarks: [] }));
    await action(directory);
  } finally {
    assert.ok(directory.startsWith(path.resolve('.baglib-data') + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
}
function write(directory: string, source = 'source.pdf', output = 'saved.pdf') {
  return JSON.parse(execFileSync(python, ['-I', helper, 'write', path.join(directory, source), path.join(directory, output), path.join(directory, 'payload.json')], { encoding: 'utf8', windowsHide: true }));
}
function check(directory: string, script: string) {
  return JSON.parse(execFileSync(python, ['-I', '-c', script, directory], { encoding: 'utf8', windowsHide: true }));
}

test('FreeText has embedded subset appearances, original Unicode, and stable repeat saves', { skip: !available }, async () => {
  await fixture(async directory => {
    assert.deepEqual(write(directory).warnings, []);
    write(directory, 'saved.pdf', 'again.pdf');
    const result = check(directory, String.raw`
import json, sys, pikepdf
from fontTools.ttLib import TTFont
from io import BytesIO
folder = sys.argv[1]
counts = []
for filename in ['saved.pdf', 'again.pdf']:
 with pikepdf.open(folder + '/' + filename) as doc:
  annots = doc.pages[0].obj.Annots
  assert len(annots) == 4
  assert str(annots[0].Contents) == 'Foreign note' and str(annots[0].NM) == 'outside'
  fonts = set()
  for annot in list(annots)[1:]:
   assert '/AP' in annot and '/DA' in annot
   ap = annot.AP.N
   assert list(ap.BBox) == list(annot.Rect)
   assert b'Tj' in ap.read_bytes()
   assert b'/ActualText' in ap.read_bytes()
   for font in ap.Resources.Font.values():
    assert font.Subtype == pikepdf.Name.Type0 and font.Encoding == pikepdf.Name('/Identity-H')
    descendant = font.DescendantFonts[0]
    assert descendant.Subtype == pikepdf.Name.CIDFontType2 and len(descendant.W) > 0
    cmap = font.ToUnicode.read_bytes()
    assert b'beginbfchar' in cmap
    embedded = TTFont(BytesIO(descendant.FontDescriptor.FontFile2.read_bytes()))
    assert len(embedded.getGlyphOrder()) < 300
    fonts.add(font.objgen)
  counts.append(sum(1 for obj in doc.objects if isinstance(obj, pikepdf.Dictionary) and obj.get('/Type') == pikepdf.Name.Font))
  assert len(fonts) == 2
  assert [str(a.Contents) for a in list(annots)[1:]] == [i['text'] for i in json.load(open(folder + '/payload.json', encoding='utf8'))['items']]
assert counts[0] == counts[1]
print(json.dumps({'fontCounts': counts}))
`);
    assert.deepEqual(result.fontCounts, [4, 4]);
  });
});

test('ToUnicode extraction preserves exact Arabic marks and mixed source order', { skip: !available }, async () => {
  await fixture(async directory => {
    write(directory);
    const result = check(directory, String.raw`
import json, re, sys, pikepdf
from fontTools.ttLib import TTFont
font = TTFont('assets/pdf-editor/fonts/NotoNaskhArabic-Regular.ttf')
assert 0x06e1 in font.getBestCmap()
with pikepdf.open(sys.argv[1] + '/saved.pdf') as doc:
 extracted = []
 for annot in list(doc.pages[0].obj.Annots)[1:]:
  ap = annot.AP.N
  maps = {}
  for key, font in ap.Resources.Font.items():
   data = font.ToUnicode.read_bytes().decode('ascii')
   pairs = []
   for block in re.findall(r'beginbfchar(.*?)endbfchar', data, re.S):
    pairs.extend(re.findall(r'<([0-9A-F]+)>\s*<([0-9A-F]+)>', block))
   maps[str(key)[1:]] = {int(cid, 16): bytes.fromhex(value).decode('utf-16-be') for cid, value in pairs}
  # Read the AP text operators in logical order using only their embedded ToUnicode.
  text = ''.join(maps[key][int(cid, 16)].replace('\ufeff', '') for key, cid in re.findall(r'BT /(\w+) .*?<([0-9A-F]+)> Tj ET', ap.read_bytes().decode('ascii')))
  assert text == str(annot.Contents), (ascii(text), ascii(str(annot.Contents)))
  extracted.append(text)
 print(json.dumps(extracted, ensure_ascii=True))
`);
    assert.deepEqual(result, texts);
  });
});

test('PDFium renders repeated appearances identically, with text inside each box', { skip: !available }, async () => {
  await fixture(async directory => {
    write(directory);
    write(directory, 'saved.pdf', 'again.pdf');
    assert.equal(check(directory, String.raw`
import json, sys, pypdfium2 as pdfium
from PIL import ImageChops
folder = sys.argv[1]
images = []
for filename in ['saved.pdf', 'again.pdf']:
 with pdfium.PdfDocument(folder + '/' + filename) as doc:
  images.append(doc[0].render(scale=2, draw_annots=True).to_pil().convert('RGB'))
assert ImageChops.difference(*images).getbbox() is None
for index in range(3):
 crop = images[0].crop((96, 96 + index * 288, 1104, 336 + index * 288))
 assert ImageChops.invert(crop).getbbox(), index
print('true')
`), true);
  });
});

test('layout wraps paragraphs and keeps RTL/LTR text upright on cropped rotated pages', { skip: !available }, async () => {
  await fixture(async directory => {
    const result = check(directory, String.raw`
import importlib.util, json, sys, pikepdf, pypdfium2 as pdfium
from pikepdf import Array
spec = importlib.util.spec_from_file_location('marks', ${JSON.stringify(helper)})
marks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(marks)
doc = pikepdf.Pdf.new()
for rotation in [0, 90, 180, 270]:
 page = doc.add_blank_page(page_size=(640, 840))
 page.obj.CropBox = Array([20, 30, 620, 830])
 page.obj.Rotate = rotation
ctx = marks.TextAppearances(doc)
text = 'العربية English (123) بَلَدٌ'
assert ''.join(run[1] for run in marks.direction_runs(text, True)) == 'بَلَدٌ English (123) العربية'
assert ''.join(run[1] for run in marks.direction_runs(text, False)) == text
wrapped = ctx.lines(text + '\n' + 'كَلِمَةٌ' * 15, True, 100, 11)
assert len(wrapped) > 2
assert ''.join(wrapped) == text + 'كَلِمَةٌ' * 15
assert all(not __import__('unicodedata').combining(line[0]) for line in wrapped if line)
for index, page in enumerate(doc.pages):
 frame = marks.Frame(page)
 item = {'id': str(index), 'kind': 'text', 'text': text, 'rtl': True, 'box': {'x': 10, 'y': 10, 'width': 70, 'height': 30}}
 annot = marks.shape_mark(doc, frame, item, ctx)
 page.obj.Annots = Array([annot])
ctx.finish()
doc.save(sys.argv[1] + '/rotated.pdf')
with pdfium.PdfDocument(sys.argv[1] + '/rotated.pdf') as pdf:
 for index in range(4):
  image = pdf[index].render(scale=2, draw_annots=True).to_pil().convert('RGB')
  bbox = __import__('PIL.ImageChops', fromlist=['invert']).invert(image).getbbox()
  assert bbox and bbox[1] >= image.height * 0.1 and bbox[3] < image.height * 0.4
print(json.dumps({'wrappedLines': len(wrapped), 'rotations': 4}))
`);
    assert.equal(result.rotations, 4);
    assert.ok(result.wrappedLines > 2);
  });
});

test('missing either shaping library preserves saving and reports a warning', { skip: !available }, async () => {
  await fixture(async directory => {
    for (const blocked of ['uharfbuzz', 'fontTools']) {
      const result = check(directory, String.raw`
import builtins, importlib.util, json, sys, io, contextlib, pikepdf
spec = importlib.util.spec_from_file_location('marks', ${JSON.stringify(helper)})
marks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(marks)
original = builtins.__import__
def importing(name, *args, **kwargs):
 if name.split('.')[0] == '${blocked}': raise ImportError('simulated missing shaping dependency')
 return original(name, *args, **kwargs)
builtins.__import__ = importing
folder = sys.argv[1]
output = io.StringIO()
with contextlib.redirect_stdout(output): marks.write(folder + '/source.pdf', folder + '/fallback.pdf', folder + '/payload.json')
result = json.loads(output.getvalue())
assert result['written'] == 3 and result['warnings']
with pikepdf.open(folder + '/fallback.pdf') as doc:
 assert all('/AP' not in a for a in list(doc.pages[0].obj.Annots)[1:])
print(json.dumps(result))
`);
      assert.equal(result.written, 3);
      assert.ok(result.warnings.length > 0);
    }
  });
});

test('shaping requirements pin approved wheels and packaging ships the regular font and licence', () => {
  const shaping = readFileSync('assets/pdf-editor/requirements-shaping.txt', 'utf8');
  const ocr = readFileSync('assets/pdf-editor/requirements-ocr.txt', 'utf8');
  for (const name of ['uharfbuzz==0.57.0', 'fonttools==4.68.0']) {
    const line = ocr.split(/\r?\n/u).find(value => value.startsWith(name));
    assert.ok(line);
    assert.ok(shaping.includes(line));
  }
  const config = load(readFileSync('electron-builder.yml', 'utf8')) as { extraResources: { from: string; to: string; filter?: string[] }[] };
  const resource = config.extraResources.find(value => value.from === 'assets/pdf-editor');
  assert.equal(resource?.to, 'pdf-editor');
  assert.ok(resource?.filter?.includes('**/*'));
  assert.ok(existsSync('assets/pdf-editor/fonts/NotoNaskhArabic-Regular.ttf'));
  assert.match(readFileSync('assets/pdf-editor/fonts/OFL.txt', 'utf8'), /SIL OPEN FONT LICENSE/u);
});
