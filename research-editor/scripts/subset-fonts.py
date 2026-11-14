"""Subset the research editor's bundled fonts (KEY-362).

Produces research-editor/app/fonts/*.woff (zlib WOFF; brotli is not installed) from:
  - @toeverything/theme fonts (OFL) in research-editor/node_modules: Inter, Kalam, IBM Plex Mono
  - BagLib's own Noto Naskh Arabic (OFL): src/renderer/public/assets/poetry-fonts/notonaskharabic.ttf

Run after `yarn workspaces focus @baglib/research-editor-app` with BagLib's existing fontTools
(the PDF engine venv), for example:
  .baglib-data/pdf-engine/venv/Scripts/python.exe research-editor/scripts/subset-fonts.py

The outputs are committed, so a normal build needs no Python.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from fontTools import subset

EDITOR = Path(__file__).resolve().parent.parent
REPO = EDITOR.parent
THEME = EDITOR / "node_modules" / "@toeverything" / "theme" / "fonts"
OUT = EDITOR / "app" / "fonts"

LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,"
    "U+0308-0309,U+0323,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD"
)
# Arabic, Arabic Supplement, Arabic Extended-A, presentation forms, joiners and marks, plus ASCII
# digits and punctuation so mixed text keeps one face. Diacritics (tashkeel) are inside U+0600-06FF.
ARABIC = "U+0020-0040,U+00A0,U+00AB,U+00BB,U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200F,U+2010-2027,U+FB50-FDFF,U+FE70-FEFF"

FONTS = [
    # (source, output name, unicode ranges, licence file)
    (THEME / "inter" / "Inter-VariableFont_slnt,wght.ttf", "Inter-Variable.woff", LATIN, THEME / "inter" / "OFL.txt"),
    (THEME / "kalam" / "Kalam-Light.ttf", "Kalam-Light.woff", LATIN, THEME / "kalam" / "OFL.txt"),
    (THEME / "kalam" / "Kalam-Regular.ttf", "Kalam-Regular.woff", LATIN, None),
    (THEME / "kalam" / "Kalam-Bold.ttf", "Kalam-Bold.woff", LATIN, None),
    (THEME / "ibm-plex-mono" / "IBMPlexMono-Regular.ttf", "IBMPlexMono-Regular.woff", LATIN, THEME / "ibm-plex-mono" / "OFL.txt"),
    (THEME / "ibm-plex-mono" / "IBMPlexMono-Bold.ttf", "IBMPlexMono-Bold.woff", LATIN, None),
    (
        REPO / "src" / "renderer" / "public" / "assets" / "poetry-fonts" / "notonaskharabic.ttf",
        "NotoNaskhArabic.woff",
        ARABIC,
        REPO / "src" / "renderer" / "public" / "assets" / "poetry-fonts" / "notonaskharabic-OFL.txt",
    ),
]


def subset_one(src: Path, dest: Path, unicodes: str) -> None:
    options = subset.Options()
    options.flavor = "woff"
    options.layout_features = ["*"]  # keep Arabic shaping (init/medi/fina, ligatures, mark positioning)
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = False
    font = subset.load_font(str(src), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(unicodes))
    subsetter.subset(font)
    subset.save_font(font, str(dest), options)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total_in = total_out = 0
    for src, name, unicodes, licence in FONTS:
        if not src.exists():
            print(f"missing source font: {src}", file=sys.stderr)
            return 1
        dest = OUT / name
        subset_one(src, dest, unicodes)
        total_in += src.stat().st_size
        total_out += dest.stat().st_size
        print(f"{name}: {src.stat().st_size / 1024:.0f} KB -> {dest.stat().st_size / 1024:.0f} KB")
        if licence:
            shutil.copyfile(licence, OUT / f"{name.split('-')[0].split('.')[0]}-OFL.txt")
    print(f"total: {total_in / 1024:.0f} KB -> {total_out / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
