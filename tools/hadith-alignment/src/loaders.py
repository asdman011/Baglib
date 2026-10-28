"""Strict CSV parsing: fail with context rather than silently dropping records."""
import csv
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

LK_COLUMNS = ["Chapter_Number", "Chapter_English", "Chapter_Arabic", "Section_Number", "Section_English", "Section_Arabic", "Hadith_number", "English_Hadith", "English_Isnad", "English_Matn", "Arabic_Hadith", "Arabic_Isnad", "Arabic_Matn", "Arabic_Comment", "English_Grade", "Arabic_Grade"]
APPENDED = ["Arabic_Tafseel", "Tafseel_Match_Score", "Tafseel_Match_Method", "OHD_Row_Index"]
BOOKS = {
    "Bukhari": (("Bukhari",), "Sahih_Al-Bukhari"),
    "Muslim": (("Muslim",), "Sahih_Muslim"),
    "AbuDaud": (("AbuDaud",), "Sunan_Abu-Dawud"),
    "Tirmidhi": (("Tirmidhi", "Tirmizi"), "Sunan_Al-Tirmidhi"),
    "Nesai": (("Nesai",), "Sunan_Al-Nasai"),
    "IbnMajah": (("IbnMajah", "IbnMaja"), "Sunan_Ibn-Maja"),
}
csv.field_size_limit(16 * 1024 * 1024)


@dataclass(frozen=True)
class OhdRow:
    text: str
    commentary: str
    source_id: str


def key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def chapter_number(path: Path) -> int:
    match = re.fullmatch(r"chapter\s*(\d+)\.csv", path.name, re.I)
    if not match:
        raise ValueError(f"Unexpected chapter filename: {path}")
    return int(match[1])


def resolve_folder(root: Path, names: tuple[str, ...]) -> Path:
    matches = [p for p in root.iterdir() if p.is_dir() and key(p.name) in {key(n) for n in names}]
    if len(matches) != 1:
        raise ValueError(f"Expected one folder for {names} in {root}; found {matches}")
    return matches[0]


def resolve_sources(lk_root: Path, ohd_root: Path, book: str) -> tuple[Path, Path]:
    aliases, ohd_name = BOOKS[book]
    lk = resolve_folder(lk_root, aliases)
    folder = resolve_folder(ohd_root, (ohd_name,))
    candidates = [p for p in folder.rglob('*') if p.is_file() and p.suffix.casefold() == '.csv' and 'mushakkala' in key(p.name) and 'mufassala' in key(p.name)]
    if len(candidates) != 1:
        raise ValueError(f"Expected one vocalized commentary CSV in {folder}; found {candidates}")
    return lk, candidates[0]


def fingerprint(path: Path) -> dict:
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {"path": str(path.resolve()), "sha256": digest, "bytes": path.stat().st_size}


def load_lk(folder: Path) -> tuple[list[dict[str, str]], list[dict]]:
    paths = sorted((p for p in folder.iterdir() if p.is_file() and re.fullmatch(r"chapter\s*\d+\.csv", p.name, re.I)), key=chapter_number)
    if not paths or len({chapter_number(p) for p in paths}) != len(paths):
        raise ValueError(f"Missing or duplicate chapter files in {folder}")
    result, manifests = [], []
    for path in paths:
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.reader(stream, strict=True)
            header = next(reader, [])
            names = {key(c): c for c in LK_COLUMNS}
            columns = [names.get(key(c), '') for c in header]
            if len(columns) != 16 or set(columns) != set(LK_COLUMNS):
                raise ValueError(f"Invalid LK header: {path}: {header}")
            count = 0
            for row in reader:
                if len(row) != 16:
                    raise ValueError(f"{path}:{reader.line_num}: expected 16 fields, got {len(row)}")
                result.append(dict(zip(columns, row)))
                count += 1
            manifests.append({**fingerprint(path), "rows": count})
    if not result:
        raise ValueError(f"Empty LK collection: {folder}")
    return result, manifests


def load_ohd(path: Path) -> tuple[list[OhdRow], dict]:
    result = []
    width = None
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.reader(stream, strict=True)
        for row in reader:
            if len(row) < 2 or (width is not None and len(row) != width):
                raise ValueError(f"{path}:{reader.line_num}: invalid/inconsistent OHD field count {len(row)}")
            width = len(row)
            result.append(OhdRow(row[-2], row[-1], row[0] if width >= 3 else ''))
    if not result:
        raise ValueError(f"Empty OHD collection: {path}")
    return result, {**fingerprint(path), "rows": len(result), "columns": width}
