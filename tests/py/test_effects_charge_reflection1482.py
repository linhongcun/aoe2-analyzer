"""#1482：近战伤害反弹（C=118）与科技赋予充能属性（C=59, 60, 61, 62）导出校验。

覆盖：
1. scripts/effects_build.py ECO_ATTR 与 scripts/army_research_build.py combat_attrs 覆盖 {59, 60, 61, 62, 118} 且零硬编码目标科技 ID；
2. army_research_build.direct_combat_units 与 build() 对 C=118（含按类 A=-1,B=6 与按单位 A>=0）及 C=59–62 的纯合成校验；
3. 已提交 data/game/effects.json、data/game/army_research.json 与 data/game/army_cost_usage.json 全量精确不变量；
4. 本地缓存固定 DE 188329 .dat 时全量扫描 1,510 项科技与 56 文明 TechTreeID/TeamBonusID 交叉核验。
"""
import inspect
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import army_research_build  # noqa: E402
import dat_source  # noqa: E402
import effects_build  # noqa: E402

TARGET_ATTRS = {59, 60, 61, 62, 118}
EXPECTED_1006_UNITS = [
    6, 7, 25, 41, 74, 75, 77, 93, 232, 281, 291, 358, 359, 473, 531, 534, 554, 555, 560, 567,
    692, 694, 725, 726, 751, 752, 753, 759, 761, 879, 881, 882, 1010, 1012, 1013, 1015, 1016,
    1018, 1123, 1125, 1155, 1658, 1659, 1660, 1661, 1699, 1701, 1703, 1735, 1737, 1741, 1743,
    1747, 1749, 1786, 1787, 1788, 1793, 1811, 1901, 1903, 1920, 1922, 1959, 1961, 1966, 1974,
    2550, 2552, 2554, 2582, 2584, 2586, 2587, 2588, 2703, 2704, 2705, 2706, 2711, 2712,
]
EXPECTED_884_UNITS = [38, 74, 75, 77, 283, 473, 567, 569, 1790, 1792, 1793, 1813]
EXPECTED_909_UNITS = [529, 532, 1103, 1302]
EXPECTED_1474_UNITS = [2703, 2704]


