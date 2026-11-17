/**
 * Baglib — Migration 033: the built-in Image Occlusion note type (KEY-391).
 *
 * Seeds the stock type Anki 26.09 creates in rslib/src/image_occlusion/notetype.rs: the same field
 * names, order and templates, so a note exports to Anki unchanged. Data only, no schema change
 * (`card_note_type.kind` already allows `image_occlusion`). The CSS keeps Anki's mask colour
 * variables and uses BagLib's theme-aware text colour (KEY-407), with Anki's black as fallback.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

export const IMAGE_OCCLUSION_NOTE_TYPE_ID = 'stock-image-occlusion';
export const IMAGE_OCCLUSION_FIELDS = ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'] as const;

export const IMAGE_OCCLUSION_CSS = `#image-occlusion-canvas {
    --inactive-shape-color: #ffeba2;
    --active-shape-color: #ff8e8e;
    --inactive-shape-border: 1px #212121;
    --active-shape-border: 1px #212121;
    --highlight-shape-color: #ff8e8e00;
    --highlight-shape-border: 1px #ff8e8e;
}

.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: var(--fg, black);
    background-color: transparent;
}
`;

export const IMAGE_OCCLUSION_FRONT = `{{#Header}}<div>{{Header}}</div>{{/Header}}
<div style="display: none">{{cloze:Occlusion}}</div>
<div id="err"></div>
<div id="image-occlusion-container">
    {{Image}}
    <canvas id="image-occlusion-canvas"></canvas>
</div>
<script>
try {
    anki.imageOcclusion.setup();
} catch (exc) {
    document.getElementById("err").innerHTML = \`Error loading image occlusion. Is your Anki version up to date?<br><br>\${exc}\`;
}
</script>
`;

export const IMAGE_OCCLUSION_BACK = `${IMAGE_OCCLUSION_FRONT}
<div><button id="toggle">Toggle Masks</button></div>
{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}
`;

const migration: Migration = {
  id: 33,
  name: 'image_occlusion_note_type',
  up(db: Database) {
    const exists = db.prepare(`SELECT 1 FROM card_note_type WHERE id = ?`).get(IMAGE_OCCLUSION_NOTE_TYPE_ID);
    if (exists) return;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, created_at, updated_at)
       VALUES (?, 'Image Occlusion', 'image_occlusion', 'image_occlusion', ?, 0, ?, ?)`
    ).run(IMAGE_OCCLUSION_NOTE_TYPE_ID, IMAGE_OCCLUSION_CSS, now, now);
    const field = db.prepare(
      `INSERT INTO card_note_field (note_type_id, ord, name, rtl, source_text) VALUES (?, ?, ?, 0, 0)`
    );
    IMAGE_OCCLUSION_FIELDS.forEach((name, ord) => field.run(IMAGE_OCCLUSION_NOTE_TYPE_ID, ord, name));
    db.prepare(
      `INSERT INTO card_note_template (note_type_id, ord, name, front, back) VALUES (?, 0, 'Image Occlusion', ?, ?)`
    ).run(IMAGE_OCCLUSION_NOTE_TYPE_ID, IMAGE_OCCLUSION_FRONT, IMAGE_OCCLUSION_BACK);
  },
  down(db: Database) {
    const used = db.prepare(`SELECT 1 FROM card_note WHERE note_type_id = ? LIMIT 1`).get(IMAGE_OCCLUSION_NOTE_TYPE_ID);
    if (used) throw new Error('image-occlusion-notes-exist');
    db.prepare(`DELETE FROM card_note_type WHERE id = ?`).run(IMAGE_OCCLUSION_NOTE_TYPE_ID);
  },
};

export default migration;
