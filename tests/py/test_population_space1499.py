"""#1499：固定 .dat 人口空间属性（C=110）导出、PopSpace 基线 fail-closed 强校验与双管线一致性测试。

覆盖：
1. scripts/dat_source.py 导出 PopSpace、跨非 RoR 文明 pop_space_sig 一致校验且缓存键升级至 dat.v26；
2. scripts/effects_build.py ECO_ATTR[110]（不进 ATTR）、validate_pop_space_baselines 的 fail-closed 契约与零硬编码科技 ID；
3. scripts/army_research_build.py population_attrs={110} 导出可选 populationUnits 且不污染 combatUnits；
4. 已提交 data/game/effects.json 与 data/game/army_research.json 精确不变量；
5. 本地缓存固定 DE 188329 .dat 时全量扫描 1,510 条科技与 1,500 条 Effects 交叉核验。
"""
import inspect
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import army_research_build  # noqa: E402
import dat_source  # noqa: E402
import effects_build  # noqa: E402

EXPECTED_834_UNITS = [83, 125, 775]
EXPECTED_924_GEORGIAN_UNITS = [38, 39, 283, 441, 448, 474, 546, 1803, 1805]


class PopulationSpace1499Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        cls.army_research = json.loads((ROOT / 'data/game/army_research.json').read_text(encoding='utf-8'))
        cls.techs = json.loads((ROOT / 'data/game/techs.json').read_text(encoding='utf-8'))
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.unit_by_id = {u['id']: u for u in cls.units}
        cls.unit_ids = set(cls.unit_by_id.keys())

    def test_dat_source_exports_pop_space_and_bumps_cache_to_v26(self):
        dump = dat_source._DUMP
        self.assertIn("pop_vals = [r.amount for r in u.resource_storages if r.type == 4]", dump)
        self.assertIn("'PopSpace':", dump)
        self.assertIn('def pop_space_sig(u):', dump)
        self.assertIn('!= pop_space_sig(cu)', dump)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v26.%s.json', parse_src)
        self.assertNotIn('dat.v25.%s.json', parse_src)

    def test_scripts_register_attr_110_without_hardcoded_tech_ids(self):
        self.assertEqual(effects_build.ECO_ATTR.get(110), '人口空间')
        self.assertNotIn(110, effects_build.ATTR)
        ar_src = inspect.getsource(army_research_build.build)
        self.assertIn('population_attrs = {110}', ar_src)
        self.assertIn("node['populationUnits']", ar_src)
        # 110 绝不得混入 combat_attrs
        combat_line = next(line for line in ar_src.splitlines() if 'combat_attrs =' in line)
        self.assertNotRegex(combat_line, r'\b110\b')

        eff_src = (ROOT / 'scripts/effects_build.py').read_text(encoding='utf-8')
        ar_full = (ROOT / 'scripts/army_research_build.py').read_text(encoding='utf-8')
        for tid in ('834', '924'):
            self.assertNotRegex(eff_src, rf'\b{tid}\b', f'effects_build.py must not hardcode {tid}')
            self.assertNotRegex(ar_full, rf'\b{tid}\b', f'army_research_build.py must not hardcode {tid}')

    def test_validate_pop_space_baselines_fail_closed(self):
        units_by_id = {83: {'id': 83}, 1123: {'id': 1123}}
        dat_units = [None] * 1200
        dat_units[83] = {'PopSpace': -1.0}
        dat_units[1123] = {'PopSpace': -0.5}

        # 合法 -1.0 基线与非 110 属性均放行
        effects_build.validate_pop_space_baselines(
            [
                {'a': 110, 'op': 'set', 'v': -0.9, 't': [83]},
                {'a': 100, 'op': 'mul', 'v': 0.85, 't': [1123]},
            ],
            dat_units,
            units_by_id,
            owner='synth-ok',
        )

        # 非 -1.0 基线（如半人口 -0.5）、None、bool、NaN、多条列表、缺键或越界均须 fail-closed
        bad_cases = [
            ('half-pop', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [1123]}], dat_units),
            ('none', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [83]}], [None] * 83 + [{'PopSpace': None}]),
            ('bool', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [83]}], [None] * 83 + [{'PopSpace': True}]),
            ('nan', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [83]}], [None] * 83 + [{'PopSpace': math.nan}]),
            ('multi-entries', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [83]}], [None] * 83 + [{'PopSpace': [-1.0, -1.0]}]),
            ('missing-key', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [83]}], [None] * 83 + [{}]),
            ('out-of-bounds', [{'a': 110, 'op': 'set', 'v': -0.9, 't': [83]}], []),
        ]
        for label, eco, du in bad_cases:
            with self.subTest(case=label):
                with self.assertRaises(ValueError):
                    effects_build.validate_pop_space_baselines(eco, du, units_by_id, owner=label)

    def test_army_research_build_isolates_population_units_from_combat_units(self):
        max_uid = max(self.unit_ids) + 1
        dat_units = [
            {'Class': 0, 'Projectiles': [-1, -1], 'ChargeProjectile': -1, 'ChargeEvent': 0, 'RechargeRate': 0, 'Transform': -1}
            for _ in range(max_uid)
        ]
        dat_units[83]['Class'] = 4
        dat_units[125]['Class'] = 18
        fake_dat = {
            'Techs': [
                {'Name': 'SynthPop', 'EffectID': 0, 'Civ': -1, 'RequiredTechs': [], 'RequiredTechCount': 0, 'ResearchLocation': 82, 'ResearchTime': 40, 'Cost': []},
                {'Name': 'SynthPlain', 'EffectID': 1, 'Civ': -1, 'RequiredTechs': [], 'RequiredTechCount': 0, 'ResearchLocation': 82, 'ResearchTime': 40, 'Cost': []},
            ],
            'Effects': [
                {
                    'Name': 'EffPop',
                    'EffectCommands': [
                        {'Type': 0, 'A': -1, 'B': 4, 'C': 110, 'D': -0.8999999761581421},
                        {'Type': 0, 'A': -1, 'B': 18, 'C': 110, 'D': -0.8999999761581421},
                    ],
                },
                {'Name': 'EffPlain', 'EffectCommands': [{'Type': 4, 'A': 83, 'B': -1, 'C': 0, 'D': 10.0}]},
            ],
            'Civs': [
                {'Name': 'Gaia', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
                {'Name': 'Bengalis', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
            ],
            'BuildTech': {},
        }
        built = army_research_build.build(fake_dat)
        self.assertEqual(built['nodes']['0']['combatUnits'], [])
        self.assertEqual(built['nodes']['0']['populationUnits'], [83, 125])
        self.assertEqual(built['nodes']['1']['combatUnits'], [83])
        self.assertNotIn('populationUnits', built['nodes']['1'])

    def test_committed_effects_and_army_research_invariants(self):
        # 1) effects.json：精确仅 Mahayana 与 Aznauri Cavalry 含 a=110，rules 保持为空，无浮点尾数
        tech_hits = sorted(
            en for en, rec in self.effects['techs'].items()
            if any(e.get('a') == 110 for e in rec.get('eco', []))
        )
        self.assertEqual(tech_hits, ['Aznauri Cavalry', 'Mahayana'])
        for civ_en, cre in self.effects['civs'].items():
            for bucket in ('bonus', 'conditional'):
                for ent in cre.get(bucket) or ():
                    self.assertFalse(any(e.get('a') == 110 for e in ent.get('eco', [])), f'{civ_en} {bucket} unexpectedly has a=110')
            self.assertFalse(any(e.get('a') == 110 for e in (cre.get('team') or {}).get('eco', [])), f'{civ_en} team unexpectedly has a=110')

        mah = self.effects['techs']['Mahayana']
        self.assertEqual(mah['rules'], [])
        self.assertEqual(
            mah['eco'],
            [
                {'a': 110, 'op': 'set', 'v': -0.9, 't': [83], 'cls': 4, 'unit': None},
                {'a': 110, 'op': 'set', 'v': -0.9, 't': [125, 775], 'cls': 18, 'unit': None},
                {'a': 110, 'op': 'set', 'v': -0.9, 't': [], 'cls': 43, 'unit': None},
            ],
        )

        azn = self.effects['techs']['Aznauri Cavalry']
        self.assertEqual(azn['rules'], [])
        self.assertEqual(len(azn['eco']), 4)
        self.assertTrue(all(e['a'] == 110 and e['op'] == 'set' and e['v'] == -0.8 for e in azn['eco']))
        azn_targets = sorted({uid for e in azn['eco'] for uid in e['t']})
        self.assertEqual(len(azn_targets), 90)
        azn_geo = sorted(uid for uid in azn_targets if 'Georgians' in self.unit_by_id[uid]['civs'])
        self.assertEqual(azn_geo, EXPECTED_924_GEORGIAN_UNITS)

        # 2) army_research.json：仅 834/924 写入 populationUnits，其余 1,508 个节点不含该字段，combatUnits 保持 []
        nodes = self.army_research['nodes']
        self.assertEqual(len(nodes), 1510)
        pop_node_ids = sorted(k for k, n in nodes.items() if 'populationUnits' in n)
        self.assertEqual(pop_node_ids, ['834', '924'])
        self.assertEqual(nodes['834']['combatUnits'], [])
        self.assertEqual(nodes['924']['combatUnits'], [])
        self.assertEqual(nodes['834']['populationUnits'], EXPECTED_834_UNITS)
        self.assertEqual(nodes['924']['populationUnits'], azn_targets)

    def test_matches_pinned_dat_full_scan_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        at = parsed['Techs']
        ae = parsed['Effects']

        # 全量 1,500 条 Effects 扫描 C=110
        effect_hits = [
            eid for eid, eff in enumerate(ae)
            if any(c['C'] == 110 and c['Type'] in (0, 4, 5, 10, 14, 15) for c in eff['EffectCommands'])
        ]
        self.assertEqual(effect_hits, [853, 936])

        # 全量 1,510 条科技扫描
        tech_hits = [tid for tid, t in enumerate(at) if t['EffectID'] in effect_hits]
        self.assertEqual(tech_hits, [834, 924])

        # 0 文明加成 / 0 团队加成命中 C=110
        for civ in parsed['Civs'][1:]:
            for key in ('TechTreeID', 'TeamBonusID'):
                self.assertNotIn(civ.get(key, -1), effect_hits, f'{civ["Name"]} {key} hits C=110')

        # 全部命中目录单位基线 PopSpace === -1.0
        hit_units = set(self.army_research['nodes']['834']['populationUnits']) | set(self.army_research['nodes']['924']['populationUnits'])
        for uid in sorted(hit_units):
            self.assertEqual(du[uid]['PopSpace'], -1.0, f'Catalog unit {uid} PopSpace != -1.0')


if __name__ == '__main__':
    unittest.main()
