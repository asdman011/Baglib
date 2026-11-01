"""Splits the pages being redacted out of a PDF, puts the engine's redacted pages back, and proves nothing else survived.

prepare: writes a temporary PDF of the chosen pages, upright and starting at the origin, and reports their geometry.
merge:   replaces those pages in a copy of the source, then reopens the result and verifies it.
Any doubt ends in a BAGLIB_ERROR, because a weaker redaction must never be returned silently.
"""
import hashlib
import json
import os
import sys

import pikepdf
from pikepdf import Array, Dictionary, Name, Stream

SIZE_TOLERANCE = 1.0


class RedactionError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(detail or code)
        self.code = code


def password():
    return os.environ.get("BAGLIB_PDF_PASSWORD", "")


def open_pdf(path):
    try:
        return pikepdf.open(path, password=password())
    except pikepdf.PasswordError as error:
        raise RedactionError("encrypted") from error


def inherited(page, key):
    node = page.obj
    while node is not None:
        if key in node:
            return node[key]
        node = node.get("/Parent")
    return None


def box_of(page, key):
    value = inherited(page, key)
    return [float(item) for item in value] if value is not None else None


def visible_box(page):
    media = box_of(page, "/MediaBox")
    crop = box_of(page, "/CropBox") or media
    left, right = sorted((media[0], media[2]))
    bottom, top = sorted((media[1], media[3]))
    crop_left, crop_right = sorted((crop[0], crop[2]))
    crop_bottom, crop_top = sorted((crop[1], crop[3]))
    box = [max(left, crop_left), max(bottom, crop_bottom), min(right, crop_right), min(top, crop_top)]
    if box[2] <= box[0] or box[3] <= box[1]:
        return [left, bottom, right, top]
    return box


def rotation_of(page):
    value = inherited(page, "/Rotate")
    return int(value) % 360 if value is not None else 0


def has_applied_signature(document):
    form = document.Root.get("/AcroForm")
    if form is None:
        return False
    pending = list(form.get("/Fields", []))
    while pending:
        field = pending.pop()
        if field.get("/FT") == Name.Sig and "/V" in field:
            return True
        pending.extend(field.get("/Kids", []))
    return False


def page_list(argument):
    return [int(item) for item in json.loads(argument)]


def prepare(source, pages, temporary, report):
    with open_pdf(source) as document:
        if has_applied_signature(document):
            raise RedactionError("signed-document-locked")
        total = len(document.pages)
        if not pages or any(page < 1 or page > total for page in pages):
            raise RedactionError("invalid-request")
        geometry = []
        with pikepdf.new() as output:
            for number in pages:
                page = document.pages[number - 1]
                box = visible_box(page)
                width, height = box[2] - box[0], box[3] - box[1]
                unit = inherited(page, "/UserUnit")
                geometry.append({"page": number, "width": width, "height": height, "rotation": rotation_of(page), "userUnit": float(unit) if unit is not None else 1})
                resources = inherited(page, "/Resources")
                output.pages.append(page)
                copy = output.pages[-1]
                if resources is not None and "/Resources" not in copy.obj:
                    copy.obj.Resources = output.copy_foreign(document.make_indirect(resources))
                copy.contents_coalesce()
                if box[0] or box[1]:
                    copy.contents_add(f"1 0 0 1 {-box[0]} {-box[1]} cm\n".encode("ascii"), prepend=True)
                copy.obj.MediaBox = Array([0, 0, width, height])
                for key in ("/CropBox", "/BleedBox", "/TrimBox", "/ArtBox", "/Rotate", "/UserUnit", "/Annots", "/Thumb", "/B", "/StructParents", "/AA"):
                    if key in copy.obj:
                        del copy.obj[key]
            output.save(temporary)
    with open(report, "w", encoding="utf8") as handle:
        json.dump({"total": total, "pages": geometry}, handle)


