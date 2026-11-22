"""Issue #1327: 渔船深海倍率与养鱼场倍率固定 .dat 导出、舍入归一化、复现性与 fail-closed 防御测试。"""
import contextlib
import copy
import io
import json
import math
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import eco_build  # noqa: E402


class FishingGather1327Export(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked_eco = json.loads((eco_build.ROOT / 'data/game/eco.json').read_text(encoding='utf-8'))
        cls.checked_report = json.loads((eco_build.ROOT / 'data/reports/eco-data.json').read_text(encoding='utf-8'))
        cls.generated_eco, cls.generated_report = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='fishing1327-export-') as directory:
            root = Path(directory)
            (root / 'data/game').mkdir(parents=True)
            (root / 'data/reports').mkdir(parents=True)
            (root / 'docs/reports').mkdir(parents=True)
            for name in ('units', 'techs', 'buildings', 'civs', 'effects'):
                shutil.copyfile(eco_build.ROOT / f'data/game/{name}.json', root / f'data/game/{name}.json')
            with patch.object(eco_build, 'ROOT', root), patch.object(eco_build, 'load', return_value=data), contextlib.redirect_stdout(io.StringIO()):
                eco_build.main()
            return (
                json.loads((root / 'data/game/eco.json').read_text(encoding='utf-8')),
                json.loads((root / 'data/reports/eco-data.json').read_text(encoding='utf-8')),
            )

    def test_pinned_dat_tasks_and_normalized_multipliers(self):
        tasks = self.data['Tasks']['13']
        deep = [t for t in tasks if t.get('Action') == 5 and t.get('Class') == 5]
        trap = [t for t in tasks if t.get('Action') == 5 and t.get('Unit') == 199 and t.get('ResOut') == 0]
        self.assertEqual(len(deep), 1)
        self.assertEqual(len(trap), 1)
        self.assertEqual(self.generated_eco['fishingShip']['deepFishMultiplier'], 1.75)
        self.assertEqual(self.generated_eco['fishingShip']['fishTrapMultiplier'], 1.45)
        self.assertEqual(self.generated_eco['fishingShip']['workRate'], 0.24)
        self.assertEqual(self.generated_eco['fishingShip']['carry'], 15)

    def test_eco_and_reports_are_reproducible(self):
        self.assertEqual(self.generated_eco, self.checked_eco)
        self.assertEqual(self.generated_report, self.checked_report)
        self.assertEqual(self.generated_report['differences'], [])
        self.assertEqual(self.generated_report['missingInDat'], [])
        rendered = eco_build.report_view(self.generated_eco, self.generated_report)
        self.assertIn('深海倍率 1.75，养鱼场倍率 1.45', rendered)

    def test_multiplier_extractor_accepts_zero_and_rounds_float32_noise(self):
        self.assertEqual(
            eco_build._fishing_task_multiplier([{'Action': 5, 'Unit': 199, 'ResOut': 0, 'Value': 1.4500000476837158}], lambda t: True, 'trap'),
            1.45,
        )
        self.assertEqual(
            eco_build._fishing_task_multiplier([{'Action': 5, 'Unit': 199, 'ResOut': 0, 'Value': 0}], lambda t: True, 'zero'),
            0.0,
        )

    def test_multiplier_extractor_fail_closed_on_missing_or_duplicate(self):
        with self.assertRaises(ValueError):
            eco_build._fishing_task_multiplier([], lambda t: True, 'missing')
        dup = [{'Action': 5, 'Unit': 199, 'ResOut': 0, 'Value': 1.45}, {'Action': 5, 'Unit': 199, 'ResOut': 0, 'Value': 1.5}]
        with self.assertRaises(ValueError):
            eco_build._fishing_task_multiplier(dup, lambda t: True, 'duplicate')

    def test_multiplier_extractor_fail_closed_on_invalid_values(self):
        for bad in (float('nan'), float('inf'), float('-inf'), True, False, -0.01, None, '1.45'):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    eco_build._fishing_task_multiplier([{'Value': bad}], lambda t: True, 'invalid')

    def test_export_fail_closed_when_trap_task_removed_or_corrupted(self):
        missing = copy.deepcopy(self.data)
        missing['Tasks']['13'] = [t for t in missing['Tasks']['13'] if not (t.get('Action') == 5 and t.get('Unit') == 199 and t.get('ResOut') == 0)]
        with self.assertRaises(ValueError):
            self.export(missing)

        bad_val = copy.deepcopy(self.data)
        for t in bad_val['Tasks']['13']:
            if t.get('Action') == 5 and t.get('Unit') == 199 and t.get('ResOut') == 0:
                t['Value'] = math.nan
        with self.assertRaises(ValueError):
            self.export(bad_val)


if __name__ == '__main__':
    unittest.main()
