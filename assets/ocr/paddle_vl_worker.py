#!/usr/bin/env python3
"""
PaddleOCR-VL-1.6 Inference Worker for Baglib
Runs the local 0.9B Vision-Language Model through the transformers native class.

The processor shrinks any image to about 1 megapixel, which loses Arabic diacritics
on a full page, so pages are cut into regions first: Arabic is read one printed row
at a time (this also keeps verse pairs together), Latin text in full-resolution blocks.
Boxes are estimated from the cropped rows; the model returns no word coordinates.
"""

import sys
import os
import re
import json
import time
import argparse
import importlib.metadata
import importlib.util
from pathlib import Path

# Physical cores only: 12 threads measured no faster than 8 on the Ryzen 7 5750G
DEFAULT_THREADS = 8
os.environ["OMP_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["MKL_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["OPENBLAS_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["VECLIB_MAXIMUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["NUMEXPR_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["HF_HUB_OFFLINE"] = "1"

REQUIRED_MODULES = {"torch": "torch", "transformers": "transformers", "numpy": "numpy", "PIL": "pillow"}
MIN_TRANSFORMERS_MAJOR = 5  # first version with the native PaddleOCRVL class
MIN_FLOAT32_AVAILABLE_BYTES = 6 * 1024 ** 3  # float32 peaks near 4 GB; bfloat16 near 2 GB but runs twice as slow
MAX_BLOCK_PIXELS = 1_003_520  # preprocessor_config.json max_pixels: larger crops get downscaled
MAX_LINE_TOKENS = 160
MAX_BLOCK_TOKENS = 1024
PROMPT = "<|begin_of_sentence|>User: <|IMAGE_START|><|IMAGE_PLACEHOLDER|><|IMAGE_END|>OCR:\nAssistant: "


class WorkerError(Exception):
    def __init__(self, code: str, **details):
        super().__init__(code)
        self.code = code
        self.details = details


def find_missing_packages() -> list:
    missing = [package for module, package in REQUIRED_MODULES.items() if importlib.util.find_spec(module) is None]
    if "transformers" not in missing:
        try:
            major = int(importlib.metadata.version("transformers").split(".")[0])
        except (importlib.metadata.PackageNotFoundError, ValueError):
            major = 0
        if major < MIN_TRANSFORMERS_MAJOR:
            missing.append(f"transformers>={MIN_TRANSFORMERS_MAJOR}")
    return missing


def get_engine_info(model_dir: Path) -> dict:
    weights_path = model_dir / "model.safetensors"
    existing_count = len([f for f in model_dir.glob("*") if f.is_file()]) if model_dir.is_dir() else 0
    total_bytes = sum(f.stat().st_size for f in model_dir.glob("*") if f.is_file()) if model_dir.is_dir() else 0
    missing_packages = find_missing_packages()
    return {
        "id": "paddleocr_vl",
        "name": "PaddleOCR-VL-1.6",
        "version": "1.6.0",
        "parameters": "0.9B",
        "device": f"CPU (AVX2, {DEFAULT_THREADS} Threads)",
        "modelPath": str(model_dir),
        "isDownloaded": weights_path.is_file() and weights_path.stat().st_size > 100 * 1024 * 1024,
        "runtimeReady": not missing_packages,
        "missingPackages": missing_packages,
        "existingFilesCount": existing_count,
        "totalExpectedFiles": 14,
        "downloadedMb": round(total_bytes / (1024 * 1024), 2),
        "supportedLanguages": ["ar", "en", "ar-SA", "en-US", "auto"],
    }


def ink_mask(image):
    import numpy as np

    gray = np.asarray(image.convert("L"))
    return gray < (np.percentile(gray, 5) + np.percentile(gray, 95)) / 2


def find_rows(ink, arabic: bool = False, offset_x: int = 0) -> list:
    """Printed rows as (x0, y0, x1, y1); Arabic bridges wider gaps to keep diacritics on their row."""
    import numpy as np

    height, width = ink.shape
    on = ink.sum(axis=1) > max(3, width * 0.004)
    bands, start = [], None
    for y, value in enumerate(on):
        if value and start is None:
            start = y
        elif not value and start is not None:
            bands.append([start, y])
            start = None
    if start is not None:
        bands.append([start, height])

    min_gap = max(4, height // 200) if arabic else 2
    merged = []
    for band in bands:
        if merged and band[0] - merged[-1][1] < min_gap:
            merged[-1][1] = band[1]
        else:
            merged.append(band)

    pad = max(4, height // 250)
    rows = []
    for top, bottom in merged:
        if bottom - top < max(6, height // 170):
            continue
        columns = np.where(ink[top:bottom].sum(axis=0) > 0)[0]
        rows.append((
            max(0, int(columns[0]) - pad) + offset_x,
            max(0, top - pad),
            min(width, int(columns[-1]) + pad) + offset_x,
            min(height, bottom + pad),
        ))
    return rows


def find_gutter(ink, rows: list):
    """Horizontal position of the blank channel between two text columns, if there is one."""
    if len(rows) < 8:
        return None
    height, width = ink.shape
    body = ink[rows[1][1]:rows[-2][3], :]
    empty = body.sum(axis=0) <= body.shape[0] * 0.005
    best_start, best_length, start = 0, 0, None
    for x in range(int(width * 0.3), int(width * 0.7)):
        if empty[x]:
            start = x if start is None else start
            if x - start + 1 > best_length:
                best_start, best_length = start, x - start + 1
        else:
            start = None
    return best_start + best_length // 2 if best_length >= width * 0.015 else None


def blocks_from_rows(rows: list) -> list:
    """Groups consecutive rows into crops small enough to reach the model at full resolution."""
    regions, current = [], []
    for row in rows:
        candidate = current + [row]
        area = (max(r[2] for r in candidate) - min(r[0] for r in candidate)) * (candidate[-1][3] - candidate[0][1])
        if current and area > MAX_BLOCK_PIXELS:
            regions.append({"kind": "block", "rows": current})
            candidate = [row]
        current = candidate
    if current:
        regions.append({"kind": "block", "rows": current})
    return regions


def plan_regions(image, arabic: bool) -> list:
    """Splits a page into crops in reading order."""
    ink = ink_mask(image)
    rows = find_rows(ink, arabic)
    if not rows:
        return []

    if arabic:
        heights = sorted(r[3] - r[1] for r in rows)
        typical = heights[len(heights) // 2]
        # A tall band is a figure, a table or touching rows: it cannot be read as one line
        return [{"kind": "line" if r[3] - r[1] <= typical * 3 else "block", "rows": [r]} for r in rows]

    gutter = find_gutter(ink, rows)
    if gutter is None:
        return blocks_from_rows(rows)

    # Rows crossing the gutter are full-width headings and footers around the two columns
    crossing = [r[0] < gutter < r[2] and bool(ink[r[1]:r[3], gutter].any()) for r in rows]
    first = crossing.index(False) if False in crossing else len(rows)
    last = len(rows) - crossing[::-1].index(False) if False in crossing else len(rows)
    top, bottom = rows[first][1] if first < len(rows) else 0, rows[last - 1][3] if last else 0
    regions = blocks_from_rows(rows[:first])
    for x0, x1 in ((0, gutter), (gutter, ink.shape[1])):
        column = [(r[0], r[1] + top, r[2], r[3] + top) for r in find_rows(ink[top:bottom, x0:x1], offset_x=x0)]
        regions += blocks_from_rows(column)
    return regions + blocks_from_rows(rows[last:])


def is_arabic(text: str) -> bool:
    arabic = sum(1 for c in text if "؀" <= c <= "ۿ")
    latin = sum(1 for c in text if c.isascii() and c.isalpha())
    return arabic > 0 and arabic >= latin


def clean_output(text: str) -> str:
    # The decoder can loop on one fragment until it hits the token limit
    return re.sub(r"(.{1,12}?)\1{9,}", r"\1", text).strip()


def estimate_lines(text: str, rows: list, rtl: bool) -> list:
    """Spreads recognized words over the cropped rows in proportion to their length."""
    words = text.split()
    if not words:
        return []
    total = sum(len(word) + 1 for word in words)
    widths = [r[2] - r[0] for r in rows]
    limits, running = [], 0
    for width in widths:
        running += width
        limits.append(running / sum(widths) * total)

    grouped = [[] for _ in rows]
    consumed, row_index = 0, 0
    for word in words:
        while row_index < len(rows) - 1 and consumed >= limits[row_index]:
            row_index += 1
        grouped[row_index].append(word)
        consumed += len(word) + 1

    lines = []
    for row, row_words in zip(rows, grouped):
        if not row_words:
            continue
        x0, y0, x1, y1 = row
        unit = (x1 - x0) / sum(len(word) + 1 for word in row_words)
        cursor = x1 if rtl else x0
        items = []
        for word in row_words:
            word_width = len(word) * unit
            left = cursor - word_width if rtl else cursor
            items.append({
                "text": word,
                "bbox": {"x": round(left, 2), "y": y0, "width": round(word_width, 2), "height": y1 - y0},
            })
            cursor += -(word_width + unit) if rtl else word_width + unit
        lines.append({
            "text": " ".join(row_words),
            "bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
            "words": items,
        })
    return lines


class Recognizer:
    def __init__(self, model_dir: Path):
        import torch
        from transformers import AutoProcessor, PaddleOCRVLForConditionalGeneration, logging

        logging.set_verbosity_error()
        torch.set_num_threads(DEFAULT_THREADS)
        self.torch = torch
        self.dtype = "float32" if available_memory() >= MIN_FLOAT32_AVAILABLE_BYTES else "bfloat16"
        self.processor = AutoProcessor.from_pretrained(str(model_dir))
        self.model = PaddleOCRVLForConditionalGeneration.from_pretrained(
            str(model_dir), dtype=getattr(torch, self.dtype)
        ).eval()

    def read(self, crop, max_tokens: int) -> str:
        inputs = self.processor(images=[crop], text=[PROMPT], return_tensors="pt")
        with self.torch.inference_mode():
            output = self.model.generate(**inputs, max_new_tokens=max_tokens, do_sample=False, use_cache=True)
        generated = output[0][inputs["input_ids"].shape[1]:]
        return clean_output(self.processor.tokenizer.decode(generated, skip_special_tokens=True))


def available_memory() -> int:
    try:
        import psutil
        return psutil.virtual_memory().available
    except ImportError:
        return 0


def peak_memory_mb() -> int:
    try:
        import psutil
        info = psutil.Process().memory_info()
        return round(getattr(info, "peak_wset", info.rss) / (1024 * 1024))
    except ImportError:
        return 0


def process_image(image_path: Path, model_dir: Path, language: str = "auto", page_number: int = 1) -> dict:
    if not image_path.is_file():
        raise WorkerError("image-not-found", path=str(image_path))
    missing = find_missing_packages()
    if missing:
        raise WorkerError("runtime-missing", missingPackages=missing)
    if not get_engine_info(model_dir)["isDownloaded"]:
        raise WorkerError("model-missing")

    from PIL import Image

    with Image.open(str(image_path)) as source:
        image = source.convert("RGB")
    width, height = image.size

    started = time.time()
    latin_regions = plan_regions(image, arabic=False)
    if not latin_regions:
        return page_result(page_number, width, height, [], [], {"regions": 0})

    recognizer = Recognizer(model_dir)
    loaded = time.time()
    arabic = language in ("ar", "ar-SA")
    known = {}
    if language not in ("ar", "ar-SA", "en", "en-US"):
        # Auto: one wide middle row tells the script before committing to a layout
        rows = [row for region in latin_regions for row in region["rows"]]
        probe = max(rows[len(rows) // 4:] or rows, key=lambda r: r[2] - r[0])
        known[probe] = recognizer.read(image.crop(probe), MAX_LINE_TOKENS)
        arabic = is_arabic(known[probe])

    regions = plan_regions(image, arabic=True) if arabic else latin_regions
    lines, blocks = [], []
    for region in regions:
        rows = region["rows"]
        box = (min(r[0] for r in rows), rows[0][1], max(r[2] for r in rows), rows[-1][3])
        is_line = region["kind"] == "line"
        text = known.get(box) if box in known else recognizer.read(image.crop(box), MAX_LINE_TOKENS if is_line else MAX_BLOCK_TOKENS)
        if text:
            blocks.append(text)
            lines += estimate_lines(text, rows, arabic)

    return page_result(page_number, width, height, lines, blocks, {
        "regions": len(regions),
        "precision": recognizer.dtype,
        "loadSeconds": round(loaded - started, 1),
        "recognizeSeconds": round(time.time() - loaded, 1),
        "peakMemoryMb": peak_memory_mb(),
    }, arabic)


def page_result(page_number: int, width: int, height: int, lines: list, blocks: list, stats: dict, arabic: bool = False) -> dict:
    separator = "\n" if arabic else "\n\n"
    return {
        "engine": "paddleocr_vl",
        "model": "PaddleOCR-VL-1.6",
        "pageNumber": page_number,
        "text": separator.join(blocks),
        "markdown": "\n\n".join(blocks),
        "width": width,
        "height": height,
        "lines": lines,
        "words": [word for line in lines for word in line["words"]],
        "tables": [],
        "stats": stats,
    }


def main():
    # Node reads this pipe as UTF-8; the Windows default code page cannot encode Arabic
    sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="PaddleOCR-VL-1.6 Local Inference Worker")
    parser.add_argument("--image", type=str, help="Path to the page image")
    parser.add_argument("--page", type=int, default=1, help="Page number (1-based)")
    parser.add_argument("--language", type=str, default="auto", help="Target language (auto, ar, en)")
    parser.add_argument("--model-dir", type=str, default=None, help="Path to model weights directory")
    parser.add_argument("--info", action="store_true", help="Print engine information JSON")
    args = parser.parse_args()

    model_dir = Path(args.model_dir) if args.model_dir else Path(__file__).resolve().parent.parent.parent / ".baglib-data" / "models" / "paddleocr-vl"

    if args.info:
        print(json.dumps(get_engine_info(model_dir), ensure_ascii=False))
        return

    if not args.image:
        parser.error("--image is required.")

    try:
        result = process_image(Path(args.image), model_dir, language=args.language, page_number=args.page)
    except WorkerError as error:
        print(json.dumps({"error": error.code, **error.details}, ensure_ascii=False))
        sys.exit(3)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
