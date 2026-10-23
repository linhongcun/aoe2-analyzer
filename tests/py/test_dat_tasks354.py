"""#354：任务从 civs[1] 读取；action 151 带 resource_multiplier；渔船深海倍率不变。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from dat_source import load  # noqa: E402


class DatTasks354(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = load()

    def tasks(self, uid, action=151):
        return [t for t in self.d['Tasks'][str(uid)] if t['Action'] == action]

    def test_generate_resource_multiplier(self):
        expect = {1228: 213, 1230: 213, 2562: 287, 2564: 287, 2703: 297, 2704: 297, 82: 521, 2418: 521}
        for uid, mul in expect.items():
            rows = self.tasks(uid)
            self.assertTrue(rows, uid)
            self.assertTrue(all(t['ResMul'] == mul for t in rows), (uid, rows[0]))

    def test_deep_fish_unchanged_and_fish_trap_comes_from_civ(self):
        # header 对渔网（unit 199）是 1.25，文明单位是 1.45；深海鱼（action 5、class 5）两边都是 1.75。
        fish = self.d['Tasks']['13']
        deep = next(t for t in fish if t['Action'] == 5 and t['Class'] == 5)
        trap = next(t for t in fish if t['Action'] == 5 and t['Unit'] == 199)
        self.assertEqual(deep['Value'], 1.75)
        self.assertAlmostEqual(trap['Value'], 1.45, places=5)
        self.assertNotAlmostEqual(trap['Value'], 1.25, places=2)