def stream_digests(obj, found, seen):
    """Adds the content of a stream and everything its resources draw."""
    if isinstance(obj, Array):
        for item in obj:
            stream_digests(item, found, seen)
        return
    if not isinstance(obj, (Stream, Dictionary)):
        return
    identity = obj.objgen
    if identity != (0, 0):
        if identity in seen:
            return
        seen.add(identity)
    if isinstance(obj, Stream):
        found.add(hashlib.sha256(obj.read_raw_bytes()).hexdigest())
        try:
            found.add(hashlib.sha256(obj.read_bytes()).hexdigest())
        except pikepdf.PdfError:
            pass
    resources = obj.get("/Resources")
    if resources is not None:
        for key in ("/XObject", "/Pattern", "/Font"):
            for item in (resources.get(key) or {}).values() if resources.get(key) is not None else ():
                stream_digests(item, found, seen)


def page_digests(page):
    found = set()
    seen = set()
    contents = page.obj.get("/Contents")
    if contents is not None:
        stream_digests(contents, found, seen)
    resources = inherited(page, "/Resources")
    if resources is not None:
        for key in ("/XObject", "/Pattern", "/Font"):
            group = resources.get(key)
            if group is not None:
                for item in group.values():
                    stream_digests(item, found, seen)
    return found


def content_digest(page):
    found = hashlib.sha256()
    contents = page.obj.get("/Contents")
    for stream in ([] if contents is None else contents if isinstance(contents, Array) else [contents]):
        found.update(stream.read_bytes())
    return found.hexdigest()


def covered_annotation(annotation, boxes, box):
    rect = annotation.get("/Rect")
    if rect is None:
        return True
    left, right = sorted((float(rect[0]), float(rect[2])))
    bottom, top = sorted((float(rect[1]), float(rect[3])))
    for item in boxes:
        box_left = box[0] + item["x"]
        box_top = box[3] - item["y"]
        if left < box_left + item["width"] and right > box_left and bottom < box_top and top > box_top - item["height"]:
            return True
    return False


def remove_fields(document, removed):
    form = document.Root.get("/AcroForm")
    if form is None or not removed:
        return

    def keep(fields):
        kept = Array()
        for field in fields:
            if field.objgen in removed:
                continue
            kids = field.get("/Kids")
            if kids is not None:
                field.Kids = keep(kids)
                if not len(field.Kids) and "/T" in field and field.get("/FT") is not None:
                    continue
            kept.append(field)
        return kept

    form.Fields = keep(form.get("/Fields", Array()))


def outline_titles(document):
    with document.open_outline() as outline:
        titles = []
        pending = list(outline.root)
        while pending:
            item = pending.pop()
            titles.append(item.title)
            pending.extend(item.children)
    return sorted(titles)


def replace_page(document, engine, page, redacted, boxes, removed):
    box = visible_box(page)
    width, height = box[2] - box[0], box[3] - box[1]
    media = [float(item) for item in redacted.mediabox]
    if abs((media[2] - media[0]) - width) > SIZE_TOLERANCE or abs((media[3] - media[1]) - height) > SIZE_TOLERANCE:
        raise RedactionError("redaction-unverified", "engine changed a page size")
    redacted.contents_coalesce()
    body = redacted.obj.Contents.read_bytes()
    prefix = f"q 1 0 0 1 {box[0] - media[0]} {box[1] - media[1]} cm\n".encode("ascii")
    resources = redacted.obj.get("/Resources")
    page.obj.Contents = document.make_stream(prefix + body + b"\nQ\n")
    page.obj.Resources = document.copy_foreign(engine.make_indirect(resources)) if resources is not None else Dictionary()
    page.obj.MediaBox = Array(box)
    page.obj.CropBox = Array(box)
    for key in ("/BleedBox", "/TrimBox", "/ArtBox", "/Thumb", "/PieceInfo", "/Metadata", "/StructParents", "/B", "/Group", "/LastModified", "/SeparationInfo"):
        if key in page.obj:
            del page.obj[key]
    annotations = page.obj.get("/Annots")
    if annotations is not None:
        kept = Array()
        for annotation in annotations:
            if covered_annotation(annotation, boxes, box):
                removed.add(annotation.objgen)
                parent = annotation.get("/Parent")
                if parent is not None and len(parent.get("/Kids", [])) <= 1:
                    removed.add(parent.objgen)
            else:
                kept.append(annotation)
        page.obj.Annots = kept


