"""Real local-engine integration checks. Uses only disposable synthetic fixtures."""
import contextlib
import datetime
import importlib.util
import io
import json
import sys
import tempfile
import logging
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("baglib_pdf", ROOT / "assets/pdf-editor/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
import pymupdf as fitz
import pikepdf
from PIL import Image, ImageCms
logging.getLogger('pyhanko').setLevel(logging.CRITICAL)


def main():
    checked = []
    with tempfile.TemporaryDirectory(prefix="baglib-pdf-engine-") as temporary:
        root = Path(temporary).resolve()
        assert root.is_relative_to(Path(tempfile.gettempdir()).resolve())
        runtime = ROOT / ".baglib-data/pdf-engine"
        java = next((runtime / "java").rglob("java.exe"))
        jar = next((runtime / "verapdf/bin").glob("cli-*.jar"))
        serial = 0

        def run(operation, filename=None, payload=None, assets=None, password=None, sources=None):
            nonlocal serial
            serial += 1
            output = root / str(serial)
            request = {"operation": operation, "filename": str(filename) if filename else "", "expectedHash": engine.digest(filename) if filename else "", "outputDirectory": str(output), "payload": payload or {}, "assets": assets or {}, "password": password, "tessdata": str(runtime / "tessdata"), "java": str(java), "veraPdfJar": str(jar)}
            request['sources'] = sources or {}
            with contextlib.redirect_stdout(io.StringIO()):
                value = engine.run(request)
            return value, output / value["outputs"][0]["filename"] if value.get("outputs") else None

        result, source = run("create", payload={"pages": [{"text": "Research notes — بِسْمِ اللهِ الرَّحْمٰنِ", "width": 595, "height": 842}, {"text": "Second page"}]})
        assert source.is_file()
        inspected, _ = run("inspect", source)
        assert inspected["totalPages"] == 2
        assert "Research notes" in inspected["pages"][0]["text"]
        assert any("\u0600" <= character <= "\u06ff" for character in inspected["pages"][0]["text"])
        preview, _ = run("preview", source)
        assert preview["image"].startswith("data:image/png;base64,")
        checked.append("bilingual creation / extraction / preview")

        text_source = root / "private.pdf"
        with fitz.open() as document:
            page = document.new_page()
            page.insert_text((50, 75), "SecretIdentifier public@example.com")
            document.set_metadata({"title": "Private metadata", "author": "Secret author"})
            document.save(text_source)
        initial, _ = run("inspect", text_source)
        block = initial["pages"][0]["blocks"][0]
        _, edited = run("edit-content", text_source, {"edits": [{"kind": "replace-text", "page": 1, "rect": [45, 55, 500, 120], "text": "Replacement — بدل", "fontSize": 12}]})
        with fitz.open(edited) as document:
            assert "SecretIdentifier" not in document[0].get_text()
            assert "Replacement" in document[0].get_text()
        checked.append("existing text replacement removes original")

        find_source = root / "find-replace.pdf"
        with fitz.open() as document:
            for _ in range(2):
                page = document.new_page()
                page.insert_text((50, 75), "cat cat scatter catcat CAT", fontsize=14)
                page.insert_text((50, 115), "remove remove", fontsize=14)
                engine.text_box(page, fitz.Rect(50, 160, 500, 215), "العلم العلم والمعلم", {"fontSize": 18, "direction": "rtl", "align": "right"})
                engine.text_box(page, fitz.Rect(50, 250, 500, 295), "عِلْم عِلْمي علم", {"fontSize": 16, "direction": "rtl", "align": "right"})
                page.draw_rect(fitz.Rect(40, 40, 530, 240), color=(0, 1, 0))
            document.save(find_source)
        with fitz.open(find_source) as document:
            original_right_edges = sorted(area.x1 for area in document[0].search_for("العلم"))
        original_find_hash = engine.digest(find_source)
        _, replaced = run("edit-content", find_source, {"textReplacements": [{"find": "cat", "replace": "dog"}, {"find": "العلم", "replace": "العمل"}, {"find": "remove", "replace": ""}, {"find": "عِلْم", "replace": "بحث"}], "wholeWordSearch": True, "edits": [{"kind": "text", "page": 1, "rect": [50, 300, 300, 350], "text": "Coordinate edit retained"}]})
        with fitz.open(replaced) as document:
            for page in document:
                text = page.get_text()
                assert text.count("dog") == 2 and "scatter" in text and "catcat" in text and "CAT" in text, text
                assert "remove" not in text and "العلم" not in text and text.count("العمل") == 2 and "والمعلم" in text, text
                assert "عِلْمي" in text and "بحث" in text and "علم" in text, text
                after_edges = sorted(area.x1 for area in page.search_for("العمل"))
                assert abs(max(original_right_edges) - max(after_edges)) < 1, (original_right_edges, after_edges)
                assert page.get_drawings(), "text replacement removed vector graphics"
            assert "Coordinate edit retained" in document[0].get_text()
        assert engine.digest(find_source) != engine.digest(replaced)
        assert engine.digest(find_source) == original_find_hash
        _, substring = run("edit-content", find_source, {"textReplacements": [{"find": "cat", "replace": "dog"}]})
        with fitz.open(substring) as document:
            assert document[0].get_text().count("dog") == 5 and "CAT" in document[0].get_text()
        for invalid_rules in ([{"find": "", "replace": "x"}], [{"find": "cat", "replace": None}], "cat"):
            try:
                run("edit-content", find_source, {"textReplacements": invalid_rules})
                raise AssertionError("invalid replacement rule accepted")
            except ValueError as error:
                assert str(error) == "invalid-request"
        wrapped_source = root / "wrapped-replacement.pdf"
        with fitz.open() as document:
            page = document.new_page()
            page.insert_text((50, 75), "wrapped\nphrase", fontsize=14)
            assert len(page.search_for("wrapped phrase")) == 2
            document.save(wrapped_source)
        try:
            run("edit-content", wrapped_source, {"textReplacements": [{"find": "wrapped phrase", "replace": "changed"}]})
            raise AssertionError("wrapped replacement silently accepted")
        except ValueError as error:
            assert str(error) == "unsupported"
        checked.append("bilingual literal Find/Replace / Unicode whole-word boundaries / adjacent hits / deletion / coordinate coexistence")
        _, organized = run("organize", source, {"pages": [{"page": 2, "rotation": 90}, {"blank": True}, {"page": 1}]})
        with fitz.open(organized) as document:
            assert len(document) == 3 and document[0].rotation == 90 and "Second" in document[0].get_text()
        split, _ = run("split", source, {"pages": [{"page": 1}, {"page": 2}], "pagesPerFile": 1})
        assert len(split["outputs"]) == 2
        checked.append("page order / rotation / blank / split")
        thumbnails, _ = run('preview', source, {'items': [{'page': 2}, {'page': 1, 'sessionId': 'external'}]}, sources={'external': {'filename': str(organized), 'sha256': engine.digest(organized)}})
        assert [item['key'] for item in thumbnails['thumbnails']] == ['current:2', 'external:1']
        assert all(item['image'].startswith('data:image/png;base64,') for item in thumbnails['thumbnails'])
        checked.append('current and imported page-plan thumbnails')

        _, redacted = run("redact", text_source, {"regions": [{"page": 1, "rect": [40, 50, 550, 110]}]})
        with fitz.open(redacted) as document:
            assert "SecretIdentifier" not in document[0].get_text() and not document.metadata["author"]
        with pikepdf.open(redacted) as document:
            streams = b"".join(obj.read_bytes() for obj in document.objects if isinstance(obj, pikepdf.Stream))
            assert b"SecretIdentifier" not in streams and b"public@example.com" not in streams
            assert not document.docinfo.get("/Title")
        checked.append("destructive redaction / independent stream check / metadata removal")
        graphic = root / 'graphic.pdf'
        picture = Image.new('RGB', (100, 100), (255, 0, 0)); picture_bytes = io.BytesIO(); picture.save(picture_bytes, format='PNG')
        with fitz.open() as document:
            page = document.new_page(width=200, height=200)
            page.insert_image(fitz.Rect(20, 20, 120, 120), stream=picture_bytes.getvalue())
            page.draw_rect(fitz.Rect(20, 130, 120, 160), color=(0, 1, 0), fill=(0, 1, 0))
            document.save(graphic)
        _, sanitized = run('redact', graphic, {'regions': [{'page': 1, 'rect': [20, 20, 70, 165]}]})
        with fitz.open(sanitized) as document:
            for image in document[0].get_images():
                pixels = Image.open(io.BytesIO(document.extract_image(image[0])['image'])).convert('RGB')
                assert pixels.getpixel((10, 10)) != (255, 0, 0)
            assert not any(drawing.get('fill') == (0.0, 1.0, 0.0) for drawing in document[0].get_drawings())
        checked.append('destructive image-pixel and vector removal')
        graphic_info, _ = run('inspect', graphic)
        image = graphic_info['pages'][0]['images'][0]
        _, moved = run('edit-content', graphic, {'edits': [{'kind': 'move-image', 'page': 1, 'rect': [130, 20, 190, 80], 'originalRect': image['rects'][0], 'xref': image['xref'], 'crop': [0, 0, 50, 50]}]})
        with fitz.open(moved) as document:
            pixels = document[0].get_pixmap()
            assert pixels.pixel(35, 35)[:3] != (255, 0, 0)
            assert pixels.pixel(150, 40)[:3] == (255, 0, 0)
        checked.append('embedded image movement / resizing / pixel crop')

        structured = root / 'structured.pdf'
        with fitz.open() as document:
            page = document.new_page()
            page.insert_text((50, 55), 'Research Heading', fontsize=24)
            page.insert_textbox(fitz.Rect(50, 100, 500, 300), ('Research body paragraph with evidence and source notes. ' * 8), fontsize=11)
            document.set_toc([[1, 'Research Heading', 1]])
            document.save(structured)
        outline, _ = run('inspect', structured)
        assert outline['outline'][0]['title'] == 'Research Heading'
        _, semantic = run('export-html', structured)
        markup = semantic.read_text(encoding='utf-8')
        assert '<h2 dir="ltr">Research Heading</h2>' in markup and '<p dir="ltr">' in markup and 'position:absolute' not in markup
        _, structured_docx = run('export-docx', structured)
        from docx import Document
        paragraphs = Document(structured_docx).paragraphs
        assert paragraphs[0].style.name == 'Heading 1' and 'Research body paragraph' in paragraphs[1].text
        checked.append('semantic responsive HTML / DOCX headings and paragraphs / chapter outline')

        _, encrypted = run("encrypt", text_source, {"bits": 256, "userPassword": "reader", "ownerPassword": "owner-test-password", "permissions": {"copy": False, "print": False}})
        try:
            pikepdf.open(encrypted, password="wrong")
            raise AssertionError("wrong password accepted")
        except pikepdf.PasswordError:
            pass
        with pikepdf.open(encrypted, password="reader") as document:
            assert document.is_encrypted and document.encryption.R == 6 and not document.allow.extract and not document.allow.print_highres
        try:
            run("encrypt", encrypted, {"mode": "decrypt"}, password="reader")
            raise AssertionError("non-owner decryption accepted")
        except ValueError as error:
            assert str(error) == "owner-password-required"
        checked.append("AES-256 / permissions / wrong-password and non-owner refusal")
        _, protected_edit = run('edit-content', encrypted, {'edits': [{'kind': 'text', 'page': 1, 'rect': [50, 150, 400, 220], 'text': 'Protected edit'}]}, password='reader')
        with pikepdf.open(protected_edit, password='reader') as document:
            assert document.is_encrypted and not document.allow.extract and not document.allow.print_highres
        _, protected_replacement = run('edit-content', encrypted, {'textReplacements': [{'find': 'SecretIdentifier', 'replace': 'Changed'}]}, password='reader')
        with pikepdf.open(protected_replacement, password='reader') as document:
            assert document.is_encrypted and not document.allow.extract and not document.allow.print_highres
        with fitz.open(protected_replacement) as document:
            assert document.authenticate('owner-test-password')
            assert 'Changed' in document[0].get_text() and 'SecretIdentifier' not in document[0].get_text()
        _, protected_pages = run('organize', encrypted, {'pages': [{'page': 1, 'rotation': 90}]}, password='reader')
        with pikepdf.open(protected_pages, password='reader') as document:
            assert document.is_encrypted and not document.allow.extract
        empty_user = root / 'empty-user-password.pdf'
        with pikepdf.open(text_source) as document:
            document.save(empty_user, encryption=pikepdf.Encryption(owner='owner-secret', user='', R=6, allow=pikepdf.Permissions(extract=False)))
        try:
            run('inspect', empty_user)
            raise AssertionError('empty user password bypassed extraction permissions')
        except ValueError as error:
            assert str(error) == 'permission-denied'
        checked.append('editing/page organization retain source encryption; empty-user permission enforcement')

        for operation in ("export-docx", "export-pptx", "export-html"):
            _, exported = run(operation, source)
            assert exported.stat().st_size > 100
            if operation == "export-docx":
                from docx import Document
                assert "Research" in "\n".join(item.text for item in Document(exported).paragraphs)
            elif operation == "export-pptx":
                from pptx import Presentation
                assert len(Presentation(exported).slides) == 2
            else:
                assert "Research" in exported.read_text(encoding="utf-8")
        table_source = root / "table.pdf"
        with fitz.open() as document:
            page = document.new_page()
            for x in (50, 200, 350):
                page.draw_line((x, 50), (x, 150))
            for y in (50, 100, 150):
                page.draw_line((50, y), (350, y))
            for x, y, value in [(60, 80, "Name"), (210, 80, "Value"), (60, 130, "=malicious()"), (210, 130, "42")]:
                page.insert_text((x, y), value)
            document.save(table_source)
        _, xlsx = run("export-xlsx", table_source)
        from openpyxl import load_workbook
        workbook = load_workbook(xlsx)
        assert any(cell.value == "=malicious()" and cell.data_type == "s" for sheet in workbook for row in sheet for cell in row)
        checked.append("editable DOCX/PPTX/HTML / XLSX tables and formula-injection refusal")

        scanned = root / "scan.pdf"
        with fitz.open(source) as original, fitz.open() as document:
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, pixmap=original[0].get_pixmap(dpi=200))
            document.save(scanned)
        _, recognized = run("ocr", scanned, {"languages": "ara+eng"})
        with fitz.open(recognized) as document:
            assert "Research" in document[0].get_text()
        checked.append("local Arabic+English searchable OCR layer (English recognized; Arabic accuracy not asserted)")
        _, arabic_source = run('create', payload={'pages': [{'text': ('هذا البحث العلمي يناقش مصادر المعرفة وأصول المكتبة العلمية\n' * 8) + 'Research library', 'fontSize': 18, 'direction': 'rtl'}]})
        arabic_scan = root / 'arabic-scan.pdf'
        with fitz.open(arabic_source) as original, fitz.open() as document:
            page = document.new_page()
            page.insert_image(page.rect, pixmap=original[0].get_pixmap(dpi=200))
            document.save(arabic_scan)
        _, arabic_ocr = run('ocr', arabic_scan, {'languages': 'ara+eng'})
        with fitz.open(arabic_ocr) as document:
            assert document[0].search_for('البحث') and 'Research library' in document[0].get_text()
        checked.append('representative Arabic search and English selectable text in raster OCR output')

        validation, _ = run("validate", source, {"profile": "2b"})
        assert validation["validator"] == "veraPDF" and validation["compliant"] is False and validation["failures"]
        _, metadata = run("repair-metadata", source, {"title": "Research بحث", "language": "ar"})
        with fitz.open(metadata) as document:
            assert document.metadata["title"] == "Research بحث"
        checked.append("real veraPDF noncompliance report / honest metadata-only repair")
        _, archival_source = run('create', payload={'pages': [{'text': 'Archival verification'}]})
        archival = root / 'archival.pdf'
        with pikepdf.open(archival_source) as document:
            with document.open_metadata() as metadata:
                metadata['pdfaid:part'] = '2'
                metadata['pdfaid:conformance'] = 'B'
                metadata['dc:title'] = 'Archival verification'
                metadata['pdf:Producer'] = 'Baglib / PyMuPDF'
            icc = document.make_stream(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
            icc.N = 3
            document.Root.OutputIntents = pikepdf.Array([pikepdf.Dictionary(Type=pikepdf.Name.OutputIntent, S=pikepdf.Name.GTS_PDFA1, OutputConditionIdentifier='sRGB IEC61966-2.1', DestOutputProfile=icc)])
            document.save(archival, min_version='1.7')
        positive, _ = run('validate', archival, {'profile': '2b'})
        assert positive['compliant'] is True and not positive['failures']
        checked.append('positive PDF/A-2b fixture validated by actual veraPDF')

        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives.serialization import pkcs12
        from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Baglib disposable test signer")])
        now = datetime.datetime.now(datetime.timezone.utc)
        certificate = x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(days=1)).add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True).add_extension(x509.KeyUsage(digital_signature=True, content_commitment=True, key_encipherment=False, data_encipherment=False, key_agreement=False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True).sign(key, hashes.SHA256())
        p12 = root / "signer.p12"; pem = root / "trust.pem"
        p12.write_bytes(pkcs12.serialize_key_and_certificates(b"test", key, certificate, None, serialization.BestAvailableEncryption(b"disposable-password")))
        pem.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        pending, pending_file = run('prepare-signature', source, {'page': 1, 'rect': [50, 650, 300, 730], 'fieldName': 'ResearchApproval'})
        assert pending['signature']['status'] == 'Pending Signature'
        prepared, _ = run('inspect', pending_file)
        assert prepared['pendingFields'][0]['name'] == 'ResearchApproval' and prepared['signedSource'] is False
        _, completed_field = run('sign', pending_file, {'certificate': 'cert', 'certificatePassword': 'disposable-password', 'existingField': 'ResearchApproval', 'page': 1, 'rect': [50, 650, 300, 730]}, {'cert': str(p12)})
        completed_info, _ = run('inspect', completed_field)
        assert not completed_info['pendingFields'] and completed_info['signedSource']
        _, interactive = run('edit-content', source, {'edits': [{'kind': 'initials-field', 'page': 1, 'rect': [50, 400, 150, 450], 'fieldName': 'Initials', 'text': 'AB'}, {'kind': 'date-field', 'page': 1, 'rect': [200, 400, 350, 450], 'fieldName': 'Date', 'text': '2026-10-26'}]})
        with fitz.open(interactive) as document:
            widgets = list(document[0].widgets())
            assert len(widgets) == 2 and {widget.field_value for widget in widgets} == {'AB', '2026-10-26'}
        checked.append('Pending Signature workflow / signing existing field / interactive initials and date')
        signed, signed_file = run("sign", source, {"certificate": "cert", "certificatePassword": "disposable-password", "page": 1, "rect": [50, 650, 300, 750]}, {"cert": str(p12)})
        assert signed["signature"]["status"] in ("Signed", "Verified")
        verified, _ = run("verify-signatures", signed_file, {"trustRoot": "root"}, {"root": str(pem)})
        assert verified["signatures"][0]["intact"] and verified["signatures"][0]["trusted"]
        try:
            run("redact", signed_file, {"pattern": "Research"})
            raise AssertionError("signed source mutation accepted")
        except ValueError as error:
            assert str(error) == "signed-document-locked"
        checked.append("real PKCS#12 signing / offline trust verification / signed-source mutation guard")
        with fitz.open(signed_file) as document:
            document[0].insert_text((50, 500), 'Unauthorized change')
            document.saveIncr()
        changed, _ = run('verify-signatures', signed_file, {'trustRoot': 'root'}, {'root': str(pem)})
        assert changed['status'] == 'Tampered'
        checked.append('signature detects incremental content tampering')
    print(json.dumps({"passed": checked}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
