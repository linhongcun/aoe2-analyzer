"""#1509：投射物追踪（C=19 bit 0）与弹速提升（Type==60 投射物 C=5 净正增量）范围导出校验。

覆盖：
1. scripts/projectile_scope.py guidance_projectile_scopes 的 C=19 bit 0/bit 1（+2）消歧、负值补码防误判、顺序覆盖语义；
2. C=5 对具体投射物（Type == 60）净正增量（Type=0/4/5 顺序覆盖与抵消排除）、常规非投射物单位与常规类别跳过、按类投射物（A < 0, B == 11）无条件 fail-closed；
3. 全量 fail-closed 畸形输入（非 dict、非严格 int Type/C/A/B、C=19 Type∈{5,10,14,15}、非有限/bool/非整数 D、缺失单位或缺失 Type/Speed）；
4. 已提交 data/game/effects.json 精确不变量（仅 Arquebus；93/902/1379 不进入；Arquebus.rules/eco 为 []；army_research.json 不变）；
5. 本地缓存固定 DE 188329 .dat 全量 199 科技交叉核验。
"""
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402
from projectile_scope import guidance_projectile_scopes  # noqa: E402


class ProjectileGuidance1509Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        cls.techs = json.loads((ROOT / 'data/game/techs.json').read_text(encoding='utf-8'))
        cls.army_research = json.loads((ROOT / 'data/game/army_research.json').read_text(encoding='utf-8'))
        cls.tech_by_id = {t['id']: t for t in cls.techs}

    @staticmethod
    def _fake_dat_units():
        # 索引 0..600 中：380/506 为投射物（Type=60），5/6 为普通战斗单位（Type=70），598 为建筑（Type=80）
        du = [None] * 600
        du[5] = {'Type': 70, 'Class': 0, 'Speed': 0.96}
        du[6] = {'Type': 70, 'Class': 0, 'Speed': 0.96}
        du[380] = {'Type': 60, 'Class': 11, 'Speed': 7.5}
        du[506] = {'Type': 60, 'Class': 11, 'Speed': 3.0}
        du[598] = {'Type': 80, 'Class': 3, 'Speed': 0.0}
        return du

    def test_c19_bit_disambiguation_order_and_negative_guard(self):
        du = self._fake_dat_units()

        # bit 0 = 1（1.0 与 3.0）命中；仅置 bit 1（+2.0，如 902/1379）精确排除
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0},
                    {'Type': 0, 'A': 506, 'B': -1, 'C': 19, 'D': 3.0},
                ],
                du,
            ),
            ({380, 506}, set()),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 19, 'D': 2.0},
                    {'Type': 0, 'A': 506, 'B': -1, 'C': 19, 'D': 2.0},
                ],
                du,
            ),
            (set(), set()),
        )

        # 命令顺序覆盖：先 1 后 0 或 2 清除；先 2 后 +1 置位（3 & 1 == 1）；先 1 后 -1 归零
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0},
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': 0.0},
                ],
                du,
            ),
            (set(), set()),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0},
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': 2.0},
                ],
                du,
            ),
            (set(), set()),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 19, 'D': 2.0},
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0},
                ],
                du,
            ),
            ({380}, set()),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0},
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 19, 'D': -1.0},
                ],
                du,
            ),
            (set(), set()),
        )

        # 负值补码防护：0 + (-1) = -1 在 Python 中 (-1) & 1 == 1，绝不得误判为追踪
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 19, 'D': -1.0},
                    {'Type': 0, 'A': 506, 'B': -1, 'C': 19, 'D': -3.0},
                ],
                du,
            ),
            (set(), set()),
        )

    def test_c5_projectile_speed_semantics_and_non_projectile_skip(self):
        du = self._fake_dat_units()

        # 非投射物单位与常规单位类别 C=5（如畜牧/护卫/草药学）全部安全跳过，不进入 speed_pids 也不误报
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 5, 'A': -1, 'B': 12, 'C': 5, 'D': 1.1},
                    {'Type': 5, 'A': -1, 'B': 0, 'C': 5, 'D': 1.15},
                    {'Type': 5, 'A': 6, 'B': -1, 'C': 5, 'D': 0.87},
                    {'Type': 4, 'A': 5, 'B': -1, 'C': 5, 'D': 0.5},
                    {'Type': 1, 'A': 33, 'B': 0, 'C': 19, 'D': 1.0},  # 非属性修改命令（Type=1 资源），忽略
                ],
                du,
            ),
            (set(), set()),
        )

        # 具体投射物 Type==60：add / set / mul 顺序跟踪净正向增量，抵消或降速排除
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5},
                    {'Type': 5, 'A': 506, 'B': -1, 'C': 5, 'D': 1.2},
                ],
                du,
            ),
            (set(), {380, 506}),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 5, 'D': 8.0},
                    {'Type': 4, 'A': 506, 'B': -1, 'C': 5, 'D': 0.5},
                    {'Type': 4, 'A': 506, 'B': -1, 'C': 5, 'D': -0.5},
                ],
                du,
            ),
            (set(), {380}),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5},
                    {'Type': 0, 'A': 380, 'B': -1, 'C': 5, 'D': 7.5},
                    {'Type': 4, 'A': 506, 'B': -1, 'C': 5, 'D': -0.2},
                ],
                du,
            ),
            (set(), set()),
        )
        self.assertEqual(
            guidance_projectile_scopes(
                [
                    {'Type': 4, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5},
                    {'Type': 5, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5},
                ],
                du,
            ),
            (set(), set()),
        )

    def test_fail_closed_validation(self):
        du = self._fake_dat_units()

        # 非 dict（如五元组）必须 TypeError
        with self.assertRaises(TypeError):
            guidance_projectile_scopes([(0, 380, -1, 19, 1.0)], du)

        # 非严格 int Type / C 必须 ValueError
        for bad_t in (True, False, 0.0, '0', math.nan, None):
            with self.assertRaises(ValueError, msg=f'Type={bad_t!r}'):
                guidance_projectile_scopes([{'Type': bad_t, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0}], du)
        for bad_c in (True, False, 19.0, 5.0, '19', math.nan, None):
            with self.assertRaises(ValueError, msg=f'C={bad_c!r}'):
                guidance_projectile_scopes([{'Type': 0, 'A': 380, 'B': -1, 'C': bad_c, 'D': 1.0}], du)

        # C=19 不支持的 Type（5/10/14/15）、按类 A < 0、非严格 int A、非有限/bool/非整数 D 必须 ValueError
        for bad_t in (5, 10, 14, 15):
            with self.assertRaises(ValueError, msg=f'C=19 Type={bad_t!r}'):
                guidance_projectile_scopes([{'Type': bad_t, 'A': 380, 'B': -1, 'C': 19, 'D': 1.0}], du)
        for bad_a in (-1, -5, True, False, 380.0, '380', None):
            with self.assertRaises(ValueError, msg=f'C=19 A={bad_a!r}'):
                guidance_projectile_scopes([{'Type': 0, 'A': bad_a, 'B': 11, 'C': 19, 'D': 1.0}], du)
        for bad_d in (True, False, math.nan, math.inf, -math.inf, 1.5, '1', None):
            with self.assertRaises(ValueError, msg=f'C=19 D={bad_d!r}'):
                guidance_projectile_scopes([{'Type': 0, 'A': 380, 'B': -1, 'C': 19, 'D': bad_d}], du)

        # C=5 按类投射物（A < 0, B == 11）对全部 Type∈{0,4,5,10,14,15} 无条件 ValueError
        for t in (0, 4, 5, 10, 14, 15):
            with self.assertRaises(ValueError, msg=f'C=5 class 11 Type={t}'):
                guidance_projectile_scopes([{'Type': t, 'A': -1, 'B': 11, 'C': 5, 'D': 0.5}], du)

        # C=5 非严格 int A / B、越界或 None 目标、团队 Type∈{10,14,15}、非有限/bool D 必须 ValueError
        for bad_a in (True, False, 380.0, '380', None, 9999, 1):
            with self.assertRaises(ValueError, msg=f'C=5 A={bad_a!r}'):
                guidance_projectile_scopes([{'Type': 4, 'A': bad_a, 'B': -1, 'C': 5, 'D': 0.5}], du)
        for bad_b in (True, False, 11.0, '11', None):
            with self.assertRaises(ValueError, msg=f'C=5 B={bad_b!r}'):
                guidance_projectile_scopes([{'Type': 4, 'A': -1, 'B': bad_b, 'C': 5, 'D': 0.5}], du)
        for bad_t in (10, 14, 15):
            with self.assertRaises(ValueError, msg=f'C=5 proj Type={bad_t}'):
                guidance_projectile_scopes([{'Type': bad_t, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5}], du)
        for bad_d in (True, False, math.nan, math.inf, -math.inf, '0.5', None):
            with self.assertRaises(ValueError, msg=f'C=5 proj D={bad_d!r}'):
                guidance_projectile_scopes([{'Type': 4, 'A': 380, 'B': -1, 'C': 5, 'D': bad_d}], du)

        # 缺失 Type / 非法 Speed 必须 fail-closed
        bad_du = list(du)
        bad_du[380] = {'Class': 11, 'Speed': 7.5}
        with self.assertRaises(KeyError):
            guidance_projectile_scopes([{'Type': 4, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5}], bad_du)
        bad_du[380] = {'Type': 60, 'Class': 11, 'Speed': True}
        with self.assertRaises(ValueError):
            guidance_projectile_scopes([{'Type': 4, 'A': 380, 'B': -1, 'C': 5, 'D': 0.5}], bad_du)

    def test_committed_effects_and_army_research_invariants(self):
        self.assertEqual(self.tech_by_id[573]['en'], 'Arquebus')
        self.assertEqual(
            self.effects['projectileGuidance'],
            {
                'Arquebus': {
                    'units': [5, 36, 420, 691, 1001, 1003],
                    'buildings': [236],
                    'tracking': True,
                    'speed': True,
                }
            },
        )
        for forbidden_en in ('Ballistics', 'Pirotechnia', 'Malon', 'Curare'):
            self.assertNotIn(forbidden_en, self.effects['projectileGuidance'])
        self.assertEqual(
            self.effects['techs']['Arquebus'],
            {'id': 573, 'combat': True, 'rules': [], 'eco': []},
        )
        # army_research.json 保持原宽集合不变
        self.assertEqual(
            self.army_research['nodes']['573']['combatUnits'],
            [5, 36, 46, 420, 557, 691, 771, 773, 1001, 1003, 1704, 1706, 1709],
        )

    def test_matches_pinned_dat_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        at = parsed['Techs']
        ae = parsed['Effects']

        def cmds_of(tid):
            eid = at[tid]['EffectID']
            return ae[eid]['EffectCommands'] if 0 <= eid < len(ae) else []

        # 573 火绳枪：8 弹丸追踪 + 同 8 弹丸弹速提升
        expected_573 = {368, 374, 380, 506, 537, 1119, 1733, 1789}
        self.assertEqual(guidance_projectile_scopes(cmds_of(573), du), (expected_573, expected_573))

        # 902 烟火之术 / 1379 突袭：仅 C=19 bit 1（+2），绝不误收
        self.assertEqual(guidance_projectile_scopes(cmds_of(902), du), (set(), set()))
        self.assertEqual(guidance_projectile_scopes(cmds_of(1379), du), (set(), set()))

        # 全量 199 项科技（除 93 弹道学）：仅 573 命中
        hits = []
        for t in self.techs:
            tid = t['id']
            if tid == 93:
                continue
            track, speed = guidance_projectile_scopes(cmds_of(tid), du)
            if track or speed:
                hits.append(tid)
        self.assertEqual(hits, [573])


if __name__ == '__main__':
    unittest.main()
