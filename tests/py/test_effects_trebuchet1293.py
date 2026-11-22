"""#1293：展开态巨型投石机（42 → 331）别名映射、去重守卫、建筑 main_atk 防回归与已提交 effects.json 校验。"""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from effects_build import (  # noqa: E402
    UNIT_FORM_ALIASES,
    cmd_dedup_key,
    filter_aliased_cmds,
    main_atk,
    resolve_unit_alias,
)


class EffectsTrebuchet1293(unittest.TestCase):
    def setUp(self):
        self.ours = {
            331: {'id': 331, 'en': 'Trebuchet (Packed)'},
            1923: {'id': 1923, 'en': 'Mounted Trebuchet'},
            1942: {'id': 1942, 'en': 'Traction Trebuchet'},
        }
        self.dcls = {331: 51, 1923: 12, 1942: 13}

    def test_main_atk_handles_building_object_atks_without_key_error(self):
        # 上游 #1238 后 data/game/buildings.json 的 atks 为对象数组
        building = {
            'id': 45,
            '_b': 1,
            'atks': [{'classId': 16, 'amount': 0, 'label': '船只'}, {'classId': 3, 'amount': 5, 'label': '穿刺'}],
        }
        self.assertEqual(main_atk(building), 3)
        self.assertEqual(main_atk({'id': 331, 'atks': [['所有建筑', 250], ['穿刺', 200]]}), 3)
        self.assertEqual(main_atk({'id': 38, 'atks': [['近战', 10]]}), 4)
        self.assertIsNone(main_atk({'id': 125, 'atks': []}))

    def test_resolve_unit_alias_and_huns_accuracy_guard(self):
        self.assertEqual(UNIT_FORM_ALIASES, {42: 331})
        self.assertEqual(resolve_unit_alias(42, 11, 'set'), 331)
        self.assertEqual(resolve_unit_alias(42, 22, 'add'), 331)
        self.assertEqual(resolve_unit_alias(42, 10, 'mul'), 331)
        self.assertEqual(resolve_unit_alias(42, 13, 'mul'), 331)
        # 匈奴科技树 448 对 42 相对加准确度 +35：不能叠加到打包记录 92% 上
        self.assertIsNone(resolve_unit_alias(42, 11, 'add'))
        self.assertIsNone(resolve_unit_alias(42, 11, 'mul'))
        # 非别名 ID 原样返回
        for uid in (331, 1923, 1942, -1):
            self.assertEqual(resolve_unit_alias(uid, 11, 'add'), uid)

    def test_non_attribute_cmds_with_a_42_pass_through_and_input_is_not_mutated(self):
        cmds = [
            (1, 42, 1, 0, 10.0),      # 资源修改（A 为资源号）
            (6, 42, -1, 0, 1.5),      # 资源乘数
            (11, 42, 1, 0, 5.0),      # 团队资源修改
            (16, 42, -1, 0, 2.0),     # 团队资源乘数
            (101, 42, 0, 1, -50.0),   # 科技费用（A 为科技号）
            (103, 42, -1, 2, 0.5),    # 科技研究时间（A 为科技号）
            (2, 42, 1, -1, 0.0),      # 启用单位
            (3, 42, 331, -1, 0.0),    # 单位替换
            (102, 42, -1, -1, 42.0),  # 禁用科技
            (201, 42, -1, 9, 769.0),  # 其他引擎指令
        ]
        snapshot = copy.deepcopy(cmds)
        result = filter_aliased_cmds(cmds, self.ours, self.dcls)
        self.assertIsNot(result, cmds)
        self.assertEqual(cmds, snapshot)
        self.assertEqual(result, snapshot)

    def test_forward_and_reverse_order_dedup_against_direct_unit_and_class_51(self):
        # 正向：331 在前、42 在后
        fwd_unit = [(4, 331, -1, 12, 2.0), (4, 42, -1, 12, 2.0)]
        self.assertEqual(filter_aliased_cmds(fwd_unit, self.ours, self.dcls), [(4, 331, -1, 12, 2.0)])
        # 反向：42 在前、331 在后
        rev_unit = [(4, 42, -1, 12, 2.0), (4, 331, -1, 12, 2.0)]
        self.assertEqual(filter_aliased_cmds(rev_unit, self.ours, self.dcls), [(4, 331, -1, 12, 2.0)])
        # 反向：42 在前、Class 51 在后（覆盖 combat 与 eco）
        rev_cls = [(5, 42, -1, 0, 1.4), (5, -1, 51, 0, 1.4), (4, 42, -1, 22, 0.5), (4, -1, 51, 22, 0.5)]
        self.assertEqual(
            filter_aliased_cmds(rev_cls, self.ours, self.dcls),
            [(5, -1, 51, 0, 1.4), (4, -1, 51, 22, 0.5)],
        )

    def test_team_variants_guard_and_cross_variant_dedup(self):
        # 团队变体 Type=14（add）命中匈奴准确度守卫
        self.assertEqual(filter_aliased_cmds([(14, 42, -1, 11, 35.0)], self.ours, self.dcls), [])
        # 团队变体 Type=15（mul）无直接命中时正常改写为 331
        self.assertEqual(
            filter_aliased_cmds([(15, 42, -1, 10, 0.75)], self.ours, self.dcls),
            [(15, 331, -1, 10, 0.75)],
        )
        # 跨变体去重：普通 Type=4 与团队 Type=14（正反顺序）
        self.assertEqual(
            filter_aliased_cmds([(14, 42, -1, 1, 2.0), (4, 331, -1, 1, 2.0)], self.ours, self.dcls),
            [(4, 331, -1, 1, 2.0)],
        )
        self.assertEqual(
            filter_aliased_cmds([(4, 42, -1, 1, 2.0), (14, -1, 51, 1, 2.0)], self.ours, self.dcls),
            [(14, -1, 51, 1, 2.0)],
        )

    def test_attack_and_armor_class_dedup_positive_negative_and_mul(self):
        # attr 9 攻防编码：cls=3(+1)->769, cls=4(+1)->1025; 负加值：cls=3(-1)->-769, cls=4(-1)->-1025
        # 乘法：cls=11(×1.15)->2931, cls=3(×1.15)->883
        self.assertEqual(cmd_dedup_key(4, 9, 769.0), (4, 9, 3))
        self.assertEqual(cmd_dedup_key(4, 9, -769.0), (4, 9, 3))
        self.assertEqual(cmd_dedup_key(4, 8, -1025.0), (4, 8, 4))
        self.assertEqual(cmd_dedup_key(5, 9, 2931.0), (5, 9, 11))
        self.assertEqual(cmd_dedup_key(5, 9, 883.0), (5, 9, 3))

        cmds = [
            (4, 331, -1, 9, 769.0),   # 直接命中 cls=3 正加值
            (4, 42, -1, 9, 769.0),    # 同类 -> 去重跳过
            (4, 42, -1, 9, 1025.0),   # 异类 cls=4 -> 保留
            (4, 331, -1, 8, -769.0),  # 直接命中 cls=3 负加值
            (4, 42, -1, 8, -769.0),   # 同类 -> 去重跳过
            (4, 42, -1, 8, -1025.0),  # 异类 cls=4 -> 保留
            (5, -1, 51, 9, 2931.0),   # 类别直接命中 cls=11 乘法
            (5, 42, -1, 9, 2931.0),   # 同类 -> 去重跳过
            (5, 42, -1, 9, 883.0),    # 异类 cls=3 -> 保留
        ]
        self.assertEqual(
            filter_aliased_cmds(cmds, self.ours, self.dcls),
            [
                (4, 331, -1, 9, 769.0),
                (4, 331, -1, 9, 1025.0),
                (4, 331, -1, 8, -769.0),
                (4, 331, -1, 8, -1025.0),
                (5, -1, 51, 9, 2931.0),
                (5, 331, -1, 9, 883.0),
            ],
        )

    def test_multiple_alias_only_commands_are_not_swallowed(self):
        cmds = [(4, 42, -1, 12, 1.0), (4, 42, -1, 12, 1.0)]
        self.assertEqual(
            filter_aliased_cmds(cmds, self.ours, self.dcls),
            [(4, 331, -1, 12, 1.0), (4, 331, -1, 12, 1.0)],
        )

    def test_real_dat_samples_warwolf_kataparuto_huns(self):
        warwolf = [
            (4, 42, -1, 22, 0.5),
            (0, 42, -1, 11, 100.0),
            (4, 1923, -1, 22, 0.5),
            (4, 1942, -1, 22, 0.5),
            (0, 1942, -1, 11, 100.0),
        ]
        self.assertEqual(
            filter_aliased_cmds(warwolf, self.ours, self.dcls),
            [
                (4, 331, -1, 22, 0.5),
                (0, 331, -1, 11, 100.0),
                (4, 1923, -1, 22, 0.5),
                (4, 1942, -1, 22, 0.5),
                (0, 1942, -1, 11, 100.0),
            ],
        )
        kataparuto = [
            (5, 42, -1, 13, 4.0),
            (5, 42, -1, 10, 0.75),
            (5, 1942, -1, 10, 0.75),
            (5, 1923, -1, 10, 0.75),
        ]
        self.assertEqual(
            filter_aliased_cmds(kataparuto, self.ours, self.dcls),
            [
                (5, 331, -1, 13, 4.0),
                (5, 331, -1, 10, 0.75),
                (5, 1942, -1, 10, 0.75),
                (5, 1923, -1, 10, 0.75),
            ],
        )
        huns_tt = [(1, 4, 1, 0, 2000.0), (4, 42, -1, 11, 35.0)]
        self.assertEqual(
            filter_aliased_cmds(huns_tt, self.ours, self.dcls),
            [(1, 4, 1, 0, 2000.0)],
        )

    def test_committed_effects_json_matches_expected_trebuchet_mapping(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        warwolf = fx['techs']['Warwolf']
        self.assertEqual(warwolf['id'], 461)
        self.assertEqual(warwolf['rules'], [{'t': [331, 1942], 'fx': [{'op': 'set', 's': 'acc', 'v': 100}]}])
        self.assertIn({'a': 22, 'op': 'add', 'v': 0.5, 't': [331], 'cls': None, 'unit': 331}, warwolf['eco'])
        self.assertEqual([e['unit'] for e in warwolf['eco']], [331, 1923, 1942])

        kataparuto = fx['techs']['Kataparuto']
        self.assertEqual(kataparuto['id'], 59)
        self.assertEqual(kataparuto['rules'], [{'t': [331, 1923, 1942], 'fx': [{'s': 'rof', 'v': 0.333333}]}])
        self.assertEqual(kataparuto['eco'], [{'a': 13, 'op': 'mul', 'v': 4, 't': [331], 'cls': None, 'unit': 331}])

        for unrelated in ('Torsion Engines', 'Drill'):
            entry = fx['techs'][unrelated]
            rule_ids = {i for r in entry['rules'] for i in r['t']}
            eco_ids = {i for e in entry['eco'] for i in (e.get('t') or [])}
            self.assertNotIn(331, rule_ids)
            self.assertNotIn(331, eco_ids)

        huns = fx['civs']['Huns']
        self.assertFalse(any(331 in r['t'] for b in huns['bonus'] for r in b['rules']))
        tt1 = next(b for b in huns['bonus'] if b['tech'] == -1)
        self.assertEqual(tt1['idx'], 0)
        self.assertEqual(tt1['linked'], 'manual')
        self.assertEqual(tt1['eco'], [{'res': 4, 'name': '人口上限', 'op': 'add', 'v': 2000}])


if __name__ == '__main__':
    unittest.main()
