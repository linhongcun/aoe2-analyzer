"""Issue 1497：effects_build.py 零本文明可拥有目标规则标记（rulesUnowned）与 freshness 过滤回归测试。"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import effects_build  # noqa: E402


class TestEffectsUnownedRules1497(unittest.TestCase):
    def test_rules_have_owned_target_unit_and_building_boundaries(self):
        ours = {
            5: {'id': 5, 'en': 'Hand Cannoneer', 'civs': ['Italians', 'Burgundians']},
            1901: {'id': 1901, 'en': 'Fire Lancer', 'civs': ['Chinese', 'Khitans']},
            70: {'id': 70, 'en': 'House', '_b': 1, 'civs': ['Britons', 'Italians']},
        }
        # 全部为非本文明单位 -> False
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [1901], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.25}]}], 'Italians', ours))
        # 混合拥有与非拥有 -> True（类似 Burgundians-3）
        self.assertTrue(effects_build.rules_have_owned_target([{'t': [5, 1901], 'fx': [{'s': 'atk', 'op': 'mul', 'v': 1.25}]}], 'Burgundians', ours))
        # 建筑目标且本文明不可建造 -> False（类似 Huns-0 House 70）
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [70], 'b': 1, 'fx': [{'s': 'hp', 'op': 'set', 'v': -1}]}], 'Huns', ours))
        # 建筑目标且本文明可建造 -> True
        self.assertTrue(effects_build.rules_have_owned_target([{'t': [70], 'b': 1, 'fx': [{'s': 'hp', 'op': 'add', 'v': 50}]}], 'Britons', ours))
        # 建筑标志不匹配（对建筑 id 缺 b=1 或对单位 id 误标 b=1）-> False
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [70], 'fx': [{'s': 'hp', 'op': 'add', 'v': 50}]}], 'Britons', ours))
        self.assertFalse(effects_build.rules_have_owned_target([{'t': [5], 'b': 1, 'fx': [{'s': 'hp', 'op': 'add', 'v': 50}]}], 'Italians', ours))
        # 空 rules -> False
        self.assertFalse(effects_build.rules_have_owned_target([], 'Italians', ours))

    def test_freshness_skips_unowned_rules_but_keeps_eco(self):
        entry = {
            'age': 4,
            'rulesUnowned': True,
            'rules': [{'t': [1901], 'fx': [{'s': 'hp', 'op': 'mul', 'v': 1.9}]}],
            'eco': [{'a': 100, 'op': 'mul', 'v': 0.8, 't': [5], 'cls': None, 'unit': 5}],
        }
        fr = effects_build.freshness('Gunpowder Units cost -20%', [entry])
        self.assertEqual(fr, {'ok': True, 'dat': [[20, 25]], 'text': [20.0]})

        # 若未标记 rulesUnowned，则 hp ×1.9 会导致 freshness 不一致（防假绿）
        entry_owned = dict(entry)
        entry_owned.pop('rulesUnowned')
        fr_owned = effects_build.freshness('Gunpowder Units cost -20%', [entry_owned])
        self.assertIs(fr_owned['ok'], False)

    def test_committed_effects_json_unowned_invariants(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        units = {u['id']: u for u in json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))}
        blds = {b['id']: dict(b, _b=1) for b in json.loads((ROOT / 'data/game/buildings.json').read_text(encoding='utf-8'))}
        ours = {**units, **blds}

        flagged = []
        computed_unowned = []
        for civ_en, rec in sorted(fx['civs'].items()):
            for sec in ('bonus', 'conditional'):
                for e in rec.get(sec, []):
                    if e.get('rulesUnowned'):
                        flagged.append((civ_en, sec, e['tech'], e['idx']))
                    if e['rules'] and not effects_build.rules_have_owned_target(e['rules'], civ_en, ours):
                        computed_unowned.append((civ_en, sec, e['tech'], e['idx']))

        expected = [('Huns', 'bonus', 289, 0), ('Italians', 'bonus', 500, 3)]
        self.assertEqual(flagged, expected)
        self.assertEqual(computed_unowned, expected)

        # 保留原始 rules 与 eco 不删改，且 Italians fresh['3'] 仅保留 eco 项
        it500 = next(e for e in fx['civs']['Italians']['bonus'] if e['tech'] == 500)
        self.assertEqual(it500['rules'][0]['t'], [1901, 1903, 1904, 1907, 1911])
        self.assertEqual([x['unit'] for x in it500['eco']], [5, 36, 420, 691, 1709])
        self.assertEqual(fx['civs']['Italians']['fresh']['3'], {'ok': True, 'dat': [[20, 25]], 'text': [20.0]})

        hun289 = next(e for e in fx['civs']['Huns']['bonus'] if e['tech'] == 289)
        self.assertEqual(hun289['rules'][0]['t'], [70])
        self.assertEqual(hun289['rules'][0].get('b'), 1)

        bur769 = next(e for e in fx['civs']['Burgundians']['bonus'] if e['tech'] == 769)
        self.assertNotIn('rulesUnowned', bur769)


if __name__ == '__main__':
    unittest.main()
