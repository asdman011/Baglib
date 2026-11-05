#!/usr/bin/env python3
"""Repeatable Arabic OCR benchmark for KEY-258.

build   renders known Arabic text into printed pages and scan-like copies, with ground truth.
run     reads every page with one engine and saves the raw text.
score   compares saved text with ground truth and writes results.json and results.md.

Ground truth comes from the hadith corpus, read-only. Pages are synthetic print, not scans of
real books, and there are no manuscripts: the report says so. Run with the app's venv Python.
"""

import argparse
import json
import random
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / ".baglib-data" / "pdf-engine"
OUT = ROOT / ".baglib-data" / "ocr-benchmark"
CORPUS = ROOT / "tools" / "hadith-alignment" / "data" / "output" / "sunnah_kutub_tisah_itqan.sqlite"
TESSERACT = ENGINE / "tesseract" / "tesseract.exe"
TESSDATA = ENGINE / "ocr-best"
WEASYPRINT = ENGINE / "weasyprint" / "weasyprint.exe"
PDFTOPPM = next((ENGINE / "poppler").rglob("pdftoppm.exe"), None)
PYTHON = ENGINE / "venv" / "Scripts" / "python.exe"
DPI = 300
TARGET_LETTER_CER = 0.10

MARKS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ]")
NOT_LETTERS = re.compile(r"[^ء-يٱ-ۓ\s]")
DIGIT_ROW = re.compile(r"^[\s\d٠-٩۰-۹IVXLlo|.,:;()\[\]\-]*$")

# (id, layout, font, vocalized)
PAGES = [
    ("prose-arial", "prose", "Arial", False),
    ("prose-typesetting", "prose", "Arabic Typesetting", False),
    ("prose-vocalized", "prose", "Arabic Typesetting", True),
    ("prose-times", "prose", "Times New Roman", False),
    ("two-column", "columns", "Arial", False),
    ("verse-layout", "verse", "Arabic Typesetting", False),
]
SCANNED = ["prose-arial", "prose-vocalized", "two-column", "verse-layout"]


def letters(text: str) -> str:
    """Letters only: no marks, digits or punctuation, single spaces."""
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", NOT_LETTERS.sub(" ", MARKS.sub("", text))).strip()


def with_marks(text: str) -> str:
    text = unicodedata.normalize("NFC", text).replace("ـ", "")
    return re.sub(r"\s+", " ", re.sub(r"[^ء-ٰٟ-ۓ\s]", " ", text)).strip()


def drop_digit_rows(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not DIGIT_ROW.match(line))


def distance(first, second) -> int:
    previous = list(range(len(second) + 1))
    for index, item in enumerate(first, 1):
        current = [index]
        for position, other in enumerate(second, 1):
            current.append(min(previous[position] + 1, current[position - 1] + 1, previous[position - 1] + (item != other)))
        previous = current
    return previous[-1]


def rate(truth, read) -> float:
    return distance(truth, read) / max(1, len(truth))


def word_recall(truth: str, read: str) -> float:
    """Share of the true words read correctly in any order, to separate recognition from reading order."""
    from collections import Counter
    expected, found = Counter(letters(truth).split()), Counter(letters(read).split())
    return sum((expected & found).values()) / max(1, sum(expected.values()))


def texts(vocalized: bool) -> list:
    """Bukhari passages chosen by id, so every build uses the same text. The full hadith field keeps its marks."""
    db = sqlite3.connect(f"file:{CORPUS}?mode=ro", uri=True)
    field = "Arabic_Hadith" if vocalized else "Arabic_Matn"
    rows = db.execute(f"SELECT {field} FROM hadiths WHERE book_key='Bukhari' AND length({field}) BETWEEN 500 AND 900 ORDER BY id LIMIT 12").fetchall()
    db.close()
    return [re.sub(r"\s+", " ", row[0]).strip() for row in rows]


