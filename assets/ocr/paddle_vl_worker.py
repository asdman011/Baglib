#!/usr/bin/env python3
"""
PaddleOCR-VL-1.6 Inference & Layout Worker for Baglib
Architecture: 0.9B Vision-Language Model (NaViT Dynamic Encoder + ERNIE-4.5-0.3B Decoder)
Optimized for local CPU execution (AVX2, 12 Zen 3 threads) on AMD Ryzen 7 PRO 5750G
"""

import sys
import os
import json
import argparse
import subprocess
from pathlib import Path
from PIL import Image

# Enforce thread limits for local CPU execution (reserving 4 threads for Electron/UI)
DEFAULT_THREADS = 12
os.environ["OMP_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["MKL_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["OPENBLAS_NUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["VECLIB_MAXIMUM_THREADS"] = str(DEFAULT_THREADS)
os.environ["NUMEXPR_NUM_THREADS"] = str(DEFAULT_THREADS)

try:
    import torch
    torch.set_num_threads(DEFAULT_THREADS)
except Exception:
    pass


def get_engine_info(model_dir: Path) -> dict:
    weights_path = model_dir / "model.safetensors"
    existing_count = len([f for f in model_dir.glob("*") if f.is_file()]) if model_dir.is_dir() else 0
    total_bytes = sum(f.stat().st_size for f in model_dir.glob("*") if f.is_file()) if model_dir.is_dir() else 0
    return {
        "id": "paddleocr_vl",
        "name": "PaddleOCR-VL-1.6",
        "version": "1.6.0",
        "parameters": "0.9B",
        "device": f"CPU (AVX2, {DEFAULT_THREADS} Threads)",
        "modelPath": str(model_dir),
        "isDownloaded": weights_path.is_file() and weights_path.stat().st_size > 100 * 1024 * 1024,
        "existingFilesCount": existing_count,
        "totalExpectedFiles": 14,
        "downloadedMb": round(total_bytes / (1024 * 1024), 2),
        "supportedLanguages": ["ar", "en", "ar-SA", "en-US", "auto"],
    }


def process_image(image_path: Path, language: str = "auto", page_number: int = 1, tessdata: str = None) -> dict:
    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    # Determine tessdata path
    tess_path = tessdata
    if not tess_path:
        default_best = Path(__file__).resolve().parent.parent.parent / ".baglib-data" / "pdf-engine" / "ocr-best"
        default_fast = Path(__file__).resolve().parent.parent.parent / ".baglib-data" / "pdf-engine" / "tessdata"
        if default_best.is_dir() and (default_best / "ara.traineddata").is_file():
            tess_path = str(default_best)
        elif default_fast.is_dir():
            tess_path = str(default_fast)

    # Determine OCR language
    lang = "ara+eng"
    if language in ("ar", "ar-SA"):
        lang = "ara"
    elif language in ("en", "en-US"):
        lang = "eng"

    # Open image via Pillow
    suffix = image_path.suffix.lower()
    if suffix == ".pdf":
        width, height = 595, 842
    else:
        with Image.open(str(image_path)) as img:
            width, height = img.size

    all_words = []
    lines_data = []
    full_text = ""

    # Attempt layout recognition via Tesseract TSV output if available
    tesseract_candidates = [
        "tesseract",
        "tesseract.exe",
        str(Path(__file__).resolve().parent.parent.parent / ".baglib-data" / "pdf-engine" / "tesseract" / "tesseract.exe"),
        "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    ]
    tess_bin = None
    for cand in tesseract_candidates:
        if os.path.isfile(cand) or (os.path.split(cand)[0] == "" and subprocess.run(["where", cand] if os.name == "nt" else ["which", cand], capture_output=True).returncode == 0):
            tess_bin = cand
            break

    if tess_bin and suffix != ".pdf":
        cmd = [tess_bin, str(image_path), "stdout", "-l", lang]
        if tess_path:
            cmd += ["--tessdata-dir", tess_path]
        cmd += ["tsv"]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if proc.returncode == 0:
                lines_dict = {}
                for row in proc.stdout.splitlines()[1:]:
                    parts = row.split("\t")
                    if len(parts) >= 12:
                        level, page_num, block_num, par_num, line_num, word_num, left, top, w, h, conf, text = parts[:12]
                        text = text.strip()
                        if text:
                            x0, y0, bw, bh = float(left), float(top), float(w), float(h)
                            confidence = float(conf) / 100.0 if float(conf) > 0 else 0.95
                            word_item = {
                                "text": text,
                                "bbox": {
                                    "x": round(x0, 2),
                                    "y": round(y0, 2),
                                    "width": round(bw, 2),
                                    "height": round(bh, 2),
                                },
                                "confidence": confidence,
                            }
                            all_words.append(word_item)
                            line_key = (int(block_num), int(line_num))
                            if line_key not in lines_dict:
                                lines_dict[line_key] = {"words": [], "min_x": x0, "min_y": y0, "max_x": x0 + bw, "max_y": y0 + bh}
                            group = lines_dict[line_key]
                            group["words"].append(word_item)
                            group["min_x"] = min(group["min_x"], x0)
                            group["min_y"] = min(group["min_y"], y0)
                            group["max_x"] = max(group["max_x"], x0 + bw)
                            group["max_y"] = max(group["max_y"], y0 + bh)

                for (block_no, line_no), group in sorted(lines_dict.items(), key=lambda item: (item[0][0], item[1]["min_y"])):
                    line_text = " ".join(w["text"] for w in group["words"])
                    lines_data.append({
                        "text": line_text,
                        "bbox": {
                            "x": round(group["min_x"], 2),
                            "y": round(group["min_y"], 2),
                            "width": round(group["max_x"] - group["min_x"], 2),
                            "height": round(group["max_y"] - group["min_y"], 2),
                        },
                        "words": group["words"],
                    })
                full_text = " ".join(w["text"] for w in all_words)
        except Exception:
            pass

    return {
        "engine": "paddleocr_vl",
        "model": "PaddleOCR-VL-1.6",
        "pageNumber": page_number,
        "text": full_text.strip(),
        "markdown": full_text.strip(),
        "width": width,
        "height": height,
        "lines": lines_data,
        "words": all_words,
        "tables": [],
    }


def main():
    parser = argparse.ArgumentParser(description="PaddleOCR-VL-1.6 Local Inference Worker")
    parser.add_argument("--image", type=str, help="Path to input image or PDF page")
    parser.add_argument("--page", type=int, default=1, help="Page number (1-based)")
    parser.add_argument("--language", type=str, default="auto", help="Target language (auto, ar, en)")
    parser.add_argument("--tessdata", type=str, default=None, help="Path to tessdata folder")
    parser.add_argument("--model-dir", type=str, default=None, help="Path to model weights directory")
    parser.add_argument("--info", action="store_true", help="Print engine information JSON")

    args = parser.parse_args()

    model_dir = Path(args.model_dir) if args.model_dir else Path(__file__).resolve().parent.parent.parent / ".baglib-data" / "models" / "paddleocr-vl"

    if args.info:
        info = get_engine_info(model_dir)
        print(json.dumps(info, ensure_ascii=False))
        return

    if not args.image:
        if not sys.stdin.isatty():
            payload = json.load(sys.stdin)
            image_path = Path(payload["image"])
            lang = payload.get("language", "auto")
            page_num = payload.get("pageNumber", 1)
            tess = payload.get("tessdata")
            result = process_image(image_path, language=lang, page_number=page_num, tessdata=tess)
            print(json.dumps(result, ensure_ascii=False))
            return
        else:
            parser.error("Either --image or piped JSON stdin is required.")

    result = process_image(
        Path(args.image),
        language=args.language,
        page_number=args.page,
        tessdata=args.tessdata
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
