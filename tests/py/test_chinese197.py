"""Chinese complete source must survive export even when generic decode is empty."""
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


class Chinese197Export(unittest.TestCase):
    TECHS = (226, 302, 304, 350, 351, 352, 425)

    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='chinese197-export-') as directory:
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
        return {r['tech']: r for r in data['civEco']['Chinese'] if r.get('tech') in Chinese197Export.TECHS}

    def test_complete_seven_records_and_empty_425_are_exported(self):
        rows = self.rows(self.generated)
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech]['chineseTech'], eco_build.raw_tech_context(self.data, tech))
        self.assertEqual(rows[425]['effects'], [])
        self.assertEqual(len(rows[425]['chineseTech']['commands']), 13)
        population = [c for c in rows[425]['chineseTech']['commands'] if c['C'] == 21]
        self.assertEqual(population, [dict(Type=0, A=uid, B=-1, C=21, D=15) for uid in (109, 71, 141, 142, 444)])

    def test_unknown_commands_and_invalid_headers_cannot_disappear(self):
        data = copy.deepcopy(self.data)
        unknown = dict(Type=999, A=-1, B=-1, C=-1, D=1)
        for tech in self.TECHS:
            data['Effects'][data['Techs'][tech]['EffectID']]['EffectCommands'] = [unknown]
        data['Techs'][425].update(Civ=7, ResearchLocation=209, ResearchAt=[[209, 1]], Cost=[[1, 5, 1]])
        rows = self.rows(self.export(data))
        self.assertEqual(set(rows), set(self.TECHS))
        for tech in self.TECHS:
            self.assertEqual(rows[tech]['effects'], [])
            self.assertEqual(rows[tech]['chineseTech'], eco_build.raw_tech_context(data, tech))

    def test_real_export_is_reproducible_without_changes_to_other55_or_global_data(self):
        self.assertEqual(self.generated, self.checked)

    def test_physical_record_distinguishes_storage_and_age_type_without_claiming_engine_test(self):
        physical = json.loads((eco_build.ROOT / 'docs/design/chinese197-source-physical.json').read_text())
        self.assertEqual(physical['source']['sha256'], eco_build.DAT['sha256'])
        self.assertFalse(physical['engineVerifiedInPinnedBuild'])
        for label in ('base', 'Chinese'):
            for tc in physical['townCenters'][label]:
                self.assertEqual(tc['resourceStorages'][0], dict(type=4, amount=5, flag=4))
        types = {r['tech']: r['raw']['type'] for r in physical['researchTypes']}
        self.assertEqual([types[i] for i in (101, 102, 103)], [2, 2, 2])
        self.assertEqual([types[i] for i in (14, 22, 199, 202, 203, 408)], [0] * 6)


if __name__ == '__main__':
    unittest.main()