def verify(output, original, pages, rasterized, forbidden, expected):
    with open(output, "rb") as handle:
        raw = handle.read()
    if raw.count(b"%%EOF") != 1:
        raise RedactionError("redaction-unverified", "more than one file revision")
    with open_pdf(output) as result:
        if len(result.pages) != len(expected):
            raise RedactionError("redaction-unverified", "page count changed")
        for number, (facts, page) in enumerate(zip(expected, result.pages), 1):
            box = visible_box(page)
            if rotation_of(page) != facts["rotation"] or any(abs(a - b) > SIZE_TOLERANCE for a, b in zip(box, facts["box"])):
                raise RedactionError("redaction-unverified", f"page {number} geometry changed")
            if number not in pages and content_digest(page) != facts["content"]:
                raise RedactionError("redaction-unverified", f"page {number} content changed")
            if number in pages and rasterized:
                resources = page.obj.get("/Resources", Dictionary())
                if resources.get("/Font") is not None and len(resources.Font):
                    raise RedactionError("redaction-unverified", f"page {number} still has fonts")
                for item in (resources.get("/XObject") or {}).values() if resources.get("/XObject") is not None else ():
                    if item.get("/Subtype") != Name.Image:
                        raise RedactionError("redaction-unverified", f"page {number} still draws a form")
        if rasterized:
            for item in result.objects:
                if isinstance(item, Stream):
                    digests = {hashlib.sha256(item.read_raw_bytes()).hexdigest()}
                    try:
                        digests.add(hashlib.sha256(item.read_bytes()).hexdigest())
                    except pikepdf.PdfError:
                        pass
                    if digests & forbidden:
                        raise RedactionError("redaction-unverified", "original page data survived")
        if outline_titles(result) != original["outline"]:
            raise RedactionError("redaction-unverified", "bookmarks changed")
        return {"pages": len(result.pages), "redacted": len(pages)}


def merge(source, temporary, pages, boxes_json, rasterized, output, report):
    boxes = json.loads(boxes_json)
    with open_pdf(source) as document, pikepdf.open(temporary) as engine:
        if has_applied_signature(document):
            raise RedactionError("signed-document-locked")
        if len(engine.pages) != len(pages):
            raise RedactionError("redaction-unverified", "engine changed the page count")
        expected = [{"box": visible_box(page), "rotation": rotation_of(page), "content": content_digest(page)} for page in document.pages]
        chosen = set(pages)
        forbidden = set()
        for number in pages:
            forbidden |= page_digests(document.pages[number - 1])
        for number, page in enumerate(document.pages, 1):
            if number not in chosen:
                forbidden -= page_digests(page)
        forbidden.discard(hashlib.sha256(b"").hexdigest())
        original = {"outline": outline_titles(document)}
        removed = set()
        for position, number in enumerate(pages):
            replace_page(document, engine, document.pages[number - 1], engine.pages[position], [box for box in boxes if box["page"] == position + 1], removed)
        remove_fields(document, removed)
        # Tagged content and XFA hold their own copies of page text, outside anything drawn on the page.
        for key in ("/StructTreeRoot", "/MarkInfo"):
            if rasterized and key in document.Root:
                del document.Root[key]
        form = document.Root.get("/AcroForm")
        if rasterized and form is not None and "/XFA" in form:
            del form["/XFA"]
        document.save(output, encryption=document.is_encrypted, object_stream_mode=pikepdf.ObjectStreamMode.generate)
    outcome = verify(output, original, chosen, rasterized, forbidden, expected)
    with open(report, "w", encoding="utf8") as handle:
        json.dump(outcome, handle)


def main():
    action = sys.argv[1]
    try:
        if action == "prepare":
            prepare(sys.argv[2], page_list(sys.argv[3]), sys.argv[4], sys.argv[5])
        elif action == "merge":
            merge(sys.argv[2], sys.argv[3], page_list(sys.argv[4]), sys.argv[5], sys.argv[6] == "true", sys.argv[7], sys.argv[8])
        else:
            raise RedactionError("invalid-request")
    except RedactionError as error:
        sys.stderr.write(f"BAGLIB_ERROR:{error.code}\n{error}\n")
        sys.exit(3)


if __name__ == "__main__":
    main()
