"""Armenian-only infrastructure and complete raw technology context, from the real exporter."""
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


class Armenians197Export(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='armenians197-export-') as directory:
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

    def test_actual_fixed_export_retains_independent_infrastructure(self):
        unit = self.data['Civs'][1]['Units'][1808]
        expected = {
            'civId': 44, 'treeId': 925, 'treeCommands': eco_build.eff(self.data, 925),
            'enable': self.raw_tech(self.data, 940), 'buildingTech': self.raw_tech(self.data, 933),
            'cart': {'unit': 1808, 'type': unit['Type'], 'class': unit['Class'],
                     'buildTech': self.data['BuildTech']['1808'], 'trainAt': unit['TrainAt'],
                     'trainTime': unit['TrainTime'], 'cost': unit['Cost']},
            'researchSites': {str(tid): self.data['Techs'][tid]['ResearchAt'] for tid in (14, 22, 199, 202, 203, 55, 182, 278, 221, 279)},
        }
        self.assertEqual(self.generated.get('armenianInfrastructure'), expected)

    def test_all_ten_existing_rows_gain_complete_context_without_reordering(self):
        actual = self.generated['civEco']['Armenians']
        self.assertEqual([row['tech'] for row in actual], [949, 957, 958, 960, 961, 962, 963, 964, 965, 966])
        for row in actual:
            self.assertEqual(row.get('armenianTech'), self.raw_tech(self.data, row['tech']), row['tech'])

    def test_unknown_raw_companions_remain_visible_to_closed_runtime_guard(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        data['Effects'][944]['EffectCommands'].append(unknown)
        data['Effects'][956]['EffectCommands'].append(unknown)
        generated = self.export(data)
        infrastructure = generated.get('armenianInfrastructure', {})
        self.assertIn('enable', infrastructure)
        self.assertEqual(infrastructure['enable']['commands'][-1], unknown)
        rows = {row['tech']: row for row in generated['civEco']['Armenians']}
        for tid in (960, 961):
            self.assertIn('armenianTech', rows[tid])
            self.assertEqual(rows[tid]['armenianTech']['commands'][-1], unknown)

    def test_other55_and_all_nine_original_globals_and_original_effects_preserved(self):
        for key, value in self.checked.items():
            if key not in ('civEco', 'armenianInfrastructure'):
                self.assertEqual(self.generated[key], value, key)
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Armenians':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)
                self.assertFalse(any('armenianTech' in row for row in self.generated['civEco'][civ]), civ)
        strip = lambda rows: [{key: value for key, value in row.items() if key != 'armenianTech'} for row in rows]
        self.assertEqual(strip(self.generated['civEco']['Armenians']), strip(self.checked['civEco']['Armenians']))

    def test_unknown_only_commands_do_not_disappear_as_legitimate_counterfactual_omission(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for eid in (951, 952, 953, 956, 957, 958, 959):
            data['Effects'][eid]['EffectCommands'] = [unknown]
        rows = {row['tech']: row for row in self.export(data)['civEco']['Armenians']}
        self.assertEqual(list(rows), [949, 957, 958, 960, 961, 962, 963, 964, 965, 966])
        for row in rows.values():
            self.assertEqual(row['effects'], [])
            self.assertEqual(row['armenianTech']['commands'], [unknown])

    def test_wrong_raw_civ_research_site_or_missing_effect_is_retained_for_refusal(self):
        data = copy.deepcopy(self.data)
        data['Techs'][958]['Civ'] = 45
        data['Techs'][960]['ResearchLocation'] = 109
        data['Techs'][961]['EffectID'] = -1
        rows = {row['tech']: row for row in self.export(data)['civEco']['Armenians']}
        self.assertEqual(rows[958]['armenianTech']['civ'], 45)
        self.assertEqual(rows[960]['armenianTech']['researchLocation'], 109)
        self.assertEqual(rows[961]['armenianTech']['effectId'], -1)
        self.assertEqual(rows[961]['effects'], [])


if __name__ == '__main__':
    unittest.main()
