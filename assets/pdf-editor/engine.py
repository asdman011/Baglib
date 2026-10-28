"""Baglib local PDF worker. One bounded JSON request on stdin; JSONL progress/result.

Passwords are carried only on the anonymous stdin pipe, never argv or output.
All paths must be granted and resolved by the Electron main process.
"""
import base64
import hashlib
import html
import io
import json
import os
import re
import sys
import unicodedata
from pathlib import Path


def emit(kind, **data):
    print(json.dumps({"type": kind, **data}, ensure_ascii=True), flush=True)


def digest(filename):
    value = hashlib.sha256()
    with open(filename, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def rect(value, page):
    import pymupdf as fitz
    if not isinstance(value, list) or len(value) != 4 or any(not isinstance(n, (int, float)) for n in value):
        raise ValueError("invalid-request")
    area = fitz.Rect(value)
    if area.is_empty or area.is_infinite or not page.rect.contains(area):
        raise ValueError("invalid-request")
    return area * page.derotation_matrix


def encrypted_pdf(document):
    return document.needs_pass or document.xref_get_key(-1, "Encrypt")[0] != "null"


def open_pdf(filename, password=None, permission=None):
    import pymupdf as fitz
    document = fitz.open(filename)
    encrypted = encrypted_pdf(document)
    access = document.authenticate(password or "") if encrypted else 4
    if not access:
        document.close()
        raise ValueError("encrypted")
    if permission and encrypted and not access & 4 and not document.permissions & permission:
        document.close()
        raise ValueError("permission-denied")
    return document


def empty_pdf_like(document, password):
    import pymupdf as fitz
    if not encrypted_pdf(document):
        return fitz.open()
    target = fitz.open(stream=document.tobytes(encryption=fitz.PDF_ENCRYPT_KEEP), filetype="pdf")
    if not target.authenticate(password or ""):
        raise ValueError("encrypted")
    target.delete_pages(0, len(target) - 1)
    return target


def canonical_arabic_font_map(document, font_xref):
    """Map generated Arabic presentation glyphs back to their logical characters.

    Only fonts freshly inserted by this worker are touched. Existing source font
    maps and canonical stored strings are outside this operation.
    """
    ref = document.xref_get_key(font_xref, "ToUnicode")
    if ref[0] != "xref":
        return
    xref = int(ref[1].split()[0]); source = document.xref_stream(xref).decode("ascii")
    def expand(block):
        records = re.findall(r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>", block.group(1))
        result = []
        for first, last, target in records:
            start, end, value = int(first, 16), int(last, 16), int(target, 16)
            if end - start > 65535:
                raise ValueError("invalid-output")
            if any(value <= high and value + end - start >= low for low, high in ((0xfb50, 0xfdff), (0xfe70, 0xfefc))):
                entries = []
                for offset in range(end - start + 1):
                    character = chr(value + offset)
                    if 0xfb50 <= value + offset <= 0xfdff or 0xfe70 <= value + offset <= 0xfefc:
                        character = unicodedata.normalize("NFKC", character)
                    entries.append(f'<{start + offset:04x}> <{character.encode("utf-16-be").hex()}>')
                for index in range(0, len(entries), 100):
                    chunk = entries[index:index + 100]
                    result.append(f'{len(chunk)} beginbfchar\n' + '\n'.join(chunk) + '\nendbfchar')
            else:
                result.append(f'1 beginbfrange\n<{first}> <{last}> <{target}>\nendbfrange')
        return '\n'.join(result) if records else block.group(0)
    revised = re.sub(r"\d+\s+beginbfrange(.*?)endbfrange", expand, source, flags=re.S)
    document.update_stream(xref, revised.encode("ascii"))


def text_box(page, area, text, settings=None):
    settings = settings or {}
    size = float(settings.get("fontSize", 12))
    if not 5 <= size <= 144 or len(text) > 100_000:
        raise ValueError("invalid-request")
    direction = settings.get("direction", "auto")
    if direction not in ("auto", "rtl", "ltr"):
        raise ValueError("invalid-request")
    align = settings.get("align", "start")
    if align not in ("start", "end", "left", "right", "center", "justify"):
        raise ValueError("invalid-request")
    color = settings.get("color", "#111111")
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        raise ValueError("invalid-request")
    font = settings.get("fontFamily", "sans-serif")
    if font not in ("sans-serif", "serif", "monospace", "cursive"):
        raise ValueError("invalid-request")
    italic = "italic" if settings.get("signatureStyle") == "italic" else "normal"
    import pymupdf as fitz
    fonts = {entry[0] for entry in page.get_fonts(full=True)}
    archive = Path(__file__).resolve().parent / "fonts"
    content = ''.join(f'<span style="font-family:BaglibArabic">{html.escape(piece)}</span>' if re.search(r"[\u0600-\u06ff]", piece) else html.escape(piece) for piece in re.split(r"([\u0600-\u06ff][\u0600-\u06ff \t]*)", text)).replace("\n", "<br>")
    font_css = '@font-face{font-family:BaglibArabic;src:url(DejaVuSans.ttf);}@font-face{font-family:BaglibArabic;src:url(DejaVuSans.ttf);font-style:italic;}'
    fitting = settings.get("_replacement", False)
    layout = "margin:0;padding:0;line-height:1;" if fitting else "line-height:1.5;"
    spare, scale = page.insert_htmlbox(area, f'<div dir="{direction}">{content}</div>', css=font_css + f"* {{font-family:{font};font-style:{italic};font-size:{size}pt;{layout}color:{color};text-align:{align};}}", archive=fitz.Archive(str(archive)), scale_low=5 / size if fitting else 1, overlay=settings.get("layer", "over") != "under")
    if spare < 0:
        raise ValueError("text-does-not-fit")
    for entry in page.get_fonts(full=True):
        if entry[0] not in fonts and 'DejaVu' in entry[3]:
            canonical_arabic_font_map(page.parent, entry[0])


def replace_text(document, replacements, whole_word=False):
    """Replace literal text without touching source strings or non-text graphics.

    MuPDF finds candidate quads. Character spans disambiguate adjacent matches,
    case and Unicode word boundaries; all matches of one rule are removed before
    inserting any replacement so later hits cannot erase newly inserted text.
    """
    import pymupdf as fitz
    if not isinstance(replacements, list) or len(replacements) > 100 or not isinstance(whole_word, bool):
        raise ValueError("invalid-request")
    for rule in replacements:
        if not isinstance(rule, dict) or not isinstance(rule.get("find"), str) or not rule["find"] or not isinstance(rule.get("replace"), str) or len(rule["find"]) > 10_000 or len(rule["replace"]) > 100_000:
            raise ValueError("invalid-request")
    def word_character(character):
        return bool(character) and (character == "_" or unicodedata.category(character)[0] in "LNM")
    for rule_index, rule in enumerate(replacements):
        find, replacement = rule["find"], rule["replace"]
        expression = re.compile(re.escape(find))
        for page in document:
            candidates = page.search_for(find, quads=True)
            if not candidates:
                continue
            matches = []
            blocks = page.get_text("rawdict")["blocks"]
            # search_for can match wrapped/dehyphenated phrases. This worker's
            # replacement box is a single line: refuse such matches rather than
            # returning a successful unchanged file or covering unrelated text.
            wrapped = "\n".join("".join(character["c"] for span in line["spans"] for character in span["chars"]) for block in blocks for line in block.get("lines", []))
            wrapped_expression = re.compile(re.escape(find).replace(r"\ ", r"[ \t\r\n]+"))
            for occurrence in wrapped_expression.finditer(wrapped):
                if "\n" not in occurrence.group():
                    continue
                start, end = occurrence.span()
                if not whole_word or not ((start and word_character(wrapped[start - 1])) or (end < len(wrapped) and word_character(wrapped[end]))):
                    raise ValueError("unsupported")
            for block in blocks:
                for line in block.get("lines", []):
                    characters, styles = [], []
                    for span in line["spans"]:
                        for character in span["chars"]:
                            # A ToUnicode mapping may expand one glyph into several letters.
                            for value in character["c"]:
                                characters.append((value, fitz.Rect(character["bbox"])))
                                styles.append(span)
                    text = "".join(value for value, _ in characters)
                    for match in expression.finditer(text):
                        start, end = match.span()
                        if whole_word and ((start and word_character(text[start - 1])) or (end < len(text) and word_character(text[end]))):
                            continue
                        area = fitz.Rect(characters[start][1])
                        for _, bounds in characters[start + 1:end]:
                            area |= bounds
                        if not any(area.intersects(quad.rect) for quad in candidates):
                            continue
                        # Rotated/vertical glyphs need a different shaping transform.
                        if abs(line.get("dir", (1, 0))[1]) > 0.01:
                            raise ValueError("unsupported")
                        style = styles[start]
                        rtl = bool(re.search(r"[\u0600-\u06ff]", replacement or find))
                        matches.append((area, {"fontSize": max(5, min(144, style.get("size", 12))), "color": "#%06x" % style.get("color", 0), "direction": "rtl" if rtl else "ltr", "align": "right" if rtl else "left", "_replacement": True}))
            for area, _ in matches:
                page.add_redact_annot(area, fill=False)
            if matches:
                page.apply_redactions(images=0, graphics=0, text=0)
                for area, style in matches:
                    if replacement:
                        text_box(page, area, replacement, style)
            emit("progress", current=rule_index * len(document) + page.number + 1, total=len(replacements) * len(document))


def inspected(document, requested=None):
    import pymupdf as fitz
    pages = []
    selected = requested or list(range(1, min(len(document), 200) + 1))
    if len(selected) > 200:
        raise ValueError("invalid-request")
    characters = 0
    for index, number in enumerate(selected):
        if not isinstance(number, int) or not 1 <= number <= len(document):
            raise ValueError("invalid-request")
        page = document[number - 1]
        blocks = []
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            lines = []
            spans = []
            for line in block.get("lines", []):
                lines.append("".join(span.get("text", "") for span in line["spans"]))
                spans.extend(line["spans"])
            text = "\n".join(lines)
            characters += len(text)
            if characters > 2_000_000:
                raise ValueError("document-too-large")
            first = spans[0] if spans else {}
            blocks.append({"text": text, "rect": list(fitz.Rect(block["bbox"]) * page.rotation_matrix), "fontSize": first.get("size", 12), "font": first.get("font", ""), "color": "#%06x" % first.get("color", 0), "direction": "rtl" if re.search(r"[\u0600-\u06ff]", text) else "ltr"})
        images = [{"xref": image[0], "rects": [list(area * page.rotation_matrix) for area in page.get_image_rects(image[0])]} for image in page.get_images(full=True)]
        pages.append({"page": number, "width": page.rect.width, "height": page.rect.height, "rotation": page.rotation, "text": page.get_text(), "blocks": blocks, "images": images})
        emit("progress", current=index + 1, total=len(selected))
    pending = [{"name": widget.field_name, "page": page.number + 1, "rect": list(widget.rect * page.rotation_matrix)} for page in document for widget in (page.widgets() or []) if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE and not widget.is_signed]
    return {"pages": pages, "totalPages": len(document), "signedSource": signed_source(document), "pendingFields": pending, "outline": [{"level": level, "title": title, "page": number} for level, title, number in document.get_toc()[:1000]], "signatureValidation": "not-performed", "extraction": "complete" if len(selected) == len(document) else "limited"}


def signed_source(document):
    import pymupdf as fitz
    return any(widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE and bool(widget.is_signed) for page in document for widget in (page.widgets() or []))


def compliance(filename, request, profile):
    import subprocess
    import xml.etree.ElementTree as ET
    if profile not in ("1b", "2b", "ua1"):
        raise ValueError("invalid-request")
    java, jar = request.get("java"), request.get("veraPdfJar")
    if not java or not jar or not Path(java).is_file() or not Path(jar).is_file():
        raise ValueError("engine-missing")
    process = subprocess.run([java, "-Xmx512m", "-jar", jar, "--format", "xml", "--flavour", profile, filename], capture_output=True, timeout=180, creationflags=0x08000000 if os.name == "nt" else 0)
    if len(process.stdout) > 20 * 1024 * 1024:
        raise ValueError("document-too-large")
    root = ET.fromstring(process.stdout)
    reports = [item for item in root.iter() if item.tag.split("}")[-1] == "validationReport"]
    if not reports:
        raise ValueError("engine-failed")
    failures = []
    for item in root.iter():
        if item.tag.split("}")[-1] == "rule" and item.get("status") == "failed" and len(failures) < 100:
            failures.append({"specification": item.get("specification", ""), "clause": item.get("clause", ""), "testNumber": item.get("testNumber", ""), "description": next((node.text or "" for node in item if node.tag.split("}")[-1] == "description"), "")})
    return {"profile": profile, "compliant": all(item.get("isCompliant") == "true" for item in reports), "failures": failures, "manualAccessibilityReviewRequired": profile == "ua1", "validator": "veraPDF"}


def clean_save(document, filename, sanitize=False):
    import pymupdf as fitz
    if sanitize:
        document.scrub(attached_files=True, clean_pages=True, embedded_files=True, hidden_text=True, javascript=True, metadata=True, redactions=False, remove_links=True, reset_fields=True, reset_responses=True, thumbnails=True, xml_metadata=True)
        # Maintain the engine producer notice while removing source/private metadata.
        document.set_metadata({"producer": f"PyMuPDF {fitz.VersionBind}", "creator": "Baglib"})
    document.save(filename, garbage=4, clean=True, deflate=True, encryption=fitz.PDF_ENCRYPT_KEEP)
    with fitz.open(filename) as verified:
        if verified.needs_pass:
            # Page count remains readable without decrypting document content.
            if verified.page_count != document.page_count:
                raise ValueError("invalid-output")
            return
        if len(verified) != len(document) or not len(verified):
            raise ValueError("invalid-output")


def validate_signatures(filename, roots=None):
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.sign.validation import validate_pdf_signature
    from pyhanko_certvalidator import ValidationContext
    from pyhanko.keys import load_certs_from_pemder
    from pyhanko.sign.fields import enumerate_sig_fields
    trusted = list(load_certs_from_pemder(roots)) if roots else None
    context = ValidationContext(trust_roots=trusted, allow_fetching=False)
    signatures = []
    with open(filename, "rb") as source:
        reader = PdfFileReader(source, strict=True)
        pending = [name for name, value, reference in enumerate_sig_fields(reader, filled_status=False)]
        for signature in reader.embedded_signatures:
            status = validate_pdf_signature(signature, signer_validation_context=context)
            changed = getattr(status.modification_level, "name", "NONE") in ("OTHER", "ANNOTATIONS") or status.docmdp_ok is False
            intact = bool(status.intact and status.valid and not changed)
            signatures.append({"field": signature.field_name, "subject": signature.signer_cert.subject.human_friendly, "fingerprint": signature.signer_cert.sha256_fingerprint, "intact": intact, "trusted": bool(status.trusted), "coverage": str(status.coverage), "status": "Verified" if status.bottom_line else "Signed" if intact else "Tampered"})
    return {"status": "Tampered" if any(item["status"] == "Tampered" for item in signatures) else "Pending Signature" if pending else "Draft" if not signatures else "Verified" if all(item["status"] == "Verified" for item in signatures) else "Signed", "pendingFields": pending, "signatures": signatures, "revocation": "not-checked-offline"}


def page_blocks(page):
    blocks = page.get_text("dict", sort=True)["blocks"]
    weights = {}
    for block in blocks:
        for line in block.get("lines", []):
            for span in line["spans"]:
                size = round(span["size"], 1)
                weights[size] = weights.get(size, 0) + len(span["text"])
    body_size = max(weights, key=weights.get) if weights else 12
    for block in blocks:
        if block.get("type") == 0:
            spans = [span for line in block.get("lines", []) for span in line["spans"]]
            text = "\n".join("".join(span["text"] for span in line["spans"]) for line in block.get("lines", []))
            size = max((span["size"] for span in spans), default=body_size)
            block["heading"] = 1 if size >= body_size * 1.5 else 2 if size >= body_size * 1.2 else 0
            block["rtl"] = bool(re.search(r"[\u0600-\u06ff]", text))
    return blocks


def convert(document, operation, filename, language="en", labels=None):
    labels = labels or {}
    if operation == "export-docx":
        from docx import Document
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        from docx.shared import Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        output = Document()
        for index, page in enumerate(document):
            if index:
                output.add_page_break()
            section = output.sections[-1]
            section.page_width = Pt(page.rect.width); section.page_height = Pt(page.rect.height)
            section.left_margin = section.right_margin = Pt(36)
            section.top_margin = section.bottom_margin = Pt(36)
            for block in page_blocks(page):
                if block.get("type") == 0:
                    paragraph = output.add_paragraph(style=f'Heading {block["heading"]}' if block["heading"] else None)
                    paragraph.paragraph_format.space_after = Pt(6)
                    if block["rtl"]:
                        bidi = OxmlElement("w:bidi"); bidi.set(qn("w:val"), "1"); paragraph._p.get_or_add_pPr().append(bidi)
                        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    x0, y0, x1, y1 = block["bbox"]
                    if abs((x0 + x1) / 2 - page.rect.width / 2) < 12 and x1 - x0 < page.rect.width * 0.8:
                        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for line_number, line in enumerate(block.get("lines", [])):
                        if line_number:
                            paragraph.add_run(" ")
                        for span in line["spans"]:
                            run = paragraph.add_run(span["text"]); run.font.size = Pt(max(5, min(72, span["size"])))
                            run.bold = bool(span.get("flags", 0) & 16); run.italic = bool(span.get("flags", 0) & 2)
                            font_name = span.get("font", "").split("+")[-1][:100]
                            if font_name:
                                run.font.name = font_name
                                run._r.get_or_add_rPr().rFonts.set(qn("w:cs"), font_name)
                            if re.search(r"[\u0600-\u06ff]", span["text"]):
                                rtl = OxmlElement("w:rtl"); run._r.get_or_add_rPr().append(rtl)
                elif block.get("type") == 1:
                    from docx.shared import Inches
                    output.add_picture(io.BytesIO(block["image"]), width=Inches(min(6, (block["bbox"][2] - block["bbox"][0]) / 72)))
            emit("progress", current=index + 1, total=len(document))
        output.save(filename)
    elif operation == "export-xlsx":
        from openpyxl import Workbook
        output = Workbook(); output.remove(output.active)
        tables = 0
        for index, page in enumerate(document):
            for number, table in enumerate(page.find_tables().tables):
                sheet = output.create_sheet(f"P{index + 1}-T{number + 1}")
                for row_number, row in enumerate(table.extract(), 1):
                    for column, value in enumerate(row, 1):
                        cell = sheet.cell(row_number, column, str(value or ""))
                        # PDF values are data, never spreadsheet formulas.
                        cell.data_type = "s"
                sheet.sheet_view.rightToLeft = any(re.search(r"[\u0600-\u06ff]", str(cell.value or "")) for row in sheet for cell in row)
                tables += 1
            emit("progress", current=index + 1, total=len(document))
        if not tables:
            raise ValueError("no-tables")
        output.save(filename)
    elif operation == "export-pptx":
        from pptx import Presentation
        from pptx.util import Pt
        output = Presentation()
        output.slide_width = Pt(document[0].rect.width); output.slide_height = Pt(document[0].rect.height)
        for index, page in enumerate(document):
            slide = output.slides.add_slide(output.slide_layouts[6])
            sx, sy = document[0].rect.width / page.rect.width, document[0].rect.height / page.rect.height
            for block in page.get_text("dict")["blocks"]:
                x0, y0, x1, y1 = block["bbox"]
                if block.get("type") == 0:
                    box = slide.shapes.add_textbox(Pt(x0 * sx), Pt(y0 * sy), Pt(max(1, (x1 - x0) * sx)), Pt(max(1, (y1 - y0) * sy)))
                    box.text_frame.word_wrap = True
                    for number, line in enumerate(block.get("lines", [])):
                        paragraph = box.text_frame.paragraphs[0] if not number else box.text_frame.add_paragraph()
                        text = "".join(span["text"] for span in line["spans"])
                        if re.search(r"[\u0600-\u06ff]", text):
                            paragraph._p.get_or_add_pPr().set("rtl", "1")
                        for span in line["spans"]:
                            run = paragraph.add_run(); run.text = span["text"]; run.font.size = Pt(max(5, min(96, span["size"] * sx)))
                elif block.get("type") == 1:
                    slide.shapes.add_picture(io.BytesIO(block["image"]), Pt(x0 * sx), Pt(y0 * sy), Pt(max(1, (x1 - x0) * sx)), Pt(max(1, (y1 - y0) * sy)))
            emit("progress", current=index + 1, total=len(document))
        output.save(filename)
    elif operation == "export-html":
        sections = []
        for index, page in enumerate(document):
            content = []
            for block in page_blocks(page):
                if block.get("type") == 0:
                    tag = f'h{min(4, block["heading"] + 1)}' if block["heading"] else "p"
                    lines = []
                    for line in block.get("lines", []):
                        spans = []
                        for span in line["spans"]:
                            value = html.escape(span["text"])
                            if span.get("flags", 0) & 16:
                                value = f"<strong>{value}</strong>"
                            if span.get("flags", 0) & 2:
                                value = f"<em>{value}</em>"
                            spans.append(value)
                        lines.append("".join(spans))
                    content.append(f'<{tag} dir="{"rtl" if block["rtl"] else "ltr"}">{" ".join(lines)}</{tag}>')
                elif block.get("type") == 1:
                    extension = block.get("ext", "png").lower()
                    if extension not in ("png", "jpeg", "jpg", "gif", "webp", "bmp"):
                        continue
                    image = base64.b64encode(block["image"]).decode("ascii")
                    alt = html.escape(f'{labels.get("image", "")} {index + 1}')
                    content.append(f'<figure><img alt="{alt}" src="data:image/{"jpeg" if extension == "jpg" else extension};base64,{image}"></figure>')
            sections.append(f'<section data-page="{index + 1}" aria-label="{html.escape(labels.get("page", ""))} {index + 1}">{"".join(content)}</section>')
            emit("progress", current=index + 1, total=len(document))
        title = html.escape(labels.get("document", ""))
        Path(filename).write_text(f'<!doctype html><html lang="{language}" dir="{"rtl" if language == "ar" else "ltr"}"><head><meta charset="utf-8"><title>{title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><style>body{{font-family:system-ui;line-height:1.9;max-width:72ch;margin:auto;padding:1.5rem;overflow-wrap:anywhere}}section{{border-block-end:1px solid #aaa;padding-block:1rem}}figure{{margin-inline:0}}img{{display:block;max-width:100%;height:auto}}p{{text-align:start}}@media print{{section{{break-after:page}}}}</style></head><body><main><h1>{title}</h1>' + "".join(sections) + '</main></body></html>', encoding="utf-8")
    else:
        raise ValueError("unsupported")


def run(request):
    import pymupdf as fitz
    operation = request["operation"]
    output_dir = Path(request["outputDirectory"])
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = request.get("payload") or {}
    sources = request.get("sources") or {}
    assets = request.get("assets") or {}
    filename = request.get("filename")
    if filename and digest(filename) != request.get("expectedHash"):
        raise ValueError("source-changed")
    if operation == "capabilities":
        ocr = all((Path(request.get("tessdata", "")) / f"{language}.traineddata").is_file() for language in ["eng", "ara"])
        validator = bool(request.get("java") and request.get("veraPdfJar") and Path(request["java"]).is_file() and Path(request["veraPdfJar"]).is_file())
        return {"engine": fitz.VersionBind, "features": ["create", "edit-content", "organize", "split", "preview", "redact", "encrypt", "export-docx", "export-xlsx", "export-pptx", "export-html", "sign", "verify-signatures", "repair-metadata"] + (["ocr"] if ocr else []) + (["validate"] if validator else [])}
    if operation == "verify-signatures":
        return validate_signatures(filename, [assets[payload["trustRoot"]]] if payload.get("trustRoot") else None)
    document = open_pdf(filename, request.get("password"), None if operation in ("preview", "validate", "verify-signatures") else fitz.PDF_PERM_COPY if operation in ("inspect", "text", "export-docx", "export-xlsx", "export-pptx", "export-html", "ocr") else fitz.PDF_PERM_ASSEMBLE if operation in ("organize", "split") else fitz.PDF_PERM_MODIFY) if filename else fitz.open()
    outputs = []
    result = {}
    try:
        if len(document) > 10000:
            raise ValueError("document-too-large")
        if operation in ("inspect", "text"):
            selected = payload.get("pages")
            if payload.get("fromPage") or payload.get("toPage"):
                start = int(payload.get("fromPage", 1))
                end = min(len(document), int(payload.get("toPage") or len(document)), start + 199)
                if not 1 <= start <= end:
                    raise ValueError("invalid-request")
                selected = list(range(start, end + 1))
            return inspected(document, selected)
        if operation == "validate":
            if encrypted_pdf(document):
                raise ValueError("unsupported")
            return compliance(filename, request, payload.get("profile", "2b"))
        if operation == "preview":
            if payload.get("items") is not None:
                items = payload["items"]
                if not isinstance(items, list) or len(items) > 36:
                    raise ValueError("invalid-request")
                thumbnails, opened = [], {}
                try:
                    for item in items:
                        key, number = item.get("sessionId", "current"), item.get("page")
                        if key != "current" and key not in opened:
                            details = sources[key]
                            if digest(details["filename"]) != details["sha256"]:
                                raise ValueError("source-changed")
                            opened[key] = open_pdf(details["filename"])
                        source = document if key == "current" else opened[key]
                        if not isinstance(number, int) or not 1 <= number <= len(source):
                            raise ValueError("invalid-request")
                        page = source[number - 1]
                        scale = min(180 / page.rect.width, 240 / page.rect.height)
                        image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                        thumbnails.append({"key": f"{key}:{number}", "page": number, "image": "data:image/png;base64," + base64.b64encode(image.tobytes("png")).decode("ascii")})
                    for key in opened:
                        if digest(sources[key]["filename"]) != sources[key]["sha256"]:
                            raise ValueError("source-changed")
                    return {"thumbnails": thumbnails}
                finally:
                    for source in opened.values():
                        source.close()
            if payload.get("pages"):
                numbers = payload["pages"]
                if not isinstance(numbers, list) or len(numbers) > 36:
                    raise ValueError("invalid-request")
                thumbnails = []
                for number in numbers:
                    if not isinstance(number, int) or not 1 <= number <= len(document):
                        raise ValueError("invalid-request")
                    page = document[number - 1]
                    scale = min(180 / page.rect.width, 240 / page.rect.height)
                    image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                    thumbnails.append({"page": number, "image": "data:image/png;base64," + base64.b64encode(image.tobytes("png")).decode("ascii")})
                return {"thumbnails": thumbnails}
            page = document[int(payload.get("page", 1)) - 1]
            width = max(100, min(1400, int(payload.get("width", 900))))
            if page.rect.height * width * width / page.rect.width > 20_000_000:
                raise ValueError("document-too-large")
            image = page.get_pixmap(matrix=fitz.Matrix(width / page.rect.width, width / page.rect.width), alpha=False)
            return {"page": page.number + 1, "width": page.rect.width, "height": page.rect.height, "image": "data:image/png;base64," + base64.b64encode(image.tobytes("png")).decode("ascii")}
        if signed_source(document) and operation not in ("sign", "export-docx", "export-xlsx", "export-pptx", "export-html"):
            raise ValueError("signed-document-locked")
        name = output_dir / "document.pdf"
        if operation == "create":
            document.close(); document = fitz.open()
            pages = payload.get("pages") or [{"width": 595, "height": 842}]
            if not 1 <= len(pages) <= 1000:
                raise ValueError("invalid-request")
            for index, config in enumerate(pages):
                width, height = float(config.get("width", 595)), float(config.get("height", 842))
                if not 72 <= width <= 3000 or not 72 <= height <= 3000:
                    raise ValueError("invalid-request")
                page = document.new_page(width=width, height=height)
                if config.get("image"):
                    page.insert_image(page.rect, filename=assets[config["image"]])
                if config.get("text"):
                    text_box(page, fitz.Rect(36, 36, width - 36, height - 36), config["text"], config)
                emit("progress", current=index + 1, total=len(pages))
            clean_save(document, name)
        elif operation == "edit-content":
            replace_text(document, payload.get("textReplacements", []), payload.get("wholeWordSearch", False))
            for index, edit in enumerate(payload.get("edits", [])):
                page = document[int(edit["page"]) - 1]
                area = rect(edit["rect"], page)
                kind = edit["kind"]
                if kind == "move-image":
                    xref = int(edit.get("xref", 0))
                    image_info = next((image for image in page.get_images(full=True) if image[0] == xref), None)
                    original = rect(edit.get("originalRect"), page)
                    if not image_info or not any(abs(area.x0 - original.x0) < 1 and abs(area.y0 - original.y0) < 1 and abs(area.x1 - original.x1) < 1 and abs(area.y1 - original.y1) < 1 for area in page.get_image_rects(xref)):
                        raise ValueError("invalid-request")
                    pixels = fitz.Pixmap(document, xref)
                    if pixels.width * pixels.height > 30_000_000:
                        raise ValueError("document-too-large")
                    if image_info[1]:
                        pixels = fitz.Pixmap(pixels, fitz.Pixmap(document, image_info[1]))
                    content = pixels.tobytes("png")
                    if edit.get("crop"):
                        from PIL import Image
                        with Image.open(io.BytesIO(content)) as source_image:
                            cropped = source_image.crop(tuple(edit["crop"])); stream = io.BytesIO(); cropped.save(stream, format="PNG"); content = stream.getvalue()
                    page.add_redact_annot(original, fill=False)
                    page.apply_redactions(images=2, graphics=0, text=1)
                    page.insert_image(area, stream=content, keep_proportion=False, overlay=edit.get("layer", "over") != "under")
                    emit("progress", current=index + 1, total=len(payload.get("edits", [])))
                    continue
                if kind in ("replace-text", "replace-image"):
                    page.add_redact_annot(area, fill=False)
                    page.apply_redactions(images=2 if kind == "replace-image" else 0, graphics=0, text=0 if kind == "replace-text" else 1)
                if kind in ("text", "replace-text", "initials", "date", "typed-signature"):
                    text_box(page, area, edit.get("text", ""), edit)
                elif kind in ("image", "replace-image", "signature-image"):
                    image = assets[edit["asset"]]
                    if edit.get("crop"):
                        from PIL import Image
                        with Image.open(image) as source:
                            cropped = source.crop(tuple(edit["crop"])); content = io.BytesIO(); cropped.save(content, format="PNG")
                            page.insert_image(area, stream=content.getvalue(), keep_proportion=False, overlay=edit.get("layer", "over") != "under")
                    else:
                        page.insert_image(area, filename=image, keep_proportion=False, overlay=edit.get("layer", "over") != "under")
                elif kind == "ink-signature":
                    for stroke in edit.get("strokes", []):
                        points = [fitz.Point(area.x0 + point[0] * area.width, area.y0 + point[1] * area.height) for point in stroke]
                        if len(points) > 1:
                            shape = page.new_shape(); shape.draw_polyline(points); shape.finish(color=(0, 0, 0), width=1.5); shape.commit()
                elif kind in ("initials-field", "date-field"):
                    field_name = edit.get("fieldName", "")
                    if not isinstance(field_name, str) or not re.fullmatch(r"[^.\x00-\x1f]{1,100}", field_name) or any(widget.field_name == field_name for current in document for widget in (current.widgets() or [])):
                        raise ValueError("invalid-request")
                    widget = fitz.Widget(); widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                    widget.field_name = field_name; widget.field_label = edit.get("label", field_name)
                    widget.rect = area; widget.field_value = edit.get("text", "")
                    widget.text_font = "Helv"; widget.text_fontsize = 12; widget.border_color = (0.2, 0.5, 0.3)
                    widget.border_width = 1; widget.text_maxlen = 100
                    page.add_widget(widget)
                elif kind in ("sticky", "callout", "ink-review"):
                    if kind == "sticky":
                        annotation = page.add_text_annot(area.tl, edit.get("text", ""))
                    elif kind == "callout":
                        annotation = page.add_freetext_annot(area, html.escape(edit.get("text", "")), richtext=True, style="font-family:sans-serif;font-size:11pt;line-height:1.6", border_color=(0.2, 0.5, 0.3), fill_color=(1, 1, 0.9))
                    else:
                        ink = [[fitz.Point(area.x0 + point[0] * area.width, area.y0 + point[1] * area.height) for point in stroke] for stroke in edit.get("strokes", []) if len(stroke) > 1]
                        if not ink:
                            raise ValueError("invalid-request")
                        annotation = page.add_ink_annot(ink)
                    annotation.set_info(title=edit.get("author", ""), content=edit.get("text", ""), subject=edit.get("status", "open"))
                    annotation.update()
                elif kind == "stamp":
                    page.add_stamp_annot(area, stamp=int(edit.get("stamp", 0)))
                else:
                    raise ValueError("invalid-request")
                emit("progress", current=index + 1, total=len(payload.get("edits", [])))
            clean_save(document, name)
            result["visualSignatureOnly"] = any(edit["kind"] in ("typed-signature", "signature-image", "ink-signature", "initials", "date", "stamp") for edit in payload.get("edits", []))
        elif operation in ("organize", "split"):
            plan = payload.get("pages") or []
            if not 1 <= len(plan) <= 10000:
                raise ValueError("invalid-request")
            target = empty_pdf_like(document, request.get("password"))
            opened = {}
            try:
                for index, item in enumerate(plan):
                    if item.get("blank"):
                        target.new_page(width=595, height=842)
                    else:
                        key = item.get("sessionId", "current")
                        if key == "current":
                            source = document
                        else:
                            details = sources[key]
                            if digest(details["filename"]) != details["sha256"]:
                                raise ValueError("source-changed")
                            if key not in opened:
                                opened[key] = open_pdf(details["filename"], details.get("password"), fitz.PDF_PERM_ASSEMBLE)
                            source = opened[key]
                        number = int(item["page"]) - 1
                        if not 0 <= number < len(source) or item.get("rotation", 0) not in (0, 90, 180, 270):
                            raise ValueError("invalid-request")
                        target.insert_pdf(source, from_page=number, to_page=number)
                        target[-1].set_rotation((source[number].rotation + item.get("rotation", 0)) % 360)
                    emit("progress", current=index + 1, total=len(plan))
                if operation == "split":
                    count = max(1, min(1000, int(payload.get("pagesPerFile", 1))))
                    for start in range(0, len(target), count):
                        split = empty_pdf_like(document, request.get("password")); split.insert_pdf(target, from_page=start, to_page=min(len(target) - 1, start + count - 1))
                        part = output_dir / f"part-{start + 1:04d}.pdf"; clean_save(split, part); split.close(); outputs.append(str(part))
                else:
                    clean_save(target, name)
            finally:
                target.close()
                for source in opened.values():
                    source.close()
        elif operation == "repair-metadata":
            metadata = document.metadata or {}
            for key in ("title", "author", "subject", "keywords"):
                if key in payload:
                    value = payload[key]
                    if not isinstance(value, str) or len(value) > 1000:
                        raise ValueError("invalid-request")
                    metadata[key] = value
            document.set_metadata(metadata)
            if payload.get("language") in ("ar", "en"):
                document.set_language(payload["language"])
            clean_save(document, name)
            result["complianceNotClaimed"] = True
        elif operation == "redact":
            count = 0
            pattern = payload.get("pattern")
            if pattern and (not isinstance(pattern, str) or len(pattern) > 200):
                raise ValueError("invalid-request")
            for page in document:
                areas = [rect(item["rect"], page) for item in payload.get("regions", []) if item["page"] == page.number + 1]
                if pattern:
                    if pattern in ("email", "phone", "id"):
                        expression = {"email": r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "phone": r"\+?\d[\d ()-]{6,}\d", "id": r"\b\d{8,18}\b"}[pattern]
                        terms = set(re.findall(expression, page.get_text()))
                    else:
                        terms = {pattern}
                    for term in terms:
                        areas.extend(page.search_for(term))
                for area in areas:
                    page.add_redact_annot(area, fill=(0, 0, 0)); count += 1
                page.apply_redactions(images=2, graphics=2, text=0)
                emit("progress", current=page.number + 1, total=len(document))
            if not count:
                raise ValueError("no-redactions")
            # Remove every annotation/form/attachment after applying masks; metadata and old
            # unreferenced object streams are purged by scrub + a full garbage-collected save.
            for page in document:
                for annotation in list(page.annots() or []):
                    page.delete_annot(annotation)
                for widget in list(page.widgets() or []):
                    page.delete_widget(widget)
            clean_save(document, name, sanitize=True)
            result["redactionsApplied"] = count
        elif operation == "encrypt":
            import pikepdf
            mode = payload.get("mode", "encrypt")
            with pikepdf.open(filename, password=request.get("password") or "") as source:
                if source.is_encrypted and not source.owner_password_matched:
                    raise ValueError("owner-password-required")
                if mode == "decrypt":
                    source.save(name, encryption=False)
                else:
                    owner = payload.get("ownerPassword", ""); user = payload.get("userPassword", "")
                    if len(owner) < 8 or not user or owner == user or payload.get("bits", 256) not in (128, 256):
                        raise ValueError("invalid-request")
                    flags = payload.get("permissions") or {}
                    allow = pikepdf.Permissions(extract=flags.get("copy", True), modify_annotation=flags.get("annotate", True), modify_assembly=flags.get("modify", True), modify_form=flags.get("forms", True), modify_other=flags.get("modify", True), print_lowres=flags.get("print", True), print_highres=flags.get("print", True))
                    source.save(name, encryption=pikepdf.Encryption(user=user, owner=owner, R=6 if payload.get("bits", 256) == 256 else 4, aes=True, allow=allow))
            with pikepdf.open(name, password=payload.get("userPassword", "") if mode != "decrypt" else "") as verified:
                if bool(verified.is_encrypted) != (mode != "decrypt"):
                    raise ValueError("invalid-output")
        elif operation == "ocr":
            target = empty_pdf_like(document, request.get("password"))
            try:
                tessdata_path = request.get("tessdata")
                if not tessdata_path or not os.path.isdir(tessdata_path):
                    root_dir = Path(__file__).resolve().parent.parent.parent / ".baglib-data" / "pdf-engine"
                    best_dir = root_dir / "ocr-best"
                    if best_dir.is_dir() and (best_dir / "ara.traineddata").is_file():
                        tessdata_path = str(best_dir)
                    else:
                        tessdata_path = str(root_dir / "tessdata")

                languages = payload.get("languages", "ara+eng")
                for page in document:
                    if page.rect.width * page.rect.height * (300 / 72) ** 2 > 30_000_000:
                        raise ValueError("document-too-large")
                    pixmap = page.get_pixmap(dpi=300, alpha=False)
                    if pixmap.alpha:
                        pixmap = fitz.Pixmap(pixmap, 0)
                    if pixmap.n != 3 or pixmap.colorspace != fitz.csRGB:
                        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
                    content = pixmap.pdfocr_tobytes(language=languages, tessdata=tessdata_path)
                    with fitz.open(stream=content, filetype="pdf") as recognized:
                        target.insert_pdf(recognized)
                    emit("progress", current=page.number + 1, total=len(document))
                clean_save(target, name)
            finally:
                target.close()
        elif operation.startswith("export-"):
            extension = {"export-docx": "docx", "export-xlsx": "xlsx", "export-pptx": "pptx", "export-html": "html"}[operation]
            name = output_dir / f"document.{extension}"
            convert(document, operation, name, request.get("language", "en"), request.get("labels"))
            result["fidelity"] = "editable-reconstruction" if extension != "html" else "semantic-reflow"
        elif operation == "prepare-signature":
            if encrypted_pdf(document):
                raise ValueError("unsupported")
            from pyhanko.sign.fields import append_signature_field, SigFieldSpec
            from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
            field_name = payload.get("fieldName", "BaglibSignature")
            if not isinstance(field_name, str) or not re.fullmatch(r"[^.\x00-\x1f]{1,100}", field_name) or any(widget.field_name == field_name for current in document for widget in (current.widgets() or [])):
                raise ValueError("invalid-request")
            number = int(payload.get("page", 1)) - 1; page = document[number]
            native = rect(payload["rect"], page) * ~page.transformation_matrix
            with open(filename, "rb") as source, open(name, "wb") as destination:
                writer = IncrementalPdfFileWriter(source)
                append_signature_field(writer, SigFieldSpec(sig_field_name=field_name, on_page=number, box=tuple(native)))
                writer.write(destination)
            result["signature"] = validate_signatures(name)
        elif operation == "sign":
            if encrypted_pdf(document):
                raise ValueError("unsupported")
            from pyhanko.sign import signers, fields
            from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
            signer = signers.SimpleSigner.load_pkcs12(assets[payload["certificate"]], passphrase=payload.get("certificatePassword", "").encode())
            if not signer:
                raise ValueError("certificate-invalid")
            page_number = int(payload.get("page", 1)) - 1
            page = document[page_number]
            area = rect(payload["rect"], page)
            # Convert the unrotated MuPDF rectangle into native PDF user space,
            # accounting for crop offsets and the PDF bottom-up coordinate system.
            native = area * ~page.transformation_matrix
            box = tuple(native)
            with open(filename, "rb") as source, open(name, "wb") as destination:
                writer = IncrementalPdfFileWriter(source)
                existing = payload.get("existingField")
                if existing and not any(widget.field_name == existing and widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE and not widget.is_signed for current in document for widget in (current.widgets() or [])):
                    raise ValueError("invalid-request")
                field_name = existing or payload.get("fieldName", "BaglibSignature")
                signers.sign_pdf(writer, signature_meta=signers.PdfSignatureMetadata(field_name=field_name, reason=payload.get("reason", "")), signer=signer, new_field_spec=None if existing else fields.SigFieldSpec(sig_field_name=field_name, on_page=page_number, box=box), existing_fields_only=bool(existing), output=destination)
            result["signature"] = validate_signatures(name)
        else:
            raise ValueError("unsupported")
        if not outputs:
            outputs = [str(name)]
        if filename and digest(filename) != request.get("expectedHash"):
            raise ValueError("source-changed")
        result["outputs"] = [{"filename": Path(value).name, "format": Path(value).suffix[1:], "bytes": Path(value).stat().st_size, "sha256": digest(value)} for value in outputs]
        return result
    finally:
        document.close()


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.buffer.read(20 * 1024 * 1024).decode("utf-8"))
        result = run(request)
        emit("complete", result=result)
    except Exception as error:
        safe = {"invalid-request", "source-changed", "encrypted", "permission-denied", "signed-document-locked", "text-does-not-fit", "owner-password-required", "no-tables", "no-redactions", "certificate-invalid", "invalid-output", "unsupported", "document-too-large", "engine-missing"}
        # Never echo exception values: crypto/parser messages can contain supplied secrets.
        emit("error", error=str(error) if str(error) in safe else "engine-failed", category=type(error).__name__)
        sys.exit(1)
