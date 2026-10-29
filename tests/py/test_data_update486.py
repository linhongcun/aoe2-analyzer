"""#486: reconcile published balance facts, actual pinned DAT fields and generated units."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from dat_source import load  # noqa: E402


class Update188329(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = load()['Civs'][1]['Units']
        cls.units = {u['id']: u for u in json.loads((ROOT / 'src/data/units.json').read_text())}

    def test_elephant_archer_cost_and_hp_from_dat(self):
        for uid, hp in ((873, 220), (875, 270)):
            raw = self.raw[uid]
            cost = {resource: amount for resource, amount, _ in raw['Cost']}
            self.assertEqual((cost[0], cost[3], raw['HP']), (70, 80, hp))
            self.assertEqual(self.units[uid]['cost'], {'Food': cost[0], 'Gold': cost[3]})
            self.assertEqual(self.units[uid]['hp'], raw['HP'])

    def test_only_non_elite_bolas_speed_changes(self):
        for uid, speed in ((2569, 1.45), (2571, 1.5)):
            self.assertAlmostEqual(self.raw[uid]['Speed'], speed, places=6)
            self.assertEqual(self.units[uid]['spd'], round(self.raw[uid]['Speed'], 2))

    def test_champi_scout_classes_and_unchanged_runner(self):
        for uid, expected in ((2550, 2), (2588, 0)):
            raw = dict(self.raw[uid]['Attacks'])
            generated = dict(self.units[uid]['atks'])
            for cls, name in ((8, '骑兵'), (30, '骆驼')):
                self.assertEqual(raw.get(cls, 0), expected)
                self.assertEqual(generated.get(name, 0), raw.get(cls, 0))


if __name__ == '__main__':
    unittest.main()
