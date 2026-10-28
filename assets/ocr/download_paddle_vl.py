#!/usr/bin/env python3
"""
PaddleOCR-VL-1.6 Local Model Downloader for Baglib
Downloads the 0.9B Vision-Language Model weights and configs from HuggingFace
into `.baglib-data/models/paddleocr-vl/` with resumable progress streaming.
"""

import sys
import os
import json
import time
import argparse
import urllib.request
from pathlib import Path

HF_BASE_URL = "https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6/resolve/main"

REQUIRED_FILES = [
    "config.json",
    "configuration_paddleocr_vl.py",
    "generation_config.json",
    "image_processing_paddleocr_vl.py",
    "inference.yml",
    "modeling_paddleocr_vl.py",
    "preprocessor_config.json",
    "processing_paddleocr_vl.py",
    "processor_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer.model",
    "tokenizer_config.json",
    "model.safetensors",
]


def check_status(model_dir: Path) -> dict:
    if not model_dir.is_dir():
        return {
            "isDownloaded": False,
            "existingFiles": [],
            "missingFiles": REQUIRED_FILES,
            "totalExpectedFiles": len(REQUIRED_FILES),
            "modelDir": str(model_dir),
            "totalBytes": 0,
        }

    existing = []
    missing = []
    total_bytes = 0

    for fn in REQUIRED_FILES:
        target = model_dir / fn
        if target.is_file() and target.stat().st_size > 0:
            existing.append(fn)
            total_bytes += target.stat().st_size
        else:
            missing.append(fn)

    is_downloaded = len(missing) == 0 and (model_dir / "model.safetensors").is_file()

    return {
        "isDownloaded": is_downloaded,
        "existingFiles": existing,
        "missingFiles": missing,
        "totalExpectedFiles": len(REQUIRED_FILES),
        "modelDir": str(model_dir),
        "totalBytes": total_bytes,
        "totalMb": round(total_bytes / (1024 * 1024), 2),
    }


def download_file(url: str, dest_path: Path, progress_cb=None):
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_suffix(dest_path.suffix + ".download")

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Baglib-PaddleOCR-Downloader/1.0"}
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        total_size = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024  # 1 MB chunk
        start_time = time.time()

        with open(temp_path, "wb") as f:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                elapsed = max(0.001, time.time() - start_time)
                speed_mb = (downloaded / (1024 * 1024)) / elapsed

                if progress_cb:
                    progress_cb(downloaded, total_size, speed_mb)

    temp_path.replace(dest_path)


def main():
    parser = argparse.ArgumentParser(description="Download PaddleOCR-VL-1.6 Model Weights")
    parser.add_argument("--model-dir", type=str, default=None, help="Target directory for model weights")
    parser.add_argument("--check", action="store_true", help="Check download status and exit")
    parser.add_argument("--download", action="store_true", help="Download missing files")
    args = parser.parse_args()

    if args.model_dir:
        model_dir = Path(args.model_dir)
    else:
        root = Path(__file__).resolve().parent.parent.parent
        model_dir = root / ".baglib-data" / "models" / "paddleocr-vl"

    status = check_status(model_dir)

    if args.check or (not args.download):
        print(json.dumps(status, ensure_ascii=False))
        return

    # Download missing files
    missing = status["missingFiles"]
    if not missing:
        print(json.dumps({"status": "already_downloaded", **status}, ensure_ascii=False))
        return

    model_dir.mkdir(parents=True, exist_ok=True)
    total_files = len(missing)

    for idx, fn in enumerate(missing, 1):
        url = f"{HF_BASE_URL}/{fn}"
        dest = model_dir / fn

        def on_progress(downloaded, total, speed):
            pct = round((downloaded / total * 100), 1) if total > 0 else 0
            payload = {
                "status": "downloading",
                "file": fn,
                "fileIndex": idx,
                "totalFiles": total_files,
                "downloadedBytes": downloaded,
                "totalBytes": total,
                "percent": pct,
                "speedMb": round(speed, 2),
            }
            sys.stdout.write(json.dumps(payload) + "\n")
            sys.stdout.flush()

        try:
            download_file(url, dest, on_progress)
            payload = {
                "status": "file_complete",
                "file": fn,
                "fileIndex": idx,
                "totalFiles": total_files,
            }
            sys.stdout.write(json.dumps(payload) + "\n")
            sys.stdout.flush()
        except Exception as e:
            err_payload = {
                "status": "error",
                "file": fn,
                "error": str(e),
            }
            sys.stdout.write(json.dumps(err_payload) + "\n")
            sys.stdout.flush()
            sys.exit(1)

    final_status = check_status(model_dir)
    sys.stdout.write(json.dumps({"status": "completed", **final_status}) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
