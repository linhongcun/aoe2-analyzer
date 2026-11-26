"""#1446：单位固有生命回复（RegenRate）与科技赋予投射物直线穿透（C=67 + C=119）导出校验。

覆盖：
1. scripts/dat_source.py 导出 RegenRate、新增跨文明一致校验 regen_rate_sig 且缓存升级至 dat.v25；
2. scripts/units_build.py derive_inherent_regen 的 fail-closed 守卫与 r6 规范化后再判正边界；
3. scripts/projectile_scope.py pass_through_projectile_ids 的 fail-closed（非 dict、具体弹丸 A>=0 拒收 Type 4/5/10/14/15/bool、NaN/±Inf/bool、按类 A<0）与同弹丸命令顺序覆盖语义；
4. 已提交 data/game/units.json、data/game/effects.json 与 data/game/techs.json 的全量不变量与 7 副形态隔离；
5. 本地缓存固定 DE 188329 .dat 时逐项交叉核验（含 902/1379 正例、997 仅 C=67 反例、1009 目录外 Type=5 A=-1 反例）。
"""
import inspect
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402
import units_build  # noqa: E402
from projectile_scope import pass_through_projectile_ids  # noqa: E402


class DuelUnmodeled1446Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        cls.techs = json.loads((ROOT / 'data/game/techs.json').read_text(encoding='utf-8'))
        cls.unit_by_id = {u['id']: u for u in cls.units}
        cls.tech_by_id = {t['id']: t for t in cls.techs}

    def test_dat_source_exports_regen_rate_and_bumps_cache_to_v25(self):
        dump = dat_source._DUMP
        self.assertIn("'RegenRate': u.creatable.rear_attack_modifier if u.creatable else 0", dump)
        self.assertIn('def regen_rate_sig(u):', dump)
        self.assertIn('!= regen_rate_sig(cu)', dump)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v25.%s.json', parse_src)
        self.assertNotIn('dat.v24.%s.json', parse_src)

    def test_derive_inherent_regen_semantics_r6_boundary_and_fail_closed(self):
        fn = units_build.derive_inherent_regen

        self.assertEqual(fn({'RegenRate': 40.0}), 40)
        self.assertIs(type(fn({'RegenRate': 40.0})), int)
        self.assertEqual(fn({'RegenRate': 15.0}), 15)
        self.assertEqual(fn({'RegenRate': 12.5}), 12.5)
        self.assertIsNone(fn({'RegenRate': 0}))
        self.assertIsNone(fn({'RegenRate': 0.0}))

        # 数值边界：微小正值经 6 位小数规范化归零后不得写入 0（避免违反 schema exclusiveMinimum: 0）
        self.assertIsNone(fn({'RegenRate': 1e-9}))
        self.assertIsNone(fn({'RegenRate': 4e-7}))
        self.assertEqual(fn({'RegenRate': 1e-6}), 1e-6)

        # 陈旧缓存缺键必须 KeyError
        with self.assertRaises(KeyError):
            fn({})

        # bool、负数、非有限数、非数值必须 ValueError
        for bad in (True, False, -1, -0.001, '40', None, math.nan, math.inf, -math.inf):
            with self.assertRaises(ValueError, msg=f'Expected reject for {bad!r}'):
                fn({'RegenRate': bad})

    def test_pass_through_projectile_ids_order_semantics_and_fail_closed(self):
        # 合法正例与无关命令共存
        self.assertEqual(
            pass_through_projectile_ids([
                {'Type': 0, 'A': -1, 'B': 44, 'C': 11, 'D': 90.0},
                {'Type': 1, 'A': 33, 'B': 0, 'C': -1, 'D': 25.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 67, 'D': 1.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.15},
            ]),
            {380},
        )

        # 仅 C=67 或仅 C=119 均不命中
        self.assertEqual(
            pass_through_projectile_ids([{'Type': 0, 'A': 1938, 'B': -1, 'C': 67, 'D': 1.0}]),
            set(),
        )
        self.assertEqual(
            pass_through_projectile_ids([{'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.3}]),
            set(),
        )

        # 同弹丸命令顺序覆盖：后续 set 0 清除前序正值；反向先 0 后正值可开启
        self.assertEqual(
            pass_through_projectile_ids([
                {'Type': 0, 'A': 380, 'B': -1, 'C': 67, 'D': 1.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.3},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.0},
            ]),
            set(),
        )
        self.assertEqual(
            pass_through_projectile_ids([
                {'Type': 0, 'A': 380, 'B': -1, 'C': 67, 'D': 1.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.3},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 67, 'D': 0.0},
            ]),
            set(),
        )
        self.assertEqual(
            pass_through_projectile_ids([
                {'Type': 0, 'A': 380, 'B': -1, 'C': 67, 'D': 0.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 67, 'D': 1.0},
                {'Type': 0, 'A': 380, 'B': -1, 'C': 119, 'D': 0.3},
            ]),
            {380},
        )

        # 拒绝非 dict（如 a_cmds 五元组）
        with self.assertRaises(TypeError):
            pass_through_projectile_ids([(0, 380, -1, 67, 1.0)])

        # 合法具体弹丸 A=380 上独立拒绝 Type=4/5/10/14/15 与 bool（分别测 C=67 与 C=119）
        for attr in (67, 119):
            for bad_type in (4, 5, 10, 14, 15, False, True):
                with self.assertRaises(ValueError, msg=f'attr={attr} type={bad_type!r}'):
                    pass_through_projectile_ids([{'Type': bad_type, 'A': 380, 'B': -1, 'C': attr, 'D': 1.0}])

            # 合法具体弹丸 A=380 上独立拒绝 NaN / ±Inf / bool / str 的 D
            for bad_d in (math.nan, math.inf, -math.inf, True, False, '0.15', None):
                with self.assertRaises(ValueError, msg=f'attr={attr} D={bad_d!r}'):
                    pass_through_projectile_ids([{'Type': 0, 'A': 380, 'B': -1, 'C': attr, 'D': bad_d}])

            # 按类（A < 0）或非 int A（含 bool）必须 ValueError
            for bad_a in (-1, -5, True, False, '380', 380.0):
                with self.assertRaises(ValueError, msg=f'attr={attr} A={bad_a!r}'):
                    pass_through_projectile_ids([{'Type': 0, 'A': bad_a, 'B': 15, 'C': attr, 'D': 1.0}])

    def test_committed_units_and_effects_exact_invariants(self):
        self.assertEqual(len(self.units), 248)
        regen_map = {u['id']: u['regenRate'] for u in self.units if 'regenRate' in u}
        self.assertEqual(regen_map, {692: 40, 694: 40, 1966: 15})
        for uid in (1954, 1978):
            self.assertNotIn('regenRate', self.unit_by_id[uid])
        forms = [u['form'] for u in self.units if 'form' in u]
        self.assertEqual(len(forms), 7)
        for form in forms:
            self.assertNotIn('regenRate', form)

        # projectilePassThrough 键名必须与 techs.json 英文名完全对齐
        self.assertEqual(self.tech_by_id[902]['en'], 'Pirotechnia')
        self.assertEqual(self.tech_by_id[1379]['en'], 'Malon')
        self.assertEqual(
            self.effects['projectilePassThrough'],
            {
                'Malon': {'units': [6, 7, 185, 2569, 2571], 'buildings': []},
                'Pirotechnia': {'units': [5], 'buildings': []},
            },
        )
        self.assertNotIn('Thunderclap Bombs', self.effects['projectilePassThrough'])
        self.assertNotIn(1009, self.tech_by_id)

    def test_matches_pinned_dat_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        at = parsed['Techs']
        ae = parsed['Effects']

        # 248 目录单位固有回复速率逐一核验，7 副形态均为 0
        for u in self.units:
            uid = u['id']
            expected = units_build.derive_inherent_regen(du[uid])
            self.assertEqual(u.get('regenRate'), expected, f'unit {uid} regenRate mismatch vs .dat')
            if 'form' in u:
                fid = u['form']['id']
                self.assertIsNone(units_build.derive_inherent_regen(du[fid]), f'form {fid} expected 0 regenRate')

        # 固定 .dat 正反例弹丸集核验：902 / 1379 / 997 / 目录外 1009
        def cmds_of(tid):
            eid = at[tid]['EffectID']
            return ae[eid]['EffectCommands'] if 0 <= eid < len(ae) else []

        self.assertEqual(pass_through_projectile_ids(cmds_of(902)), {380})
        self.assertEqual(
            pass_through_projectile_ids(cmds_of(1379)),
            {187, 365, 366, 376, 377, 538, 2572, 2573, 2574, 2575},
        )
        self.assertEqual(pass_through_projectile_ids(cmds_of(997)), set())
        # 目录外隐藏加成 1009（Type=5, A=-1, C=119）：锁作 fail-closed 固定数据反例
        with self.assertRaises(ValueError):
            pass_through_projectile_ids(cmds_of(1009))


if __name__ == '__main__':
    unittest.main()