class EffectsChargeReflection1482Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        cls.army_research = json.loads((ROOT / 'data/game/army_research.json').read_text(encoding='utf-8'))
        cls.army_cost_usage = json.loads((ROOT / 'data/game/army_cost_usage.json').read_text(encoding='utf-8'))
        cls.techs = json.loads((ROOT / 'data/game/techs.json').read_text(encoding='utf-8'))
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.tech_by_id = {t['id']: t for t in cls.techs}
        cls.unit_ids = {u['id'] for u in cls.units}

    def test_scripts_register_attrs_without_hardcoded_tech_ids(self):
        for attr in TARGET_ATTRS:
            self.assertIn(attr, effects_build.ECO_ATTR, f'ECO_ATTR missing {attr}')
        ar_src = inspect.getsource(army_research_build.build)
        for attr in TARGET_ATTRS:
            self.assertRegex(ar_src, rf'\b{attr}\b', f'build() combat_attrs missing {attr}')
        eff_src = (ROOT / 'scripts/effects_build.py').read_text(encoding='utf-8')
        ar_full = (ROOT / 'scripts/army_research_build.py').read_text(encoding='utf-8')
        for tid in ('884', '909', '997', '1006', '1474'):
            self.assertNotRegex(eff_src, rf'\b{tid}\b', f'effects_build.py must not hardcode {tid}')
            self.assertNotRegex(ar_full, rf'\b{tid}\b', f'army_research_build.py must not hardcode {tid}')

    def test_build_collects_combat_units_for_attr_118_and_59_to_62(self):
        max_uid = max(self.unit_ids) + 1
        dat_units = [
            {'Class': 0, 'Projectiles': [-1, -1], 'ChargeProjectile': -1, 'ChargeEvent': 0, 'RechargeRate': 0, 'Transform': -1}
            for _ in range(max_uid)
        ]
        for uid in (1793, 1922, 2704):
            dat_units[uid]['Class'] = 6
        fake_dat = {
            'Techs': [
                {'Name': 'Synth118', 'EffectID': 0, 'Civ': -1, 'RequiredTechs': [], 'RequiredTechCount': 0, 'ResearchLocation': 82, 'ResearchTime': 40, 'Cost': []},
                {'Name': 'SynthCharge', 'EffectID': 1, 'Civ': -1, 'RequiredTechs': [], 'RequiredTechCount': 0, 'ResearchLocation': 209, 'ResearchTime': 30, 'Cost': []},
            ],
            'Effects': [
                {
                    'Name': 'Eff118',
                    'EffectCommands': [
                        {'Type': 4, 'A': -1, 'B': 6, 'C': 118, 'D': 0.25},
                        {'Type': 4, 'A': 7, 'B': -1, 'C': 118, 'D': 0.25},
                        {'Type': 4, 'A': 6, 'B': -1, 'C': 118, 'D': 0.25},
                    ],
                },
                {
                    'Name': 'EffCharge',
                    'EffectCommands': [
                        {'Type': 0, 'A': 529, 'B': -1, 'C': 62, 'D': 6.0},
                        {'Type': 0, 'A': 532, 'B': -1, 'C': 59, 'D': 1.0},
                        {'Type': 4, 'A': 1948, 'B': -1, 'C': 61, 'D': 1.0},
                        {'Type': 0, 'A': 2704, 'B': -1, 'C': 60, 'D': 0.033333},
                        {'Type': 0, 'A': 539, 'B': -1, 'C': 999, 'D': 1.0},  # unrelated attr ignored
                    ],
                },
            ],
            'Civs': [
                {'Name': 'Gaia', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
                {'Name': 'Byzantine', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
            ],
            'BuildTech': {},
        }
        built = army_research_build.build(fake_dat)
        self.assertEqual(built['nodes']['0']['combatUnits'], [6, 7, 1793, 1922, 2704])
        self.assertEqual(built['nodes']['1']['combatUnits'], [529, 532, 1948, 2704])

    def test_committed_effects_army_research_and_usage_invariants(self):
        techs = self.effects['techs']
        self.assertEqual(len(EXPECTED_1006_UNITS), 81)

        def attr_targets(tech_en, attr):
            return sorted({uid for e in techs[tech_en]['eco'] if e.get('a') == attr for uid in (e.get('t') or [])})

        self.assertEqual(attr_targets('Lamellar Armor', 118), EXPECTED_1006_UNITS)
        for attr in (59, 60, 61, 62):
            self.assertEqual(attr_targets('Comitatenses', attr), EXPECTED_884_UNITS, f'884 a:{attr}')
            self.assertEqual(attr_targets('Gothikon', attr), EXPECTED_1474_UNITS, f'1474 a:{attr}')
        self.assertEqual(attr_targets('Siphons', 62), EXPECTED_909_UNITS)
        self.assertEqual(attr_targets('Siphons', 59), EXPECTED_909_UNITS)
        self.assertEqual(attr_targets('Thunderclap Bombs', 62), [1948])
        for en in ('Fletching', 'Bodkin Arrow', 'Bracer'):
            self.assertEqual(attr_targets(en, 61), [1948, 2705, 2706], f'{en} a:61')
        self.assertEqual(attr_targets('Siege Engineers', 61), [1948])

        # Exact set of techs in effects.json carrying any attr in {59, 60, 61, 62, 118}
        hit_techs = sorted(
            en for en, rec in techs.items()
            if any(e.get('a') in TARGET_ATTRS for e in rec.get('eco', []))
        )
        self.assertEqual(
            hit_techs,
            [
                'Bodkin Arrow',
                'Bracer',
                'Comitatenses',
                'Fletching',
                'Gothikon',
                'Lamellar Armor',
                'Siege Engineers',
                'Siphons',
                'Thunderclap Bombs',
            ],
        )

        # army_research.json combatUnits
        nodes = self.army_research['nodes']
        self.assertEqual(nodes['1006']['combatUnits'], EXPECTED_1006_UNITS)
        self.assertEqual(nodes['884']['combatUnits'], EXPECTED_884_UNITS)
        self.assertEqual(nodes['909']['combatUnits'], EXPECTED_909_UNITS)
        self.assertEqual(nodes['1474']['combatUnits'], EXPECTED_1474_UNITS)
        self.assertEqual(nodes['997']['combatUnits'], [1948])
        for tid in ('199', '200', '201', '377'):
            self.assertIn(1948, nodes[tid]['combatUnits'], f't:{tid} missing 1948')

        # army_cost_usage.json reflects 909 on Italians-2 & Chinese-1
        self.assertIn(909, self.army_cost_usage['bonuses']['Italians-2']['tids'])
        self.assertEqual(len(self.army_cost_usage['bonuses']['Italians-2']['tids']), 12)
        self.assertIn(909, self.army_cost_usage['bonuses']['Chinese-1']['tids'])
        self.assertEqual(len(self.army_cost_usage['bonuses']['Chinese-1']['tids']), 62)

    def test_matches_pinned_dat_full_scan_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        at = parsed['Techs']
        ae = parsed['Effects']

        by_class = {}
        for uid in self.unit_ids:
            cls = du[uid]['Class']
            by_class.setdefault(cls, []).append(uid)

        # Verify 0 civ bonuses / team bonuses touch C in {59, 60, 61, 62, 118} on catalog units
        for civ in parsed['Civs'][1:]:
            for key in ('TechTreeID', 'TeamBonusID'):
                eid = civ.get(key, -1)
                if 0 <= eid < len(ae):
                    for cmd in ae[eid]['EffectCommands']:
                        if cmd['Type'] in (0, 4, 5) and cmd['C'] in TARGET_ATTRS:
                            targets = [cmd['A']] if cmd['A'] >= 0 else by_class.get(cmd['B'], [])
                            hit = [u for u in targets if u in self.unit_ids]
                            self.assertEqual(hit, [], f"Unexpected civ bonus hit {civ['Name']} {key} {cmd}")

        # Full scan of all 1,510 techs for catalog hits on TARGET_ATTRS
        catalog_hits = {}
        for tid, tech in enumerate(at):
            eid = tech['EffectID']
            if not (0 <= eid < len(ae)):
                continue
            hits = set()
            for cmd in ae[eid]['EffectCommands']:
                if cmd['Type'] in (0, 4, 5) and cmd['C'] in TARGET_ATTRS:
                    targets = [cmd['A']] if cmd['A'] >= 0 else by_class.get(cmd['B'], [])
                    hits.update(u for u in targets if u in self.unit_ids)
            if hits and tid in self.tech_by_id:
                catalog_hits[tid] = sorted(hits)

        self.assertEqual(sorted(catalog_hits.keys()), [199, 200, 201, 377, 884, 909, 997, 1006, 1474])
        self.assertEqual(catalog_hits[1006], EXPECTED_1006_UNITS)
        self.assertEqual(catalog_hits[884], EXPECTED_884_UNITS)
        self.assertEqual(catalog_hits[909], EXPECTED_909_UNITS)
        self.assertEqual(catalog_hits[1474], EXPECTED_1474_UNITS)
        self.assertEqual(catalog_hits[997], [1948])


if __name__ == '__main__':
    unittest.main()
