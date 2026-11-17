/**
 * Baglib — Image occlusion (KEY-391), compatible with Anki 26.09.
 *
 * Ported from Anki's own code so a note round-trips unchanged:
 * - parsing:   rslib/src/image_occlusion/imageocclusion.rs (parse_image_cloze, get_image_cloze_data)
 * - rendering: rslib/src/cloze.rs (render_image_occlusion)
 * - writing:   ts/routes/image-occlusion/shapes/to-cloze.ts (shapeOrShapesToCloze, floatToDisplay)
 *
 * Storage: every shape is one cloze in the Occlusion field, for example
 *   {{c1::image-occlusion:rect:left=.2325:top=.3261:width=.202:height=.0975:oi=1}}<br>
 * Coordinates are normalised to 0–1 of the image size. Shapes that share an ordinal form a group
 * and are asked together. Text labels use ordinal 0 and are always shown.
 * `oi=1` ("occlude inactive") gives "hide all, guess one"; without it, "hide one, guess one".
 */

export type OcclusionShapeKind = 'rect' | 'ellipse' | 'polygon' | 'text';

export interface OcclusionPoint {
  x: number;
  y: number;
}

/** One shape, with coordinates normalised to 0–1 of the image. */
export interface OcclusionShape {
  kind: OcclusionShapeKind;
  /** Cloze ordinal; shapes with the same ordinal are one group. Text labels use 0. */
  ordinal: number;
  left: number;
  top: number;
  width?: number;
  height?: number;
  rx?: number;
  ry?: number;
  points?: OcclusionPoint[];
  text?: string;
  /** Text scale (Anki locks the aspect ratio, so one number). */
  scale?: number;
  /** Text font size, normalised to the image height. */
  fontSize?: number;
  angle?: number;
  fill?: string;
}

export interface OcclusionProperty {
  name: string;
  value: string;
}

/** Anki's mask colour; a fill equal to it is not stored. */
export const SHAPE_MASK_COLOR = '#ffeba2';
export const TEXT_COLOR = '#000000';
export const TEXT_BACKGROUND_COLOR = '#ffffff';
export const TEXT_FONT_FAMILY = 'Arial';
export const TEXT_PADDING = 5;
export const TEXT_FONT_SIZE = 40;
const ANGLE_STEPS = 10000;

export const IMAGE_OCCLUSION_PREFIX = 'image-occlusion:';

/** Up to 4 fraction digits, leading/trailing zeros removed (Anki's floatToDisplay). */
export function floatToDisplay(value: number): string {
  if (Number.isNaN(value) || value === 0) return '.0000';
  return value.toFixed(4).replace(/^0+|0+$/gu, '');
}

export function angleToStored(angle: number | undefined): number | null {
  const deg = Number(angle ?? 0) % 360;
  return Number.isNaN(deg) ? null : Math.round((deg / 360) * ANGLE_STEPS);
}

export function storedToAngle(value: string | number | undefined): number | null {
  const steps = Number(value) % ANGLE_STEPS;
  return Number.isNaN(steps) ? null : (steps / ANGLE_STEPS) * 360;
}

/**
 * Parses `rect:left=.2:top=.3:...` (the text after `image-occlusion:`).
 * Values escape `\` and `:` with a backslash, as in Anki.
 */
export function parseImageCloze(text: string): { shape: string; properties: OcclusionProperty[] } | null {
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  const shape = text.slice(0, colon);
  const properties: OcclusionProperty[] = [];
  let i = colon;
  while (i < text.length && text[i] === ':') {
    const eq = text.indexOf('=', i + 1);
    if (eq < 0) break;
    const name = text.slice(i + 1, eq);
    if (!name || name.includes(':')) break;
    let value = '';
    let j = eq + 1;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '\\') {
        const next = text[j + 1];
        if (next === '\\' || next === ':') {
          value += next;
          j += 2;
          continue;
        }
        break;
      }
      if (ch === ':') break;
      value += ch;
      j += 1;
    }
    // Anki's escaped_transform needs at least one character for the value.
    if (j === eq + 1) break;
    properties.push({ name, value });
    i = j;
  }
  return { shape, properties };
}

