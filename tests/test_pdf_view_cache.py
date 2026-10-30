import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

import pikepdf

spec = importlib.util.spec_from_file_location('view_cache', Path(__file__).resolve().parents[1] / 'assets/pdf-editor/view_cache.py')
view_cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(view_cache)


class PdfViewCacheTests(unittest.TestCase):
    def test_balances_flat_tree_preserving_order_inherited_geometry_and_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.pdf'
            output = Path(directory) / 'view.pdf'
            with pikepdf.Pdf.new() as document:
                for number in range(65):
                    page = document.add_blank_page(page_size=(500, 700))
                    page.obj['/BaglibTestPage'] = number
                document.Root.Pages.MediaBox = pikepdf.Array([0, 0, 500, 700])
                for page in document.pages:
                    del page.obj['/MediaBox']
                document.save(source)
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            result = view_cache.optimize(source, output, 1000000)
            self.assertEqual(result['pages'], 65)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
            with pikepdf.Pdf.open(output) as document:
                self.assertTrue(document.is_linearized)
                self.assertEqual([node.Count for node in document.Root.Pages.Kids], [32, 32, 1])
                self.assertEqual([page.obj['/BaglibTestPage'] for page in document.pages], list(range(65)))
                self.assertTrue(all(list(page.mediabox) == [0, 0, 500, 700] for page in document.pages))
                children = [node.objgen for node in document.Root.Pages.Kids]
                view_cache.balance_flat_pages(document)
                self.assertEqual([node.objgen for node in document.Root.Pages.Kids], children)

    def test_refuses_same_destination_and_encrypted_documents(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.pdf'
            output = Path(directory) / 'view.pdf'
            with pikepdf.Pdf.new() as document:
                document.add_blank_page()
                document.save(source, encryption=pikepdf.Encryption(owner='owner', user=''))
            with self.assertRaisesRegex(ValueError, 'invalid-output'):
                view_cache.optimize(source, source, 1000000)
            with self.assertRaisesRegex(ValueError, 'encrypted'):
                view_cache.optimize(source, output, 1000000)
            self.assertFalse(output.exists())

    def test_bounded_output_does_not_exceed_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.pdf'
            output = Path(directory) / 'view.pdf'
            with pikepdf.Pdf.new() as document:
                document.add_blank_page()
                document.save(source)
            with self.assertRaises(Exception):
                view_cache.optimize(source, output, 100)
            self.assertLessEqual(output.stat().st_size, 100)


if __name__ == '__main__':
    unittest.main()
