"""Writes BagLib's additions into a PDF as real, removable annotations (ADR-012).

    baglib_marks.py write <source> <output> <payload.json>
    baglib_marks.py inspect <file>

`write` removes every annotation and outline item BagLib wrote before (named `baglib:<id>` and flagged
/BagLibOwned) and adds the ones in the payload, so repeated saves never duplicate. Annotations made elsewhere are not
touched. The output is a full rewrite: no incremental update keeps older BagLib revisions inside the file.

Positions in the payload are percentages of the page as displayed (rotation applied), like the reader stores them.
"""
import hashlib
import json
import re
import unicodedata
from io import BytesIO
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

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


class AppearanceFont:
    """One shared subset per script and save. CIDs distinguish glyphs with different source clusters."""

    def __init__(self, document, path, hb, ttfont):
        self.document = document
        data = path.read_bytes()
        self.font = ttfont(BytesIO(data))
        self.order = self.font.getGlyphOrder()
        self.cmap = self.font.getBestCmap()
        self.upem = self.font['head'].unitsPerEm
        self.hb = hb
        self.shaper = hb.Font(hb.Face(data))
        self.shaper.scale = (self.upem, self.upem)
        self.entries = {}
        self.resource = document.make_indirect(Dictionary())

    def shape(self, text, rtl, arabic):
        buffer = self.hb.Buffer()
        buffer.add_codepoints([ord(char) for char in text])
        buffer.direction = 'rtl' if rtl else 'ltr'
        buffer.script = 'Arab' if arabic else 'Latn'
        buffer.language = 'ar' if arabic else 'en'
        self.hb.shape(self.shaper, buffer)
        infos, positions = buffer.glyph_infos, buffer.glyph_positions
        boundaries = sorted({info.cluster for info in infos} | {len(text)})
        ends = dict(zip(boundaries, boundaries[1:]))
        # Prefer the advancing base glyph as each cluster's Unicode carrier. Mapping the
        # source onto an offset, zero-width vowel confuses spatial text extraction.
        carriers = {}
        for index, (info, position) in enumerate(zip(infos, positions)):
            if info.cluster not in carriers or position.x_advance:
                carriers[info.cluster] = index
        glyphs = []
        for index, (info, position) in enumerate(zip(infos, positions)):
            original = text[info.cluster:ends[info.cluster]] if carriers[info.cluster] == index else ''
            glyphs.append((info.codepoint, original, position, info.cluster))
        return glyphs

    def cid(self, gid, original):
        key = (gid, original)
        if key not in self.entries:
            self.entries[key] = len(self.entries) + 1
        return self.entries[key]

    def embed(self):
        from fontTools import subset
        options = subset.Options()
        options.layout_features = []
        options.drop_tables += ['FFTM']
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(gids={gid for gid, _ in self.entries} | {0})
        subsetter.subset(self.font)
        out = BytesIO()
        self.font.save(out)
        subset_order = self.font.getReverseGlyphMap()
        # A deterministic six-letter PDF subset prefix.
        digest = hashlib.sha256(out.getvalue()).digest()
        prefix = ''.join(chr(65 + byte % 26) for byte in digest[:6])
        name = Name('/' + prefix + '+' + self.font['name'].getDebugName(6))
        scale = 1000 / self.upem
        head, hhea = self.font['head'], self.font['hhea']
        program = pikepdf.Stream(self.document, out.getvalue())
        program.Length1 = len(out.getvalue())
        descriptor = self.document.make_indirect(Dictionary(
            Type=Name.FontDescriptor, FontName=name, Flags=4,
            FontBBox=Array([round(value * scale) for value in (head.xMin, head.yMin, head.xMax, head.yMax)]),
            ItalicAngle=0, Ascent=round(hhea.ascent * scale), Descent=round(hhea.descent * scale),
            CapHeight=round(hhea.ascent * scale), StemV=80, FontFile2=program,
        ))
        widths, mapping, unicode_entries = [], bytearray(2 * (len(self.entries) + 1)), []
        for (gid, original), cid in self.entries.items():
            glyph_name = self.order[gid]
            mapping[cid * 2:cid * 2 + 2] = subset_order[glyph_name].to_bytes(2, 'big')
            widths.extend([cid, Array([round(self.font['hmtx'][glyph_name][0] * scale, 4)])])
            # FEFF is an ignorable filler for decomposed glyph components without a source character.
            unicode_entries.append(f'<{cid:04X}> <{original.encode("utf-16-be").hex().upper() or "FEFF"}>')
        cmap = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
                '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
                '/CMapName /BagLibUnicode def', '/CMapType 2 def',
                '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange']
        for index in range(0, len(unicode_entries), 100):
            chunk = unicode_entries[index:index + 100]
            cmap.extend([f'{len(chunk)} beginbfchar', *chunk, 'endbfchar'])
        cmap.extend(['endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end'])
        descendant = self.document.make_indirect(Dictionary(
            Type=Name.Font, Subtype=Name.CIDFontType2, BaseFont=name,
            CIDSystemInfo=Dictionary(Registry=String('Adobe'), Ordering=String('Identity'), Supplement=0),
            FontDescriptor=descriptor, W=Array(widths),
            CIDToGIDMap=pikepdf.Stream(self.document, bytes(mapping)),
        ))
        self.resource.update(Dictionary(Type=Name.Font, Subtype=Name.Type0, BaseFont=name,
                                        Encoding=Name('/Identity-H'), DescendantFonts=Array([descendant]),
                                        ToUnicode=pikepdf.Stream(self.document, '\n'.join(cmap).encode('ascii'))))


