"""#486: normalized Jarl armour changes must appear in the patch summary."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from data_diff import diff  # noqa: E402


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
        units = diff({'units': old}, {'units': new})['units']
        self.assertEqual((units['added'], units['removed']), ([], []))
        self.assertEqual([(u['zh'], u['en']) for u in units['changed']], [('首领', 'Jarl'), ('精锐首领', 'Elite Jarl')])
        for unit in units['changed']:
            fields = {f['key']: (f['old'], f['new']) for f in unit['fields']}
            self.assertEqual(fields, {'cls': (self.OLD_CLASSES, self.NEW_CLASSES), 'armc': (self.OLD_ARMOUR, self.NEW_ARMOUR)})

    def test_each_normalized_armour_field_is_reported_independently(self):
        for key in ['cls', 'armc']:
            with self.subTest(field=key):
                old, changed = self.jarls()
                new = copy.deepcopy(old[:1])
                new[0][key] = changed[0][key]
                units = diff({'units': old[:1]}, {'units': new})['units']
                self.assertEqual([[f['key'] for f in u['fields']] for u in units['changed']], [[key]])


if __name__ == '__main__':
    unittest.main()
