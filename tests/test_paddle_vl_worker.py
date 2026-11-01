"""Layout logic of the OCR worker; no model is loaded here."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

WORKER = Path(__file__).resolve().parent.parent / "assets" / "ocr" / "paddle_vl_worker.py"
spec = importlib.util.spec_from_file_location("paddle_vl_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def page(width, height, strokes):
    pixels = np.full((height, width, 3), 255, dtype=np.uint8)
    for x0, y0, x1, y1 in strokes:
        pixels[y0:y1, x0:x1] = 0
    return Image.fromarray(pixels)


def text_rows(x0, x1, count, top=100, step=50):
    return [(x0, top + i * step, x1, top + i * step + 20) for i in range(count)]


class PlanRegionsTests(unittest.TestCase):
    def test_arabic_reads_each_row_on_its_own(self):
        image = page(1000, 800, text_rows(100, 900, 10))
        regions = worker.plan_regions(image, arabic=True)
        self.assertEqual(len(regions), 10)
        self.assertTrue(all(r["kind"] == "line" and len(r["rows"]) == 1 for r in regions))
        tops = [r["rows"][0][1] for r in regions]
        self.assertEqual(tops, sorted(tops))

    def test_arabic_sends_a_tall_figure_as_a_block(self):
        strokes = text_rows(100, 900, 6) + [(100, 420, 900, 700)]
        regions = worker.plan_regions(page(1000, 800, strokes), arabic=True)
        self.assertEqual([r["kind"] for r in regions], ["line"] * 6 + ["block"])

    def test_latin_page_fits_blocks_inside_the_model_pixel_limit(self):
        image = page(1400, 2000, text_rows(100, 1300, 36))
        regions = worker.plan_regions(image, arabic=False)
        self.assertGreater(len(regions), 1)
        for region in regions:
            rows = region["rows"]
            area = (max(r[2] for r in rows) - min(r[0] for r in rows)) * (rows[-1][3] - rows[0][1])
            self.assertLessEqual(area, worker.MAX_BLOCK_PIXELS)

    def test_latin_columns_are_read_one_after_the_other(self):
        strokes = [(100, 40, 900, 60)] + text_rows(100, 460, 12) + text_rows(540, 900, 12)
        regions = worker.plan_regions(page(1000, 800, strokes), arabic=False)
        starts = [row[0] for region in regions for row in region["rows"]]
        self.assertEqual(starts[0], min(starts))  # the heading comes first
        columns = starts[1:]
        self.assertEqual(columns, sorted(columns))
        self.assertGreater(max(columns), 500)

    def test_blank_page_has_no_regions(self):
        self.assertEqual(worker.plan_regions(page(400, 400, []), arabic=False), [])


class OutputTests(unittest.TestCase):
    def test_words_run_right_to_left_in_arabic(self):
        lines = worker.estimate_lines("الأولى الثانية", [(100, 10, 500, 40)], rtl=True)
        first, second = lines[0]["words"]
        self.assertGreater(first["bbox"]["x"], second["bbox"]["x"])
        self.assertAlmostEqual(first["bbox"]["x"] + first["bbox"]["width"], 500, delta=1)

    def test_words_spread_over_every_row_of_a_block(self):
        rows = [(0, 0, 400, 20), (0, 30, 400, 50)]
        lines = worker.estimate_lines("one two three four five six", rows, rtl=False)
        self.assertEqual(len(lines), 2)
        self.assertEqual(" ".join(line["text"] for line in lines), "one two three four five six")

    def test_runaway_repetition_is_collapsed(self):
        self.assertEqual(worker.clean_output("17" + "1" * 80), "171")

    def test_script_detection(self):
        self.assertTrue(worker.is_arabic("فإن تكن الأخرى"))
        self.assertFalse(worker.is_arabic("Egypt 2014"))


if __name__ == "__main__":
    unittest.main()
