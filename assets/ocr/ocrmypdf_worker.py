#!/usr/bin/env python3
"""Reads one page image through OCRmyPDF and prints BagLib's OCR JSON on stdout.

The image is a temporary render of the page, so the source PDF is never opened here.
OCRmyPDF's output PDF stays in a temporary folder and is deleted with it. Text and
word boxes come from Tesseract's hOCR, because the PDF text layer stores each Arabic
word reversed.
"""

import argparse
import importlib.metadata
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ElementTree
from pathlib import Path

LANGUAGE_FILES = ("ara", "eng")
LINE_CLASSES = {"ocr_line", "ocr_header", "ocr_footer", "ocr_caption", "ocr_textfloat"}
BIDI_MARKS = re.compile("[‎‏‪-‮⁦-⁩]")
# Treats a page as one column of lines. Without it Tesseract splits Arabic verse
# into hemistich blocks and reads almost none of it.
ARABIC_PAGE_SEGMENTATION = 4


class WorkerError(Exception):
    """A reason the app can show the reader in their language."""

    def __init__(self, code: str, **details):
        super().__init__(code)
        self.code = code
        self.details = details


def find_tool(root: Path, relative: str, *commands: str):
    bundled = root / relative
    if bundled.is_file():
        return bundled
    for command in commands:
        found = shutil.which(command)
        if found:
            return Path(found)
    return None


def find_tesseract(root: Path):
    return find_tool(root, "tesseract/tesseract.exe", "tesseract")


def find_ghostscript(root: Path):
    return find_tool(root, "ghostscript/bin/gswin64c.exe", "gswin64c", "gs")


def find_missing_packages(root: Path) -> list:
    missing = []
    if importlib.util.find_spec("ocrmypdf") is None:
        missing.append("ocrmypdf")
    if find_tesseract(root) is None:
        missing.append("tesseract")
    if find_ghostscript(root) is None:
        missing.append("ghostscript")
    return missing


def find_missing_language_data(root: Path) -> list:
    tessdata = root / "ocr-best"
    missing = [name for name in LANGUAGE_FILES if not (tessdata / f"{name}.traineddata").is_file()]
    if not (tessdata / "configs" / "hocr").is_file():
        missing.append("hocr")
    return missing


def get_engine_info(root: Path) -> dict:
    missing_packages = find_missing_packages(root)
    missing_data = find_missing_language_data(root)
    try:
        version = importlib.metadata.version("ocrmypdf")
    except importlib.metadata.PackageNotFoundError:
        version = ""
    return {
        "id": "ocrmypdf",
        "name": "OCRmyPDF",
        "version": version,
        "parameters": "Tesseract 5",
        "device": "CPU",
        "modelPath": str(root / "ocr-best"),
        "isDownloaded": not missing_data,
        "runtimeReady": not missing_packages,
        "missingPackages": missing_packages or missing_data,
        "supportedLanguages": ["ar", "en", "ar-SA", "en-US", "auto"],
    }


