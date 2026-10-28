"""Georgian canonical source rows must survive the real exporter, including unknown-only commands."""
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


class Georgians197Export(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='georgians197-export-') as directory:
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

    def test_actual_fixed_export_keeps_infrastructure_independent_of_start_bonus(self):
        unit = self.data['Civs'][1]['Units'][1808]
        expected = {
            'civId': 45, 'treeId': 927, 'treeCommands': eco_build.eff(self.data, 927),
            'enable': self.raw_tech(self.data, 932), 'buildingTech': self.raw_tech(self.data, 933),
            'cart': {'unit': 1808, 'type': unit['Type'], 'class': unit['Class'],
                     'buildTech': self.data['BuildTech']['1808'], 'trainAt': unit['TrainAt'],
                     'trainTime': unit['TrainTime'], 'cost': unit['Cost']},
            'researchSites': {str(tid): self.data['Techs'][tid]['ResearchAt'] for tid in (14, 22, 199, 202, 203, 55, 182, 278, 221, 279)},
        }
        self.assertEqual(self.generated.get('georgianInfrastructure'), expected)
        self.assertNotIn('startingCart', expected)

    def test_three_existing_canonical_rows_gain_complete_raw_context_in_original_order(self):
        rows = self.generated['civEco']['Georgians']
        self.assertEqual([row.get('tech') for row in rows], [925, 926, 934, None])
        for row in rows[:3]:
            self.assertEqual(row.get('georgianTech'), self.raw_tech(self.data, row['tech']), row['tech'])
        self.assertNotIn('georgianTech', rows[3])

    def test_unknown_companions_are_not_lost_from_start_church_or_enable(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for eid in (937, 938, 939, 944):
            data['Effects'][eid]['EffectCommands'].append(unknown)
        generated = self.export(data)
        infrastructure = generated.get('georgianInfrastructure', {})
        self.assertIn('enable', infrastructure)
        self.assertEqual(infrastructure['enable']['commands'][-1], unknown)
        rows = {row['tech']: row for row in generated['civEco']['Georgians'] if 'tech' in row}
        for tid in (925, 926, 934):
            self.assertIn('georgianTech', rows[tid])
            self.assertEqual(rows[tid]['georgianTech']['commands'][-1], unknown)

    def test_unknown_only_canonical_rows_do_not_disappear_as_legitimate_whole_omission(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for eid in (937, 938, 939):
            data['Effects'][eid]['EffectCommands'] = [unknown]
        rows = {row['tech']: row for row in self.export(data)['civEco']['Georgians'] if 'tech' in row}
        self.assertEqual(list(rows), [925, 926, 934])
        for row in rows.values():
            self.assertEqual(row['effects'], [])
            self.assertEqual(row['georgianTech']['commands'], [unknown])

    def test_wrong_civ_site_and_missing_effect_remain_visible_to_runtime_refusal(self):
        data = copy.deepcopy(self.data)
        data['Techs'][925]['Civ'] = 44
        data['Techs'][926]['ResearchLocation'] = 109
        data['Techs'][934]['EffectID'] = -1
        rows = {row['tech']: row for row in self.export(data)['civEco']['Georgians'] if 'tech' in row}
        self.assertIn(925, rows)
        self.assertIn(926, rows)
        self.assertIn(934, rows)
        self.assertEqual(rows[925]['georgianTech']['civ'], 44)
        self.assertEqual(rows[926]['georgianTech']['researchLocation'], 109)
        self.assertEqual(rows[934]['georgianTech']['effectId'], -1)
        self.assertEqual(rows[934]['effects'], [])

    def test_all_ten_existing_globals_other55_and_original_georgian_effects_remain_identical(self):
        for key, value in self.checked.items():
            if key not in ('civEco', 'georgianInfrastructure'):
                self.assertEqual(self.generated[key], value, key)
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Georgians':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)
                self.assertFalse(any('georgianTech' in row for row in self.generated['civEco'][civ]), civ)
        strip = lambda rows: [{key: value for key, value in row.items() if key != 'georgianTech'} for row in rows]
        self.assertEqual(strip(self.generated['civEco']['Georgians']), strip(self.checked['civEco']['Georgians']))


if __name__ == '__main__':
    unittest.main()