def direction_runs(text, rtl):
    """Resolve ordinary Arabic/Latin paragraphs, including numbers, marks and neutral punctuation.

    Weak/neutral resolution and level reordering follow UAX #9. Explicit embedding/isolate
    controls are not interpreted here. Canonical source strings always remain in Contents.
    """
    base_level = 1 if rtl else 0
    base_type = 'R' if rtl else 'L'
    types = [unicodedata.bidirectional(char) or 'ON' for char in text]
    previous, strong = base_type, base_type
    for index, kind in enumerate(types):
        if kind == 'NSM':
            kind = previous
        if kind == 'EN' and strong == 'AL':
            kind = 'AN'
        if kind in ('R', 'L', 'AL'):
            strong = kind
        types[index] = 'R' if kind == 'AL' else kind
        previous = types[index]
    for index in range(1, len(types) - 1):
        before, kind, after = types[index - 1:index + 2]
        if (kind == 'ES' and before == after == 'EN') or (kind == 'CS' and before == after and before in ('EN', 'AN')):
            types[index] = before
    # Currency/percent signs adjoining European digits form part of the numeric run.
    index = 0
    while index < len(types):
        end = index + 1
        if types[index] == 'ET':
            while end < len(types) and types[end] == 'ET':
                end += 1
            if (index > 0 and types[index - 1] == 'EN') or (end < len(types) and types[end] == 'EN'):
                types[index:end] = ['EN'] * (end - index)
        index = end
    types = ['ON' if kind in ('ES', 'ET', 'CS') else kind for kind in types]
    strong = base_type
    for index, kind in enumerate(types):
        if kind in ('R', 'L'):
            strong = kind
        elif kind == 'EN' and strong == 'L':
            types[index] = 'L'
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for index, char in enumerate(text):
        if char in pairs.values():
            stack.append((char, index))
        elif char in pairs:
            match = next((pos for pos in range(len(stack) - 1, -1, -1) if stack[pos][0] == pairs[char]), None)
            if match is not None:
                _, opening = stack[match]
                del stack[match:]
                enclosed = {'R' if kind in ('AN', 'EN') else kind for kind in types[opening + 1:index]}
                if base_type in enclosed:
                    resolved = base_type
                else:
                    opposite = 'L' if rtl else 'R'
                    preceding = next((kind for kind in reversed(types[:opening]) if kind in ('L', 'R')), base_type)
                    resolved = opposite if opposite in enclosed and preceding == opposite else base_type
                types[opening] = types[index] = resolved
    index = 0
    while index < len(types):
        if types[index] in ('L', 'R', 'EN', 'AN'):
            index += 1
            continue
        end = index + 1
        while end < len(types) and types[end] not in ('L', 'R', 'EN', 'AN'):
            end += 1
        before = types[index - 1] if index else base_type
        after = types[end] if end < len(types) else base_type
        before = 'R' if before in ('EN', 'AN') else before
        after = 'R' if after in ('EN', 'AN') else after
        types[index:end] = [before if before == after else base_type] * (end - index)
        index = end
    runs = []
    for offset, (char, kind) in enumerate(zip(text, types)):
        level = (2 if kind in ('L', 'EN', 'AN') else 1) if rtl else (1 if kind == 'R' else 2 if kind in ('EN', 'AN') else 0)
        arabic = 'ARABIC' in unicodedata.name(char, '')
        if (unicodedata.combining(char) or char in ('\u200c', '\u200d')) and runs:
            arabic = runs[-1][2]
        if runs and runs[-1][0] == level and runs[-1][2] == arabic:
            runs[-1][1] += char
        else:
            runs.append([level, char, arabic, offset])
    # L2 reorders runs, while HarfBuzz reorders glyphs within each RTL run.
    for level in range(max((run[0] for run in runs), default=base_level), 0, -1):
        index = 0
        while index < len(runs):
            if runs[index][0] < level:
                index += 1
                continue
            end = index + 1
            while end < len(runs) and runs[end][0] >= level:
                end += 1
            runs[index:end] = reversed(runs[index:end])
            index = end
    return runs