function isEmptyOrZero(value: string): boolean {
  return value === '' || value === '0';
}

/**
 * htmlescape::encode_attribute, as Anki uses it: characters below 256 that are not ASCII letters or
 * digits become `&#xHH;`; everything else (Arabic included) is kept.
 */
function encodeAttribute(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    out += code < 256 && !/[A-Za-z0-9]/u.test(ch) ? `&#x${code.toString(16).toUpperCase()};` : ch;
  }
  return out;
}

/** The `data-*` attributes Anki writes for one shape (get_image_cloze_data). */
export function getImageClozeData(text: string): string {
  const occlusion = parseImageCloze(text);
  if (!occlusion) return '';
  let result = '';
  if (['rect', 'ellipse', 'polygon', 'text'].includes(occlusion.shape)) {
    result += `data-shape="${occlusion.shape}" `;
  }
  for (const { name, value } of occlusion.properties) {
    switch (name) {
      case 'left':
      case 'top':
      case 'angle':
      case 'fill':
        if (value !== '') result += `data-${name}="${value}" `;
        break;
      case 'width':
      case 'height':
      case 'rx':
      case 'ry':
      case 'scale':
        if (!isEmptyOrZero(value)) result += `data-${name}="${value}" `;
        break;
      case 'points':
        if (value !== '') {
          const pairs: string[] = [];
          for (const pair of value.split(' ')) {
            const comma = pair.indexOf(',');
            if (comma < 0) continue;
            pairs.push(`${pair.slice(0, comma)},${pair.slice(comma + 1)}`);
          }
          if (pairs.length) result += `data-points="${pairs.join(' ')}" `;
        }
        break;
      case 'oi':
        if (value !== '') result += `data-occludeInactive="${value}" `;
        break;
      case 'text':
        if (value !== '') result += `data-text="${encodeAttribute(value)}" `;
        break;
      case 'fs':
        if (value !== '') result += `data-font-size="${value}" `;
        break;
      default:
        break;
    }
  }
  return result;
}

/** Anki's render_image_occlusion: the hidden <div> the review script reads to draw masks. */
export function renderImageOcclusion(text: string, questionSide: boolean, active: boolean, ordinals: number[]): string {
  const ords = ordinals.join(',');
  const data = getImageClozeData(text);
  if ((questionSide && active) || ordinals.includes(0)) {
    return `<div class="cloze" data-ordinal="${ords}" ${data}></div>`;
  }
  if (!active) return `<div class="cloze-inactive" data-ordinal="${ords}" ${data}></div>`;
  if (!questionSide && active) return `<div class="cloze-highlight" data-ordinal="${ords}" ${data}></div>`;
  return '';
}

function escapeValue(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/:/gu, '\\:');
}

function shapeData(shape: OcclusionShape): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['left', floatToDisplay(shape.left)],
    ['top', floatToDisplay(shape.top)],
  ];
  const angle = angleToStored(shape.angle);
  if (angle) out.push(['angle', String(angle)]);
  switch (shape.kind) {
    case 'rect':
      out.push(['width', floatToDisplay(shape.width ?? 0)], ['height', floatToDisplay(shape.height ?? 0)]);
      if (shape.fill && shape.fill !== SHAPE_MASK_COLOR) out.push(['fill', shape.fill]);
      break;
    case 'ellipse':
      out.push(['rx', floatToDisplay(shape.rx ?? 0)], ['ry', floatToDisplay(shape.ry ?? 0)]);
      if (shape.fill && shape.fill !== SHAPE_MASK_COLOR) out.push(['fill', shape.fill]);
      break;
    case 'polygon':
      out.push(['points', (shape.points ?? []).map(p => `${floatToDisplay(p.x)},${floatToDisplay(p.y)}`).join(' ')]);
      if (shape.fill && shape.fill !== SHAPE_MASK_COLOR) out.push(['fill', shape.fill]);
      break;
    case 'text':
      out.push(['text', shape.text ?? ''], ['scale', floatToDisplay(shape.scale ?? 1)]);
      if (shape.fontSize) out.push(['fs', floatToDisplay(shape.fontSize)]);
      if (shape.fill && shape.fill !== TEXT_COLOR) out.push(['fill', shape.fill]);
      break;
  }
  return out;
}

