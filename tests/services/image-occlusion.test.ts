/**
 * KEY-391 image occlusion. Expected strings come from Anki 26.09's own tests
 * (rslib/src/image_occlusion/imageocclusion.rs, rslib/src/cloze.rs) and its editor
 * (ts/routes/image-occlusion/shapes/to-cloze.ts), so BagLib notes match Anki's byte for byte.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactOrdinals,
  floatToDisplay,
  getImageClozeData,
  imageFieldFor,
  mediaNameFromImageField,
  occlusionFieldToShapes,
  occlusionOrdinals,
  parseImageCloze,
  shapesToOcclusionField,
  type OcclusionShape,
} from '../../src/shared/revision/image-occlusion';
import { generateCards, processClozes } from '../../src/shared/revision/template-engine';
import type { CardNoteType } from '../../src/shared/types/card-notes';

test('Anki get_image_cloze_data golden outputs', () => {
  assert.equal(
    getImageClozeData('rect:left=10:top=20:width=30:height=10'),
    'data-shape="rect" data-left="10" data-top="20" data-width="30" data-height="10" '
  );
  assert.equal(
    getImageClozeData('ellipse:left=15:top=20:width=10:height=20:rx=10:ry=5'),
    'data-shape="ellipse" data-left="15" data-top="20" data-width="10" data-height="20" data-rx="10" data-ry="5" '
  );
  assert.equal(getImageClozeData('polygon:points=0,0 10,10 20,0'), 'data-shape="polygon" data-points="0,0 10,10 20,0" ');
  assert.equal(
    getImageClozeData(String.raw`text:text=\\foo\:bar\::left=10`),
    'data-shape="text" data-text="&#x5C;foo&#x3A;bar&#x3A;" data-left="10" '
  );
  assert.equal(
    getImageClozeData(String.raw`text:text=\:lol\::left=10`),
    'data-shape="text" data-text="&#x3A;lol&#x3A;" data-left="10" '
  );
  // Zero width is dropped, as in Anki; oi becomes data-occludeInactive.
  assert.equal(
    getImageClozeData('rect:left=.1:top=.2:width=0:height=.3:oi=1'),
    'data-shape="rect" data-left=".1" data-top=".2" data-height=".3" data-occludeInactive="1" '
  );
  // Arabic label text passes through untouched.
  assert.equal(getImageClozeData('text:left=.1:top=.1:text=بغداد'), 'data-shape="text" data-left=".1" data-top=".1" data-text="بغداد" ');
});

test('Anki parse_image_cloze handles escaped text (image_occlusion_with_funny_text)', () => {
  const parsed = parseImageCloze(String.raw`text:left=10:top=20:text=\:l\\ol\::width=30:height=40`)!;
  assert.equal(parsed.shape, 'text');
  assert.equal(parsed.properties.length, 5);
  assert.deepEqual(parsed.properties.find(p => p.name === 'text'), { name: 'text', value: String.raw`:l\ol:` });
  assert.deepEqual(parsed.properties.find(p => p.name === 'width'), { name: 'width', value: '30' });
});

test('Anki image_cloze reveal: active shape on the question side', () => {
  const { rendered } = processClozes('{{c1::image-occlusion:rect:left=10.0:top=20:width=30:height=10}}', 1, 'front');
  assert.equal(
    rendered,
    '<div class="cloze" data-ordinal="1" data-shape="rect" data-left="10.0" data-top="20" data-width="30" data-height="10" ></div>'
  );
});

test('render states: inactive, highlight on the answer side, ordinal 0 always active, multi-ordinal', () => {
  const field = '{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.2:oi=1}}<br>{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.1:oi=1}}<br>{{c0::image-occlusion:text:left=.7:top=.7:text=Nile:scale=1}}<br>';
  const front2 = processClozes(field, 2, 'front').rendered;
  assert.match(front2, /<div class="cloze-inactive" data-ordinal="1" data-shape="rect"/u);
  assert.match(front2, /<div class="cloze" data-ordinal="2" data-shape="ellipse"/u);
  assert.match(front2, /<div class="cloze" data-ordinal="0" data-shape="text"/u);
  const back2 = processClozes(field, 2, 'back').rendered;
  assert.match(back2, /<div class="cloze-highlight" data-ordinal="2"/u);
  assert.match(back2, /<div class="cloze-inactive" data-ordinal="1"/u);
  const multi = processClozes('{{c1,2::image-occlusion:rect:left=10:top=20:width=30:height=40}}', 2, 'front').rendered;
  assert.match(multi, /data-ordinal="1,2"/u);
});

test('escaped "\\::" in label text is not read as a cloze hint', () => {
  const { rendered } = processClozes(String.raw`{{c0::image-occlusion:text:left=.1:top=.1:text=a\::scale=1}}`, 1, 'front');
  assert.match(rendered, /data-text="a&#x3A;"/u);
  assert.match(rendered, /data-scale="1"/u);
});

test('writing shapes matches Anki editor output, and reading it back round-trips', () => {
  assert.equal(floatToDisplay(0.2325), '.2325');
  assert.equal(floatToDisplay(0), '.0000');
  assert.equal(floatToDisplay(1), '1.');
  const shapes: OcclusionShape[] = [
    { kind: 'rect', ordinal: 1, left: 0.2325, top: 0.3261, width: 0.202, height: 0.0975 },
    { kind: 'ellipse', ordinal: 2, left: 0.5, top: 0.4, rx: 0.1, ry: 0.05 },
    { kind: 'polygon', ordinal: 2, left: 0.1, top: 0.6, points: [{ x: 0.1, y: 0.6 }, { x: 0.3, y: 0.7 }, { x: 0.15, y: 0.9 }] },
    { kind: 'text', ordinal: 0, left: 0.7, top: 0.1, text: 'نهر: النيل', scale: 1, fontSize: 0.05 },
  ];
  const hideAll = shapesToOcclusionField(shapes, true);
  assert.equal(
    hideAll.split('<br>')[0],
    '{{c1::image-occlusion:rect:left=.2325:top=.3261:width=.202:height=.0975:oi=1}}'
  );
  assert.match(hideAll, /\{\{c0::image-occlusion:text:left=\.7:top=\.1:text=نهر\\: النيل:scale=1\.:fs=\.05:oi=1\}\}<br>/u);
  const hideOne = shapesToOcclusionField(shapes, false);
  assert.ok(!hideOne.includes(':oi=1'));

  const back = occlusionFieldToShapes(hideAll);
  assert.equal(back.occludeInactive, true);
  assert.equal(back.shapes.length, 4);
  assert.equal(back.shapes[3].text, 'نهر: النيل');
  assert.deepEqual(back.shapes[2].points, [{ x: 0.1, y: 0.6 }, { x: 0.3, y: 0.7 }, { x: 0.15, y: 0.9 }]);
  assert.equal(occlusionFieldToShapes(hideOne).occludeInactive, false);
  assert.deepEqual(occlusionOrdinals(back.shapes), [1, 2]);
});

test('compactOrdinals keeps groups together and puts text labels on 0', () => {
  const out = compactOrdinals([
    { kind: 'rect', ordinal: 5, left: 0, top: 0, width: 0.1, height: 0.1 },
    { kind: 'rect', ordinal: 9, left: 0, top: 0, width: 0.1, height: 0.1 },
    { kind: 'ellipse', ordinal: 5, left: 0, top: 0, rx: 0.1, ry: 0.1 },
    { kind: 'text', ordinal: 3, left: 0, top: 0, text: 'x' },
  ]);
  assert.deepEqual(out.map(s => s.ordinal), [1, 2, 1, 0]);
});

test('image occlusion note type generates one card per group, in both modes', () => {
  const type = {
    id: 'stock-image-occlusion',
    name: 'Image Occlusion',
    kind: 'image_occlusion',
    templates: [
      {
        ord: 0,
        name: 'Image Occlusion',
        front: '<div style="display: none">{{cloze:Occlusion}}</div><div id="image-occlusion-container">{{Image}}<canvas id="image-occlusion-canvas"></canvas></div>',
        back: '<div style="display: none">{{cloze:Occlusion}}</div><div id="image-occlusion-container">{{Image}}<canvas id="image-occlusion-canvas"></canvas></div>',
      },
    ],
  } as unknown as CardNoteType;
  const shapes: OcclusionShape[] = [
    { kind: 'rect', ordinal: 1, left: 0.1, top: 0.1, width: 0.2, height: 0.1 },
    { kind: 'rect', ordinal: 2, left: 0.5, top: 0.1, width: 0.2, height: 0.1 },
    { kind: 'ellipse', ordinal: 2, left: 0.5, top: 0.5, rx: 0.1, ry: 0.1 },
    { kind: 'text', ordinal: 0, left: 0.8, top: 0.8, text: 'label' },
  ];
  for (const oi of [true, false]) {
    const cards = generateCards(type, { Occlusion: shapesToOcclusionField(shapes, oi), Image: imageFieldFor('a.png') });
    assert.deepEqual(cards.map(c => c.ord), [0, 1], 'two groups give two cards; the text label gives none');
    assert.match(cards[1].front, /<div class="cloze" data-ordinal="2" data-shape="rect"/u);
    assert.match(cards[1].front, /<div class="cloze" data-ordinal="2" data-shape="ellipse"/u);
    assert.match(cards[1].front, /<div class="cloze-inactive" data-ordinal="1"/u);
    assert.equal(/data-occludeInactive="1"/u.test(cards[1].front), oi);
    assert.match(cards[1].front, /<img src="a.png">/u);
  }
});

test('image field helpers', () => {
  assert.equal(imageFieldFor('ab.png'), '<img src="ab.png">');
  assert.equal(mediaNameFromImageField('<img src="ab.png">'), 'ab.png');
  assert.equal(mediaNameFromImageField("<img alt='x' src='c.jpg' />"), 'c.jpg');
  assert.equal(mediaNameFromImageField('no image'), null);
});

test('saved Image Occlusion note: stock type seeded, one card per group, deck export in Anki format', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('../../src/main/database/migrator');
  const { migrations } = await import('../../src/main/database/migrations');
  const { CardNoteRepository } = await import('../../src/main/database/repositories/card-note.repository');
  const { DeckRepository } = await import('../../src/main/database/repositories/deck.repository');
  const { CardDeckService } = await import('../../src/main/services/card-decks');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  try {
    const notes = new CardNoteRepository(db);
    const type = notes.getNoteType('stock-image-occlusion')!;
    assert.equal(type.kind, 'image_occlusion');
    assert.deepEqual(type.fields.map(f => f.name), ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments']);
    assert.match(type.templates[0].front, /anki\.imageOcclusion\.setup\(\)/u);

    const deck = new DeckRepository(db).createDeck({ name: 'خرائط' });
    const media = `${'a'.repeat(40)}.png`;
    const shapes: OcclusionShape[] = [
      { kind: 'rect', ordinal: 1, left: 0.1, top: 0.1, width: 0.2, height: 0.1 },
      { kind: 'ellipse', ordinal: 2, left: 0.5, top: 0.5, rx: 0.1, ry: 0.1 },
      { kind: 'rect', ordinal: 2, left: 0.7, top: 0.2, width: 0.1, height: 0.1 },
      { kind: 'text', ordinal: 0, left: 0.8, top: 0.8, text: 'دجلة' },
    ];
    const saved = notes.saveNote({
      noteTypeId: 'stock-image-occlusion',
      fields: { Occlusion: shapesToOcclusionField(shapes, true), Image: imageFieldFor(media), Header: 'أنهار العراق', 'Back Extra': '', Comments: '' },
      deckId: deck.id,
    });
    assert.equal(saved.cards.length, 2, 'two groups make two cards');

    const exported = new CardDeckService(db).exportText(deck.id);
    assert.ok(exported.imageOcclusion, 'the deck has an image occlusion export');
    assert.deepEqual(exported.imageOcclusion!.media, [media]);
    const lines = exported.imageOcclusion!.text.trimEnd().split('\n');
    assert.deepEqual(lines.slice(0, 6), ['#separator:Tab', '#html:true', '#notetype:Image Occlusion', '#deck:خرائط', '#guid column:1', '#tags column:7']);
    assert.equal(lines.length, 7, 'one row per note, not per card');
    assert.ok(lines[6].includes('{{c2::image-occlusion:ellipse:'));
    assert.ok(lines[6].includes('<img src=""' + media + '"">'), 'quotes in HTML fields are doubled, as Anki expects');
    assert.ok(!exported.text.includes('image-occlusion'), 'the Basic file has no image occlusion cards');
  } finally {
    db.close();
  }
});
