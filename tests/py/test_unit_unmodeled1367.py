"""#1367：投射物穿透与战斗任务（action_type 157/158/160）导出与 units.json 一致性校验。

覆盖：
1. scripts/dat_source.py 导出 ProjectileHitMode / CombatTasks，保留原 7 字段 task_sig，
   新增 combat_tasks_sig / proj_hit_mode_sig 跨文明一致断言，缓存升级至 dat.v23；
2. scripts/units_build.py derive_unmodeled_dat_fields 的 fail-closed 契约与类型/边界防护；
3. data/game/units.json 全量 248 目录单位及 7 组 form 副形态精确清单，
   并在本地缓存固定 DE 188329 .dat 时逐单位交叉核验。
"""
import inspect
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402
import units_build  # noqa: E402


class UnitUnmodeled1367Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.unit_by_id = {u['id']: u for u in cls.units}

    def test_dat_source_exports_new_fields_preserves_task_sig_and_bumps_cache_to_v23(self):
        dump = dat_source._DUMP
        self.assertIn("'ProjectileHitMode': u.projectile.hit_mode if u.projectile else 0", dump)
        self.assertIn("'CombatTasks': [", dump)
        self.assertIn('x.action_type in (157, 158, 160)', dump)
        # 保留原 7 字段 task_sig，不全局扩展到 Chronicles 文明（如 Achaemenids #125）
        self.assertIn('def task_sig(u):', dump)
        self.assertIn(
            't.action_type, t.class_id, t.unit_id, t.resource_in, t.resource_out, t.resource_multiplier, t.work_value_1',
            dump,
        )
        # 独立跨文明一致校验
        self.assertIn('def combat_tasks_sig(u):', dump)
        self.assertIn('def proj_hit_mode_sig(u):', dump)
        self.assertIn('!= combat_tasks_sig(cu)', dump)
        self.assertIn('!= proj_hit_mode_sig(cu)', dump)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v24.%s.json', parse_src)
        self.assertNotIn('dat.v22.%s.json', parse_src)

    def test_derive_unmodeled_dat_fields_fail_closed_and_semantics(self):
        fn = units_build.derive_unmodeled_dat_fields

        # 缺失 CombatTasks 或 ProjectileHitMode 必须直接 KeyError，不得静默降级
        with self.assertRaises(KeyError):
            fn({'Projectiles': [-1, -1]}, [])
        with self.assertRaises(KeyError):
            fn({'Projectiles': [1, -1], 'CombatTasks': []}, [None, {}])

        # 非 int / bool 的 ProjectileHitMode 与非 list 的 CombatTasks 必须 ValueError
        for bad_hm in (True, False, 1.0, '1', None):
            with self.assertRaises(ValueError, msg=f'bad hit_mode={bad_hm!r}'):
                fn({'Projectiles': [1, -1], 'CombatTasks': []}, [None, {'ProjectileHitMode': bad_hm}])
        for bad_tasks in (None, {}, '[]', 123):
            with self.assertRaises(ValueError, msg=f'bad tasks={bad_tasks!r}'):
                fn({'Projectiles': [-1, -1], 'CombatTasks': bad_tasks}, [])

        # 仅主投射物 hit_mode == 1 触发 projectilePassThrough；副投射物绝不触发
        proj_table = [None, {'ProjectileHitMode': 1}, {'ProjectileHitMode': 0}]
        self.assertEqual(
            fn({'Projectiles': [1, 2], 'CombatTasks': []}, proj_table),
            {'projectilePassThrough': True},
        )
        self.assertEqual(
            fn({'Projectiles': [2, 1], 'CombatTasks': []}, proj_table),
            {},
        )

        # action 157 命中特效三分型 + 未知/冲突任务省略 onHitEffect
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 157, 'attr': 109.0, 'v1': -180.0, 'v2': 3.0}]}, []),
            {'onHitEffect': 'dot'},
        )
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 157, 'attr': 5.0, 'v1': -0.15, 'v2': 10.0}]}, []),
            {'onHitEffect': 'slow'},
        )
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 157, 'attr': 10.0, 'v1': -0.2, 'v2': 5.0}]}, []),
            {'onHitEffect': 'attack-speed'},
        )
        # 未知 attr 或多个不同 157 子类冲突时不臆造，省略 onHitEffect
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 157, 'attr': 99.0, 'v1': -1.0, 'v2': 3.0}]}, []),
            {},
        )
        self.assertEqual(
            fn(
                {
                    'Projectiles': [-1, -1],
                    'CombatTasks': [
                        {'action': 157, 'attr': 109.0, 'v1': -180.0, 'v2': 3.0},
                        {'action': 157, 'attr': 5.0, 'v1': -0.15, 'v2': 10.0},
                    ],
                },
                [],
            ),
            {},
        )

        # action 160 严格限定 attr == 9 && v1 > 0 && v2 > 0
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 160, 'attr': 9.0, 'v1': 0.33, 'v2': 0.5}]}, []),
            {'damagedTargetBonus': True},
        )
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 160, 'attr': 8.0, 'v1': 0.33, 'v2': 0.5}]}, []),
            {},
        )

        # action 158 严格限定 v1 > 0 && v2 < 0
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 158, 'attr': 0.0, 'v1': 0.33, 'v2': -1.0}]}, []),
            {'lowHpTransform': True},
        )
        self.assertEqual(
            fn({'Projectiles': [-1, -1], 'CombatTasks': [{'action': 158, 'attr': 0.0, 'v1': 0.33, 'v2': 1.0}]}, []),
            {},
        )

    def test_units_json_exact_catalog_sets_and_form_isolation(self):
        self.assertEqual(len(self.units), 248)

        pass_through = sorted(u['id'] for u in self.units if u.get('projectilePassThrough') is True)
        self.assertEqual(pass_through, [279, 542, 1004, 1006, 1120, 1122, 1741, 1743, 1948, 1962])
        # 反例：步弓手 4 / 弩手 24 / 劲弩手 492 副弹丸 hit_mode=1 绝不得污染
        for uid in (4, 24, 492):
            self.assertNotIn('projectilePassThrough', self.unit_by_id[uid])

        on_hit = {u['id']: u['onHitEffect'] for u in self.units if 'onHitEffect' in u}
        self.assertEqual(
            on_hit,
            {
                1920: 'dot',
                1922: 'dot',
                1959: 'slow',
                1961: 'slow',
                2586: 'attack-speed',
                2587: 'attack-speed',
            },
        )
        # bit 128 与 onHitEffect 在 DE 188329 目录内 1:1 对齐
        bit128 = sorted(u['id'] for u in self.units if u['combatAbility'] & 128)
        self.assertEqual(bit128, sorted(on_hit.keys()))

        damaged_bonus = sorted(u['id'] for u in self.units if u.get('damagedTargetBonus') is True)
        self.assertEqual(damaged_bonus, [2566, 2568])

        low_hp = sorted(u['id'] for u in self.units if u.get('lowHpTransform') is True)
        self.assertEqual(low_hp, [1974])

        # 7 个副形态均不携带这 4 个新字段
        new_keys = ('projectilePassThrough', 'onHitEffect', 'damagedTargetBonus', 'lowHpTransform')
        forms = [u['form'] for u in self.units if 'form' in u]
        self.assertEqual(len(forms), 7)
        for form in forms:
            for key in new_keys:
                self.assertNotIn(key, form, f'form {form["id"]} unexpectedly carries {key}')

    def test_matches_pinned_dat_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        new_keys = ('projectilePassThrough', 'onHitEffect', 'damagedTargetBonus', 'lowHpTransform')
        for u in self.units:
            uid = u['id']
            expected = units_build.derive_unmodeled_dat_fields(du[uid], du)
            actual = {k: u[k] for k in new_keys if k in u}
            self.assertEqual(actual, expected, f'unit {uid} derived fields mismatch vs pinned .dat')


if __name__ == '__main__':
    unittest.main()
