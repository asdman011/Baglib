import hashlib
import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('stirling_setup', Path(__file__).resolve().parents[1] / 'scripts' / 'setup-stirling-pdf.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class StirlingProvisionTests(unittest.TestCase):
    def test_version_matched_cached_module_needs_no_network(self):
        with tempfile.TemporaryDirectory(prefix='baglib-native-provision-') as directory:
            root = Path(directory)
            server = root / 'server.jar'
            with zipfile.ZipFile(server, 'w') as archive:
                archive.writestr('BOOT-INF/lib/jpdfium-9.8.7.jar', b'fixture')
            native = root / 'natives' / 'jpdfium-natives-windows-x64-9.8.7.jar'
            native.parent.mkdir()
            native.write_bytes(b'verified fixture')
            native.with_suffix('.jar.sha256').write_text(hashlib.sha256(native.read_bytes()).hexdigest())
            with patch.object(setup.os, 'name', 'nt'), patch.object(setup.urllib.request, 'urlopen', side_effect=AssertionError('Network forbidden')):
                self.assertEqual(setup.setup_native_module(server), native)

    def test_bad_download_hash_preserves_existing_module(self):
        with tempfile.TemporaryDirectory(prefix='baglib-native-integrity-') as directory:
            target = Path(directory) / 'native.jar'
            target.write_bytes(b'original verified module')
            response = io.BytesIO(b'invalid download')
            response.headers = {'Content-Length': '16'}
            with patch.object(setup.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(RuntimeError, 'SHA256'):
                    setup.download_file('https://example.invalid/module.jar', target, 'fixture', '0' * 64)
            self.assertEqual(target.read_bytes(), b'original verified module')
            self.assertFalse(target.with_suffix('.jar.download').exists())


if __name__ == '__main__':
    unittest.main()
