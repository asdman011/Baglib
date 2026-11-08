"""Writes BagLib's additions into a PDF as real, removable annotations (ADR-012).

    baglib_marks.py write <source> <output> <payload.json>
    baglib_marks.py inspect <file>

`write` removes every annotation and outline item BagLib wrote before (named `baglib:<id>` and flagged
/BagLibOwned) and adds the ones in the payload, so repeated saves never duplicate. Annotations made elsewhere are not
touched. The output is a full rewrite: no incremental update keeps older BagLib revisions inside the file.

Positions in the payload are percentages of the page as displayed (rotation applied), like the reader stores them.
"""
import json
import math
import sys
from datetime import datetime, timezone

import pikepdf
from pikepdf import Array, Dictionary, Name, String

OWNER = "BagLib"


def pdf_date(value):
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        moment = datetime.now(timezone.utc)
    return moment.astimezone(timezone.utc).strftime("D:%Y%m%d%H%M%SZ")


def rgb(hex_color):
    value = str(hex_color or "#f59e0b").lstrip("#")
    if len(value) != 6:
        value = "f59e0b"
    return Array([round(int(value[index:index + 2], 16) / 255, 4) for index in (0, 2, 4)])


class Frame:
    """Maps display percentages to PDF user space for one page, honouring CropBox and /Rotate."""

    def __init__(self, page):
        box = [float(value) for value in (page.obj.get("/CropBox") or page.obj.get("/MediaBox"))]
        self.x0, self.y0 = min(box[0], box[2]), min(box[1], box[3])
        self.x1, self.y1 = max(box[0], box[2]), max(box[1], box[3])
        self.rotate = int(page.obj.get("/Rotate", 0)) % 360

    def point(self, px, py):
        fx, fy = float(px) / 100, float(py) / 100
        w, h = self.x1 - self.x0, self.y1 - self.y0
        if self.rotate == 90:
            return self.x0 + fy * w, self.y0 + fx * h
        if self.rotate == 180:
            return self.x1 - fx * w, self.y0 + fy * h
        if self.rotate == 270:
            return self.x1 - fy * w, self.y1 - fx * h
        return self.x0 + fx * w, self.y1 - fy * h

    def rect(self, box):
        ax, ay = self.point(box["x"], box["y"])
        bx, by = self.point(box["x"] + box["width"], box["y"] + box["height"])
        return [min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)]

    def quad(self, box):
        # QuadPoints order: top-left, top-right, bottom-left, bottom-right in display terms.
        corners = [(box["x"], box["y"]), (box["x"] + box["width"], box["y"]), (box["x"], box["y"] + box["height"]), (box["x"] + box["width"], box["y"] + box["height"])]
        values = []
        for cx, cy in corners:
            values.extend(self.point(cx, cy))
        return values


def owned(annotation):
    try:
        if bool(annotation.get("/BagLibOwned", False)):
            return True
        return str(annotation.get("/NM", "")).startswith("baglib:")
    except Exception:
        return False


def base(document, subtype, rect, item, part=""):
    name = f"baglib:{item['id']}{(':' + part) if part else ''}"
    annotation = Dictionary(
        Type=Name.Annot, Subtype=Name("/" + subtype), Rect=Array(rect), NM=String(name), T=String(OWNER),
        M=String(pdf_date(item.get("modified"))), CreationDate=String(pdf_date(item.get("created"))),
        F=4, BagLibOwned=True, BagLibKind=Name("/" + item["kind"]),
    )
    if item.get("color"):
        annotation.C = rgb(item["color"])
    if item.get("text"):
        annotation.Contents = String(item["text"])
    return document.make_indirect(annotation)


def appearance(document, rect, content):
    """A minimal appearance stream so every viewer shows the shape the same way."""
    # The drawing uses page coordinates, so the form's box is the annotation rectangle itself (identity matrix).
    stream = pikepdf.Stream(document, content.encode("latin-1"))
    stream.Type = Name.XObject
    stream.Subtype = Name.Form
    stream.BBox = Array(rect)
    stream.Resources = Dictionary(ExtGState=Dictionary(GS0=Dictionary(Type=Name.ExtGState, CA=0.35, ca=0.35, BM=Name.Multiply)))
    return Dictionary(N=stream)


def color_ops(hex_color, stroke=True):
    r, g, b = [float(value) for value in rgb(hex_color)]
    return f"{r:.4f} {g:.4f} {b:.4f} {'RG' if stroke else 'rg'}"


