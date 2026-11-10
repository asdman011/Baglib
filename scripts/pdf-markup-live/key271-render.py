"""Render the actual saved real-file PDF pages with annotations at 2x for KEY-271 visual QA."""
from pathlib import Path
import sys
import pikepdf
import pypdfium2 as pdfium
source = Path(sys.argv[1]).resolve()
evidence = Path('.baglib-data/key271-evidence').resolve()
evidence.mkdir(parents=True, exist_ok=True)
for language in ['ar', 'en']:
    filename = source / (language + '.pdf')
    with pikepdf.open(filename) as pdf:
        stamps = [a for a in pdf.pages[0].obj.Annots if str(a.get('/BagLibKind', '')) == '/stamp']
        assert len(stamps) == 10
        for stamp in stamps:
            assert stamp.Subtype == pikepdf.Name.Stamp
            label = stamp.AP.N.Resources.XObject.Label
            assert label.Resources.Font
            assert any('/FontFile2' in font.DescendantFonts[0].FontDescriptor for font in label.Resources.Font.values())
    document = pdfium.PdfDocument(str(filename))
    page = document[0]
    bitmap = page.render(scale=2, draw_annots=True)
    bitmap.to_pil().save(evidence / ('pdfium-stamps-' + language + '-2x.png'))
    bitmap.close()
    page.close()
    document.close()
print('Both real PDF pages rendered at 2x with ten embedded-font stamps each')
