export interface InkOverlayPage { width: number; height: number }
export interface InkOverlayEdit { page: number; rect: number[]; strokes: number[][][]; color?: string }

export function buildInkOverlay(pages: InkOverlayPage[], edits: InkOverlayEdit[]): Buffer {
  if (!pages.length || pages.length > 2000 || !edits.length || edits.length > 100) throw new Error('invalid-request');
  for (const page of pages) if (![page.width, page.height].every(value => Number.isFinite(value) && value > 0 && value <= 14400)) throw new Error('invalid-request');
  const streams = pages.map(() => [] as string[]);
  for (const edit of edits) {
    if (!Number.isInteger(edit.page) || edit.page < 1 || edit.page > pages.length || edit.rect.length !== 4 || !edit.rect.every(Number.isFinite)) throw new Error('invalid-request');
    const [left, top, right, bottom] = edit.rect;
    const page = pages[edit.page - 1];
    if (left < 0 || top < 0 || right <= left || bottom <= top || right > page.width || bottom > page.height) throw new Error('invalid-request');
    if (!Array.isArray(edit.strokes) || !edit.strokes.length || edit.strokes.length > 100 || !/^#[0-9a-f]{6}$/iu.test(edit.color || '#000000')) throw new Error('invalid-request');
    const color = edit.color || '#000000';
    const rgb = [1, 3, 5].map(offset => (parseInt(color.slice(offset, offset + 2), 16) / 255).toFixed(5)).join(' ');
    const commands = ['q', `${rgb} RG`, '1.5 w 1 J 1 j'];
    for (const stroke of edit.strokes) {
      if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 2000) throw new Error('invalid-request');
      stroke.forEach((point, index) => {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('invalid-request');
        commands.push(`${(left + point[0] * (right - left)).toFixed(4)} ${(page.height - top - point[1] * (bottom - top)).toFixed(4)} ${index ? 'l' : 'm'}`);
      });
      commands.push('S');
    }
    streams[edit.page - 1].push(...commands, 'Q');
  }
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] >>`];
  pages.forEach((page, index) => {
    const content = streams[index].join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << >> /Contents ${4 + index * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}