def text_mark(document, frame, item):
    rects = [frame.rect(box) for box in item.get("rects", []) if box.get("width", 0) > 0 and box.get("height", 0) > 0]
    if not rects:
        return None
    outer = [min(r[0] for r in rects), min(r[1] for r in rects), max(r[2] for r in rects), max(r[3] for r in rects)]
    subtype = {"highlight": "Highlight", "underline": "Underline", "strike": "StrikeOut"}[item["kind"]]
    annotation = base(document, subtype, outer, item)
    quads = []
    for box in item["rects"]:
        if box.get("width", 0) > 0 and box.get("height", 0) > 0:
            quads.extend(frame.quad(box))
    annotation.QuadPoints = Array(quads)
    if item.get("quote"):
        annotation.Subj = String(item["quote"][:500])
    ops = []
    for r in rects:
        if subtype == "Highlight":
            ops.append(f"/GS0 gs {color_ops(item.get('color'), False)} {r[0]:.3f} {r[1]:.3f} {r[2] - r[0]:.3f} {r[3] - r[1]:.3f} re f")
        else:
            y = r[1] + (r[3] - r[1]) * (0.08 if subtype == "Underline" else 0.5)
            ops.append(f"{color_ops(item.get('color'))} 1 w {r[0]:.3f} {y:.3f} m {r[2]:.3f} {y:.3f} l S")
    annotation.AP = appearance(document, outer, "\n".join(ops))
    return annotation


def shape_mark(document, frame, item):
    shape = item["kind"]
    rect = frame.rect(item["box"])
    if shape == "arrow":
        (ax, ay), (bx, by) = frame.point(item["from"]["x"], item["from"]["y"]), frame.point(item["to"]["x"], item["to"]["y"])
        pad = 4
        rect = [min(ax, bx) - pad, min(ay, by) - pad, max(ax, bx) + pad, max(ay, by) + pad]
        annotation = base(document, "Line", rect, item)
        annotation.L = Array([ax, ay, bx, by])
        annotation.LE = Array([Name("/None"), Name("/OpenArrow")])
        # The head: two short strokes back from the tip at ±28°.
        length = max(math.hypot(bx - ax, by - ay), 0.001)
        ux, uy = (ax - bx) / length, (ay - by) / length
        head = []
        for angle in (0.49, -0.49):
            cos, sin = math.cos(angle), math.sin(angle)
            hx, hy = bx + 9 * (ux * cos - uy * sin), by + 9 * (ux * sin + uy * cos)
            head.append(f"{bx:.3f} {by:.3f} m {hx:.3f} {hy:.3f} l S")
        rect = [min(rect[0], bx - 10), min(rect[1], by - 10), max(rect[2], bx + 10), max(rect[3], by + 10)]
        annotation.Rect = Array(rect)
        annotation.AP = appearance(document, rect, f"{color_ops(item.get('color'))} 1.5 w 1 J {ax:.3f} {ay:.3f} m {bx:.3f} {by:.3f} l S " + " ".join(head))
        return annotation
    if shape == "text":
        annotation = base(document, "FreeText", rect, item)
        annotation.DA = String("/Helv 11 Tf 0 g")
        annotation.BS = Dictionary(W=0)
        annotation.Q = 2 if item.get("rtl") else 0
        return annotation
    subtype = "Circle" if shape == "oval" else "Square"
    annotation = base(document, subtype, rect, item)
    w, h = rect[2] - rect[0], rect[3] - rect[1]
    if subtype == "Square":
        dash = "[3 2] 0 d " if shape == "area" else ""
        ops = f"{color_ops(item.get('color'))} {dash}1.5 w {rect[0] + 0.75:.3f} {rect[1] + 0.75:.3f} {w - 1.5:.3f} {h - 1.5:.3f} re S"
    else:
        cx, cy, rx, ry, k = rect[0] + w / 2, rect[1] + h / 2, w / 2 - 0.75, h / 2 - 0.75, 0.5523
        ops = (f"{color_ops(item.get('color'))} 1.5 w {cx + rx:.3f} {cy:.3f} m "
               f"{cx + rx:.3f} {cy + k * ry:.3f} {cx + k * rx:.3f} {cy + ry:.3f} {cx:.3f} {cy + ry:.3f} c "
               f"{cx - k * rx:.3f} {cy + ry:.3f} {cx - rx:.3f} {cy + k * ry:.3f} {cx - rx:.3f} {cy:.3f} c "
               f"{cx - rx:.3f} {cy - k * ry:.3f} {cx - k * rx:.3f} {cy - ry:.3f} {cx:.3f} {cy - ry:.3f} c "
               f"{cx + k * rx:.3f} {cy - ry:.3f} {cx + rx:.3f} {cy - k * ry:.3f} {cx + rx:.3f} {cy:.3f} c S")
    if shape == "area":
        annotation.BS = Dictionary(S=Name.D, D=Array([3, 2]), W=1.5)
    annotation.AP = appearance(document, rect, ops)
    return annotation