def html(page_id: str, layout: str, font: str, vocalized: bool, passages: list) -> tuple:
    body = passages if vocalized else [MARKS.sub("", passage) for passage in passages]
    style = f"@page {{ size: A4; margin: 2cm }} body {{ font-family: '{font}'; font-size: 17pt; line-height: 1.9; direction: rtl }} p {{ margin: 0 0 .8em }}"
    if layout == "prose":
        chosen = body[:2]
        return f"<html lang='ar' dir='rtl'><meta charset='utf-8'><style>{style}</style><body>{''.join(f'<p>{text}</p>' for text in chosen)}</body></html>", "\n".join(chosen)
    if layout == "columns":
        chosen = body[2:4]
        style += " body { columns: 2; column-gap: 1.2cm; font-size: 15pt }"
        return f"<html lang='ar' dir='rtl'><meta charset='utf-8'><style>{style}</style><body>{''.join(f'<p>{text}</p>' for text in chosen)}</body></html>", "\n".join(chosen)
    words = " ".join(body[4:6]).split()
    rows = [(" ".join(words[at:at + 4]), " ".join(words[at + 4:at + 8])) for at in range(0, min(len(words), 96), 8)]
    rows = [row for row in rows if row[1]]
    table = "".join(f"<tr><td>{first}</td><td>{second}</td></tr>" for first, second in rows)
    style += " table { width: 100%; border-spacing: 1.5cm .1cm } td { text-align: center; width: 50% }"
    return f"<html lang='ar' dir='rtl'><meta charset='utf-8'><style>{style}</style><body><table>{table}</table></body></html>", "\n".join(f"{first} {second}" for first, second in rows)


