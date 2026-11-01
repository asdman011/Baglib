#!/usr/bin/env python3
"""
Verification Script for PaddleOCR-VL-1.6 in Baglib
Runs the real model on freshly drawn English and Arabic pages and compares the text it
returns with the text that was drawn. Each page loads the model, so expect some minutes.
"""

import base64
import difflib
import sys
import json
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PYTHON_EXE = REPO_ROOT / ".baglib-data" / "pdf-engine" / "venv" / "Scripts" / "python.exe"
WORKER_SCRIPT = REPO_ROOT / "assets" / "ocr" / "paddle_vl_worker.py"
MEMORY_BUDGET_MB = 4500  # float32 weights plus inference, measured near 4 GB
MIN_SIMILARITY = 0.9  # OCR is not exact: clean Arabic still loses the odd alif or hamza
ENGLISH_LINE = "Baglib reads scanned books locally"
ARABIC_LINE = "المكتبة التراثية والعلوم الإسلامية"


def run_worker(*args) -> dict:
    cmd = [str(PYTHON_EXE), str(WORKER_SCRIPT)] + list(args)
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        raise SystemExit(f"Worker failed ({proc.returncode}): {proc.stdout[-500:]} {proc.stderr[-500:]}")
    return json.loads(proc.stdout)


def draw_page(path: Path, text: str, right_to_left: bool = False) -> None:
    """System.Drawing shapes Arabic; this Pillow build has no raqm to do it."""
    flags = "[System.Drawing.StringFormatFlags]::DirectionRightToLeft" if right_to_left else "0"
    script = f"""
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 1000, 240
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 32)
$format = New-Object System.Drawing.StringFormat
$format.FormatFlags = {flags}
$rect = New-Object System.Drawing.RectangleF 40.0, 80.0, 920.0, 100.0
$g.DrawString('{text}', $font, [System.Drawing.Brushes]::Black, $rect, $format)
$bmp.Save('{str(path).replace("'", "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
"""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], check=True)


def check_page(language: str, image: Path, expected: str) -> None:
    result = run_worker("--image", str(image), "--language", language)
    assert result.get("engine") == "paddleocr_vl", "Engine must be paddleocr_vl"
    similarity = difflib.SequenceMatcher(None, expected, result["text"]).ratio()
    assert similarity >= MIN_SIMILARITY, f"{language} similarity {similarity:.3f}: {result['text']!r}"
    assert result["words"], f"{language} output has no word boxes"
    stats = result["stats"]
    assert stats["peakMemoryMb"] < MEMORY_BUDGET_MB, f"Worker peaked at {stats['peakMemoryMb']} MB"
    print(f"✓ {language}: similarity {similarity:.3f} {result['text']!r} ({stats})")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=== Validating PaddleOCR-VL-1.6 Engine Integration ===")

    info = run_worker("--info")
    print(f"✓ Engine: {info.get('name')} · {info.get('device')}")
    assert info.get("id") == "paddleocr_vl", "Engine ID must be paddleocr_vl"
    assert info.get("runtimeReady"), f"Missing in the app's venv: {info.get('missingPackages')}"
    assert info.get("isDownloaded"), "Model weights are not downloaded"

    with tempfile.TemporaryDirectory() as tmpdir:
        en_image = Path(tmpdir) / "test_en.png"
        draw_page(en_image, ENGLISH_LINE)
        check_page("en", en_image, ENGLISH_LINE)

        ar_image = Path(tmpdir) / "test_ar.png"
        draw_page(ar_image, ARABIC_LINE, right_to_left=True)
        check_page("ar", ar_image, ARABIC_LINE)

    print("\n✓ PADDLEOCR-VL-1.6 VERIFICATION CHECKS PASSED.")


if __name__ == "__main__":
    main()
