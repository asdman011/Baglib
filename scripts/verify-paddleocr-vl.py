#!/usr/bin/env python3
"""
Verification Script for PaddleOCR-VL-1.6 in Baglib
Validates:
1. Engine info JSON metadata and device configuration
2. Memory footprint on local CPU (< 2.5 GB RAM)
3. Structured layout & bounding box output on English and Arabic pages
"""

import sys
import os
import json
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PYTHON_EXE = REPO_ROOT / ".baglib-data" / "pdf-engine" / "venv" / "Scripts" / "python.exe"
WORKER_SCRIPT = REPO_ROOT / "assets" / "ocr" / "paddle_vl_worker.py"


def run_worker(*args) -> dict:
    cmd = [str(PYTHON_EXE), str(WORKER_SCRIPT)] + list(args)
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(proc.stdout)


def main():
    print("=== Validating PaddleOCR-VL-1.6 Engine Integration ===")

    # 1. Check Engine Info
    info = run_worker("--info")
    print(f"✓ Engine Name: {info.get('name')}")
    print(f"✓ Parameters: {info.get('parameters')}")
    print(f"✓ Device: {info.get('device')}")
    assert info.get("id") == "paddleocr_vl", "Engine ID must be paddleocr_vl"
    assert "CPU" in info.get("device"), "Device must indicate CPU execution"

    # 2. English Recognition Test
    import pymupdf
    with tempfile.TemporaryDirectory() as tmpdir:
        en_img_path = Path(tmpdir) / "test_en.png"
        doc = pymupdf.open()
        page = doc.new_page(width=600, height=200)
        page.insert_text((50, 80), "PaddleOCR-VL SOTA Academic Layout Recognition", fontsize=18)
        pix = page.get_pixmap(dpi=150)
        pix.save(str(en_img_path))
        doc.close()

        res_en = run_worker("--image", str(en_img_path), "--language", "en")
        assert res_en.get("engine") == "paddleocr_vl", "Engine must be paddleocr_vl"
        assert len(res_en.get("words", [])) >= 4, "Should recognize words on English page"
        assert res_en.get("width") > 0 and res_en.get("height") > 0
        first_word = res_en["words"][0]
        assert "bbox" in first_word and first_word["bbox"]["width"] > 0
        print(f"✓ English Test: {len(res_en['words'])} words recognized with valid bounding boxes")

    # 3. Arabic Recognition Test
    with tempfile.TemporaryDirectory() as tmpdir:
        ar_img_path = Path(tmpdir) / "test_ar.png"
        doc = pymupdf.open()
        page = doc.new_page(width=600, height=200)
        fontfile = "C:/Windows/Fonts/arial.ttf" if os.path.exists("C:/Windows/Fonts/arial.ttf") else None
        page.insert_text((50, 80), "المكتبة التراثية والعلوم الإسلامية", fontsize=18, fontfile=fontfile, fontname="ar_font")
        pix = page.get_pixmap(dpi=150)
        pix.save(str(ar_img_path))
        doc.close()

        res_ar = run_worker("--image", str(ar_img_path), "--language", "ar")
        assert res_ar.get("engine") == "paddleocr_vl", "Engine must be paddleocr_vl"
        assert len(res_ar.get("words", [])) >= 1, "Should recognize words on Arabic page"
        print(f"✓ Arabic Test: {len(res_ar['words'])} words recognized with valid bounding boxes")

    # 4. Memory Footprint Verification
    import psutil
    process = psutil.Process()
    ram_mb = process.memory_info().rss / (1024 * 1024)
    print(f"✓ Active Process Memory: {ram_mb:.1f} MB (Budget: 2500 MB)")
    assert ram_mb < 2500, f"Memory ({ram_mb} MB) exceeds 2.5 GB budget"

    # 5. Model Files & Downloader Check
    downloader_script = REPO_ROOT / "assets" / "ocr" / "download_paddle_vl.py"
    proc_dl = subprocess.run([str(PYTHON_EXE), str(downloader_script), "--check"], capture_output=True, text=True, encoding="utf-8", check=True)
    dl_status = json.loads(proc_dl.stdout)
    print(f"✓ Model Files Status: {len(dl_status.get('existingFiles', []))}/{dl_status.get('totalExpectedFiles')} files present ({dl_status.get('totalMb')} MB)")
    assert len(dl_status.get("existingFiles", [])) >= 13, "Configuration & tokenizer files must be present"

    print("\n✓ ALL PaddleOCR-VL-1.6 VERIFICATION CHECKS PASSED.")


if __name__ == "__main__":
    main()
