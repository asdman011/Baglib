"""Copies a PDF without its comments; Stirling-PDF's API has no equivalent endpoint.

Links and form fields are annotations too, but they are not comments, so they stay unless named.
"""
import sys

import pikepdf


def main(source: str, output: str, also_remove: list[str]) -> None:
    kept = set()
    if "--links" not in also_remove:
        kept.add("/Link")
    if "--form-fields" not in also_remove:
        kept.add("/Widget")
    with pikepdf.open(source) as document:
        for page in document.pages:
            if "/Annots" not in page:
                continue
            remaining = [item for item in page.Annots if str(item.get("/Subtype", "")) in kept]
            if remaining:
                page.Annots = pikepdf.Array(remaining)
            else:
                del page["/Annots"]
        if "--form-fields" in also_remove and "/AcroForm" in document.Root:
            del document.Root["/AcroForm"]
        document.save(output)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
