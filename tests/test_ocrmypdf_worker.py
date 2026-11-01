"""Unit tests for the parts of the OCRmyPDF worker that need no OCR run."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1] / "assets" / "ocr" / "ocrmypdf_worker.py"
spec = importlib.util.spec_from_file_location("ocrmypdf_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
sys.modules["ocrmypdf_worker"] = worker
spec.loader.exec_module(worker)

HOCR = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
 <body>
  <div class='ocr_page' id='page_1' title='image "x.png"; bbox 0 0 2481 3509; ppageno 0'>
   <p class='ocr_par' dir='rtl'>
    <span class='ocr_line' id='line_1_1' title="bbox 447 671 2041 752; baseline 0 -24">
     <span class='ocrx_word' title='bbox 1973 693 2041 727; x_wconf 72' dir='ltr'>١١‏</span>
     <span class='ocrx_word' title='bbox 1520 673 1923 756; x_wconf 15'>فَإِنْ</span>
     <span class='ocrx_word' title='bbox 10 10 20 20; x_wconf 0'>‏ </span>
    </span>
    <span class='ocr_header' title="bbox 100 100 400 150">
     <span class='ocrx_word' title='bbox 100 100 400 150; x_wconf 90'><strong>Title</strong></span>
    </span>
   </p>
  </div>
 </body>
</html>"""


class ParseHocrTests(unittest.TestCase):
    def setUp(self):
        self.page = worker.parse_hocr(HOCR)

    def test_reads_page_size(self):
        self.assertEqual((self.page["width"], self.page["height"]), (2481, 3509))

    def test_keeps_arabic_in_reading_order_without_bidi_marks(self):
        self.assertEqual(self.page["lines"][0]["text"], "١١ فَإِنْ")

    def test_word_boxes_are_pixels_with_confidence(self):
        word = self.page["lines"][0]["words"][1]
        self.assertEqual(word["bbox"], {"x": 1520, "y": 673, "width": 403, "height": 83})
        self.assertAlmostEqual(word["confidence"], 0.15)

    def test_drops_words_with_no_text(self):
        self.assertEqual(len(self.page["lines"][0]["words"]), 2)

    def test_header_lines_and_nested_markup_are_read(self):
        self.assertEqual(self.page["lines"][1]["text"], "Title")


class ReadinessTests(unittest.TestCase):
    def test_empty_engine_folder_reports_every_language_file(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(worker.find_missing_language_data(Path(folder)), ["ara", "eng", "hocr"])

    def test_language_files_without_hocr_config_are_not_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            tessdata = Path(folder) / "ocr-best"
            tessdata.mkdir()
            for name in worker.LANGUAGE_FILES:
                (tessdata / f"{name}.traineddata").write_bytes(b"x")
            self.assertEqual(worker.find_missing_language_data(Path(folder)), ["hocr"])

    def test_processing_refuses_before_touching_the_image(self):
        with tempfile.TemporaryDirectory() as folder:
            original = worker.find_missing_packages
            worker.find_missing_packages = lambda root: ["tesseract"]
            try:
                with self.assertRaises(worker.WorkerError) as caught:
                    worker.process_image(Path(folder) / "absent.png", Path(folder))
            finally:
                worker.find_missing_packages = original
            self.assertEqual(caught.exception.code, "runtime-missing")
            self.assertEqual(caught.exception.details["missingPackages"], ["tesseract"])


class TransparencyTests(unittest.TestCase):
    def test_flattens_alpha_onto_white_without_changing_the_input(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            source = work / "pasted.png"
            Image.new("RGBA", (4, 4), (0, 0, 0, 0)).save(source)
            before = source.read_bytes()

            flat = worker.flatten_transparency(source, work)
            self.assertNotEqual(flat, source)
            self.assertEqual(source.read_bytes(), before)
            with Image.open(flat) as result:
                self.assertEqual(result.mode, "RGB")
                self.assertEqual(result.getpixel((0, 0)), (255, 255, 255))

    def test_opaque_images_pass_through(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "page.png"
            Image.new("RGB", (4, 4), "white").save(source)
            self.assertEqual(worker.flatten_transparency(source, Path(folder)), source)


class LanguageChoiceTests(unittest.TestCase):
    def test_explicit_languages_skip_detection(self):
        original = worker.detect_language
        worker.detect_language = lambda image, root: self.fail("detection should not run")
        try:
            self.assertEqual(worker.tesseract_language("ar-SA", Path("x"), Path("y")), "ara")
            self.assertEqual(worker.tesseract_language("en-US", Path("x"), Path("y")), "eng")
        finally:
            worker.detect_language = original


if __name__ == "__main__":
    unittest.main()
