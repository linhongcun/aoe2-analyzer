import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('relic_income_build', ROOT / 'scripts/relic_income_build.py')
relic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relic)


class RelicIncome238Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'src/data/relic_income.json').read_text())

    def fixture(self):
        """Reconstruct the small audited fields to exercise rejection, without .dat/cache/network."""
        d = copy.deepcopy(self.data)
        base = next(iter(d['civs'].values()))['baseResources']
        civs = [{'id': 0, 'name': 'Gaia', 'teamBonusId': -1, 'resources': base}]
        civs += sorted([{'id': v['datCiv'], 'name': name, 'teamBonusId': {'Aztecs': 488, 'Burgundians': 783}.get(name, -1), 'resources': v['baseResources']} for name, v in d['civs'].items()], key=lambda c: c['id'])
        effects, techs = {}, {}
        for m in d['modifiers'].values():
            key = str(m['effectId'])
            effects[key] = {'id': m['effectId'], 'name': key, 'commands': [{} for _ in range(9)]}
            for i, c in zip(m['commandIndices'], m['commands']):
                effects[key]['commands'][i] = c
        for i, c in zip((7, 8), d['modifiers']['atheism']['neutralCommands']):
            effects['464']['commands'][i] = c
        for t in d['lithuanians']['thresholds']:
            techs[str(t['tech']['id'])] = t['tech']
            effects[str(t['effect']['id'])] = t['effect']
        for t in d['armenianChain']['techs']:
            techs[str(t['id'])] = t
        for e in d['armenianChain']['effects']:
            effects[str(e['id'])] = e
        techs['21'] = {'id': 21, 'civ': d['civs']['Huns']['datCiv'], 'effectId': 464}
        techs['506'] = {'id': 506, 'civ': d['civs']['Hindustanis']['datCiv'], 'effectId': 562}
        return {'civs': civs, 'effects': effects, 'techs': techs, 'audit': d['audit']}

    def test_generated_provenance_and_roundtrip(self):
        self.assertEqual(self.data['meta']['datSha256'], relic.DAT['sha256'])
        self.assertFalse(self.data['meta']['engineVerifiedInPinnedBuild'])
        self.assertEqual(self.data, relic.build(self.fixture()))
        self.assertEqual(len(self.data['civs']), 56)
        self.assertIn('3dab81b6', self.data['meta']['fieldSemantics']['resources'])

    def test_rates_come_from_dat_fields_not_semantics_document_examples(self):
        d = self.data
        self.assertEqual(d['baseRates'], {'Gold': 30.0, 'Food': 0.0, 'Wood': 0.0, 'Stone': 0.0})
        self.assertEqual(d['modifiers']['burgundians']['value'], 20)
        self.assertEqual(d['modifiers']['aztecs']['value'], 1.3300000429153442)
        self.assertEqual(d['modifiers']['aztecs']['displayValue'], 1.33)
        self.assertEqual(d['modifiers']['grandTrunkRoad']['value'], 1.100000023841858)
        self.assertEqual(d['modifiers']['grandTrunkRoad']['displayValue'], 1.1)
        self.assertEqual(d['modifiers']['atheism']['value'], 0.5)
        self.assertEqual(d['modifiers']['grandTrunkRoad']['commands'][0]['Type'], 6)
        self.assertGreater(d['modifiers']['aztecs']['commands'][0]['D'], 1.33)

    def test_named_resource_ids_match_the_audited_dat_fields(self):
        self.assertEqual(self.data['resourceIds'], {'Gold': 191, 'Food': 225, 'Wood': 264, 'Stone': 265})
        base = self.data['civs']['Franks']['baseResources']
        for resource, field in self.data['resourceIds'].items():
            self.assertEqual(self.data['baseRates'][resource], base[str(field)])

    def test_exhaustive_paths_and_absence_of_relic_task(self):
        a = self.data['audit']
        self.assertEqual(a['resourceTaskReferences'], [])
        self.assertEqual(a['headerResourceTaskReferences'], [])
        self.assertGreater(a['unitTaskCount'], 400000)
        self.assertGreater(a['headerTaskCount'], 2000)
        self.assertEqual(len(a['resourceCommands']), 7)
        self.assertTrue(all(u['tasks'] == [] for u in a['gaiaRelics'].values()))
        self.assertTrue(all(t['action_type'] != 151 for u in a['monasteries'].values() for t in u['tasks']))
        self.assertTrue(all(c['Type'] == 36 for c in self.data['modifiers']['atheism']['neutralCommands']))

    def test_lithuanian_gates_targets_and_cap(self):
        l = self.data['lithuanians']
        self.assertEqual([t['count'] for t in l['thresholds']], [1, 2, 3, 4])
        self.assertEqual(l['cap'], 4)
        self.assertEqual([u['id'] for u in l['units']], [38, 283, 569, 1234, 1236])
        self.assertEqual([u['id'] for u in l['extraRawTargets']], [1813])
        self.assertEqual(l['thresholds'][0]['tech']['requires'], [104, 107])
        for previous, current in zip(l['thresholds'], l['thresholds'][1:]):
            self.assertIn(previous['tech']['id'], current['tech']['requires'])
        self.assertEqual(l['attackClass'], 4)
        self.assertEqual(l['attackIncrement'], 1)

    def test_armenian_spawn_is_a_count_source_not_a_rate_modifier(self):
        a = self.data['armenianChain']
        self.assertEqual(a['helper']['buildingTech'], 957)
        commands = next(e['commands'] for e in a['effects'] if e['id'] == 952)
        self.assertEqual([(c['A'], c['D']) for c in commands if c['Type'] == 1 and c['A'] == 283], [(283, 1), (283, 0)])
        self.assertEqual([c['A'] for c in commands if c['Type'] == 7], [285])
        self.assertFalse(any(c['Type'] in (1, 6) and c['A'] in (191, 225, 264, 265) for c in commands))

    def test_new_resource_path_or_task_stops_export(self):
        for field in ('resourceTaskReferences', 'headerResourceTaskReferences', 'resourceCommands'):
            raw = self.fixture()
            raw['audit'][field].append({'effectId': 100, 'index': 0})
            with self.subTest(field=field), self.assertRaises(AssertionError):
                relic.build(raw)

    def test_civilization_base_divergence_or_invalid_value_stops_export(self):
        for value in (-1, float('nan'), float('inf')):
            raw = self.fixture()
            for c in raw['civs']:
                c['resources']['191'] = value
            with self.subTest(value=value), self.assertRaises(AssertionError):
                relic.build(raw)
        raw = self.fixture()
        raw['civs'][2]['resources']['191'] += 1
        with self.assertRaises(AssertionError):
            relic.build(raw)

    def test_wrong_ownership_operation_or_enemy_branch_stops_export(self):
        for key, field, value in [('488', 'Type', 16), ('783', 'A', 191), ('562', 'D', float('nan')), ('464', 'Type', 26)]:
            raw = self.fixture()
            index = 7 if key == '464' else 5 if key == '562' else 0
            raw['effects'][key]['commands'][index][field] = value
            with self.subTest(key=key, field=field), self.assertRaises(AssertionError):
                relic.build(raw)
        raw = self.fixture()
        raw['techs']['506']['civ'] = raw['techs']['21']['civ']
        with self.assertRaises(AssertionError):
            relic.build(raw)


if __name__ == '__main__':
    unittest.main()