ICONS = {"pin": "Comment", "note": "Note", "question": "Help"}


def sticky(document, frame, item):
    if "box" in item:
        x, y = frame.point(item["box"]["x"], item["box"]["y"])
    else:
        x, y = frame.point(4, 4)
    annotation = base(document, "Text", [x, y - 20, x + 20, y], item)
    annotation.Name = Name("/" + ICONS.get(item["kind"], "Note"))
    annotation.Open = False
    return annotation


def replies(document, parent, item, rect):
    added = []
    for index, reply in enumerate(item.get("replies", [])):
        child = base(document, "Text", rect, {"id": item["id"], "kind": "reply", "text": reply.get("text", ""), "created": reply.get("created"), "modified": reply.get("modified")}, f"r{index}")
        child.IRT = parent
        child.Name = Name.Comment
        added.append(child)
    if item.get("resolved"):
        state = base(document, "Text", rect, {"id": item["id"], "kind": "reply", "created": item.get("resolved"), "modified": item.get("resolved")}, "state")
        state.IRT = parent
        state.StateModel = String("Review")
        state.State = String("Completed")
        state.F = 4 | 2  # hidden: a review state, not a visible note
        added.append(state)
    return added


def remove_owned(document):
    for page in document.pages:
        if "/Annots" not in page.obj:
            continue
        kept = [annotation for annotation in page.obj.Annots if not owned(annotation)]
        if kept:
            page.obj.Annots = Array(kept)
        else:
            del page.obj["/Annots"]
    with document.open_outline() as outline:
        outline.root[:] = [entry for entry in outline.root if not str(entry.title).startswith("⁣")]
    if "/Info" in document.trailer:
        info = document.trailer.Info
        for key in [key for key in info.keys() if str(key).startswith("/BagLib")]:
            del info[key]


def write(source, output, payload_path):
    with open(payload_path, encoding="utf-8") as handle:
        payload = json.load(handle)
    with pikepdf.open(source) as document:
        remove_owned(document)
        count = len(document.pages)
        written = 0
        for item in payload.get("items", []):
            page_number = int(item.get("page", 0))
            if page_number < 1 or page_number > count:
                continue
            page = document.pages[page_number - 1]
            frame = Frame(page)
            kind = item["kind"]
            if kind in ("highlight", "underline", "strike"):
                annotation = text_mark(document, frame, item)
            elif kind in ("rect", "oval", "arrow", "text", "area"):
                annotation = shape_mark(document, frame, item)
            elif kind in ("pin", "note", "question"):
                annotation = sticky(document, frame, item)
            else:
                annotation = None
            if annotation is None:
                continue
            annotation.P = page.obj
            extra = replies(document, annotation, item, [float(value) for value in annotation.Rect])
            if "/Annots" not in page.obj:
                page.obj.Annots = Array()
            page.obj.Annots.append(annotation)
            for child in extra:
                child.P = page.obj
                page.obj.Annots.append(child)
            written += 1
        bookmarks = [entry for entry in payload.get("bookmarks", []) if 1 <= int(entry.get("page", 0)) <= count]
        if bookmarks:
            with document.open_outline() as outline:
                for entry in bookmarks:
                    # An invisible separator (U+2063) at the start of the title marks the item as BagLib's.
                    outline.root.append(pikepdf.OutlineItem("⁣" + str(entry.get("title") or entry["page"]), int(entry["page"]) - 1))
        document.save(output, object_stream_mode=pikepdf.ObjectStreamMode.generate, deterministic_id=False)
    print(json.dumps({"written": written, "bookmarks": len(bookmarks)}))


def inspect(path):
    with pikepdf.open(path) as document:
        mine, outside, names = 0, 0, []
        for page in document.pages:
            for annotation in page.obj.get("/Annots", []):
                if owned(annotation):
                    mine += 1
                    names.append(str(annotation.get("/NM", "")))
                else:
                    outside += 1
        with document.open_outline() as outline:
            marks = [str(entry.title) for entry in outline.root]
        print(json.dumps({"pages": len(document.pages), "owned": mine, "outside": outside, "names": names,
                          "outline": marks, "ownedOutline": sum(1 for title in marks if title.startswith("⁣"))}, ensure_ascii=False))


if __name__ == "__main__":
    if sys.argv[1] == "write":
        write(sys.argv[2], sys.argv[3], sys.argv[4])
    elif sys.argv[1] == "inspect":
        inspect(sys.argv[2])
    else:
        raise SystemExit("usage: baglib_marks.py write|inspect")
