"""#486: normalized Jarl armour changes must appear in the patch summary."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from data_diff import summarize  # noqa: E402


class UnitArmourDiff(unittest.TestCase):
    # Exact normalized fields from 185872 (main@7f3521c2) and 188329 exports.
    OLD_CLASSES = [3, 4, 8, 19, 31, 36]
    NEW_CLASSES = [3, 4, 8, 19, 31]
    OLD_ARMOUR = [['骑兵', 0], ['独特单位', 0], ['特殊近战', 0], ['英雄/国王', 0]]
    NEW_ARMOUR = [['骑兵', 0], ['独特单位', 0], ['特殊近战', 0]]

    def jarls(self):
        old = [
            {'id': 2708, 'en': 'Jarl', 'zh': '首领', 'cls': self.OLD_CLASSES, 'armc': self.OLD_ARMOUR},
            {'id': 2709, 'en': 'Elite Jarl', 'zh': '精锐首领', 'cls': self.OLD_CLASSES, 'armc': self.OLD_ARMOUR},
        ]
        new = copy.deepcopy(old)
        for unit in new:
            unit.update(cls=self.NEW_CLASSES, armc=self.NEW_ARMOUR)
        return old, new

    def test_real_188329_jarl_armour_removal_reports_both_units(self):
        old, new = self.jarls()
        md = summarize({'units': old}, {'units': new})
        self.assertIn('## 单位（新增 0 / 移除 0 / 变更 2）', md)
        for name in ['首领（Jarl）', '精锐首领（Elite Jarl）']:
            self.assertIn(name, md)
        self.assertIn('cls [3, 4, 8, 19, 31, 36] → [3, 4, 8, 19, 31]', md)
        self.assertIn('["英雄/国王", 0]', md)

    def test_each_normalized_armour_field_is_reported_independently(self):
        for key in ['cls', 'armc']:
            with self.subTest(field=key):
                old, changed = self.jarls()
                new = copy.deepcopy(old[:1])
                new[0][key] = changed[0][key]
                md = summarize({'units': old[:1]}, {'units': new})
                self.assertIn('变更 1', md)
                self.assertIn(key + ' ', md)
                self.assertNotIn('无数据变化', md)


if __name__ == '__main__':
    unittest.main()
