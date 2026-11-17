/**
 * Baglib — the image-occlusion drawer that runs inside the sandboxed card frame (KEY-391).
 *
 * A port of Anki 26.09's ts/routes/image-occlusion/review.ts (drawShapes, drawShape, toggleMasks,
 * extractShapeFromRenderedCloze, optimumPixelSizeForCanvas), written as plain browser JavaScript so
 * it can be inlined into the frame (its CSP allows inline scripts only). It reads the hidden
 * `.cloze` / `.cloze-inactive` / `.cloze-highlight` divs that the template engine renders and
 * paints the masks on `#image-occlusion-canvas` over the image, exactly like Anki does.
 *
 * The stock template calls `anki.imageOcclusion.setup()`, as Anki's does; this script defines it.
 */

export interface ImageOcclusionFrameStrings {
  toggleMasks: string;
  noImage: string;
}

export const DEFAULT_IMAGE_OCCLUSION_FRAME_STRINGS: ImageOcclusionFrameStrings = {
  toggleMasks: 'Toggle Masks',
  noImage: 'No image to show.',
};

const SCRIPT = String.raw`
(function () {
  var MASK = '#ffeba2', TEXT_BG = '#ffffff', TEXT_FONT = 'Arial', TEXT_PAD = 5, TEXT_SIZE = 40, TEXT_COLOR = '#000000';
  var STRINGS = __STRINGS__;
  var hide = false, oneTime = false;

  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function storedToAngle(x) { var s = Number(x) % 10000; return isNaN(s) ? 0 : (s / 10000) * 360; }

  function readShape(el) {
    var d = el.dataset, type = d.shape;
    if (type !== 'rect' && type !== 'ellipse' && type !== 'polygon' && type !== 'text') return null;
    var s = {
      type: type,
      occludeInactive: d.occludeinactive === '1',
      ordinal: parseInt(d.ordinal, 10),
      left: num(d.left, 0), top: num(d.top, 0),
      angle: storedToAngle(d.angle),
      fill: d.fill == null ? (type === 'text' ? TEXT_COLOR : MASK) : d.fill
    };
    if (type === 'rect') { s.width = num(d.width, 0); s.height = num(d.height, 0); }
    else if (type === 'ellipse') { s.rx = num(d.rx, 0); s.ry = num(d.ry, 0); }
    else if (type === 'polygon') {
      s.points = (d.points || '').split(' ').filter(Boolean).map(function (p) { var xy = p.split(','); return { x: num(xy[0], 0), y: num(xy[1], 0) }; });
      if (!s.points.length) s.points = [{ x: 0, y: 0 }];
    } else {
      s.text = d.text || ''; s.scale = num(d.scale, 1);
      s.fontSize = d.fontSize ? num(d.fontSize, 0) : 0;
    }
    return s;
  }
  function shapes(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector)).map(readShape).filter(Boolean);
  }
  function toAbsolute(s, w, h) {
    var a = {}; for (var k in s) a[k] = s[k];
    a.left = s.left * w; a.top = s.top * h;
    if (s.type === 'rect') { a.width = s.width * w; a.height = s.height * h; }
    if (s.type === 'ellipse') { a.rx = s.rx * w; a.ry = s.ry * h; }
    if (s.type === 'polygon') a.points = s.points.map(function (p) { return { x: p.x * w, y: p.y * h }; });
    if (s.type === 'text') a.fontSize = s.fontSize ? s.fontSize * h : TEXT_SIZE;
    return a;
  }
  function drawShape(ctx, w, h, shape, fill, stroke, strokeWidth) {
    var s = toAbsolute(shape, w, h);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
    var angle = ((s.angle || 0) * Math.PI) / 180;
    if (s.type === 'rect') {
      if (angle) { ctx.save(); ctx.translate(s.left, s.top); ctx.rotate(angle); ctx.translate(-s.left, -s.top); }
      ctx.fillRect(s.left, s.top, s.width, s.height);
      if (strokeWidth) ctx.strokeRect(s.left, s.top, s.width, s.height);
      if (angle) ctx.restore();
    } else if (s.type === 'ellipse') {
      if (angle) { ctx.save(); ctx.translate(s.left, s.top); ctx.rotate(angle); ctx.translate(-s.left, -s.top); }
      ctx.beginPath(); ctx.ellipse(s.left + s.rx, s.top + s.ry, s.rx, s.ry, 0, 0, Math.PI * 2, false); ctx.closePath();
      ctx.fill(); if (strokeWidth) ctx.stroke();
      if (angle) ctx.restore();
    } else if (s.type === 'polygon') {
      var minX = s.points[0].x, minY = s.points[0].y;
      s.points.forEach(function (p) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; });
      ctx.save(); ctx.translate(s.left - minX, s.top - minY); ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
      for (var i = 0; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.closePath(); ctx.fill(); if (strokeWidth) ctx.stroke(); ctx.restore();
    } else {
      ctx.save(); ctx.font = s.fontSize + 'px ' + TEXT_FONT; ctx.textBaseline = 'top'; ctx.scale(s.scale, s.scale);
      var lines = s.text.split('\n'), m = ctx.measureText('M');
      var lineHeight = 1.5 * (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent), maxW = 0;
      var left = s.left / s.scale, top = s.top / s.scale;
      lines.forEach(function (l) { var tw = ctx.measureText(l).width; if (tw > maxW) maxW = tw; });
      if (angle) { ctx.translate(left, top); ctx.rotate(angle); ctx.translate(-left, -top); }
      ctx.fillStyle = TEXT_BG; ctx.fillRect(left, top, maxW + TEXT_PAD, lines.length * lineHeight + TEXT_PAD);
      ctx.fillStyle = s.fill || '#000';
      lines.forEach(function (l, idx) { ctx.fillText(l, left, top + idx * lineHeight); });
      ctx.restore();
    }
  }
  function border(cs, name, dw, dc) {
    var parts = (cs.getPropertyValue(name) || '').split(' ').filter(Boolean);
    var width = parseFloat(parts[0]);
    return { width: isNaN(width) ? dw : width, color: parts[1] || dc };
  }
  function props(canvas) {
    var cs = getComputedStyle(canvas);
    return {
      active: cs.getPropertyValue('--active-shape-color').trim() || '#ff8e8e',
      inactive: cs.getPropertyValue('--inactive-shape-color').trim() || MASK,
      highlight: cs.getPropertyValue('--highlight-shape-color').trim() || '#ff8e8e00',
      activeBorder: border(cs, '--active-shape-border', 1, '#212121'),
      inactiveBorder: border(cs, '--inactive-shape-border', 1, '#212121'),
      highlightBorder: border(cs, '--highlight-shape-border', 1, '#ff8e8e')
    };
  }
  function drawShapes(canvas, onlyText) {
    var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, p = props(canvas);
    var keep = function (s) { return !onlyText || s.type === 'text'; };
    shapes('.cloze').filter(keep).forEach(function (s) { drawShape(ctx, w, h, s, p.active, p.activeBorder.color, p.activeBorder.width); });
    shapes('.cloze-inactive').filter(keep).filter(function (s) { return s.occludeInactive; }).forEach(function (s) {
      drawShape(ctx, w, h, s, s.fill !== MASK ? s.fill : p.inactive, p.inactiveBorder.color, p.inactiveBorder.width);
    });
    shapes('.cloze-highlight').filter(keep).forEach(function (s) { drawShape(ctx, w, h, s, p.highlight, p.highlightBorder.color, p.highlightBorder.width); });
    var count = 0; try { count = document.querySelectorAll('.cloze, .cloze-inactive, .cloze-highlight').length; } catch (e) {}
    canvas.setAttribute('data-baglib-drawn', String(count));
  }
  function optimumSize(img, canvas) {
    var ratio = window.devicePixelRatio || 1;
    var cw = canvas.clientWidth * ratio, ch = canvas.clientHeight * ratio;
    var scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    var width = img.naturalWidth * scale, height = img.naturalHeight * scale;
    var max = 4096 * 4096;
    if (width * height > max) { var k = Math.sqrt(max) / Math.sqrt(width * height); width *= k; height *= k; }
    return { width: Math.floor(width), height: Math.floor(height) };
  }
  function toggleMasks() {
    var canvas = document.getElementById('image-occlusion-canvas');
    if (!canvas) return;
    hide = !hide;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    drawShapes(canvas, hide);
  }
  function inner() {
    var canvas = document.getElementById('image-occlusion-canvas');
    if (!canvas) return;
    var container = document.getElementById('image-occlusion-container');
    var img = document.querySelector('#image-occlusion-container img');
    if (!img || !img.naturalWidth) { if (container) container.textContent = STRINGS.noImage; return; }
    container.style.aspectRatio = String(img.naturalWidth / img.naturalHeight);
    var size = optimumSize(img, canvas);
    canvas.width = size.width; canvas.height = size.height;
    var button = document.getElementById('toggle');
    if (button) {
      button.textContent = STRINGS.toggleMasks;
      if (document.querySelector('[data-occludeinactive="1"]')) {
        if (!button.__baglibBound) { button.addEventListener('click', toggleMasks); button.__baglibBound = true; }
      } else button.style.display = 'none';
    }
    if (!oneTime) {
      window.addEventListener('keydown', function (e) {
        var b = document.getElementById('toggle');
        if (b && b.style.display !== 'none' && (e.key === 'M' || e.key === 'm')) toggleMasks();
      });
      window.addEventListener('message', function (e) {
        if (e.source !== window.parent || !e.data || e.data.type !== 'baglib-io-toggle') return;
        var b = document.getElementById('toggle');
        if (b && b.style.display !== 'none') toggleMasks();
      });
      window.addEventListener('resize', function () { requestAnimationFrame(inner); });
      oneTime = true;
    }
    hide = false;
    drawShapes(canvas, false);
  }
  function setup() {
    var err = document.getElementById('err');
    if (err) err.textContent = '';
    var img = document.querySelector('#image-occlusion-container img');
    var go = function () { requestAnimationFrame(inner); };
    if (!img || img.complete) go();
    else { img.addEventListener('load', go); img.addEventListener('error', go); }
  }
  window.anki = window.anki || {};
  window.anki.imageOcclusion = { setup: setup, toggleMasks: toggleMasks };
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('image-occlusion-canvas') && !document.getElementById('image-occlusion-canvas').hasAttribute('data-baglib-drawn')) setup();
  });
})();
`;

/** The script for the frame's <head>, with the UI strings baked in (JSON, so it can't break out). */
export function imageOcclusionFrameScript(strings: ImageOcclusionFrameStrings = DEFAULT_IMAGE_OCCLUSION_FRAME_STRINGS): string {
  const json = JSON.stringify({ toggleMasks: strings.toggleMasks, noImage: strings.noImage }).replace(/</gu, '\\u003c');
  return SCRIPT.replace('__STRINGS__', json);
}
