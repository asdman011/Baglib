import io
import json
import os
import sys
from pathlib import Path

import pikepdf


class BoundedOutput(io.BufferedIOBase):
    def __init__(self, target, limit):
        self.target = target
        self.limit = limit

    def writable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.target.tell()

    def seek(self, offset, whence=os.SEEK_SET):
        position = self.target.seek(offset, whence)
        if position > self.limit:
            raise OSError('cache-size-limit')
        return position

    def write(self, data):
        if self.tell() + len(data) > self.limit:
            raise OSError('cache-size-limit')
        return self.target.write(data)

    def flush(self):
        self.target.flush()


def balance_flat_pages(document):
    root = document.Root.Pages
    children = list(root.Kids)
    if len(children) <= 32 or any(child.get('/Type') != pikepdf.Name.Page for child in children):
        return
    groups = []
    for start in range(0, len(children), 32):
        pages = children[start:start + 32]
        group = document.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Pages, Parent=root, Kids=pikepdf.Array(pages), Count=len(pages)))
        for page in pages:
            page.Parent = group
        groups.append(group)
    root.Kids = pikepdf.Array(groups)


def optimize(source, destination, limit):
    source = Path(source).resolve(strict=True)
    destination = Path(destination).resolve()
    if source == destination:
        raise ValueError('invalid-output')
    with pikepdf.Pdf.open(source, attempt_recovery=False) as document:
        if document.is_encrypted:
            raise ValueError('encrypted')
        pages = len(document.pages)
        balance_flat_pages(document)
        with destination.open('xb') as target:
            output = BoundedOutput(target, limit)
            try:
                document.save(output, linearize=True, fix_metadata_version=False, recompress_flate=False)
                output.flush()
                os.fsync(target.fileno())
            finally:
                output.close()
    with pikepdf.Pdf.open(destination, attempt_recovery=False) as verified:
        if len(verified.pages) != pages or not verified.is_linearized:
            raise ValueError('invalid-output')
    return {'pages': pages, 'bytes': destination.stat().st_size}


if __name__ == '__main__':
    try:
        print(json.dumps(optimize(sys.argv[1], sys.argv[2], int(sys.argv[3]))))
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        sys.exit(1)
