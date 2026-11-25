"""#1402：army_research_build.py 文明 TeamBonusID 禁用、Type=8/18 区域重启用与启用节点命名单测。"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import army_research_build  # noqa: E402


def make_dat_unit():
    return {
        'Class': 0,
        'Projectiles': [-1, -1],
        'ChargeProjectile': -1,
        'ChargeEvent': 0,
        'RechargeRate': 0,
        'Transform': -1,
    }


class ArmyResearchBuild1402Tests(unittest.TestCase):
    def test_build_collects_team_bonus_disables_type8_and_type18_enables_and_loc_enabler_name(self):
        units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        max_uid = max(u['id'] for u in units) + 1
        dat_units = [make_dat_unit() for _ in range(max_uid)]

        fake_dat = {
            'Techs': [
                # t:0 -> location > 0, enables 2550 (Champi Scout), no tech catalog name, no upgrades
                {
                    'Name': 'Champi Scout (Make avail)',
                    'EffectID': 0,
                    'Civ': -1,
                    'RequiredTechs': [],
                    'RequiredTechCount': 0,
                    'ResearchLocation': 12,
                    'ResearchTime': 0,
                    'Cost': [],
                },
                # t:1 -> location <= 0, enables 2550 -> name stays None
                {
                    'Name': 'Hidden Enable',
                    'EffectID': 0,
                    'Civ': -1,
                    'RequiredTechs': [],
                    'RequiredTechCount': 0,
                    'ResearchLocation': -1,
                    'ResearchTime': 0,
                    'Cost': [],
                },
            ],
            'Effects': [
                {'Name': 'Enable Champi', 'EffectCommands': [{'Type': 2, 'A': 2550, 'B': 1, 'C': -1, 'D': 0.0}]},
                {
                    'Name': 'Civ Tree',
                    'EffectCommands': [
                        {'Type': 102, 'A': -1, 'B': -1, 'C': -1, 'D': 265.0},
                        {'Type': 8, 'A': 1451, 'B': 12, 'C': -1, 'D': 1.0},
                        {'Type': 18, 'A': 599, 'B': 12, 'C': -1, 'D': 1.0},
                        {'Type': 8, 'A': 999, 'B': 5, 'C': -1, 'D': 1.0},  # B != 12 -> ignored
                        {'Type': 8, 'A': 998, 'B': 12, 'C': -1, 'D': 0.0},  # D != 1.0 -> ignored
                    ],
                },
                {
                    'Name': 'Civ Team Bonus',
                    'EffectCommands': [
                        {'Type': 102, 'A': -1, 'B': -1, 'C': -1, 'D': 656.0},
                    ],
                },
            ],
            'Civs': [
                {'Name': 'Gaia', 'TechTreeID': -1, 'TeamBonusID': -1, 'Units': dat_units},
                {'Name': 'Vietnamese', 'TechTreeID': 1, 'TeamBonusID': 2, 'Units': dat_units},
            ],
            'BuildTech': {},
        }

        built = army_research_build.build(fake_dat)
        self.assertEqual(built['nodes']['0']['name'], '启用：蔷琵斥候')
        self.assertIsNone(built['nodes']['1']['name'])
        self.assertEqual(built['civs']['Vietnamese']['disabled'], [265, 656])
        self.assertEqual(built['civs']['Vietnamese']['enabled'], [599, 1451])

    def test_committed_army_research_json_invariants(self):
        ar = json.loads((ROOT / 'data/game/army_research.json').read_text(encoding='utf-8'))
        self.assertEqual(len(ar['nodes']), 1510)
        self.assertEqual(ar['nodes']['1350']['name'], '启用：蔷琵斥候')
        self.assertIn(656, ar['civs']['Vietnamese']['disabled'])
        self.assertIn(1451, ar['civs']['Spanish']['enabled'])
        self.assertIn(1454, ar['civs']['Byzantines']['enabled'])
        self.assertIn(236, ar['civs']['Byzantines']['enabled'])
        self.assertIn(599, ar['civs']['Berbers']['enabled'])
        for civ in ('Incas', 'Mapuche', 'Muisca', 'Tupi'):
            for tid in (1350, 1402, 1351, 1352):
                self.assertIn(tid, ar['civs'][civ]['enabled'], f'{civ} missing t:{tid}')
        for tid in (236, 1454, 1350, 599):
            self.assertNotIn(tid, ar['civs']['Franks']['enabled'], f'Franks must not enable t:{tid}')


if __name__ == '__main__':
    unittest.main()