def detect_language(image: Path, root: Path) -> str:
    """Asks Tesseract for the page's script. Sparse pages have too little text to tell."""
    tesseract = find_tesseract(root)
    try:
        result = subprocess.run(
            [str(tesseract), str(image), "stdout", "--psm", "0", "--tessdata-dir", str(root / "ocr-best")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired):
        return "ara+eng"
    match = re.search(r"Script:\s*(\w+)", result.stdout)
    script = match.group(1) if match else ""
    return {"Arabic": "ara", "Latin": "eng"}.get(script, "ara+eng")


def tesseract_language(language: str, image: Path, root: Path) -> str:
    if language.lower().startswith("ar"):
        return "ara"
    if language.lower().startswith("en"):
        return "eng"
    return detect_language(image, root)


def parse_title(title: str) -> dict:
    fields = {}
    for part in title.split(";"):
        pieces = part.split()
        if len(pieces) >= 2:
            fields[pieces[0]] = pieces[1:]
    return fields


def bbox_of(fields: dict) -> dict:
    left, top, right, bottom = (int(value) for value in fields["bbox"][:4])
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def clean_word(text: str) -> str:
    return BIDI_MARKS.sub("", text).strip()


def parse_hocr(markup: str) -> dict:
    """Turns hOCR into lines of words. Tesseract writes them in reading order."""
    root = ElementTree.fromstring(markup)
    width = height = 0
    lines = []
    for element in root.iter():
        css = set((element.get("class") or "").split())
        if "ocr_page" in css:
            box = bbox_of(parse_title(element.get("title", "")))
            width, height = box["width"], box["height"]
        if not css & LINE_CLASSES:
            continue
        words = []
        for child in element.iter():
            if "ocrx_word" not in (child.get("class") or "").split():
                continue
            text = clean_word("".join(child.itertext()))
            if not text:
                continue
            fields = parse_title(child.get("title", ""))
            word = {"text": text, "bbox": bbox_of(fields)}
            if "x_wconf" in fields:
                word["confidence"] = int(fields["x_wconf"][0]) / 100
            words.append(word)
        if words:
            lines.append({
                "text": " ".join(word["text"] for word in words),
                "bbox": bbox_of(parse_title(element.get("title", ""))),
                "words": words,
            })
    return {"width": width, "height": height, "lines": lines}


def flatten_transparency(image: Path, work: Path) -> Path:
    """OCRmyPDF refuses images with an alpha channel, which screenshots and pasted images have."""
    from PIL import Image

    with Image.open(image) as source:
        if "A" not in source.getbands() and "transparency" not in source.info:
            return image
        flat = work / "flattened.png"
        rgba = source.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, "white")
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        canvas.save(flat, dpi=source.info.get("dpi", (300, 300)))
        return flat


def run_ocrmypdf(image: Path, language: str, dpi: int, work: Path) -> Path:
    import ocrmypdf
    from ocrmypdf.exceptions import MissingDependencyError

    options ={"tesseract_pagesegmode": ARABIC_PAGE_SEGMENTATION} if language == "ara" else {}
    tempfile.tempdir = str(work)
    try:
        ocrmypdf.ocr(
            flatten_transparency(image, work),
            work / "staged.pdf",
            language=language,
            image_dpi=dpi,
            output_type="pdf",
            optimize=0,
            jobs=1,
            keep_temporary_files=True,
            progress_bar=False,
            **options,
        )
    except MissingDependencyError as error:
        raise WorkerError("runtime-missing", missingPackages=["tesseract"]) from error
    found = sorted(work.rglob("*.hocr"))
    if not found:
        raise WorkerError("engine-failed")
    return found[0]


def process_image(image: Path, root: Path, language: str = "auto", page_number: int = 1, dpi: int = 300) -> dict:
    missing_packages = find_missing_packages(root)
    if missing_packages:
        raise WorkerError("runtime-missing", missingPackages=missing_packages)
    missing_data = find_missing_language_data(root)
    if missing_data:
        raise WorkerError("model-missing", missingPackages=missing_data)

    os.environ["PATH"] = os.pathsep.join([str(find_tesseract(root).parent), str(find_ghostscript(root).parent), os.environ.get("PATH", "")])
    os.environ["TESSDATA_PREFIX"] = str(root / "ocr-best")
    chosen = tesseract_language(language, image, root)

    with tempfile.TemporaryDirectory(prefix="baglib-ocrmypdf-") as folder:
        hocr = run_ocrmypdf(image, chosen, dpi, Path(folder))
        page = parse_hocr(hocr.read_text(encoding="utf-8"))

    text = "\n".join(line["text"] for line in page["lines"])
    return {
        "pageNumber": page_number,
        "text": text,
        "markdown": text,
        "lines": page["lines"],
        "words": [word for line in page["lines"] for word in line["words"]],
        "width": page["width"],
        "height": page["height"],
        "language": chosen,
        "tables": [],
    }


def main():
    # stdout goes to Electron, and Arabic text cannot pass through the Windows code page.
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--info", action="store_true")
    parser.add_argument("--engine-root", required=True)
    parser.add_argument("--image")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--dpi", type=int, default=300)
    args = parser.parse_args()
    root = Path(args.engine_root)

    if args.info:
        print(json.dumps(get_engine_info(root), ensure_ascii=False))
        return
    if not args.image:
        parser.error("--image is required")

    try:
        result = process_image(Path(args.image), root, args.language, args.page, args.dpi)
    except WorkerError as error:
        print(json.dumps({"error": error.code, **error.details}, ensure_ascii=False))
        sys.exit(3)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
