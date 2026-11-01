"""Rewrites a pip console launcher so it finds python.exe beside itself.

pip writes an absolute Python path into each launcher, so a copied launcher breaks.
Stirling can only start OCRmyPDF as a real executable named on PATH.
"""
import sys
from pathlib import Path

SOURCE, TARGET = Path(sys.argv[1]), Path(sys.argv[2])
launcher = SOURCE.read_bytes()
shebang = launcher.rfind(b"#!")
archive = launcher.index(b"\n", shebang) + 1
TARGET.write_bytes(launcher[:shebang] + b"#!python.exe\n" + launcher[archive:])
