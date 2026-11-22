"""#1328：弹道学（科技 93）弹丸适用性与蓄力限定推导离线单测。

覆盖：
1. scripts/dat_source.py 导出 ChargeProjectile/ChargeEvent/RechargeRate 且缓存版本升级至 dat.v21；
2. scripts/projectile_scope.py 纯函数行为与 fail-closed 守卫（非字典命令、A < 0、陈旧缓存缺字段）；
3. scripts/army_research_build.build() 排除 COMBAT_ATTRS 直接命中后再写 chargeOnlyCombatUnits；
4. 已提交 data/game/effects.json 与 data/game/army_research.json 的 248 单位/1,510 科技全量不变量。
"""
import inspect
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import army_research_build  # noqa: E402
import dat_source  # noqa: E402
from projectile_scope import (  # noqa: E402
    guided_projectile_ids,
    is_regular_cooldown_charge,
    split_projectile_units,
    transform_closure,
)


def make_dat_unit(
    *,
    cls=0,
    p1=-1,
    p2=-1,
    pc=-1,
    ce=0,
    rr=0,
    transform=-1,
):
    return {
        'Class': cls,
        'Projectiles': [p1, p2],
        'ChargeProjectile': pc,
        'ChargeEvent': ce,
        'RechargeRate': rr,
        'Transform': transform,
    }