class TextAppearances:
    """Reusable FreeText/stamp appearance builder. Imports stay lazy for older engine installs."""

    def __init__(self, document):
        self.document = document
        self.fonts = {}
        self.warnings = []
        self.unavailable = False

    def font(self, arabic):
        import uharfbuzz as hb
        from fontTools.ttLib import TTFont
        key = 'Naskh' if arabic else 'Latin'
        if key not in self.fonts:
            filename = 'NotoNaskhArabic-Regular.ttf' if arabic else 'DejaVuSans.ttf'
            self.fonts[key] = AppearanceFont(self.document, Path(__file__).parent / 'fonts' / filename, hb, TTFont)
        return key, self.fonts[key]

    def shaped(self, text, rtl):
        runs = []
        for level, content, arabic, offset in direction_runs(text, rtl):
            key, font = self.font(arabic)
            segments = []
            for index, char in enumerate(content):
                selected = font
                selected_key = key
                if ord(char) not in font.cmap and char not in ('\u200c', '\u200d'):
                    selected_key, selected = self.font(False)
                if segments and segments[-1][0] == selected_key:
                    segments[-1][2] += char
                else:
                    segments.append([selected_key, selected, char, index])
            if level % 2:
                segments.reverse()
            for selected_key, selected, segment, start in segments:
                glyphs = selected.shape(segment, bool(level % 2), arabic)
                runs.append((selected_key, selected, glyphs, offset + start))
        return runs

    @staticmethod
    def width(runs, size):
        return sum(position.x_advance * size / font.upem for _, font, glyphs, _ in runs for _, _, position, _ in glyphs)

    def lines(self, text, rtl, width, size):
        lines = []
        for paragraph in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
            line = ''
            # Break long words at combining sequences, never between a base and tashkeel.
            for token in re.findall(r'\s+|\S+', paragraph):
                candidate = line + token
                if self.width(self.shaped(candidate, rtl), size) <= width:
                    line = candidate
                    continue
                if line:
                    lines.append(line)
                    line = ''
                clusters = []
                for char in token:
                    if clusters and (unicodedata.combining(char) or char == '\u200d' or clusters[-1].endswith('\u200d')):
                        clusters[-1] += char
                    else:
                        clusters.append(char)
                for cluster in clusters:
                    if line and self.width(self.shaped(line + cluster, rtl), size) > width:
                        lines.append(line)
                        line = ''
                    line += cluster
            lines.append(line)
        return lines

    def appearance(self, rect, text, rtl=False, size=11, rotation=0):
        """Return /AP with page-coordinate BBox. Shared font resources are finalized by finish()."""
        if self.unavailable:
            return None
        try:
            return self.build(rect, text, rtl, size, rotation)
        except (ImportError, OSError) as error:
            self.unavailable = True
            self.warnings.append({'code': 'freetext-appearance-unavailable', 'detail': str(error)})
            return None

    def build(self, outer, text, rtl, size, rotation):
        w, h = outer[2] - outer[0], outer[3] - outer[1]
        matrices = {
            0: (1, 0, 0, 1, outer[0], outer[1]),
            90: (0, 1, -1, 0, outer[2], outer[1]),
            180: (-1, 0, 0, -1, outer[2], outer[3]),
            270: (0, -1, 1, 0, outer[0], outer[3]),
        }
        rect = [0, 0, h, w] if rotation in (90, 270) else [0, 0, w, h]
        transform = ' '.join(str(value) for value in matrices.get(rotation, matrices[0]))
        width = max(rect[2] - rect[0] - 6, 1)
        lines = self.lines(text, rtl, width, size)
        fonts = Dictionary()
        ops = [f'q {transform} cm {rect[0]} {rect[1]} {rect[2] - rect[0]} {rect[3] - rect[1]} re W n 0 g']
        # Font extrema reserve headroom for stacked Quran marks, and room below the baseline.
        ascent = max((font.font['head'].yMax / font.upem for font in self.fonts.values()), default=1.1) * size
        descent = max((-font.font['head'].yMin / font.upem for font in self.fonts.values()), default=0.5) * size
        leading = max(size * 1.6, ascent + descent)
        baseline = rect[3] - 3 - ascent
        for line in lines:
            runs = self.shaped(line, rtl)
            x = rect[2] - 3 - self.width(runs, size) if rtl else rect[0] + 3
            actual = ('\ufeff' + line).encode('utf-16-be').hex().upper()
            ops.append(f'/Span << /ActualText <{actual}> >> BDC')
            commands = []
            for key, font, glyphs, offset in runs:
                fonts[Name('/' + key)] = font.resource
                for gid, original, position, cluster in glyphs:
                    px = x + position.x_offset * size / font.upem
                    py = baseline + position.y_offset * size / font.upem
                    cid = font.cid(gid, original)
                    commands.append((offset + cluster, f'BT /{key} {size} Tf 1 0 0 1 {px:.5f} {py:.5f} Tm <{cid:04X}> Tj ET'))
                    x += position.x_advance * size / font.upem
            ops.extend(command for _, command in sorted(commands, key=lambda entry: entry[0]))
            ops.append('EMC')
            baseline -= leading
        ops.append('Q')
        result = appearance(self.document, outer, '\n'.join(ops))
        result.N.Resources = Dictionary(Font=fonts)
        return result

    def finish(self):
        for font in self.fonts.values():
            if font.entries:
                font.embed()


def shape_mark(document, frame, item, text_appearances=None):
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
        if text_appearances is not None:
            rendered = text_appearances.appearance(rect, str(item.get("text", "")), bool(item.get("rtl")), rotation=frame.rotate)
            if rendered is not None:
                annotation.AP = rendered
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
        text_appearances = TextAppearances(document)
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
                annotation = shape_mark(document, frame, item, text_appearances)
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
        text_appearances.finish()
        document.save(output, object_stream_mode=pikepdf.ObjectStreamMode.generate, deterministic_id=False)
    print(json.dumps({"written": written, "bookmarks": len(bookmarks), "warnings": text_appearances.warnings}))


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
