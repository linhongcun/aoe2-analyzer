"""#486: patch archives use their own fixed evidence, never today's historical values."""
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import patches_build as patches  # noqa: E402


class PatchArchives(unittest.TestCase):
    def test_185872_archive_bytes_remain_frozen(self):
        original = (ROOT / 'src/data/patches/185872.json').read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(),
                         '13aac16199d5ff637b88758520390e707d7c338ddbd595eeea29ac0d5c6e7b2b')

    def test_185872_reproduces_without_current_data_or_dat(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / 'scripts/patch_inputs', root / 'scripts/patch_inputs')
            with mock.patch.object(patches, 'ROOT', root):
                actual = patches.generate('185872')
        content = json.dumps(actual, ensure_ascii=False, indent=2) + '\n'
        self.assertEqual(content, (ROOT / 'src/data/patches/185872.json').read_text())

    def test_historical_source_facts_cannot_change_unnoticed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / 'scripts/patch_inputs', root / 'scripts/patch_inputs')
            source = root / 'scripts/patch_inputs/185872.json'
            evidence = json.loads(source.read_text())
            evidence['data']['units'][0]['zh'] = 'tampered historical fact'
            source.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
            with mock.patch.object(patches, 'ROOT', root):
                with self.assertRaisesRegex(AssertionError, '历史来源'):
                    patches.generate('185872')

    def test_188329_has_independent_release_and_publication_dates(self):
        patch = patches.generate('188329')
        self.assertEqual(patch['releaseDate'], '2026-10-27')
        self.assertEqual(patch['sourcePublishedAt'], '2026-10-27T10:04:41-07:00')
        self.assertEqual(patch['publishedAt'], '2026-10-28')
        self.assertNotIn('date', patch)
        self.assertEqual(json.loads((ROOT / 'src/data/patches/188329.json').read_text()), patch)

    def test_188329_rejects_another_source_even_if_build_number_is_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            pins = json.loads((ROOT / 'scripts/data_sources.json').read_text())
            pins['sources']['dat']['commit'] = 'f' * 40
            (root / 'scripts/data_sources.json').write_text(json.dumps(pins))
            with mock.patch.object(patches, 'ROOT', root):
                with self.assertRaisesRegex(AssertionError, '固定来源身份'):
                    patches.generate('188329')

    def test_188329_records_changed_and_unchanged_balance_targets(self):
        entries = patches.generate('188329')['entries']
        def values(uid):
            return {(entry['before'], entry['after']) for entry in entries
                    if entry['targetType'] == 'unit' and entry['targetId'] == uid}
        for uid, old_hp, new_hp in [(873, '230', '220'), (875, '280', '270')]:
            self.assertIn(('60 食物、80 黄金', '70 食物、80 黄金'), values(uid))
            self.assertIn((old_hp, new_hp), values(uid))
        self.assertIn(('1.5', '1.45'), values(2569))
        self.assertEqual(values(2571), set())
        self.assertEqual(values(2588), set())
        champi = [e for e in entries if e['targetId'] == 2550]
        self.assertEqual(len(champi), 2)
        self.assertTrue(all((e['before'], e['after']) == ('1', '2') for e in champi))
        self.assertTrue(all(e['originalText'] == 'Scout Cavalry-line and Camel Scout' for e in champi))
        self.assertTrue(all('护甲' in e['scopeNote'] for e in champi))
        self.assertTrue(all(e['provenance'] == 'dat' for e in entries))
        self.assertTrue(all(e['source'].endswith('update-188329/') for e in entries))


if __name__ == '__main__':
    unittest.main()
