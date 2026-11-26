"""#1323：units_build 保留显式零值攻击类别、保序去重守卫、可离线导入性与已提交 units.json 不变量。"""
import importlib
import json
import os
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = str(ROOT / 'scripts')
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)


class UnitsZeroAttacks1323(unittest.TestCase):
    def test_import_units_build_is_offline_and_side_effect_free(self):
        # 即使无 AOE_CACHE 且阻断 PIL，导入 units_build 也不得读盘、写盘或报错
        with mock.patch.dict(os.environ, {}, clear=True):
            sys.modules.pop('units_build', None)
            with mock.patch.dict(sys.modules, {'PIL': None, 'PIL.Image': None}):
                mod = importlib.import_module('units_build')
        self.assertTrue(callable(mod.attack_pairs))
        self.assertTrue(callable(mod.combat_stats))

    def test_attack_pairs_preserves_zero_maps_class14_and_dedups_in_order(self):
        import units_build as ub

        # 保留显式 0 并维持原始顺序
        self.assertEqual(
            ub.attack_pairs([
                {'Class': 21, 'Amount': 0},
                {'Class': 3, 'Amount': 2},
                {'Class': 28, 'Amount': 0},
                {'Class': 39, 'Amount': -3},
            ]),
            [['标准建筑', 0], ['穿刺', 2], ['骑射手', 0], ['骑乘减伤', -3]],
        )
        # 类别 14 译为掠食动物；未知类别回退「类别N」
        self.assertEqual(
            ub.attack_pairs([{'Class': 14, 'Amount': 0}, {'Class': 999, 'Amount': 0}]),
            [['掠食动物', 0], ['类别999', 0]],
        )
        # 同类别 (非零, 0) 保序保留非零（例：41 近卫军弓手 6, 0）
        self.assertEqual(
            ub.attack_pairs([
                {'Class': 15, 'Amount': 6},
                {'Class': 4, 'Amount': 10},
                {'Class': 15, 'Amount': 0},
            ]),
            [['弓手', 6], ['近战', 10]],
        )
        # 同类别 (0, 非零) 在首次出现位置提升为非零
        self.assertEqual(
            ub.attack_pairs([
                {'Class': 15, 'Amount': 0},
                {'Class': 4, 'Amount': 10},
                {'Class': 15, 'Amount': 6},
            ]),
            [['弓手', 6], ['近战', 10]],
        )
        # 同类别 (0, 0) 折叠为单条 0（例：1370 草原枪兵攻城武器 0, 0）
        self.assertEqual(
            ub.attack_pairs([
                {'Class': 4, 'Amount': 9},
                {'Class': 20, 'Amount': 0},
                {'Class': 11, 'Amount': 0},
                {'Class': 20, 'Amount': 0},
            ]),
            [['近战', 9], ['攻城武器', 0], ['所有建筑', 0]],
        )
        # 同类别双非零必须立即抛出 ValueError，防止静默覆盖
        for bad in (
            [{'Class': 20, 'Amount': 5}, {'Class': 20, 'Amount': 8}],
            [{'Class': 20, 'Amount': 5}, {'Class': 20, 'Amount': 5}],
            [{'Class': 20, 'Amount': -3}, {'Class': 20, 'Amount': 5}],
        ):
            with self.assertRaises(ValueError):
                ub.attack_pairs(bad)

    def test_combat_stats_uses_attack_pairs_without_changing_armor_contract(self):
        import units_build as ub

        row = {
            'HP': 40,
            'Attack': 11,
            'MeleeArmor': 0,
            'PierceArmor': 7,
            'Range': 7,
            'MinRange': 2,
            'Speed': 0.65,
            'LineOfSight': 9,
            'ReloadTime': 3.6,
            'AccuracyPercent': 100,
            'BlastWidth': 0,
            'Attacks': [
                {'Class': 4, 'Amount': 0},
                {'Class': 3, 'Amount': 11},
                {'Class': 17, 'Amount': 1},
            ],
            'Armours': [
                {'Class': 4, 'Amount': 0},
                {'Class': 3, 'Amount': 7},
                {'Class': 20, 'Amount': 0},
            ],
        }
        stats = ub.combat_stats(row)
        self.assertEqual(stats['atks'], [['近战', 0], ['穿刺', 11], ['冲车', 1]])
        self.assertEqual(stats['arms'], [['近战', 0], ['穿刺', 7]])
        self.assertEqual(stats['armc'], [['攻城武器', 0]])
        self.assertEqual(stats['cls'], [3, 4, 20])

    def test_committed_units_json_invariants(self):
        units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        by_id = {u['id']: u for u in units}
        self.assertEqual(len(units), 248)

        # 215 个目录单位与全部 7 个副形态含至少 1 条显式 0 攻击类别
        zero_units = [u['id'] for u in units if any(amount == 0 for _, amount in u['atks'])]
        forms = [u['form'] for u in units if 'form' in u]
        zero_forms = [f['id'] for f in forms if any(amount == 0 for _, amount in f['atks'])]
        self.assertEqual(len(zero_units), 215)
        self.assertEqual(len(forms), 7)
        self.assertEqual(len(zero_forms), 7)

        # 所有单位及副形态的攻击类别均无重复、无「类别N」未映射名
        for item in units + forms:
            names = [name for name, _ in item['atks']]
            self.assertEqual(len(names), len(set(names)), f"duplicate attack class on {item['id']}")
            for name in names:
                self.assertIsNone(re.fullmatch(r'类别\d+', name), f"unmapped attack class {name} on {item['id']}")

        # 精确 4 个双基础类单位：均为显式 0 近战 + 正穿刺
        dual_base = sorted(
            u['id']
            for u in units
            if {'近战', '穿刺'}.issubset({name for name, _ in u['atks']})
        )
        self.assertEqual(dual_base, [73, 279, 542, 559])
        for uid in dual_base:
            atk_map = dict(by_id[uid]['atks'])
            self.assertEqual(atk_map['近战'], 0)
            self.assertGreater(atk_map['穿刺'], 0)

        # 关键代表单位与 9 个重复类别去重结果抽核
        self.assertIn(['骑射手', 0], by_id[7]['atks'])
        self.assertIn(['骑射手', 0], by_id[1010]['atks'])
        self.assertIn(['近战', 0], by_id[279]['atks'])
        self.assertIn(['穿刺', 11], by_id[279]['atks'])
        self.assertIn(['掠食动物', 0], by_id[83]['atks'])

        dedup_expected = {
            41: ('弓手', 6),
            869: ('攻城武器', 5),
            871: ('攻城武器', 8),
            1744: ('攻城武器', 25),
            1746: ('攻城武器', 35),
            1923: ('攻城武器', 30),
            1370: ('攻城武器', 0),
            1372: ('攻城武器', 0),
            1944: ('攻城武器', 0),
        }
        for uid, (cls_name, expected_val) in dedup_expected.items():
            self.assertEqual(dict(by_id[uid]['atks'])[cls_name], expected_val, f'dedup mismatch on {uid}')


if __name__ == '__main__':
    unittest.main()
