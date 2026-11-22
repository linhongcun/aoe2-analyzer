"""#1296 数据管线校验：城堡版保加利亚骑兵下马 form、固有 totalProjectiles 与充能 chargeMultiProjectiles。"""
import json
import unittest
from pathlib import Path


class UnitProjectilesForms1296(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        catalog = Path(__file__).resolve().parents[2] / 'data/game/units.json'
        cls.units = {u['id']: u for u in json.loads(catalog.read_text(encoding='utf-8'))}

    def test_castle_and_krepost_konniks_all_have_dismount_form(self):
        expected = {1225: 1252, 1227: 1253, 1254: 1252, 1255: 1253}
        for owner, target in expected.items():
            with self.subTest(owner=owner):
                form = self.units[owner].get('form')
                self.assertIsNotNone(form)
                self.assertEqual(form['kind'], 'dismount')
                self.assertEqual(form['id'], target)

    def test_intrinsic_total_projectiles_matches_21_real_units_and_excludes_cosmetic_mangonels(self):
        expected_multi = {
            73: 3, 559: 5, 1231: 3, 1233: 4, 1260: 4, 1704: 6, 1706: 6, 1750: 5,
            1001: 5, 1003: 6, 1962: 5, 250: 4, 533: 4, 1795: 5, 1904: 8, 1907: 10,
            831: 3, 832: 3, 2626: 3, 2627: 3, 2628: 3,
        }
        actual = {uid: u['totalProjectiles'] for uid, u in self.units.items() if 'totalProjectiles' in u}
        self.assertEqual(actual, expected_multi)
        # 投石车系装饰副弹丸、常规单箭弓手、喷火船、充能多箭单位不得误导出 totalProjectiles
        for excluded in (280, 550, 588, 4, 24, 492, 6, 7, 1103, 529, 532, 1968, 1970, 1952, 1901, 1903, 1948):
            self.assertNotIn('totalProjectiles', self.units[excluded], f'unit {excluded} should not export totalProjectiles')

    def test_charge_multi_projectiles_matches_exact_6_salvo_units(self):
        expected_salvo = {1968, 1970, 1901, 1903, 1948, 1952}
        actual = {uid for uid, u in self.units.items() if u.get('chargeMultiProjectiles') is True}
        self.assertEqual(actual, expected_salvo)
        # 单发充能远程（mtp=1）及已有固有 totalProjectiles=3 的龟甲船不得标记 chargeMultiProjectiles
        for excluded in (2569, 2571, 2705, 2706, 2711, 2712, 831, 832):
            self.assertNotIn('chargeMultiProjectiles', self.units[excluded], f'unit {excluded} should not export chargeMultiProjectiles')
