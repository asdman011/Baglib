"""Lossy matching keys only; never use these values as display text."""
import re

MARKS = re.compile(r"[\u0617-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]")
OTHER = re.compile(r"[^\u0621-\u063a\u0641-\u064a\s]")
SPACES = re.compile(r"\s+")
FOLD = str.maketrans({"إ": "ا", "أ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "ء", "ئ": "ء"})


def present(text: str | None) -> bool:
    return bool(text and text.strip() and text.strip().casefold() not in {"nan", "null", "none"})


def normalize_arabic(text: str | None) -> str:
    if not present(text):
        return ""
    return SPACES.sub(" ", OTHER.sub(" ", MARKS.sub("", text).translate(FOLD))).strip()


def matching_text(row: dict[str, str]) -> str:
    if present(row["Arabic_Hadith"]):
        return row["Arabic_Hadith"]
    return " ".join(row[k] for k in ("Arabic_Isnad", "Arabic_Matn") if present(row[k]))
