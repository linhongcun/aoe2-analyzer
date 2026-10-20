import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('trade_income_build', ROOT / 'scripts/trade_income_build.py')
trade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trade)


class TradeIncome226Test(unittest.TestCase):
    def test_provenance_and_population_templates(self):
        data = json.loads((ROOT / 'src/data/trade_income.json').read_text())
        self.assertEqual(data['meta']['datSha256'], trade.DAT['sha256'])
        self.assertFalse(data['meta']['engineVerifiedInPinnedBuild'])
        self.assertEqual(data, trade.build(data['units']))
        self.assertEqual(set(data['units']), {'17', '128'})

    def test_unknown_or_invalid_population_cannot_become_zero(self):
        for units in ({}, {'17': {'population': 0}, '128': {'population': 1}},
                      {'17': {'population': -1}, '128': {'population': 1}},
                      {'17': {'population': float('inf')}, '128': {'population': 1}}):
            with self.assertRaises(AssertionError):
                trade.build(units)


if __name__ == '__main__':
    unittest.main()