/** One cloze for one shape, exactly as Anki's editor writes it. */
export function shapeToCloze(shape: OcclusionShape, occludeInactive: boolean): string {
  let text = '';
  for (const [key, value] of shapeData(shape)) text += `:${key}=${escapeValue(value)}`;
  if (occludeInactive) text += ':oi=1';
  return `{{c${shape.ordinal}::${IMAGE_OCCLUSION_PREFIX}${shape.kind}${text}}}<br>`;
}

/** Text for the Occlusion field. Shapes keep their own ordinals (groups share one). */
export function shapesToOcclusionField(shapes: OcclusionShape[], occludeInactive: boolean): string {
  return shapes.map(shape => shapeToCloze(shape, occludeInactive)).join('');
}

function num(props: Map<string, string>, name: string): number | undefined {
  const raw = props.get(name);
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Reads the Occlusion field back into shapes, for editing. Unknown shapes are skipped. */
export function occlusionFieldToShapes(field: string): { shapes: OcclusionShape[]; occludeInactive: boolean } {
  const shapes: OcclusionShape[] = [];
  let occludeInactive = false;
  const re = /\{\{c(\d+(?:,\d+)*)::image-occlusion:([^}]*)\}\}/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(field)) !== null) {
    const ordinal = Number(match[1].split(',')[0]);
    const parsed = parseImageCloze(match[2]);
    if (!parsed || !Number.isSafeInteger(ordinal)) continue;
    const kind = parsed.shape as OcclusionShapeKind;
    if (!['rect', 'ellipse', 'polygon', 'text'].includes(kind)) continue;
    const props = new Map(parsed.properties.map(p => [p.name, p.value]));
    if (props.get('oi') === '1') occludeInactive = true;
    const shape: OcclusionShape = {
      kind,
      ordinal,
      left: num(props, 'left') ?? 0,
      top: num(props, 'top') ?? 0,
    };
    const angle = storedToAngle(props.get('angle'));
    if (angle) shape.angle = angle;
    if (props.get('fill')) shape.fill = props.get('fill');
    if (kind === 'rect') {
      shape.width = num(props, 'width') ?? 0;
      shape.height = num(props, 'height') ?? 0;
    } else if (kind === 'ellipse') {
      shape.rx = num(props, 'rx') ?? 0;
      shape.ry = num(props, 'ry') ?? 0;
    } else if (kind === 'polygon') {
      shape.points = (props.get('points') ?? '')
        .split(' ')
        .map(pair => pair.split(','))
        .filter(pair => pair.length === 2)
        .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    } else {
      shape.text = props.get('text') ?? '';
      shape.scale = num(props, 'scale') ?? 1;
      const fs = num(props, 'fs');
      if (fs) shape.fontSize = fs;
    }
    shapes.push(shape);
  }
  return { shapes, occludeInactive };
}

/** Ordinals that produce cards (text labels, ordinal 0, never do). */
export function occlusionOrdinals(shapes: OcclusionShape[]): number[] {
  return [...new Set(shapes.map(s => s.ordinal).filter(n => n > 0))].sort((a, b) => a - b);
}

/** Renumbers groups to 1..n in their current order, keeping shapes of one group together. */
export function compactOrdinals(shapes: OcclusionShape[]): OcclusionShape[] {
  const map = new Map<number, number>();
  let next = 1;
  return shapes.map(shape => {
    if (shape.kind === 'text' || shape.ordinal === 0) return { ...shape, ordinal: 0 };
    if (!map.has(shape.ordinal)) map.set(shape.ordinal, next++);
    return { ...shape, ordinal: map.get(shape.ordinal)! };
  });
}

/** Anki's image field holds an <img>; BagLib stores the card-media file name in it. */
export function imageFieldFor(mediaName: string): string {
  return `<img src="${mediaName}">`;
}

export function mediaNameFromImageField(field: string): string | null {
  const match = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/iu.exec(field);
  return match ? match[1] : null;
}
