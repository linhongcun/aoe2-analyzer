"""Complete Jurchen raw tech evidence survives the real exporter, including malformed source."""
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


class Jurchens197Export(unittest.TestCase):
    TECHS = (993, 995)

    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='jurchens197-export-') as directory:
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

    @staticmethod
    def rows(generated):
        return {r['tech']: r for r in generated['civEco']['Jurchens'] if r.get('tech') in (993, 995)}

    def test_complete993_and995_headers_are_exported_from_fixed_source(self):
        rows = self.rows(self.generated)
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech].get('jurchenTech'), self.raw(self.data, tech))
            self.assertEqual(rows[tech]['source'], 'bonus')
            self.assertEqual(rows[tech]['requires'], [])

    def test_actual_complete_command_groups_are_one_and31(self):
        rows = self.rows(self.generated)
        self.assertEqual(len((rows[993].get('jurchenTech') or {}).get('commands', [])), 1)
        self.assertEqual(len((rows[995].get('jurchenTech') or {}).get('commands', [])), 31)

    def test_unknown_only_993_and995_rows_are_retained_with_raw_and_empty_decode(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for tech in self.TECHS:
            data['Effects'][data['Techs'][tech]['EffectID']]['EffectCommands'] = [unknown]
        rows = self.rows(self.export(data))
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech]['effects'], [])
            self.assertEqual(rows[tech].get('jurchenTech'), self.raw(data, tech))

    def test_unknown_raw_companions_cannot_disappear_beside_recognized_commands(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        for tech in self.TECHS:
            data['Effects'][data['Techs'][tech]['EffectID']]['EffectCommands'].append(unknown)
        rows = self.rows(self.export(data))
        for tech in self.TECHS:
            self.assertEqual(rows[tech].get('jurchenTech'), self.raw(data, tech))

    def test_foreign_civ_or_research_location_headers_do_not_hide_canonical_rows(self):
        data = copy.deepcopy(self.data)
        data['Techs'][993]['Civ'] = 51
        data['Techs'][995]['ResearchLocation'] = 209
        data['Techs'][995]['ResearchAt'] = [[209, 1]]
        rows = self.rows(self.export(data))
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech].get('jurchenTech'), self.raw(data, tech))

    def test_effect_pointer_and_cost_are_recorded_rather_than_replaced_with_good_constants(self):
        data = copy.deepcopy(self.data)
        data['Effects'].append({'EffectCommands': [{'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}]})
        data['Techs'][993]['EffectID'] = len(data['Effects']) - 1
        data['Techs'][995]['Cost'] = [[1, 5, 1]]
        rows = self.rows(self.export(data))
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech].get('jurchenTech'), self.raw(data, tech))

    def test_no_per_civ_resource_dump_or_other55_civilization_changes(self):
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Jurchens':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)
        self.assertEqual({k: v for k, v in self.generated.items() if k != 'civEco'},
                         {k: v for k, v in self.checked.items() if k != 'civEco'})


if __name__ == '__main__':
    unittest.main()
