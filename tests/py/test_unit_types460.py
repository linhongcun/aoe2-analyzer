"""#460：上游单位类别校正必须精确，不能按多个文明宽泛归类。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from unit_types import unit_type


class UnitTypes460(unittest.TestCase):
    def test_winged_hussar_is_regional_even_with_pinned_unique_label(self):
        self.assertEqual(unit_type(1707, 'UniqueUnit'), 'RegionalUnit')

    def test_already_correct_upstream_label_is_idempotent(self):
        self.assertEqual(unit_type(1707, 'RegionalUnit'), 'RegionalUnit')

    def test_other_ids_keep_every_source_category_including_unique(self):
        for unit_id in [207, 441, 448, 546, 691, 1234, 1699, 1701, 1703, 1901, 99999]:
            for category in ['Unit', 'UnitUpgrade', 'UniqueUnit', 'RegionalUnit']:
                with self.subTest(unit_id=unit_id, category=category):
                    self.assertEqual(unit_type(unit_id, category), category)


if __name__ == '__main__':
    unittest.main()
