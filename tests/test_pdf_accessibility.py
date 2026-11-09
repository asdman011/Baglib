import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

import pikepdf

spec = importlib.util.spec_from_file_location(
    "engine", Path(__file__).resolve().parents[1] / "assets/pdf-editor/engine.py"
)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class PdfAccessibilityTests(unittest.TestCase):
    def test_untagged_pdf_without_lang_or_title(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "untagged.pdf"
            with pikepdf.new() as document:
                document.add_blank_page(page_size=(300, 400))
                document.save(source)

            before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            report = engine.check_accessibility(str(source))

            # Must not alter source file
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before_hash)

            # Untagged checks
            self.assertFalse(report["isTagged"])
            self.assertFalse(report["hasMarked"])
            self.assertFalse(report["hasStructTree"])
            self.assertFalse(report["hasLanguage"])
            self.assertIsNone(report["language"])
            self.assertFalse(report["hasTitle"])
            self.assertFalse(report["displayDocTitle"])
            self.assertEqual(report["totalPages"], 1)
            self.assertEqual(report["pagesWithoutText"], [1])

    def test_tagged_pdf_with_lang_and_title(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "tagged.pdf"
            with pikepdf.new() as document:
                page = document.add_blank_page(page_size=(400, 600))
                document.Root.MarkInfo = pikepdf.Dictionary({"/Marked": True})
                document.Root.Lang = pikepdf.String("en-US")

                # Structure Tree Root with a Paragraph
                p_elem = pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/StructElem"),
                    "/S": pikepdf.Name("/P"),
                    "/Pg": page.obj,
                })
                struct_tree = pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/StructTreeRoot"),
                    "/K": pikepdf.Array([p_elem])
                })
                document.Root.StructTreeRoot = struct_tree

                # Title and displayDocTitle
                document.docinfo["/Title"] = pikepdf.String("Accessible Document Guide")
                document.Root.ViewerPreferences = pikepdf.Dictionary({"/DisplayDocTitle": True})

                document.save(source)

            report = engine.check_accessibility(str(source))
            self.assertTrue(report["isTagged"])
            self.assertTrue(report["hasMarked"])
            self.assertTrue(report["hasStructTree"])
            self.assertTrue(report["hasLanguage"])
            self.assertEqual(report["language"], "en-US")
            self.assertTrue(report["hasTitle"])
            self.assertEqual(report["title"], "Accessible Document Guide")
            self.assertTrue(report["displayDocTitle"])
            self.assertEqual(len(report["readingOrder"]), 1)
            self.assertEqual(report["readingOrder"][0]["tag"], "P")
            self.assertFalse(report["readingOrder"][0]["estimated"])

    def test_figures_without_alt(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "figures.pdf"
            with pikepdf.new() as document:
                page = document.add_blank_page()
                document.Root.MarkInfo = pikepdf.Dictionary({"/Marked": True})

                fig_no_alt = pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/StructElem"),
                    "/S": pikepdf.Name("/Figure"),
                    "/Pg": page.obj,
                })
                fig_with_alt = pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/StructElem"),
                    "/S": pikepdf.Name("/Figure"),
                    "/Pg": page.obj,
                    "/Alt": pikepdf.String("Diagram of neural architecture")
                })
                document.Root.StructTreeRoot = pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/StructTreeRoot"),
                    "/K": pikepdf.Array([fig_no_alt, fig_with_alt])
                })
                document.save(source)

            report = engine.check_accessibility(str(source))
            self.assertEqual(report["figuresCount"], 2)
            self.assertEqual(report["figuresWithoutAlt"], 1)

    def test_fix_accessibility_metadata_produces_staged_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original.pdf"
            output = Path(directory) / "staged.pdf"
            with pikepdf.new() as document:
                document.add_blank_page()
                document.save(source)

            before_hash = hashlib.sha256(source.read_bytes()).hexdigest()

            result = engine.fix_accessibility_metadata(
                str(source), str(output), language="ar", title="كتاب الإتاحة"
            )

            # Source file untouched
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before_hash)
            self.assertEqual(result["format"], "pdf")
            self.assertTrue(output.exists())

            # Staged file has fixes
            with pikepdf.open(output) as fixed:
                self.assertEqual(str(fixed.Root.Lang), "ar")
                self.assertEqual(str(fixed.docinfo.get("/Title")), "كتاب الإتاحة")
                self.assertTrue(fixed.Root.ViewerPreferences.DisplayDocTitle)

    def test_font_without_tounicode_and_pua_glyphs(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "pua_font.pdf"
            with pikepdf.new() as document:
                page = document.add_blank_page(page_size=(300, 400))
                # Add a font dictionary lacking /ToUnicode
                font_dict = pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/Font"),
                    "/Subtype": pikepdf.Name("/TrueType"),
                    "/BaseFont": pikepdf.Name("/CustomArabicDecorative"),
                    "/Encoding": pikepdf.Name("/WinAnsiEncoding"),
                })
                page.Resources = pikepdf.Dictionary({
                    "/Font": pikepdf.Dictionary({
                        "/F1": font_dict
                    })
                })
                document.save(source)

            report = engine.check_accessibility(str(source))
            # 1. Detects font without /ToUnicode
            self.assertIn("/CustomArabicDecorative", report["fontsWithoutToUnicode"])

            # 2. Test sanitize_pdf_text handling of PUA characters:
            # - U+F22B maps to '﴿'
            # - U+F222 maps to '﴾'
            # - Unmapped PUA glyph U+F201 is dropped
            # - has_unmapped is detected
            raw_text = "قال الله عز وجل: \uf22bإنفروا خفافا\uf222 \uf201\uf202"
            clean, has_unmapped = engine.sanitize_pdf_text(raw_text)
            self.assertTrue(has_unmapped)
            self.assertEqual(clean, "قال الله عز وجل: ﴿إنفروا خفافا﴾")
            # No PUA characters remain in clean text
            self.assertFalse(any(0xE000 <= ord(c) <= 0xF8FF for c in clean))


if __name__ == "__main__":
    unittest.main()
