"""Khmer exporter preserves full raw, independent physical supply and prerequisite witnesses."""
import contextlib
import copy
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import eco_build  # noqa: E402


class Khmer197Export(unittest.TestCase):
    TECHS = (638, 654, 657, 672)
    NODES = (216, 659, 660, 661, 666, 667, 668, 25, 147, 148)

    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='khmer197-export-') as directory:
            root = Path(directory)
            (root / 'src/data').mkdir(parents=True)
            (root / 'docs').mkdir()
            for name in ('units', 'techs', 'buildings', 'civs', 'effects'):
                shutil.copyfile(eco_build.ROOT / f'src/data/{name}.json', root / f'src/data/{name}.json')
            with patch.object(eco_build, 'ROOT', root), patch.object(eco_build, 'load', return_value=data), contextlib.redirect_stdout(io.StringIO()):
                eco_build.main()
            return json.loads((root / 'src/data/eco.json').read_text())

    @staticmethod
    def raw(data, tech):
        t = data['Techs'][tech]
        return {'tech': tech, 'civ': t['Civ'], 'effectId': t['EffectID'],
                'requiredCount': t['RequiredTechCount'], 'requires': [tid for tid in t['RequiredTechs'] if tid >= 0],
                'researchLocation': t['ResearchLocation'], 'researchAt': t['ResearchAt'],
                'researchTime': t['ResearchTime'], 'cost': t['Cost'], 'commands': eco_build.eff(data, t['EffectID'])}

    def test_physical_farm_fields_are_exported_independently_of654(self):
        expected = {'civId': 28, 'farms': [
            {'unit': uid, 'type': self.data['Civs'][1]['Units'][uid]['Type'],
             'class': self.data['Civs'][1]['Units'][uid]['Class'],
             'workRate': round(self.data['Civs'][1]['Units'][uid]['WorkRate'], 4),
             'capacity': self.data['Civs'][1]['Units'][uid]['Capacity']} for uid in (50, 1187)]}
        self.assertEqual(self.generated.get('khmerFarm'), expected)
        self.assertNotIn('initialFood', expected)
        self.assertNotIn('tasks', expected)

    def test_complete_four_techs_include_empty638_and657_rows(self):
        rows = {r['tech']: r for r in self.generated['civEco']['Khmer'] if 'tech' in r}
        self.assertEqual(set(rows), set(self.TECHS))
        for tid in self.TECHS:
            self.assertEqual(rows[tid].get('khmerTech'), self.raw(self.data, tid), tid)
            self.assertEqual(rows[tid]['source'], 'bonus')
            self.assertEqual(rows[tid]['name'], self.data['Techs'][tid]['Name'])
        self.assertEqual(rows[638]['effects'], [])
        self.assertEqual(rows[657]['effects'], [])

    def test_ten_prerequisite_witnesses_are_full_existing_cache_headers(self):
        expected = {'civId': 28, 'nodes': {str(i): self.raw(self.data, i) for i in self.NODES}}
        self.assertEqual(self.generated.get('khmerPrerequisites'), expected)
        self.assertEqual(len(expected['nodes']), 10)
        self.assertIn(638, expected['nodes']['216']['requires'])
        for tid in (25, 147, 148):
            self.assertIn(101, expected['nodes'][str(tid)]['requires'])
            self.assertEqual(expected['nodes'][str(tid)]['requiredCount'], 2)

    def test_tree24_and_team6_are_retained_even_with_no_economic_decode(self):
        rows = self.generated['civEco']['Khmer']
        tree = [r for r in rows if 'khmerTree' in r]
        team = [r for r in rows if 'khmerTeam' in r]
        self.assertEqual(len(tree), 1)
        self.assertEqual(len(team), 1)
        self.assertEqual(tree[0]['khmerTree'], {'civId': 28, 'treeId': 646, 'commands': eco_build.eff(self.data, 646)})
        self.assertEqual(team[0]['khmerTeam'], {'civId': 28, 'teamId': 647, 'commands': eco_build.eff(self.data, 647)})
        self.assertEqual(tree[0]['effects'], [])
        self.assertEqual(team[0]['effects'], [])
        self.assertEqual(len(tree[0]['khmerTree']['commands']), 24)
        self.assertEqual(len(team[0]['khmerTeam']['commands']), 6)

    def test_unknown_only_canonical_techs_cannot_disappear_after_decode(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        data['Effects'].append({'EffectCommands': [unknown]})
        data['Techs'][638]['EffectID'] = len(data['Effects']) - 1
        for tid in (654, 657, 672):
            data['Effects'][data['Techs'][tid]['EffectID']]['EffectCommands'] = [unknown]
        rows = {r['tech']: r for r in self.export(data)['civEco']['Khmer'] if 'tech' in r}
        self.assertEqual(set(rows), set(self.TECHS))
        for tid in self.TECHS:
            self.assertEqual(rows[tid]['effects'], [])
            self.assertEqual(rows[tid].get('khmerTech'), self.raw(data, tid))

    def test_unknown_tree_team_companions_and_unknown_only_rows_remain_visible(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for eid in (646, 647):
            data['Effects'][eid]['EffectCommands'] = [unknown]
        rows = self.export(data)['civEco']['Khmer']
        tree = [r for r in rows if 'khmerTree' in r]
        team = [r for r in rows if 'khmerTeam' in r]
        self.assertEqual(len(tree), 1)
        self.assertEqual(len(team), 1)
        self.assertEqual(tree[0]['khmerTree']['commands'], [unknown])
        self.assertEqual(team[0]['khmerTeam']['commands'], [unknown])
        self.assertEqual(tree[0]['effects'], [])
        self.assertEqual(team[0]['effects'], [])

    def test_wrong_civ_site_and_missing_effect_do_not_masquerade_as_whole_removal(self):
        data = copy.deepcopy(self.data)
        data['Techs'][638]['Civ'] = 27
        data['Techs'][654]['ResearchLocation'] = 109
        data['Techs'][657]['EffectID'] = -1
        data['Techs'][672]['RequiredTechs'] = [101, -1, -1, -1, -1, -1]
        rows = {r['tech']: r for r in self.export(data)['civEco']['Khmer'] if 'tech' in r}
        self.assertEqual(set(rows), set(self.TECHS))
        for tid in self.TECHS:
            self.assertEqual(rows[tid].get('khmerTech'), self.raw(data, tid), tid)

    def test_wrong_tree_and_team_ids_preserve_canonical_empty_raw_context(self):
        data = copy.deepcopy(self.data)
        data['Civs'][28]['TechTreeID'] = -1
        data['Civs'][28]['TeamBonusID'] = -1
        rows = self.export(data)['civEco']['Khmer']
        tree = [r for r in rows if 'khmerTree' in r]
        team = [r for r in rows if 'khmerTeam' in r]
        self.assertEqual(len(tree), 1)
        self.assertEqual(len(team), 1)
        self.assertEqual(tree[0]['khmerTree'], {'civId': 28, 'treeId': -1, 'commands': []})
        self.assertEqual(team[0]['khmerTeam'], {'civId': 28, 'teamId': -1, 'commands': []})

    def test_physical_and_prerequisite_export_read_cache_instead_of_constant_outputs(self):
        data = copy.deepcopy(self.data)
        data['Civs'][1]['Units'][50].update({'Type': 70, 'Class': 4, 'WorkRate': .43333333, 'Capacity': 16})
        data['Techs'][659]['RequiredTechCount'] = 2
        generated = self.export(data)
        physical = generated.get('khmerFarm', {})
        self.assertIn('farms', physical)
        self.assertEqual(physical['farms'][0], {'unit': 50, 'type': 70, 'class': 4, 'workRate': .4333, 'capacity': 16})
        prerequisites = generated.get('khmerPrerequisites', {})
        self.assertIn('nodes', prerequisites)
        self.assertEqual(prerequisites['nodes']['659'], self.raw(data, 659))

    def test_all_old_globals_other55_and_original_two_khmer_rows_remain_exact(self):
        for key, value in self.checked.items():
            if key not in ('civEco', 'khmerFarm', 'khmerPrerequisites'):
                self.assertEqual(self.generated[key], value, key)
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Khmer':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)
                self.assertFalse(any('khmerTech' in r or 'khmerTree' in r or 'khmerTeam' in r for r in rows), civ)
        strip = lambda rows: [{k: v for k, v in r.items() if k not in ('khmerTech', 'khmerTree', 'khmerTeam')}
                              for r in rows if r.get('tech') in (654, 672)]
        self.assertEqual(strip(self.generated['civEco']['Khmer']), strip(self.checked['civEco']['Khmer']))


if __name__ == '__main__':
    unittest.main()
