"""#393：免单项资源不等于自动获得科技；生成数据必须保留费用修正。"""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import eco_build  # noqa: E402


class VietnamEconomy393(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        root = Path(cls.temp.name)
        (root / 'src/data').mkdir(parents=True)
        (root / 'docs').mkdir()
        for name in ('units', 'techs', 'buildings', 'civs', 'effects'):
            shutil.copyfile(eco_build.ROOT / f'src/data/{name}.json', root / f'src/data/{name}.json')
        with patch.object(eco_build, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
            eco_build.main()
        cls.generated = json.loads((root / 'src/data/eco.json').read_text())

    def effects(self, civ):
        return [e for row in self.generated['civEco'][civ] if row['source'] == 'tree' for e in row['effects']]

    def test_vietnam_keeps_wood_discount_and_research_time(self):
        effects = self.effects('Vietnamese')
        self.assertIn({'kind': 'techCost', 'tech': 202, 'techName': 'Double Bit Axe', 'res': 'Wood', 'op': 'set', 'v': 0}, effects)
        self.assertIn({'kind': 'techTime', 'tech': 202, 'techName': 'Double Bit Axe', 'op': 'mul', 'v': 0.5}, effects)
        self.assertEqual([e['techName'] for e in effects if e['kind'] == 'freeTech'], ['Conscription'])

    def test_spanish_gold_discount_is_not_automatic_research(self):
        effects = self.effects('Spanish')
        self.assertTrue(any(e['kind'] == 'techCost' and e.get('res') == 'Gold' and e['op'] == 'set' and e['v'] == 0 for e in effects))
        self.assertFalse(any(e['kind'] == 'freeTech' for e in effects))

    def test_actual_automatic_technologies_are_preserved(self):
        for civ, names in {
            'Franks': {'Horse collar', 'Heavy plow', 'Crop rotation'},
            'Vikings': {'Wheel Barrow', 'Hand Cart'},
            'Bohemians': {'Gold Mining', 'Gold Shaft Mining', 'Stone Mining', 'Stone Shaft Mining'},
            'Teutons': {'Murder Holes', 'Herbal Medicine'},
        }.items():
            self.assertEqual({e['techName'] for e in self.effects(civ) if e['kind'] == 'freeTech'}, names, civ)

    def test_zero_cost_and_zero_adjustments_do_not_grant_technology(self):
        for kind, op in [('techCost', 'set'), ('techCost', 'mul'), ('techCost', 'add'), ('techTime', 'mul'), ('techTime', 'add')]:
            effect = {'kind': kind, 'tech': 202, 'techName': 'Double Bit Axe', 'op': op, 'v': 0}
            if kind == 'techCost':
                effect['res'] = 'Wood'
            tree, free = eco_build.split_tree_effects([effect])
            self.assertEqual(tree, [effect], (kind, op))
            self.assertEqual(free, [], (kind, op))

    def test_automatic_marker_only_folds_its_own_technology(self):
        wood = {'kind': 'techCost', 'tech': 202, 'techName': 'Double Bit Axe', 'res': 'Wood', 'op': 'set', 'v': 0}
        time = {'kind': 'techTime', 'tech': 202, 'techName': 'Double Bit Axe', 'op': 'mul', 'v': 0.5}
        automatic = {'kind': 'techTime', 'tech': 322, 'techName': 'Murder Holes', 'op': 'set', 'v': 0}
        stone = {'kind': 'techCost', 'tech': 322, 'techName': 'Murder Holes', 'res': 'Stone', 'op': 'set', 'v': 0}
        self.assertEqual(eco_build.split_tree_effects([wood, automatic, stone, time]), ([wood, time], ['Murder Holes']))

