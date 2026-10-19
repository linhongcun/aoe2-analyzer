import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('market_build', ROOT / 'scripts/market_build.py')
market = importlib.util.module_from_spec(spec)
spec.loader.exec_module(market)


class MarketDataTest(unittest.TestCase):
    def test_generated_data_separates_dat_from_engine_claims(self):
        data = json.loads((ROOT / 'src/data/market.json').read_text())
        rules = json.loads((ROOT / 'scripts/market_rules.json').read_text())
        self.assertEqual(data['engine'], rules)
        self.assertEqual(data['meta']['datSha256'], market.DAT['sha256'])
        self.assertFalse(data['meta']['engineVerifiedInPinnedBuild'])
        self.assertEqual(data['meta']['feeResource'], 78)
        techs = json.loads((ROOT / 'src/data/techs.json').read_text())
        guilds = next(t for t in techs if t['id'] == 15)
        self.assertEqual(data['guilds']['civs'], guilds['civs'])
        self.assertNotIn('Hindustanis', data['guilds']['civs'])
        self.assertNotIn('Saracens', data['guilds']['civs'])

    def test_exporter_requires_the_known_effect_civilizations(self):
        raw = {'baseFee': 0.3, 'feeEffects': [
            {'tech': 15, 'civ': -1, 'fee': 0.15}, {'tech': 355, 'civ': 9, 'fee': 0.05}, {'tech': 506, 'civ': 20, 'fee': 0.1}]}
        techs = json.loads((ROOT / 'src/data/techs.json').read_text())
        rules = json.loads((ROOT / 'scripts/market_rules.json').read_text())
        built = market.build(raw, techs, rules)
        self.assertEqual(built['civFees']['Saracens']['fee'], 0.05)
        self.assertEqual(built['uniqueFees']['Hindustanis']['fee'], 0.1)
        raw['feeEffects'][1]['civ'] = 10
        with self.assertRaises(AssertionError):
            market.build(raw, techs, rules)


if __name__ == '__main__':
    unittest.main()
