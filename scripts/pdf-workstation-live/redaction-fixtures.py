"""Builds redaction test files from a copied book, and answers questions about results, for redaction-live.mts."""
import hashlib
import json
import sys

import pikepdf
from PIL import Image
from pikepdf import Array, Dictionary, Name, String


def rotated(source, output):
    """Pages 1 to 4 of the book turned 0, 90, 180 and 270 degrees."""
    with pikepdf.open(source) as document:
        for index, angle in enumerate([0, 90, 180, 270]):
            document.pages[index + 28].obj.Rotate = angle
        document.save(output)


def cropped(source, output):
    """A page whose visible area does not start at the origin."""
    with pikepdf.open(source) as document:
        page = document.pages[28]
        media = [float(item) for item in page.mediabox]
        page.obj.CropBox = Array([media[0] + 40, media[1] + 60, media[2] - 30, media[3] - 20])
        document.save(output)


def encrypted(source, output):
    with pikepdf.open(source) as document:
        document.save(output, encryption=pikepdf.Encryption(owner="owner-pass", user="user-pass", R=6))


def structured(source, output):
    """Adds a form field and a link beside the redaction area, and another form field inside it."""
    with pikepdf.open(source) as document:
        page = document.pages[28]

        def widget(name, rect, value):
            return document.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Widget, FT=Name.Tx, T=String(name), V=String(value), Rect=Array(rect), P=page.obj, F=4))

        kept = widget("kept_field", [60, 60, 200, 80], "stays")
        secret = widget("secret_field", [60, 660, 200, 680], "SECRETFIELDVALUE")
        link = document.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Link, Rect=Array([60, 100, 200, 120]), Dest=Array([document.pages[30].obj, Name.Fit])))
        page.obj.Annots = Array([kept, secret, link])
        document.Root.AcroForm = document.make_indirect(Dictionary(Fields=Array([kept, secret]), DA=String("/Helv 0 Tf 0 g")))
        with document.open_metadata(set_pikepdf_as_editor=False) as metadata:
            metadata["dc:title"] = "Redaction fixture"
        document.save(output)


def facts(path, password):
    with pikepdf.open(path, password=password) as document:
        with document.open_outline() as outline:
            titles = len(outline.root)
        pages = []
        for page in document.pages:
            streams = page.obj.get("/Contents")
            digest = hashlib.sha256()
            for stream in ([] if streams is None else streams if isinstance(streams, Array) else [streams]):
                digest.update(stream.read_bytes())
            box = page.cropbox
            pages.append({"rotate": int(page.obj.get("/Rotate", 0)), "w": round(float(box[2]) - float(box[0]), 1), "h": round(float(box[3]) - float(box[1]), 1), "content": digest.hexdigest(), "annots": len(page.obj.get("/Annots", []))})
        form = document.Root.get("/AcroForm")
        fields = [str(field.get("/T")) for field in form.get("/Fields", [])] if form is not None else []
        names = 0
        with document.open_metadata() as metadata:
            title = str(metadata.get("dc:title", ""))
        raw = open(path, "rb").read()
        return {"pages": pages, "outline": titles, "fields": fields, "title": title, "encrypted": document.is_encrypted, "eof": raw.count(b"%%EOF"), "named": names}


def search(path, password, needles):
    """Looks for literal strings in the raw file and in every decoded stream."""
    found = {}
    raw = open(path, "rb").read()
    with pikepdf.open(path, password=password) as document:
        blobs = [raw]
        for item in document.objects:
            if isinstance(item, pikepdf.Stream):
                try:
                    blobs.append(item.read_bytes())
                except pikepdf.PdfError:
                    pass
            elif isinstance(item, (pikepdf.Dictionary, pikepdf.Array)):
                blobs.append(str(item).encode("utf8", "ignore"))
    for needle in needles:
        encoded = [needle.encode("utf8"), needle.encode("utf-16-be"), needle.encode("latin1", "ignore")]
        found[needle] = any(form in blob for blob in blobs for form in encoded if form)
    return found


def darkness(image_path, boxes):
    """Share of near-black pixels in each box, given as fractions of the image."""
    image = Image.open(image_path).convert("L")
    width, height = image.size
    result = []
    for left, top, right, bottom in boxes:
        area = image.crop((int(left * width), int(top * height), max(int(left * width) + 1, int(right * width)), max(int(top * height) + 1, int(bottom * height))))
        counts = area.histogram()
        result.append(round(sum(counts[:40]) / sum(counts), 3))
    return {"size": [width, height], "dark": result}


if __name__ == "__main__":
    action = sys.argv[1]
    if action in ("rotated", "cropped", "encrypted", "structured"):
        globals()[action](sys.argv[2], sys.argv[3])
    elif action == "facts":
        print(json.dumps(facts(sys.argv[2], sys.argv[3])))
    elif action == "search":
        print(json.dumps(search(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]))))
    elif action == "darkness":
        print(json.dumps(darkness(sys.argv[2], json.loads(sys.argv[3]))))
