"""
Verification script for Baglib PDF engine and Stirling-PDF delegation.
Uses standard Python libraries and pikepdf; 100% Stirling-PDF delegated engine.
"""

import sys
import os
import json
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("baglib_pdf", ROOT / "assets/pdf-editor/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def main():
    print("=== Validating PDF Engine & Stirling-PDF Delegation ===")

    # 1. Capabilities check
    caps = engine.run({"operation": "capabilities"})
    assert caps.get("engine") == "Stirling-PDF 3.2.2"
    assert "inspect" in caps.get("features", [])
    assert "preview" in caps.get("features", [])
    assert "organize" in caps.get("features", [])
    assert "redact" in caps.get("features", [])
    print(f"✓ Engine Capabilities: {caps.get('engine')} with {len(caps.get('features', []))} features")

    # 2. Basic digest test
    dummy_file = ROOT / "package.json"
    h = engine.digest(str(dummy_file))
    assert len(h) == 64
    print(f"✓ Digest helper verified: {h[:16]}...")

    print("\n✓ ALL PDF ENGINE VERIFICATION CHECKS PASSED.")


if __name__ == "__main__":
    main()
