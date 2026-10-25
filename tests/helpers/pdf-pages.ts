export function makePagePdf(count: number, logo: Buffer): Buffer {
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from(`<< /Type /Pages /Kids [${Array.from({ length: count }, (_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${count} >>`),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    logo.length ? Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`), logo, Buffer.from('\nendstream')]) : Buffer.from('<< >>'),
  ];
  const colors = ['1 0 0', '0 1 0', '0 0 1', '1 1 0', '1 0 1', '0 1 1', '0.5 0.5 0.5'];
  for (let index = 0; index < count; index++) {
    const content = `${colors[index % colors.length]} rg 0 0 700 1000 re f\n0 0 0 rg BT /F1 40 Tf 30 900 Td (PAGE ${index + 1}) Tj ET`;
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 1000] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + index * 2} 0 R >>`));
    objects.push(Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`));
  }
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    parts.push(part);
    length += part.length;
  });
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
  return Buffer.concat(parts);
}
