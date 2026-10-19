"""#229 original-field and conservative healing-policy regressions."""
import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('garrison_healing_build', ROOT / 'scripts/garrison_healing_build.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GarrisonHealing229Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'src/data/garrison_healing.json').read_text())

    def test_pin_and_model_claim_are_explicit(self):
        pin = json.loads((ROOT / 'scripts/data_sources.json').read_text())['sources']['dat']
        self.assertEqual(self.data['meta']['sha256'], pin['sha256'])
        self.assertEqual(self.data['meta']['commit'], pin['commit'])
        self.assertFalse(self.data['meta']['engineVerifiedInPinnedBuild'])

    def test_all_garrison_objects_have_a_healing_policy(self):
        general = json.loads((ROOT / 'src/data/garrison_general.json').read_text())
        self.assertEqual(set(self.data['units']), set(general['units']))
        self.assertEqual(self.data['hostIds'], json.loads((ROOT / 'src/data/garrison_hosts.json').read_text()))
        self.assertEqual(len(self.data['hostIds']), 20)

    def test_static_rates_keep_original_float_precision(self):
        for uid, expected in [(109, 0.1), (79, 0.1), (82, 0.2), (1251, 0.2), (1806, 0.4),
                              (104, 1.5), (12, 0.5), (87, 0.5), (101, 0.25)]:
            self.assertAlmostEqual(self.data['units'][str(uid)]['healRate'], expected)
        self.assertNotEqual(self.data['units']['109']['healRate'], 0.1)

    def test_zero_rate_hosts_do_not_become_healers(self):
        for uid in (49, 84, 45, 1189, 68, 70, 2556):
            self.assertEqual(self.data['units'][str(uid)]['healRate'], 0)

    def test_repair_rate_is_not_implicitly_substituted_for_healing(self):
        for uid in self.data['hostIds']:
            self.assertEqual(self.data['units'][str(uid)]['repairRate'], 0)

    def test_relic_and_special_occupants_are_distinct(self):
        self.assertEqual(self.data['units']['285']['eligibility'], 'ineligible')
        for uid in (1808, 594, 280, 13):
            self.assertEqual(self.data['units'][str(uid)]['eligibility'], 'unverified')
        for uid in (83, 293, 4, 74, 125, 434):
            self.assertEqual(self.data['units'][str(uid)]['eligibility'], 'organic')

    def test_only_the_audited_direct_rate_technology_is_exported(self):
        self.assertEqual(set(self.data['rateTechs']), {'441'})
        herbal = self.data['rateTechs']['441']
        self.assertEqual((herbal['requires'], herbal['count']), ([102], 1))
        effects = herbal['effects']
        self.assertEqual(len(effects), 2)
        self.assertTrue(all(e['op'] == 'mul' and e['value'] == 6 for e in effects))
        self.assertEqual(sum(82 in e['units'] for e in effects), 1)
        self.assertEqual(sum(109 in e['units'] for e in effects), 1)

    def test_generator_excludes_type_202_from_global_attribute_multiplication(self):
        units = {'82': {'hp': 4800, 'type': 80, 'class': 3, 'healRate': 0.2, 'repairRate': 0},
                 '79': {'hp': 1020, 'type': 80, 'class': 52, 'healRate': 0.1, 'repairRate': 0}}
        d = {'Techs': [{'EffectID': -1}] * 441 + [{'EffectID': 0, 'RequiredTechs': [102, -1], 'RequiredTechCount': 1}],
             'Effects': [{'EffectCommands': [{'Type': 5, 'A': -1, 'B': 3, 'C': 108, 'D': 6},
                                            {'Type': 5, 'A': -1, 'B': 52, 'C': 108, 'D': 6},
                                            {'Type': 202, 'A': 82, 'B': -1, 'C': 108, 'D': 6}]}]}
        generated = module.generate(d, {'units': copy.deepcopy(units), 'overrides': {}})
        self.assertEqual(generated['rateTechs']['441']['effects'], [
            {'units': [82], 'op': 'mul', 'value': 6}, {'units': [79], 'op': 'mul', 'value': 6}])

    def test_a_new_rate_source_requires_an_explicit_audit(self):
        with self.assertRaisesRegex(ValueError, 'requires a model audit'):
            module.generate({'Techs': [], 'Effects': []}, {'units': {}, 'overrides': {}})

    def test_a_new_civilization_base_override_cannot_be_ignored(self):
        with self.assertRaisesRegex(ValueError, 'override requires a model audit'):
            module.generate({'Techs': [], 'Effects': []}, {'units': {}, 'overrides': {'British': {'109': {'healRate': 1}}}})


if __name__ == '__main__':
    unittest.main()