def scan_like(source: Path, target: Path, seed: int) -> None:
    from PIL import Image, ImageFilter
    import numpy
    random.seed(seed)
    image = Image.open(source).convert("L").rotate(0.8, expand=False, fillcolor=255)
    image = image.resize((image.width * 2 // 3, image.height * 2 // 3)).resize(image.size).filter(ImageFilter.GaussianBlur(0.7))
    pixels = numpy.asarray(image, dtype=numpy.int16)
    noise = numpy.random.default_rng(seed).normal(0, 14, pixels.shape)
    Image.fromarray(numpy.clip(pixels + noise, 0, 255).astype("uint8")).save(target.with_suffix(".jpg"), quality=45, dpi=(DPI, DPI))
    Image.open(target.with_suffix(".jpg")).save(target, dpi=(DPI, DPI))
    target.with_suffix(".jpg").unlink()


def build() -> None:
    folder = OUT / "set"
    folder.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index, (page_id, layout, font, vocalized) in enumerate(PAGES):
        markup, truth = html(page_id, layout, font, vocalized, texts(vocalized))
        pdf = folder / f"{page_id}.pdf"
        subprocess.run([str(WEASYPRINT), "-", str(pdf)], input=markup.encode("utf-8"), check=True)
        subprocess.run([str(PDFTOPPM), "-r", str(DPI), "-png", "-singlefile", "-f", "1", "-l", "1", str(pdf), str(folder / page_id)], check=True)
        (folder / f"{page_id}.txt").write_text(truth, encoding="utf-8")
        manifest.append({"id": page_id, "layout": layout, "font": font, "vocalized": vocalized, "kind": "print"})
        if page_id in SCANNED:
            scan = f"{page_id}-scan"
            scan_like(folder / f"{page_id}.png", folder / f"{scan}.png", index)
            (folder / f"{scan}.txt").write_text(truth, encoding="utf-8")
            manifest.append({"id": scan, "layout": layout, "font": font, "vocalized": vocalized, "kind": "scan-like"})
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(manifest)} pages in {folder}")


def tesseract(image: Path, psm: int) -> str:
    result = subprocess.run([str(TESSERACT), str(image), "stdout", "-l", "ara", "--psm", str(psm), "--tessdata-dir", str(TESSDATA)], capture_output=True)
    return result.stdout.decode("utf-8")


def ocrmypdf(image: Path, psm) -> str:
    """The Hub path: OCRmyPDF over a scanned page, with Tesseract's own segmentation unless psm is given."""
    work = OUT / "work"
    work.mkdir(exist_ok=True)
    sidecar = work / f"{image.stem}.txt"
    command = [str(PYTHON), "-m", "ocrmypdf", "-l", "ara", "--image-dpi", str(DPI), "--deskew", "--sidecar", str(sidecar), "--output-type", "pdf", "--optimize", "0"]
    if psm is not None:
        command += ["--tesseract-pagesegmode", str(psm)]
    env = {**__import__("os").environ, "TESSDATA_PREFIX": str(TESSDATA), "PATH": f"{TESSERACT.parent};{next((ENGINE / 'ghostscript').rglob('gswin64c.exe')).parent};" + __import__("os").environ["PATH"]}
    subprocess.run(command + [str(image), str(work / f"{image.stem}.pdf")], check=True, env=env, capture_output=True)
    return sidecar.read_text(encoding="utf-8")


def paddle(image: Path, _psm) -> str:
    result = subprocess.run([str(PYTHON), str(ROOT / "assets" / "ocr" / "paddle_vl_worker.py"), "--image", str(image), "--language", "ar"], capture_output=True)
    return json.loads(result.stdout.decode("utf-8"))["text"]


ENGINES = {
    "tesseract-psm3": (lambda image, _: tesseract(image, 3), None),
    "tesseract-psm4": (lambda image, _: tesseract(image, 4), None),
    "tesseract-psm6": (lambda image, _: tesseract(image, 6), None),
    "hub-before": (ocrmypdf, None),
    "hub-psm4": (ocrmypdf, 4),
    "hub-psm6": (ocrmypdf, 6),
    "paddleocr-vl": (paddle, None),
}


def run(engine: str, only: list) -> None:
    folder = OUT / "set"
    target = OUT / "runs" / engine
    target.mkdir(parents=True, exist_ok=True)
    reader, option = ENGINES[engine]
    for page in json.loads((folder / "manifest.json").read_text(encoding="utf-8")):
        if only and page["id"] not in only:
            continue
        started = time.time()
        text = reader(folder / f"{page['id']}.png", option)
        (target / f"{page['id']}.txt").write_text(text, encoding="utf-8")
        (target / f"{page['id']}.json").write_text(json.dumps({"seconds": round(time.time() - started, 1)}), encoding="utf-8")
        print(f"{engine} {page['id']} {time.time() - started:.1f}s", flush=True)


def score() -> None:
    folder = OUT / "set"
    pages = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    results = []
    for engine_folder in sorted((OUT / "runs").iterdir()):
        for page in pages:
            output = engine_folder / f"{page['id']}.txt"
            if not output.exists():
                continue
            truth = (folder / f"{page['id']}.txt").read_text(encoding="utf-8")
            read = output.read_text(encoding="utf-8")
            timing = json.loads((engine_folder / f"{page['id']}.json").read_text(encoding="utf-8"))
            results.append({
                "engine": engine_folder.name, "page": page["id"], "kind": page["kind"], "layout": page["layout"], "vocalized": page["vocalized"],
                "letterCer": round(rate(letters(truth), letters(read)), 4),
                "letterCerWithoutDigitRows": round(rate(letters(truth), letters(drop_digit_rows(read))), 4),
                "wer": round(rate(letters(truth).split(), letters(read).split()), 4),
                "wordRecall": round(word_recall(truth, read), 4),
                "markCer": round(rate(with_marks(truth), with_marks(read)), 4) if page["vocalized"] else None,
                "seconds": timing["seconds"],
            })
    (OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    percent = lambda value: "-" if value is None else f"{value * 100:.1f}%"
    lines = [f"Target: letter CER at most {TARGET_LETTER_CER * 100:.0f}% on printed pages.", "", "| Engine | Page | Letter CER | Without digit rows | WER | Words read, any order | CER with marks | Seconds |", "|---|---|---|---|---|---|---|---|"]
    lines += [f"| {row['engine']} | {row['page']} | {percent(row['letterCer'])} | {percent(row['letterCerWithoutDigitRows'])} | {percent(row['wer'])} | {percent(row['wordRecall'])} | {percent(row['markCer'])} | {row['seconds']} |" for row in results]
    (OUT / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["build", "run", "score"])
    parser.add_argument("--engine", choices=sorted(ENGINES))
    parser.add_argument("--pages", nargs="*", default=[])
    arguments = parser.parse_args()
    if arguments.command == "build":
        build()
    elif arguments.command == "run":
        run(arguments.engine, arguments.pages)
    else:
        score()


if __name__ == "__main__":
    main()
