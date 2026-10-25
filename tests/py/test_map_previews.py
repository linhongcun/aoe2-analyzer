"""地图素材管线拒绝来源漂移、损坏缓存和过期生成文件。"""
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from map_previews import check_output, fetch_source, verify_source


class MapPreviews(unittest.TestCase):
    def test_rejects_changed_source(self):
        expected = hashlib.sha256(b'fixed source').hexdigest()
        with self.assertRaisesRegex(ValueError, 'sha256 不符'):
            verify_source(b'changed upstream', expected, 'map.png')

    def test_rechecks_cached_file_without_network(self):
        with tempfile.TemporaryDirectory() as temporary:
            cache = Path(temporary)
            (cache / 'map.png').write_bytes(b'corrupted cache')
            asset = {'path': 'map.png', 'sha256': hashlib.sha256(b'fixed source').hexdigest()}
            with patch('urllib.request.urlopen') as download:
                with self.assertRaisesRegex(ValueError, 'sha256 不符'):
                    fetch_source({}, asset, cache)
                download.assert_not_called()

    def test_failed_download_is_not_cached(self):
        with tempfile.TemporaryDirectory() as temporary:
            cache = Path(temporary)
            asset = {'path': 'map.png', 'sha256': hashlib.sha256(b'fixed source').hexdigest()}
            with patch('urllib.request.urlopen') as download:
                download.return_value.__enter__.return_value.read.return_value = b'changed upstream'
                with self.assertRaisesRegex(ValueError, 'sha256 不符'):
                    fetch_source({'repo': 'owner/repo', 'commit': 'fixed'}, asset, cache)
            self.assertFalse((cache / 'map.png').exists())

    def test_check_rejects_missing_or_modified_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / 'map.webp'
            with self.assertRaisesRegex(ValueError, '缺失或已变化'):
                check_output(output, b'expected image')
            output.write_bytes(b'changed image')
            with self.assertRaisesRegex(ValueError, '缺失或已变化'):
                check_output(output, b'expected image')
            output.write_bytes(b'expected image')
            check_output(output, b'expected image')


if __name__ == '__main__':
    unittest.main()
