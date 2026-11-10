import unittest, tempfile, json, sys
from pathlib import Path
import pikepdf
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'assets/pdf-editor'))
import baglib_marks as marks

class StudyAnnotations(unittest.TestCase):
    def test_stamp_measure_rewrite_preserves_foreign(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, first, second, payload = [root / name for name in ['source.pdf', 'first.pdf', 'second.pdf', 'payload.json']]
            with pikepdf.new() as pdf:
                page = pdf.add_blank_page(page_size=(600, 900))
                page.obj.Annots = pikepdf.Array([pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Text, Rect=[1, 1, 20, 20], Contents='foreign', NM='outside'))])
                pdf.save(source)
            common = dict(page=1, created=None, modified=None, replies=[], resolved=None, color='#10b981', box=dict(x=10, y=20, width=35, height=8))
            items = [dict(common, id='stamp', kind='stamp', text='تمت المراجعة', rtl=True, stampId='checked', language='ar'),
                     dict(common, id='line', kind='measure', text='10 cm', **{'from':dict(x=10,y=30),'to':dict(x=60,y=30)}, measurement=dict(mode='distance')),
                     dict(common, id='area', kind='measure', text='60 cm²', **{'from':dict(x=10,y=40),'to':dict(x=60,y=60)}, measurement=dict(mode='area'))]
            payload.write_text(json.dumps(dict(items=items, bookmarks=[])), encoding='utf-8')
            marks.write(source, first, payload)
            marks.write(first, second, payload)
            with pikepdf.open(second) as pdf:
                annotations = pdf.pages[0].obj.Annots
                self.assertEqual(len(annotations), 4)
                mine = {str(a.NM):a for a in annotations if marks.owned(a)}
                self.assertEqual(mine['baglib:stamp'].Subtype, pikepdf.Name.Stamp)
                self.assertIn('/AP', mine['baglib:stamp'])
                self.assertIn(b'1 1 1 rg', mine['baglib:stamp'].AP.N.read_bytes())
                self.assertEqual(str(mine['baglib:stamp'].Contents), 'تمت المراجعة')
                self.assertEqual(mine['baglib:line'].IT, pikepdf.Name.LineDimension)
                self.assertEqual(mine['baglib:area'].Subtype, pikepdf.Name.Polygon)
                self.assertEqual(str(annotations[0].Contents), 'foreign')

if __name__ == '__main__': unittest.main()
