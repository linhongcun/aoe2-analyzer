"""#224 fixed-data regressions, without a game client or network dependency."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('garrison_general_build', ROOT / 'scripts/garrison_general_build.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GarrisonGeneral224Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'src/data/garrison_general.json').read_text())
        cls.hosts = json.loads((ROOT / 'src/data/garrison_hosts.json').read_text())

    def test_attack_multiplier_decodes_class_and_percentage(self):
        commands = [{'Type': 5, 'A': 4, 'B': -1, 'C': 9, 'D': 858}]
        self.assertEqual(module.decode(commands, self.data['units']),
                         [{'unit': 4, 'stat': 'attack', 'op': 'mul', 'value': 0.9}])

    def test_melee_attack_does_not_become_pierce_contribution(self):
        commands = [{'Type': 4, 'A': 74, 'B': -1, 'C': 9, 'D': 1025}]
        self.assertEqual(module.decode(commands, self.data['units']), [])

    def test_aliases_deduplicate_each_class_command(self):
        units = {'45': {'class': 3}, '133': {'class': 3}}
        commands = [{'Type': 4, 'A': -1, 'B': 3, 'C': 2, 'D': 5}]
        self.assertEqual(module.decode(commands, units, {133: 45}),
                         [{'unit': 45, 'stat': 'capacity', 'op': 'add', 'value': 5}])

    def test_potential_hosts_include_civ_enabled_zero_capacity_buildings(self):
        self.assertTrue({68, 70, 2556}.issubset(self.hosts))
        self.assertEqual(self.data['units']['70']['capacity'], 0)
        self.assertIn({'unit': 70, 'stat': 'garrisonType', 'op': 'set', 'value': 1},
                      next(r for r in self.data['civs']['Khmer']['automatic'] if r['id'] == 657)['effects'])
        self.assertIn({'unit': 68, 'stat': 'garrisonType', 'op': 'set', 'value': 16},
                      next(r for r in self.data['civs']['Gurjaras']['automatic'] if r['id'] == 856)['effects'])
        self.assertIn({'unit': 2556, 'stat': 'capacity', 'op': 'add', 'value': 5},
                      next(r for r in self.data['civs']['Tupi']['automatic'] if r['id'] == 1395)['effects'])

    def test_mobile_carriers_are_not_building_hosts(self):
        self.assertFalse({545, 1105, 1258, 1808}.intersection(self.hosts))
        # Mule carts retain the building structure despite being mobile.
        self.assertEqual((self.data['units']['1808']['type'], self.data['units']['1808']['sizeClass']), (80, 4))

    def test_fishing_ship_uses_current_bird_garrison_tasks(self):
        self.assertEqual(self.data['units']['13']['garrisonTasks'], [{'classId': 3, 'unitId': -1}])
        for unit in (17, 21, 539, 545, 1750, 2633):
            self.assertEqual(self.data['units'][str(unit)]['garrisonTasks'], [])

    def test_dock_uses_four_age_forms(self):
        self.assertEqual(self.data['buildings']['45']['eraForms'], [45, 133, 47, 51])
        self.assertEqual([self.data['units'][str(i)]['max'] for i in (45, 133, 47, 51)], [1, 4, 5, 6])

    def test_donjon_age_changes_are_not_lost_to_research_catalog_filtering(self):
        self.assertEqual(self.data['units']['1665']['attack'], 0)
        for tid, maximum in ((101, 5), (102, 3), (103, 4)):
            effects = self.data['ageRules'][str(tid)]['effects']
            self.assertIn({'unit': 1665, 'stat': 'total', 'op': 'add', 'value': 1}, effects)
            self.assertIn({'unit': 1665, 'stat': 'max', 'op': 'add', 'value': maximum}, effects)

    def test_bombard_capacity_modifier_belongs_to_teuton_automatic_bonus(self):
        bonus = next(r for r in self.data['civs']['Teutons']['automatic'] if r['id'] == 353)
        self.assertIn({'unit': 236, 'stat': 'capacity', 'op': 'add', 'value': 5}, bonus['effects'])
        self.assertIn({'unit': 236, 'stat': 'max', 'op': 'add', 'value': 4}, bonus['effects'])
        self.assertFalse(any(e['unit'] == 236 and e['stat'] == 'max' for e in self.data['techs']['11']['effects']))

    def test_size_class_exceptions_do_not_follow_legacy_object_group(self):
        self.assertEqual((self.data['units']['1811']['class'], self.data['units']['1811']['sizeClass']), (6, 4))
        self.assertEqual((self.data['units']['775']['class'], self.data['units']['775']['sizeClass']), (18, 3))
        self.assertEqual(self.data['units']['1263']['sizeClass'], 3)

    def test_multishot_inputs_keep_secondary_attack_and_bulk_flags(self):
        self.assertEqual(self.data['units']['73']['secondaryProjectile'], 510)
        self.assertEqual(self.data['units']['510']['attack'], 3)
        self.assertEqual(self.data['units']['1231']['combatAbility'] & 16, 16)
        self.assertEqual(self.data['units']['1952']['max'], 6)
        self.assertEqual(self.data['units']['1968']['chargeType'], 6)
        self.assertEqual(self.data['units']['1968']['maxCharge'], 20)

    def test_hidden_markers_and_n_of_church_dependencies_are_preserved(self):
        rules = {r['id']: r for r in self.data['conditional']}
        self.assertEqual((rules[943]['requires'], rules[943]['count']), ([199, 930, 941], 2))
        self.assertIn(930, {r['id'] for r in self.data['civs']['Georgians']['automatic']})
        self.assertIn(941, {r['id'] for r in self.data['civs']['Armenians']['automatic']})

    def test_extra_train_location_uses_selected_slot(self):
        self.assertEqual(self.data['techs']['16']['trainingLocations'],
                         [{'unit': 41, 'slot': 1, 'location': 12}, {'unit': 555, 'slot': 1, 'location': 12}])
        self.assertEqual(self.data['unitUpgradeTechs']['24'], [100])
        self.assertEqual(self.data['unitUpgradeTechs']['234'], [140])

    def test_relic_deposit_and_transformed_monastery_stay_separate(self):
        tasks = self.data['units']['286']['specialTasks']
        self.assertTrue(any(t['action'] == 136 and t['unitId'] == 104 for t in tasks))
        self.assertEqual(self.data['relicIds'], [285])
        self.assertIn(104, self.data['buildings']['1806']['predecessors'])
        self.assertIn(45, self.data['buildings']['1189']['predecessors'])

    def test_extra_occupants_have_chinese_labels(self):
        for unit in (285, 286, 434, *self.data['herdableIds']):
            self.assertRegex(self.data['units'][str(unit)]['zh'], '[\u4e00-\u9fff]')

    def test_all_civilizations_and_source_pin_are_explicit(self):
        civs = json.loads((ROOT / 'src/data/civs.json').read_text())
        self.assertEqual(set(self.data['civs']), {c['en'] for c in civs})
        self.assertEqual(self.data['meta']['sha256'], module.DAT['sha256'])
        self.assertFalse(self.data['meta']['engineVerifiedInPinnedBuild'])
        self.assertIn(47, self.data['civs']['Turks']['free'])


if __name__ == '__main__':
    unittest.main()
