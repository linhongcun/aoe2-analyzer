"""地图目录来源归档、双语关联与可区分的游戏地图身份。"""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from map_catalog_build import build_maps, read_snapshot


def snapshot_row(identity, name='浅滩', english=False):
    return {
        'mapId': f'rm_{identity}',
        'mapName': identity.title() if english else name,
        'description': 'A verified map description.' if english else '来自固定 API 快照的地图形态说明。',
        'imageUrl': f'https://backend.cdn.aoe2companion.com/public/aoe2/de/maps/rm_{identity}.png',
    }


def fixture(identities=('shallows', 'marsh')):
    source = {'repo': 'owner/maps', 'commit': 'a' * 40, 'assets': {}}
    previews, zh, en = {}, {}, {}
    for identity in identities:
        path = f'app/assets/maps/rm_{identity}.png'
        source['assets'][identity] = {'path': path, 'width': 420, 'height': 420}
        previews[identity] = {
            'image': f'img/maps/{identity}.webp',
            'sourceUrl': f'https://github.com/owner/maps/blob/{"a" * 40}/{path}',
            'width': 420,
            'height': 420,
        }
        zh[f'rm_{identity}'] = snapshot_row(identity)
        en[f'rm_{identity}'] = snapshot_row(identity, english=True)
    return source, previews, zh, en


class SnapshotIntegrity(unittest.TestCase):
    def write_snapshot(self, root, rows):
        data = (json.dumps(rows, ensure_ascii=False, indent=2) + '\n').encode()
        (root / 'source.json').write_bytes(data)
        return {'path': 'source.json', 'sha256': hashlib.sha256(data).hexdigest()}

    def test_snapshot_hash_rejects_modified_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pin = self.write_snapshot(root, [snapshot_row('black-forest')])
            (root / 'source.json').write_text('[]')
            with self.assertRaisesRegex(ValueError, 'sha256 不符'):
                read_snapshot(pin, root)

    def test_duplicate_ids_and_untranslated_placeholders_are_rejected(self):
        row = snapshot_row('black-forest')
        for rows, message in [([row, row], '重复 mapId'), ([{**row, 'mapName': '[map.blackForest]'}], '本地化占位符')]:
            with self.subTest(message=message), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                pin = self.write_snapshot(root, rows)
                with self.assertRaisesRegex(ValueError, message):
                    read_snapshot(pin, root)


class CatalogJoin(unittest.TestCase):
    def test_same_chinese_name_does_not_merge_distinct_maps(self):
        source, previews, zh, en = fixture()
        rows = build_maps(source, previews, zh, en, {})
        self.assertEqual({row['id'] for row in rows}, {'shallows', 'marsh'})
        self.assertEqual([row['name'] for row in rows], ['浅滩', '浅滩'])
        self.assertEqual({row['en'] for row in rows}, {'Shallows', 'Marsh'})

    def test_missing_language_and_wrong_image_identity_are_rejected(self):
        source, previews, zh, en = fixture(('black-forest',))
        with self.assertRaisesRegex(ValueError, '缺少中英双语来源'):
            build_maps(source, previews, zh, {}, {})
        en['rm_black-forest']['imageUrl'] = 'https://example.test/rm_arabia.png'
        with self.assertRaisesRegex(ValueError, '图像来源与 mapId 不匹配'):
            build_maps(source, previews, zh, en, {})

    def test_featured_priority_and_editorial_text_are_preserved(self):
        source, previews, zh, en = fixture()
        metadata = {
            'shallows': {'featured': True, 'priority': 1, 'group': 'hybrid'},
            'marsh': {'featured': True, 'priority': 0, 'group': 'hybrid', 'scouting': '先看通路。', 'opening': '先确认安全。'},
        }
        rows = build_maps(source, previews, zh, en, metadata)
        self.assertEqual([row['id'] for row in rows], ['marsh', 'shallows'])
        self.assertEqual(rows[0]['scouting'], '先看通路。')
        self.assertEqual(rows[0]['opening'], '先确认安全。')
        self.assertNotIn('priority', rows[0])

    def test_wrong_preview_pin_unknown_metadata_and_nonstandard_mode_are_rejected(self):
        source, previews, zh, en = fixture(('black-forest',))
        with self.assertRaisesRegex(ValueError, '未知地图 ID'):
            build_maps(source, previews, zh, en, {'typo': {}})
        with self.assertRaisesRegex(ValueError, '分类或排列顺序无效'):
            build_maps(source, previews, zh, en, {'black-forest': {'group': 'invented'}})
        previews['black-forest']['sourceUrl'] = 'https://example.test/latest.png'
        with self.assertRaisesRegex(ValueError, '不是固定来源'):
            build_maps(source, previews, zh, en, {})
        source, previews, zh, en = fixture(('ctr_basin',))
        with self.assertRaisesRegex(ValueError, '标准随机地图'):
            build_maps(source, previews, zh, en, {})


class PinnedCorpus(unittest.TestCase):
    def test_corpus_has_unique_map_ids_and_required_common_maps(self):
        pins = json.loads((ROOT / 'scripts/data_sources.json').read_text())['assetSources']
        zh = read_snapshot(pins['mapCatalog']['snapshots']['zh-hans'])
        en = read_snapshot(pins['mapCatalog']['snapshots']['en'])
        self.assertEqual(set(zh), set(en))
        catalog = json.loads((ROOT / 'src/data/mapCatalog.json').read_text())['maps']
        ids = [row['id'] for row in catalog]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), set(pins['mapPreviews']['assets']))
        self.assertTrue({'black-forest', 'michi', 'runestones', 'land_nomad', 'african_clearing'} <= set(ids))
        self.assertFalse(any(identity.startswith('ctr_') for identity in ids))

    def test_non_square_atacama_keeps_verified_dimensions(self):
        pin = json.loads((ROOT / 'scripts/data_sources.json').read_text())['assetSources']['mapPreviews']['assets']['atacama']
        preview = json.loads((ROOT / 'src/data/mapPreviews.json').read_text())['atacama']
        self.assertEqual((pin['width'], pin['height']), (423, 420))
        self.assertEqual((preview['width'], preview['height']), (423, 420))


if __name__ == '__main__':
    unittest.main()
