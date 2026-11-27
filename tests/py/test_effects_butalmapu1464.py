"""#1464：马普切「布图马普（1380）」城堡独特单位（科那 2566 / 精锐科那 2568）费用补充、三重校验反例与已提交 effects.json 校验。"""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from effects_build import (  # noqa: E402
    BUTALMAPU_EFFECT_FN,
    BUTALMAPU_TECH_ID,
    CASTLE_BLD_ID,
    EFFECT_FUNCTION_RES_ID,
    castle_unique_units,
    supplement_script_cost_eco,
)


class EffectsButalmapu1464Tests(unittest.TestCase):
    def setUp(self):
        self.tech = {
            'id': BUTALMAPU_TECH_ID,
            'en': 'Butalmapu',
            'zh': '布图马普',
            'civs': ['Mapuche'],
            'desc': '团队城堡独特单位及掷石绳骑兵成本 -15%。',
            'descEn': 'Team Castle Unique Units and Bolas Riders cost -15%.',
        }
        self.base_eco = [
            {'res': EFFECT_FUNCTION_RES_ID, 'name': '资源33', 'op': 'set', 'v': BUTALMAPU_EFFECT_FN},
            {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2569], 'cls': None, 'unit': 2569},
            {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2571], 'cls': None, 'unit': 2571},
        ]
        self.trees = {
            't': {
                'Mapuche': [
                    [
                        CASTLE_BLD_ID,
                        4,
                        5,
                        [
                            [5, 0, 'u', 2566, 1, None],
                            [5, 1, 'u', 440, 1, None],
                            [5, 2, 't', 1379, 1, None],
                            [6, 0, 'u', 2568, 1, 2566],
                            [6, 1, 'u', 331, 1, None],
                            [6, 2, 't', 1380, 1, None],
                            [6, 3, 'u', 2999, 0, None],
                        ],
                    ],
                    [
                        87,
                        4,
                        5,
                        [
                            [5, 0, 'u', 2569, 1, None],
                            [6, 0, 'u', 2571, 1, 2569],
                        ],
                    ],
                    [12, 4, 5, [[1, 0, 'u', 93, 1, None]]],
                ]
            }
        }
        self.units_by_id = {
            2566: {'id': 2566, 'en': 'Kona', 'type': 'UniqueUnit', 'b': 82, 'civs': ['Mapuche']},
            2568: {'id': 2568, 'en': 'Elite Kona', 'type': 'UniqueUnit', 'b': 82, 'civs': ['Mapuche']},
            2999: {'id': 2999, 'en': 'Disabled Kona', 'type': 'UniqueUnit', 'b': 82, 'civs': ['Mapuche']},
            2569: {'id': 2569, 'en': 'Bolas Rider', 'type': 'UniqueUnit', 'b': 87, 'civs': ['Mapuche']},
            2571: {'id': 2571, 'en': 'Elite Bolas Rider', 'type': 'UniqueUnit', 'b': 87, 'civs': ['Mapuche']},
            440: {'id': 440, 'en': 'Petard', 'type': 'Unit', 'b': 82, 'civs': ['Mapuche', 'Franks']},
            331: {'id': 331, 'en': 'Trebuchet (Packed)', 'type': 'Unit', 'b': 82, 'civs': ['Mapuche', 'Franks']},
            93: {'id': 93, 'en': 'Spearman', 'type': 'Unit', 'b': 12, 'civs': ['Mapuche', 'Franks']},
        }

    def test_castle_unique_units_filters_to_available_own_castle_unique_units(self):
        self.assertEqual(castle_unique_units(self.trees, self.units_by_id, 'Mapuche'), [2566, 2568])
        self.assertEqual(castle_unique_units(self.trees, self.units_by_id, 'Franks'), [])
        # 建筑记录（_b=1）与多文明共享单位一律排除
        with_bld = copy.deepcopy(self.units_by_id)
        with_bld[2566]['_b'] = 1
        with_bld[2568]['civs'] = ['Mapuche', 'Incas']
        self.assertEqual(castle_unique_units(self.trees, with_bld, 'Mapuche'), [])

    def test_supplement_appends_kona_and_preserves_res33_and_immutability(self):
        snapshot = copy.deepcopy(self.base_eco)
        result = supplement_script_cost_eco(self.tech, self.base_eco, self.trees, self.units_by_id)
        self.assertIsNot(result, self.base_eco)
        self.assertEqual(self.base_eco, snapshot)
        self.assertEqual(
            result,
            [
                {'res': 33, 'name': '资源33', 'op': 'set', 'v': 51},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2569], 'cls': None, 'unit': 2569},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2571], 'cls': None, 'unit': 2571},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2566], 'cls': None, 'unit': 2566},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2568], 'cls': None, 'unit': 2568},
            ],
        )

    def test_supplement_deduplicates_if_unit_already_present_in_dat_eco(self):
        eco_with_2566 = self.base_eco + [{'a': 100, 'op': 'mul', 'v': 0.85, 't': [2566], 'cls': None, 'unit': 2566}]
        result = supplement_script_cost_eco(self.tech, eco_with_2566, self.trees, self.units_by_id)
        self.assertEqual([e.get('unit') for e in result if e.get('a') == 100], [2569, 2571, 2566, 2568])

    def test_supplement_fail_closed_on_each_guard(self):
        # 1. 非 1380 科技
        other_tech = {**self.tech, 'id': 1379}
        self.assertEqual(supplement_script_cost_eco(other_tech, self.base_eco, self.trees, self.units_by_id), self.base_eco)

        # 2. 非 Mapuche 单文明
        for bad_civs in ([], ['Franks'], ['Mapuche', 'Incas']):
            t = {**self.tech, 'civs': bad_civs}
            self.assertEqual(supplement_script_cost_eco(t, self.base_eco, self.trees, self.units_by_id), self.base_eco)

        # 3. 中英文官方说明缺 -15%
        for field in ('desc', 'descEn'):
            t = {**self.tech, field: '团队城堡独特单位及掷石绳骑兵成本降低。'}
            self.assertEqual(supplement_script_cost_eco(t, self.base_eco, self.trees, self.units_by_id), self.base_eco)

        # 4. 缺失或偏离 res:33 set 51（含 bool / NaN / Inf）
        for bad_res in (
            [],
            [{'res': 33, 'name': '资源33', 'op': 'add', 'v': 51}],
            [{'res': 33, 'name': '资源33', 'op': 'set', 'v': 52}],
            [{'res': 33, 'name': '资源33', 'op': 'set', 'v': True}],
            [{'res': 33, 'name': '资源33', 'op': 'set', 'v': float('nan')}],
            [{'res': 33, 'name': '资源33', 'op': 'set', 'v': float('inf')}],
        ):
            eco = bad_res + self.base_eco[1:]
            self.assertEqual(supplement_script_cost_eco(self.tech, eco, self.trees, self.units_by_id), eco)

        # 5. 缺失或偏离 a:100 mul 0.85（含非 mul、混合倍率、bool / NaN / Inf）
        for bad_cost in (
            [],
            [{'a': 100, 'op': 'mul', 'v': 0.8, 't': [2569], 'cls': None, 'unit': 2569}],
            [
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2569], 'cls': None, 'unit': 2569},
                {'a': 100, 'op': 'mul', 'v': 0.8, 't': [2571], 'cls': None, 'unit': 2571},
            ],
            [
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2569], 'cls': None, 'unit': 2569},
                {'a': 100, 'op': 'add', 'v': -5, 't': [2571], 'cls': None, 'unit': 2571},
            ],
            [{'a': 100, 'op': 'mul', 'v': True, 't': [2569], 'cls': None, 'unit': 2569}],
            [{'a': 100, 'op': 'mul', 'v': float('nan'), 't': [2569], 'cls': None, 'unit': 2569}],
            [{'a': 100, 'op': 'mul', 'v': float('inf'), 't': [2569], 'cls': None, 'unit': 2569}],
        ):
            eco = [self.base_eco[0]] + bad_cost
            self.assertEqual(supplement_script_cost_eco(self.tech, eco, self.trees, self.units_by_id), eco)

        # 6. 城堡树无可推导独特单位
        empty_trees = {'t': {'Mapuche': []}}
        self.assertEqual(supplement_script_cost_eco(self.tech, self.base_eco, empty_trees, self.units_by_id), self.base_eco)

    def test_committed_effects_json_has_butalmapu_kona_cost_entries(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        butalmapu = fx['techs']['Butalmapu']
        self.assertEqual(butalmapu['id'], 1380)
        self.assertEqual(butalmapu['rules'], [])
        self.assertEqual(
            butalmapu['eco'],
            [
                {'res': 33, 'name': '资源33', 'op': 'set', 'v': 51},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2569], 'cls': None, 'unit': 2569},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2571], 'cls': None, 'unit': 2571},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2566], 'cls': None, 'unit': 2566},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [2568], 'cls': None, 'unit': 2568},
            ],
        )
        cost_targets = {uid for e in butalmapu['eco'] for uid in (e.get('t') or ())}
        for excluded in (93, 440, 331):
            self.assertNotIn(excluded, cost_targets)


if __name__ == '__main__':
    unittest.main()
