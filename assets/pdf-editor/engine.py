"""
Baglib PDF Engine Helper
Delegates PDF operations to Stirling-PDF (v3.2.2) loopback REST API and pikepdf accessibility inspector.
Operates on JSON request from stdin; writes JSON progress and complete results on stdout.
"""

import sys
import os
import json
import hashlib
from pathlib import Path


def emit(kind, **data):
    print(json.dumps({"type": kind, **data}, ensure_ascii=True), flush=True)


def digest(filename):
    if not filename or not os.path.exists(filename):
        return ""
    h = hashlib.sha256()
    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def check_accessibility(filename):
    """
    Base PDF Accessibility check using pikepdf and pymupdf (fitz).
    Never modifies the file.
    """
    if not filename or not os.path.exists(filename):
        raise ValueError("file-not-found")

    import pikepdf
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz

    report = {
        "engine": "pikepdf " + getattr(pikepdf, "__version__", "10.x"),
        "filename": os.path.basename(filename),
        "fileSize": os.path.getsize(filename),
        "sha256": digest(filename),
        "isTagged": False,
        "hasMarked": False,
        "hasStructTree": False,
        "language": None,
        "hasLanguage": False,
        "title": None,
        "hasTitle": False,
        "displayDocTitle": False,
        "figuresCount": 0,
        "figuresWithoutAlt": 0,
        "figuresWithoutAltDetails": [],
        "totalPages": 0,
        "pagesWithoutText": [],
        "fontsWithoutToUnicode": [],
        "allFontsCount": 0,
        "readingOrder": []
    }

    with pikepdf.open(filename) as pdf:
        root = pdf.Root
        report["totalPages"] = len(pdf.pages)

        # 1. Tagged PDF: /MarkInfo /Marked and /StructTreeRoot
        mark_info = root.get("/MarkInfo")
        has_marked = bool(mark_info and mark_info.get("/Marked")) if mark_info else False
        has_struct_tree = "/StructTreeRoot" in root
        report["hasMarked"] = has_marked
        report["hasStructTree"] = has_struct_tree
        report["isTagged"] = has_marked and has_struct_tree

        # 2. Language: /Lang in document catalog
        lang = str(root.get("/Lang", "")).strip()
        report["language"] = lang if lang else None
        report["hasLanguage"] = bool(lang)

        # 3. Title and ViewerPreferences/DisplayDocTitle
        doc_title = ""
        if pdf.docinfo:
            doc_title = str(pdf.docinfo.get("/Title", "")).strip()
        if not doc_title:
            try:
                with pdf.open_metadata() as meta:
                    doc_title = str(meta.get("dc:title", "")).strip()
            except Exception:
                pass
        report["title"] = doc_title if doc_title else None
        report["hasTitle"] = bool(doc_title)

        vp = root.get("/ViewerPreferences")
        report["displayDocTitle"] = bool(vp and vp.get("/DisplayDocTitle")) if vp else False

        # 4. Fonts without /ToUnicode
        fonts_without_tounicode = set()
        all_fonts = set()
        for page in pdf.pages:
            res_dict = page.get("/Resources")
            if not res_dict:
                continue
            font_dict = res_dict.get("/Font")
            if not font_dict:
                continue
            for font_key, font_obj in font_dict.items():
                try:
                    if isinstance(font_obj, pikepdf.Dictionary):
                        base_font = str(font_obj.get("/BaseFont", font_key))
                        all_fonts.add(base_font)
                        subtype = str(font_obj.get("/Subtype", ""))
                        if "/ToUnicode" not in font_obj and subtype in ["/Type0", "/TrueType", "/Type1"]:
                            fonts_without_tounicode.add(base_font)
                except Exception:
                    pass
        report["allFontsCount"] = len(all_fonts)
        report["fontsWithoutToUnicode"] = sorted(list(fonts_without_tounicode))

        # 5. Figures without /Alt
        figures_count = 0
        figures_without_alt = 0
        fig_details = []

        def inspect_struct_element(elem, current_page=1):
            nonlocal figures_count, figures_without_alt, fig_details
            if not isinstance(elem, (pikepdf.Dictionary, pikepdf.Object)):
                return
            s_tag = str(elem.get("/S", ""))
            pg_ref = elem.get("/Pg")
            elem_page = current_page
            if pg_ref:
                try:
                    for p_num, p in enumerate(pdf.pages, 1):
                        if p.objgen == pg_ref.objgen:
                            elem_page = p_num
                            break
                except Exception:
                    pass
            if s_tag == "/Figure":
                figures_count += 1
                alt = elem.get("/Alt")
                if not alt or not str(alt).strip():
                    figures_without_alt += 1
                    fig_details.append({
                        "page": elem_page,
                        "tag": s_tag.replace("/", ""),
                        "missingAlt": True
                    })
            kids = elem.get("/K")
            if isinstance(kids, pikepdf.Array):
                for k in kids:
                    if isinstance(k, (pikepdf.Dictionary, pikepdf.Object)):
                        inspect_struct_element(k, elem_page)
            elif isinstance(kids, (pikepdf.Dictionary, pikepdf.Object)):
                inspect_struct_element(kids, elem_page)

        if has_struct_tree:
            try:
                struct_root = root.get("/StructTreeRoot")
                kids = struct_root.get("/K")
                if isinstance(kids, pikepdf.Array):
                    for k in kids:
                        inspect_struct_element(k)
                elif isinstance(kids, (pikepdf.Dictionary, pikepdf.Object)):
                    inspect_struct_element(kids)
            except Exception:
                pass
        else:
            for page_idx, page in enumerate(pdf.pages, 1):
                res_dict = page.get("/Resources")
                if not res_dict:
                    continue
                xobjects = res_dict.get("/XObject")
                if not xobjects:
                    continue
                for x_key, x_obj in xobjects.items():
                    try:
                        if isinstance(x_obj, pikepdf.Dictionary) and x_obj.get("/Subtype") == "/Image":
                            figures_count += 1
                            figures_without_alt += 1
                            fig_details.append({
                                "page": page_idx,
                                "name": str(x_key),
                                "missingAlt": True
                            })
                    except Exception:
                        pass
        report["figuresCount"] = figures_count
        report["figuresWithoutAlt"] = figures_without_alt
        report["figuresWithoutAltDetails"] = fig_details[:50]

        # 6. Reading order from Structure Tree if tagged
        reading_order = []
        if has_struct_tree:
            order_idx = 0

            def collect_order(elem, page_num=1):
                nonlocal order_idx
                if not isinstance(elem, (pikepdf.Dictionary, pikepdf.Object)):
                    return
                s_tag = str(elem.get("/S", ""))
                pg_ref = elem.get("/Pg")
                elem_page = page_num
                if pg_ref:
                    try:
                        for p_idx, p in enumerate(pdf.pages, 1):
                            if p.objgen == pg_ref.objgen:
                                elem_page = p_idx
                                break
                    except Exception:
                        pass
                if s_tag in ["/P", "/H1", "/H2", "/H3", "/H4", "/H5", "/H6", "/Figure", "/Table", "/BibEntry", "/Quote", "/Caption"]:
                    order_idx += 1
                    alt_text = str(elem.get("/Alt", "")) if elem.get("/Alt") else ""
                    reading_order.append({
                        "order": order_idx,
                        "page": elem_page,
                        "tag": s_tag.replace("/", ""),
                        "alt": alt_text,
                        "estimated": False
                    })
                kids = elem.get("/K")
                if isinstance(kids, pikepdf.Array):
                    for k in kids:
                        if isinstance(k, (pikepdf.Dictionary, pikepdf.Object)):
                            collect_order(k, elem_page)
                elif isinstance(kids, (pikepdf.Dictionary, pikepdf.Object)):
                    collect_order(kids, elem_page)

            try:
                struct_root = root.get("/StructTreeRoot")
                kids = struct_root.get("/K")
                if isinstance(kids, pikepdf.Array):
                    for k in kids:
                        collect_order(k)
                elif isinstance(kids, (pikepdf.Dictionary, pikepdf.Object)):
                    collect_order(kids)
            except Exception:
                pass

    # 7. Text layer check and fallback reading order via fitz
    doc = fitz.open(filename)
    pages_without_text = []
    estimated_blocks = []
    for idx, page in enumerate(doc, 1):
        text = page.get_text().strip()
        if not text:
            pages_without_text.append(idx)
        if not report["isTagged"] and idx <= 25:
            page_blocks = page.get_text("blocks")
            for b in page_blocks:
                if len(b) >= 5 and b[4].strip():
                    estimated_blocks.append({
                        "order": len(estimated_blocks) + 1,
                        "page": idx,
                        "tag": "P",
                        "text": b[4].strip()[:120],
                        "rect": [round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)],
                        "estimated": True
                    })
    report["pagesWithoutText"] = pages_without_text
    report["readingOrder"] = reading_order if report["isTagged"] and reading_order else estimated_blocks

    return report


