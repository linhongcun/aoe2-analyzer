"""Mapuche complete source must survive selective economic decoding."""
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


class Mapuche197Export(unittest.TestCase):
    TECHS = (1381, 1382, 1405, 1406, 1407)

    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='mapuche197-export-') as directory:
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
        return {r['tech']: r for r in data['civEco']['Mapuche'] if r.get('tech') in Mapuche197Export.TECHS}

    def test_five_complete_records_and_empty_decoder_row_survive(self):
        rows = self.rows(self.generated)
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech]['mapucheTech'], eco_build.raw_tech_context(self.data, tech))
        self.assertEqual(rows[1382]['effects'], [])
        self.assertEqual(len(rows[1382]['mapucheTech']['commands']), 31)

    def test_unknown_commands_and_invalid_headers_do_not_disappear(self):
        data = copy.deepcopy(self.data)
        unknown = dict(Type=999, A=-1, B=-1, C=-1, D=1)
        for tech in self.TECHS:
            data['Effects'][data['Techs'][tech]['EffectID']]['EffectCommands'] = [unknown]
        data['Techs'][1382].update(Civ=7, ResearchLocation=209, ResearchAt=[[209, 1]], Cost=[[1, 5, 1]])
        data['Effects'][data['Techs'][1353]['EffectID']]['EffectCommands'].append(unknown)
        result = self.export(data)
        for tech, row in self.rows(result).items():
            self.assertEqual(row['effects'], [])
            self.assertEqual(row['mapucheTech'], eco_build.raw_tech_context(data, tech))
        self.assertEqual(result['mapucheInfrastructure']['enable']['commands'][-1], unknown)

    def test_export_reproduces_the_committed_data(self):
        self.assertEqual(self.generated, self.checked)

    def test_bounded_physical_population_and_training_source(self):
        report = json.loads((eco_build.ROOT / 'docs/design/mapuche197-source-physical.json').read_text())
        self.assertEqual(report['source']['sha256'], eco_build.DAT['sha256'])
        self.assertFalse(report['physical']['engineVerifiedInPinnedBuild'])
        infrastructure = report['infrastructure']
        self.assertEqual(infrastructure, self.generated['mapucheInfrastructure'])
        for unit in infrastructure['settlements']:
            self.assertEqual(unit['populationSource'], dict(type=4, amount=5, flag=4))
            self.assertEqual(unit['workRate'], 1)
        self.assertEqual(infrastructure['baseTrain93']['trainAt'], [[12, 22], [1665, 22]])
        self.assertEqual(infrastructure['startingScout'], dict(resource=263, unit=2550, populationSource=dict(type=4, amount=1, flag=0)))


if __name__ == '__main__':
    unittest.main()