class BallisticsScope1328Tests(unittest.TestCase):
    def test_dat_source_exports_charge_fields_and_bumps_cache_to_v21(self):
        self.assertIn("'ChargeProjectile': u.creatable.charge_projectile_unit if u.creatable else -1", dat_source._DUMP)
        self.assertIn("'ChargeEvent': u.creatable.charge_event if u.creatable else 0", dat_source._DUMP)
        self.assertIn("'RechargeRate': u.creatable.recharge_rate if u.creatable else 0", dat_source._DUMP)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v21.%s.json', parse_src)
        self.assertNotIn('dat.v20.%s.json', parse_src)

    def test_is_regular_cooldown_charge_matches_unit_charge_predicate_and_fails_closed(self):
        # 2705 / 2706 扈从部队：常规冷却蓄力
        self.assertTrue(is_regular_cooldown_charge({'ChargeEvent': 6, 'RechargeRate': 0.067}))
        self.assertTrue(is_regular_cooldown_charge({'ChargeEvent': 6, 'RechargeRate': 0.083}))
        # 1901 火矛兵 / 1103 火艨艟 / 831 龟甲船：常规冷却参数
        self.assertTrue(is_regular_cooldown_charge({'ChargeEvent': 4, 'RechargeRate': 0.03333}))
        self.assertTrue(is_regular_cooldown_charge({'ChargeEvent': 0, 'RechargeRate': 0.04}))
        self.assertTrue(is_regular_cooldown_charge({'ChargeEvent': 0, 'RechargeRate': 0.17}))
        # 1948 楼船：非常规双模式槽位（ce=-3, rr=100000）
        self.assertFalse(is_regular_cooldown_charge({'ChargeEvent': -3, 'RechargeRate': 100000}))
        # 2711 / 2712 约姆斯维京：rr=100000
        self.assertFalse(is_regular_cooldown_charge({'ChargeEvent': 3, 'RechargeRate': 100000}))
        # 边界值：ChargeEvent < 0 或 RechargeRate >= 1000 均判非常规
        self.assertFalse(is_regular_cooldown_charge({'ChargeEvent': -1, 'RechargeRate': 0.1}))
        self.assertFalse(is_regular_cooldown_charge({'ChargeEvent': 0, 'RechargeRate': 1000}))
        # 缺字段 fail-closed
        with self.assertRaises(KeyError):
            is_regular_cooldown_charge({'ChargeEvent': 6})
        with self.assertRaises(KeyError):
            is_regular_cooldown_charge({'RechargeRate': 0.067})

    def test_guided_projectile_ids_accepts_raw_dicts_and_fails_closed_on_tuples_or_class_cmds(self):
        raw_cmds = [
            {'Type': 0, 'A': 361, 'B': -1, 'C': 19, 'D': 1.0},
            {'Type': 4, 'A': 2702, 'B': -1, 'C': 19, 'D': 1.0},
            {'Type': 5, 'A': 1936, 'B': -1, 'C': 19, 'D': 3.0},
            {'Type': 0, 'A': 500, 'B': -1, 'C': 12, 'D': 1.0},  # 非目标属性
            {'Type': 1, 'A': 999, 'B': 0, 'C': 19, 'D': 1.0},  # 非属性命令
        ]
        self.assertEqual(guided_projectile_ids(raw_cmds, attrs=(19,)), {361, 1936, 2702})
        # 拒绝 effects_build.a_cmds() 五元组
        with self.assertRaises(TypeError):
            guided_projectile_ids([(0, 361, -1, 19, 1.0)], attrs=(19,))
        # 拒绝按类别生效（A < 0）
        with self.assertRaises(ValueError):
            guided_projectile_ids([{'Type': 0, 'A': -1, 'B': 15, 'C': 19, 'D': 1.0}], attrs=(19,))

    def test_split_projectile_units_archetypes_transforms_and_fail_closed(self):
        # 构造覆盖全部 7 类代表性原型的最小离线 dat_units 表
        dat_units = [None] * 2800
        dat_units[4] = make_dat_unit(p1=361)  # 步弓手：主弹丸命中
        dat_units[1952] = make_dat_unit(p1=1981, pc=1982, ce=6, rr=0.05)  # 主 + 蓄力双命中 → 常规适用
        dat_units[2705] = make_dat_unit(pc=2702, ce=6, rr=0.067)  # 扈从部队：仅常规冷却蓄力命中
        dat_units[2706] = make_dat_unit(pc=2707, ce=6, rr=0.083)  # 精锐扈从部队：仅常规冷却蓄力命中
        dat_units[1948] = make_dat_unit(p1=1938, p2=1934, pc=1936, ce=-3, rr=100000)  # 楼船：非常规源值 → 常规适用
        dat_units[2711] = make_dat_unit(pc=2713, ce=3, rr=100000)  # 约姆斯维京：未命中
        dat_units[1901] = make_dat_unit(pc=1925, ce=4, rr=0.03333)  # 火矛兵：未命中
        dat_units[1103] = make_dat_unit(p1=676, p2=676, pc=2629, ce=0, rr=0.04)  # 火艨艟：未命中
        dat_units[831] = make_dat_unit(p1=1906, pc=767, ce=0, rr=0.17)  # 龟甲船：未命中
        # 双向 Transform 形态闭包：331（目录）<-> 42（展开态，命中主弹丸）
        dat_units[331] = make_dat_unit(transform=42)
        dat_units[42] = make_dat_unit(p1=999, transform=331)

        catalog = [{'id': uid} for uid in (4, 331, 831, 1103, 1901, 1948, 1952, 2705, 2706, 2711)]
        forms = transform_closure(dat_units, [u['id'] for u in catalog])
        self.assertEqual(forms[331], {42, 331})

        guided = {361, 999, 1936, 1981, 1982, 2702, 2707}
        all_ids, charge_only = split_projectile_units(dat_units, forms, catalog, guided)
        self.assertEqual(all_ids, [4, 331, 1948, 1952, 2705, 2706])
        self.assertEqual(charge_only, [2705, 2706])

        # 陈旧缓存缺 ChargeProjectile 或 Projectiles 必须 fail-closed
        stale_missing_pc = list(dat_units)
        stale_missing_pc[2705] = {'Projectiles': [-1, -1], 'ChargeEvent': 6, 'RechargeRate': 0.067, 'Transform': -1}
        with self.assertRaises(KeyError):
            split_projectile_units(stale_missing_pc, forms, [{'id': 2705}], guided)

        stale_missing_proj = list(dat_units)
        stale_missing_proj[4] = {'ChargeProjectile': -1, 'ChargeEvent': 0, 'RechargeRate': 0, 'Transform': -1}
        with self.assertRaises(KeyError):
            split_projectile_units(stale_missing_proj, forms, [{'id': 4}], guided)

    def test_army_research_build_excludes_direct_combat_attr_from_charge_only(self):
        # 同一科技既通过属性 19 命中 2705/2706 的蓄力弹丸，又通过 COMBAT_ATTRS（如攻击力 C=9）直接命中 2705：
        # 2705 不得进入 chargeOnlyCombatUnits，2706 保留在 chargeOnlyCombatUnits。
        units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        max_uid = max(u['id'] for u in units) + 1
        dat_units = [make_dat_unit() for _ in range(max_uid)]
        dat_units[2705] = make_dat_unit(cls=6, pc=2702, ce=6, rr=0.067)
        dat_units[2706] = make_dat_unit(cls=6, pc=2707, ce=6, rr=0.083)
        dat_units[1948] = make_dat_unit(cls=22, p1=1938, p2=1934, pc=1936, ce=-3, rr=100000)

        fake_dat = {
            'Techs': [
                {
                    'Name': 'Synthetic Guided + Direct',
                    'EffectID': 0,
                    'Civ': -1,
                    'RequiredTechs': [],
                    'RequiredTechCount': 0,
                    'ResearchLocation': 209,
                    'ResearchTime': 60,
                    'Cost': [[1, 300, 1]],
                }
            ],
            'Effects': [
                {
                    'Name': 'Synthetic',
                    'EffectCommands': [
                        {'Type': 0, 'A': 2702, 'B': -1, 'C': 19, 'D': 1.0},
                        {'Type': 0, 'A': 2707, 'B': -1, 'C': 19, 'D': 1.0},
                        {'Type': 0, 'A': 1936, 'B': -1, 'C': 19, 'D': 3.0},
                        {'Type': 4, 'A': 2705, 'B': -1, 'C': 9, 'D': 1025.0},  # 直接修改 2705 攻击力
                    ],
                }
            ],
            'Civs': [
                {'Name': 'Gaia', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
                {'Name': 'British', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
            ],
            'BuildTech': {},
        }
        built = army_research_build.build(fake_dat)
        node = built['nodes']['0']
        self.assertEqual(node['combatUnits'], [1948, 2705, 2706])
        self.assertEqual(node['chargeOnlyCombatUnits'], [2706])

    def test_committed_artifacts_match_ballistics_and_1510_tech_invariants(self):
        fx = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        ar = json.loads((ROOT / 'data/game/army_research.json').read_text(encoding='utf-8'))
        units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))

        # 1. #746 不变量：techs.Ballistics 的 rules / eco 保持空数组
        self.assertEqual(fx['techs']['Ballistics']['id'], 93)
        self.assertEqual(fx['techs']['Ballistics']['rules'], [])
        self.assertEqual(fx['techs']['Ballistics']['eco'], [])

        # 2. effects.json 顶层 ballistics 与 army_research.json 节点 93 100% 一致
        b_units = fx['ballistics']['units']
        b_charge_only = fx['ballistics']['chargeOnly']
        node93 = ar['nodes']['93']
        self.assertEqual(b_units, sorted(set(b_units)))
        self.assertEqual(len(b_units), 66)
        self.assertEqual(b_units, node93['combatUnits'])
        self.assertEqual(b_charge_only, [2705, 2706])
        self.assertEqual(b_charge_only, node93['chargeOnlyCombatUnits'])
        self.assertTrue(set(b_charge_only).issubset(set(b_units)))

        # 3. 具名正反例与 1948 楼船常规适用
        for uid in (4, 24, 39, 279, 539, 1911, 1948, 1952, 1968, 2569, 2705, 2706):
            self.assertIn(uid, b_units, f'unit {uid} should be in ballistics.units')
        self.assertNotIn(1948, b_charge_only)
        for uid in (5, 36, 46, 125, 280, 281, 282, 331, 529, 532, 775, 831, 832, 1103, 1302, 1901, 1903, 2711, 2712):
            self.assertNotIn(uid, b_units, f'unit {uid} must not be in ballistics.units')

        # 4. 248 目录单位四类划分精确守恒（64 常规 + 2 仅蓄力 + 41 移除误报 + 141 近战未命中 = 248）
        self.assertEqual(len(units), 248)
        unit_set = set(b_units)
        removed_fp = [u['id'] for u in units if u['rng'] > 1 and u['id'] not in unit_set]
        melee_excluded = [u['id'] for u in units if u['rng'] <= 1 and u['id'] not in unit_set]
        self.assertEqual(len(removed_fp), 41)
        self.assertEqual(len(melee_excluded), 141)
        self.assertEqual(len(b_units) - len(b_charge_only), 64)

        # 5. 全库 1,510 项科技中仅 93 具有 chargeOnlyCombatUnits，且所有节点均满足子集关系
        self.assertEqual(len(ar['nodes']), 1510)
        charge_nodes = {tid: node['chargeOnlyCombatUnits'] for tid, node in ar['nodes'].items() if 'chargeOnlyCombatUnits' in node}
        self.assertEqual(charge_nodes, {'93': [2705, 2706]})
        for tid, node in ar['nodes'].items():
            if 'chargeOnlyCombatUnits' in node:
                self.assertTrue(set(node['chargeOnlyCombatUnits']).issubset(set(node['combatUnits'])), tid)


if __name__ == '__main__':
    unittest.main()
