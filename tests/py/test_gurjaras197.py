"""Complete Gurjara source survives real export without inventing stock or garrison income."""
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


class Gurjaras197Export(unittest.TestCase):
    TECHS = (856, 857)

    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='gurjaras197-export-') as directory:
            root = Path(directory)
            (root / 'src/data').mkdir(parents=True)
            (root / 'docs').mkdir()
            for name in ('units', 'techs', 'buildings', 'civs', 'effects'):
                shutil.copyfile(eco_build.ROOT / f'src/data/{name}.json', root / f'src/data/{name}.json')
            with patch.object(eco_build, 'ROOT', root), patch.object(eco_build, 'load', return_value=data), contextlib.redirect_stdout(io.StringIO()):
                eco_build.main()
            return json.loads((root / 'src/data/eco.json').read_text())

    @staticmethod
    def rows(data):
        return {row['tech']: row for row in data['civEco']['Gurjaras'] if row.get('tech') in Gurjaras197Export.TECHS}

    def test_complete_pair_headers_and_commands_come_from_the_fixed_source(self):
        rows = self.rows(self.generated)
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech]['gurjaraTech'], eco_build.raw_tech_context(self.data, tech))
        self.assertEqual([len(rows[tech]['gurjaraTech']['commands']) for tech in self.TECHS], [9, 2])
        self.assertEqual(rows[857]['gurjaraTech']['commands'][1], dict(Type=7, A=1549, B=619, C=2, D=0))
        self.assertEqual(rows[857]['requires'], [639, 307])

    def test_unknown_commands_and_bad_headers_are_retained_even_when_decode_is_empty(self):
        data = copy.deepcopy(self.data)
        unknown = dict(Type=999, A=-1, B=-1, C=-1, D=1)
        for tech in self.TECHS:
            data['Effects'][data['Techs'][tech]['EffectID']]['EffectCommands'] = [unknown]
        data['Techs'][856]['Civ'] = 41
        data['Techs'][857].update(ResearchLocation=209, ResearchAt=[[209, 1]], Cost=[[1, 5, 1]])
        rows = self.rows(self.export(data))
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech]['effects'], [])
            self.assertEqual(rows[tech]['gurjaraTech'], eco_build.raw_tech_context(data, tech))

    def test_current_export_reproduces_committed_data_without_other55_or_global_changes(self):
        self.assertEqual(self.generated, self.checked)
        self.assertEqual({key: value for key, value in self.generated.items() if key != 'civEco'},
                         {key: value for key, value in self.checked.items() if key != 'civEco'})
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Gurjaras':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)

    def test_physical_record_distinguishes_bushes_and_initial_scout_from_stock_or_villagers(self):
        physical = json.loads((eco_build.ROOT / 'docs/design/gurjaras197-source-physical.json').read_text())
        self.assertEqual(physical['source']['sha256'], eco_build.DAT['sha256'])
        self.assertFalse(physical['engineVerifiedInPinnedBuild'])
        self.assertEqual(physical['civ'], dict(id=42, name='Gurjaras', treeId=842, teamId=843))
        self.assertEqual({row['resource'] for row in physical['resourceDifferencesFromBase']}, {73, 263})
        bush = physical['extraForageBush']
        self.assertEqual((bush['unit'], bush['owner'], bush['class'], bush['type']), (1549, 'Gaia', 7, 10))
        self.assertEqual(bush['resourceStorages'][0], dict(type=0, amount=175, flag=0))
        self.assertEqual(physical['startingScout']['unit'], 1755)
        self.assertEqual(physical['startingScout']['populationCost'], dict(type=4, amount=1, flag=0))
        self.assertEqual(physical['townCenter']['populationStorage'], dict(type=4, amount=5, flag=4))


if __name__ == '__main__':
    unittest.main()
