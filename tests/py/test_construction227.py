"""Construction source-field regressions; no game client or network needed."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from construction_build import expand


class Construction227Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = expand(json.loads((ROOT / 'src/data/construction.json').read_text()))

    def test_support_matrix_and_provenance(self):
        self.assertEqual(len(self.data['buildings']), 38)
        self.assertEqual(sum(b['supported'] for b in self.data['buildings'].values()), 37)
        self.assertEqual(len(self.data['civs']), 56)
        self.assertFalse(self.data['meta']['engineVerifiedInPinnedBuild'])
        pins = json.loads((ROOT / 'scripts/data_sources.json').read_text())
        self.assertEqual(self.data['meta']['patch'], '%s (%s)' % (pins['patch']['name'], pins['patch']['date']))
        self.assertEqual(self.data['meta']['sha256'], pins['sources']['dat']['sha256'])

    def test_tc_uses_actual_annexes(self):
        self.assertEqual(self.data['buildings']['109']['forms'], [621, 617, 484, 597])
        for civ in self.data['civs'].values():
            for uid in (621, 617, 484, 597):
                self.assertEqual(civ['units'][str(uid)]['time'], 150)
                self.assertIn(118, civ['units'][str(uid)]['at'])

    def test_fishing_ship_is_not_an_ordinary_villager(self):
        self.assertFalse(self.data['buildings']['199']['supported'])
        self.assertEqual(self.data['civs']['Franks']['units']['199']['at'], [13])

    def test_ordinary_builders_are_equal_not_additive_duplicates(self):
        for c in self.data['civs'].values():
            self.assertEqual(c['units']['118']['rate'], c['units']['212']['rate'])
        self.assertEqual(len(self.data['research']['54']['commands']), 2)

    def test_sicilian_first_tc_gate_is_retained_for_all_targets(self):
        rule = next(r for r in self.data['civs']['Sicilians']['automatic'] if r['id'] == 770)
        self.assertEqual(rule['requires'], [307])
        self.assertEqual(rule['count'], 1)
        self.assertEqual({c['B'] for c in rule['commands'] if c['A'] == -1}, {27, 39, 52})

    def test_cuman_sequential_rules_keep_their_dependencies(self):
        rules = {r['id']: r for r in self.data['civs']['Cumans']['automatic']}
        self.assertEqual(rules[723]['requires'], [101, 722])
        self.assertEqual(rules[724]['requires'], [102, 723])

    def test_raw_builder_and_wonder_modifiers_are_not_normalized_away(self):
        commands = self.data['civs']['Spanish']['tree']
        self.assertTrue(any(c['A'] == 118 and c['C'] == 13 and 1.29 < c['D'] < 1.31 for c in commands))
        self.assertTrue(any(c['A'] == 276 and c['C'] == 101 and 1.08 < c['D'] < 1.09 for c in commands))
        romans = next(r for r in self.data['civs']['Romans']['automatic'] if r['id'] == 887)
        self.assertTrue(any(c['A'] == -1 and c['B'] == 4 and c['C'] == 13 for c in romans['commands']))

    def test_wu_hidden_team_technology_never_leaks_to_other_civilizations(self):
        for name, civ in self.data['civs'].items():
            ids = {r['id'] for r in civ['automatic']}
            self.assertEqual(1089 in ids, name == 'Wu')

    def test_research_keeps_original_effect_and_command_indices(self):
        crane = self.data['research']['54']
        self.assertEqual(crane['effect'], 54)
        self.assertEqual({c['index'] for c in crane['commands']}, {0, 1})
