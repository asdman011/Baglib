import importlib.util
import os
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "engine", Path(__file__).resolve().parents[1] / "assets/pdf-editor/engine.py"
)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

REPO_ROOT = Path(__file__).resolve().parents[1]
EN_PDF = str(REPO_ROOT / "tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf")
AR_PDF = str(REPO_ROOT / "tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf")
SCANNED_PDF = str(REPO_ROOT / "tests/real-files/pdf/ar/scanned-image-only/تفسير الموعذتين لابن تيمية.pdf")


class PdfPageExtractionTests(unittest.TestCase):
    def test_page_scoped_extraction_matches_full_pass(self):
        self.assertTrue(os.path.exists(EN_PDF), f"Missing test file: {EN_PDF}")
        scoped = engine.extract_pdf_pages(EN_PDF, [200])
        full = engine.check_accessibility(EN_PDF)

        self.assertEqual(scoped["totalPages"], 240)
        self.assertEqual(list(scoped["pageTexts"].keys()), ["200"])
        self.assertTrue(len(scoped["pageTexts"]["200"]) > 500)
        self.assertEqual(scoped["pageTexts"]["200"], full["pageTexts"]["200"])
        self.assertEqual(scoped["pageHasUnmapped"]["200"], full["pageHasUnmapped"]["200"])

    def test_arabic_page_scoped_extraction_with_fonts(self):
        self.assertTrue(os.path.exists(AR_PDF), f"Missing test file: {AR_PDF}")
        scoped = engine.extract_pdf_pages(AR_PDF, [2])
        self.assertEqual(scoped["totalPages"], 45)
        self.assertIn("2", scoped["pageTexts"])
        self.assertTrue(len(scoped["pageTexts"]["2"]) > 200)
        self.assertFalse(scoped["pageHasUnmapped"]["2"])
        self.assertTrue(len(scoped["fontsWithoutToUnicode"]) > 0)

    def test_scanned_pdf_reports_pages_without_text(self):
        self.assertTrue(os.path.exists(SCANNED_PDF), f"Missing test file: {SCANNED_PDF}")
        scoped = engine.extract_pdf_pages(SCANNED_PDF, [1])
        self.assertEqual(scoped["totalPages"], 42)
        self.assertEqual(scoped["pagesWithoutText"], [1])
        self.assertEqual(scoped["pageTexts"]["1"], "")


if __name__ == "__main__":
    unittest.main()
