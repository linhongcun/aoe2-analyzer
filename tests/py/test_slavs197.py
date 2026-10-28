"""Slavic canonical raw survives the real exporter even when decode emits no effects.
The exact first-red draft and actual execution evidence are preserved separately.
"""
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


class Slavs197Export(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='slavs197-export-') as directory:
            root = Path(directory)
            (root / 'src/data').mkdir(parents=True)
            (root / 'docs').mkdir()
            for name in ('units', 'techs', 'buildings', 'civs', 'effects'):
                shutil.copyfile(eco_build.ROOT / f'src/data/{name}.json', root / f'src/data/{name}.json')
            with patch.object(eco_build, 'ROOT', root), patch.object(eco_build, 'load', return_value=data), contextlib.redirect_stdout(io.StringIO()):
                eco_build.main()
            return json.loads((root / 'src/data/eco.json').read_text())

    @staticmethod
    def raw_tech(data, tech):
        row = data['Techs'][tech]
        return {'tech': tech, 'civ': row['Civ'], 'effectId': row['EffectID'],
                'requiredCount': row['RequiredTechCount'], 'requires': [tid for tid in row['RequiredTechs'] if tid >= 0],
                'researchLocation': row['ResearchLocation'], 'researchAt': row['ResearchAt'],
                'researchTime': row['ResearchTime'], 'cost': row['Cost'], 'commands': eco_build.eff(data, row['EffectID'])}

    def test_fixed_physical_supplier_metadata_is_independent_of_bonus_row(self):
        expected = {'civId': 23, 'farms': [
            {'unit': uid, 'type': self.data['Civs'][1]['Units'][uid]['Type'],
             'class': self.data['Civs'][1]['Units'][uid]['Class'],
             'workRate': round(self.data['Civs'][1]['Units'][uid]['WorkRate'], 4),
             'capacity': self.data['Civs'][1]['Units'][uid]['Capacity']} for uid in (50, 1187)]}
        self.assertEqual(self.generated.get('slavicFarm'), expected)
        self.assertNotIn('commands', expected)
        self.assertNotIn('initialFood', expected)
        self.assertNotIn('tasks', expected)

    def test_tree34_and_three_canonical_tech_contexts_are_preserved_in_own_rows(self):
        rows = self.generated['civEco']['Slavs']
        tree = [row for row in rows if 'slavicTree' in row]
        self.assertEqual(len(tree), 1)
        self.assertEqual(tree[0]['slavicTree'], {'civId': 23, 'treeId': 7, 'commands': eco_build.eff(self.data, 7)})
        self.assertEqual(len(tree[0]['slavicTree']['commands']), 34)
        self.assertNotIn('tech', tree[0])  # tree EFFECT7 is not technology7
        self.assertEqual([row.get('tech') for row in rows], [None, None, 510, 511, 721])
        for row in rows[2:]:
            self.assertEqual(row.get('slavicTech'), self.raw_tech(self.data, row['tech']), row['tech'])
        self.assertEqual(rows[-1]['source'], 'team')
        self.assertEqual(rows[-1]['effects'], [])  # preserve Type10 without global decode permission
        self.assertEqual(len(rows[-1]['slavicTech']['commands']), 12)

    def test_unknown_tree_companion_survives_complete_raw_not_just_decoded_farm_commands(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        data['Effects'][7]['EffectCommands'].append(unknown)
        rows = [row for row in self.export(data)['civEco']['Slavs'] if 'slavicTree' in row]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['slavicTree']['commands'][-1], unknown)
        self.assertEqual(len(rows[0]['slavicTree']['commands']), 35)

    def test_unknown_only_tree_keeps_empty_canonical_row_instead_of_legal_omission(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        data['Effects'][7]['EffectCommands'] = [unknown]
        rows = [row for row in self.export(data)['civEco']['Slavs'] if 'slavicTree' in row]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['source'], 'tree')
        self.assertEqual(rows[0]['effects'], [])
        self.assertEqual(rows[0]['slavicTree']['commands'], [unknown])

    def test_wrong_tree_id_stays_visible_for_runtime_refusal(self):
        data = copy.deepcopy(self.data)
        data['Civs'][23]['TechTreeID'] = -1
        rows = [row for row in self.export(data)['civEco']['Slavs'] if 'slavicTree' in row]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['slavicTree'], {'civId': 23, 'treeId': -1, 'commands': []})
        self.assertEqual(rows[0]['effects'], [])

    def test_unknown_companions_of_510_511_and_team721_are_not_lost(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for eid in (566, 567, 758):
            data['Effects'][eid]['EffectCommands'].append(unknown)
        rows = {row['tech']: row for row in self.export(data)['civEco']['Slavs'] if 'tech' in row}
        for tid in (510, 511, 721):
            self.assertIn('slavicTech', rows[tid])
            self.assertEqual(rows[tid]['slavicTech']['commands'][-1], unknown)
        self.assertEqual(rows[721]['source'], 'team')

    def test_unknown_only_canonical_techs_do_not_disappear(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for eid in (566, 567, 758):
            data['Effects'][eid]['EffectCommands'] = [unknown]
        rows = {row['tech']: row for row in self.export(data)['civEco']['Slavs'] if 'tech' in row}
        self.assertEqual(list(rows), [510, 511, 721])
        for row in rows.values():
            self.assertEqual(row['effects'], [])
            self.assertEqual(row['slavicTech']['commands'], [unknown])

    def test_wrong_civ_site_missing_effect_stay_visible_for_atomic_runtime_refusal(self):
        data = copy.deepcopy(self.data)
        data['Techs'][510]['Civ'] = 22
        data['Techs'][511]['ResearchLocation'] = 109
        data['Techs'][721]['EffectID'] = -1
        rows = {row['tech']: row for row in self.export(data)['civEco']['Slavs'] if 'tech' in row}
        self.assertEqual(set(rows), {510, 511, 721})
        self.assertEqual(rows[510]['slavicTech']['civ'], 22)
        self.assertEqual(rows[511]['slavicTech']['researchLocation'], 109)
        self.assertEqual(rows[721]['source'], 'team')
        self.assertEqual(rows[721]['slavicTech']['effectId'], -1)
        self.assertEqual(rows[721]['effects'], [])

    def test_physical_source_fields_are_read_from_cache_not_replaced_by_constants(self):
        data = copy.deepcopy(self.data)
        data['Civs'][1]['Units'][50].update({'Type': 70, 'Class': 4, 'WorkRate': .43333333, 'Capacity': 16})
        generated = self.export(data)
        physical = generated.get('slavicFarm', {})
        self.assertIn('farms', physical)
        self.assertEqual(physical['farms'][0], {'unit': 50, 'type': 70, 'class': 4, 'workRate': .4333, 'capacity': 16})

    def test_all_eleven_old_globals_other55_and_original_four_slavic_rows_stay_equal(self):
        for key, value in self.checked.items():
            if key not in ('civEco', 'slavicFarm'):
                self.assertEqual(self.generated[key], value, key)
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Slavs':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)
                self.assertFalse(any('slavicTree' in row or 'slavicTech' in row for row in self.generated['civEco'][civ]), civ)
        strip = lambda rows: [{key: value for key, value in row.items() if key not in ('slavicTree', 'slavicTech')}
                              for row in rows if row.get('tech') != 721]
        self.assertEqual(strip(self.generated['civEco']['Slavs']), strip(self.checked['civEco']['Slavs']))


if __name__ == '__main__':
    unittest.main()
