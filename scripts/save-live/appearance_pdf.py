"""Read saved PDFs independently of the app and render their actual appearance streams."""
import hashlib
import io
import json
import sys
from pathlib import Path

import pikepdf


def canonical(value, ancestors=()):
    # Compare annotation graphs by values/stream bytes, allowing object renumbering on save.
    if isinstance(value, (pikepdf.Dictionary, pikepdf.Stream, pikepdf.Array)):
        identity = value.objgen
        if identity != (0, 0) and identity in ancestors:
            return '<cycle>'
        ancestors = ancestors + (identity,) if identity != (0, 0) else ancestors
        if isinstance(value, pikepdf.Array):
            return [canonical(item, ancestors) for item in value]
        result = {str(key): canonical(item, ancestors) for key, item in value.items()
                  if str(key) not in ('/P', '/Length', '/Filter', '/DecodeParms')}
        if isinstance(value, pikepdf.Stream):
            result['stream'] = hashlib.sha256(value.read_bytes()).hexdigest()
        return result
    return str(value)


def snapshot(filename):
    with pikepdf.open(filename) as doc:
        owned, foreign = [], []
        for page in doc.pages:
            for annotation in page.obj.get('/Annots', []):
                if bool(annotation.get('/BagLibOwned', False)) or str(annotation.get('/NM', '')).startswith('baglib:'):
                    appearance = annotation.get('/AP', {}).get('/N')
                    owned.append({'id': str(annotation.get('/NM', '')),
                                  'subtype': str(annotation.get('/Subtype', '')),
                                  'text': str(annotation.get('/Contents', '')),
                                  'appearance': isinstance(appearance, pikepdf.Stream) and b'Tj' in appearance.read_bytes()})
                else:
                    foreign.append(hashlib.sha256(json.dumps(canonical(annotation), sort_keys=True).encode()).hexdigest())
        fonts = sum(1 for obj in doc.objects if isinstance(obj, pikepdf.Dictionary)
                    and obj.get('/Type') == pikepdf.Name.Font)
        return {'owned': sorted(owned, key=lambda item: item['id']), 'foreign': sorted(foreign), 'fonts': fonts}


def prepare(filename):
    with pikepdf.open(filename, allow_overwriting_input=True) as doc:
        page = doc.pages[0]
        annotations = page.obj.get('/Annots', pikepdf.Array())
        annotations.append(doc.make_indirect(pikepdf.Dictionary(
            Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Text,
            Rect=pikepdf.Array([10, 10, 30, 30]), NM=pikepdf.String('key293-foreign'),
            Contents=pikepdf.String('Foreign annotation — تعليق خارجي'), F=4)))
        page.obj.Annots = annotations
        doc.save(filename)


def render(filename, output):
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(filename) as doc:
        page = doc[0]
        bitmap = page.render(scale=2, draw_annots=True)
        bitmap.to_pil().save(output + '-page.png')
        bitmap.close()
        page.close()
    # Also isolate the saved APs against white for an unobstructed typography check.
    with pikepdf.open(filename) as doc:
        page = doc.pages[0]
        page.obj.Contents = doc.make_stream(b'')
        page.obj.Annots = pikepdf.Array([a for a in page.obj.Annots if a.get('/BagLibOwned', False)])
        content = io.BytesIO()
        doc.save(content)
    with pdfium.PdfDocument(content.getvalue()) as doc:
        page = doc[0]
        bitmap = page.render(scale=2, draw_annots=True)
        bitmap.to_pil().save(output + '-appearances.png')
        bitmap.close()
        page.close()


if __name__ == '__main__':
    action, filename = sys.argv[1:3]
    if action == 'prepare':
        prepare(filename)
    elif action == 'snapshot':
        print(json.dumps(snapshot(filename), ensure_ascii=True))
    elif action == 'render':
        Path(sys.argv[3]).parent.mkdir(parents=True, exist_ok=True)
        render(filename, sys.argv[3])
    else:
        raise ValueError(action)