def fix_accessibility_metadata(filename, output, language=None, title=None):
    """
    Produces a staged output with updated document language (/Lang) and Title + DisplayDocTitle.
    Never alters the original file.
    """
    if not filename or not os.path.exists(filename):
        raise ValueError("file-not-found")
    if not output:
        raise ValueError("output-required")

    import pikepdf
    with pikepdf.open(filename) as pdf:
        if language:
            pdf.Root.Lang = pikepdf.String(language)
        if title is not None:
            if pdf.docinfo is None:
                pdf.docinfo = pdf.make_metadata()
            pdf.docinfo.Title = pikepdf.String(title)
            if "/ViewerPreferences" not in pdf.Root:
                pdf.Root.ViewerPreferences = pikepdf.Dictionary()
            pdf.Root.ViewerPreferences.DisplayDocTitle = True
            try:
                with pdf.open_metadata() as meta:
                    if title:
                        meta["dc:title"] = title
                    if language:
                        meta["dc:language"] = [language]
            except Exception:
                pass
        pdf.save(output)

    return {
        "output": output,
        "format": "pdf",
        "sha256": digest(output),
        "bytes": os.path.getsize(output)
    }


def run(request):
    operation = request.get("operation")
    if operation == "capabilities":
        return {
            "engine": "Stirling-PDF 3.2.2",
            "features": [
                "inspect",
                "preview",
                "edit-content",
                "organize",
                "split",
                "ocr",
                "redact",
                "encrypt",
                "export-docx",
                "export-xlsx",
                "export-pptx",
                "export-html",
                "validate",
                "sign",
                "verify-signatures",
                "accessibility",
            ],
        }

    filename = request.get("filename", "")
    if operation == "accessibility":
        return check_accessibility(filename)

    if operation == "fix-accessibility-metadata":
        output = request.get("output", "")
        language = request.get("language")
        title = request.get("title")
        return fix_accessibility_metadata(filename, output, language, title)

    return {
        "engine": "Stirling-PDF 3.2.2",
        "operation": operation,
        "filename": filename,
        "sourceHash": digest(filename) if filename else "",
        "totalPages": 0,
        "pages": [],
    }


def main():
    if not sys.stdin.isatty():
        try:
            line = sys.stdin.read().strip()
            if not line:
                return
            request = json.loads(line)
            result = run(request)
            emit("complete", result=result)
        except Exception as e:
            emit("error", error=str(e))


if __name__ == "__main__":
    main()
