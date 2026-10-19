"""#218 extraction regressions; no game or network required for unit cases."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('garrison_build', ROOT / 'scripts/garrison_build.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Garrison218Test(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'src/data/garrison.json').read_text())

    def test_villager_class_target_preserves_raw_flat_dps_change(self):
        effects = module.decode([{'Type': 4, 'A': -1, 'B': 4, 'C': 130, 'D': -0.5}], self.data['units'])
        self.assertEqual(effects, [{'unit': i, 'stat': 'firepower', 'op': 'add', 'value': -0.5} for i in (83, 293)])

    def test_pierce_encoding_is_not_read_as_769_attack(self):
        effects = module.decode([{'Type': 4, 'A': 79, 'B': -1, 'C': 9, 'D': 769}], self.data['units'])
        self.assertEqual(effects, [{'unit': 79, 'stat': 'attack', 'op': 'add', 'value': 1}])

    def test_melee_attack_and_unrelated_targets_do_not_increase_arrows(self):
        cmds = [{'Type': 4, 'A': -1, 'B': 4, 'C': 9, 'D': 1025},
                {'Type': 4, 'A': 82, 'B': -1, 'C': 102, 'D': 8}]
        self.assertEqual(module.decode(cmds, self.data['units']), [])

    def test_base_slot_and_maximum_stay_separate(self):
        tc = self.data['units']['109']
        self.assertEqual((tc['projectile'], tc['total'], tc['max'], tc['capacity']), (-1, 1, 11, 15))

    def test_svan_towers_exports_building_and_villager_contributions(self):
        rule = self.data['techs']['923']
        self.assertIn(923, module.TECHS)
        self.assertEqual((rule['requires'], rule['count']), ([102], 1))
        self.assertEqual(rule['effects'], [
            *({'unit': i, 'stat': 'attack', 'op': 'add', 'value': 2} for i in (79, 234, 235, 109)),
            *({'unit': i, 'stat': 'firepower', 'op': 'add', 'value': -1} for i in (83, 293)),
        ])

    def test_conditional_effects_keep_n_of_prerequisites(self):
        rules = {r['id']: r for r in self.data['conditional']}
        self.assertEqual(rules[610]['count'], 2)
        self.assertEqual(rules[610]['requires'], [608, 140, 775])
        self.assertEqual(rules[611]['requires'], [608, 63, 775])

    def test_all_site_civilizations_have_audited_rules(self):
        civs = json.loads((ROOT / 'src/data/civs.json').read_text())
        self.assertEqual(set(self.data['civs']), {c['en'] for c in civs})
        self.assertEqual(self.data['civs']['Turks']['free'], [47])
        self.assertEqual(self.data['meta']['sha256'], module.DAT['sha256'])


if __name__ == '__main__':
    unittest.main()
