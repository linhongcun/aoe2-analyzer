"""#197 Wei metadata from the actual fixed DAT exporter, never hand-edited JSON."""
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


class Wei197Export(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = eco_build.load()
        cls.checked = json.loads((eco_build.ROOT / 'src/data/eco.json').read_text())
        cls.generated = cls.export(cls.data)

    @staticmethod
    def export(data):
        with tempfile.TemporaryDirectory(prefix='wei197-export-') as directory:
            root = Path(directory)
            (root / 'src/data').mkdir(parents=True)
            (root / 'docs').mkdir()
            for name in ('units', 'techs', 'buildings', 'civs', 'effects'):
                shutil.copyfile(eco_build.ROOT / f'src/data/{name}.json', root / f'src/data/{name}.json')
            with patch.object(eco_build, 'ROOT', root), patch.object(eco_build, 'load', return_value=data), contextlib.redirect_stdout(io.StringIO()):
                eco_build.main()
            return json.loads((root / 'src/data/eco.json').read_text())

    def test_fixed_dat_actual_export_contains_exact_complete16_contexts(self):
        rows = {r.get('tech'): r for r in self.generated['civEco']['Wei']}
        for tid in range(1039, 1055):
            t = self.data['Techs'][tid]
            expected = {
                'effectId': t['EffectID'], 'requiredCount': t['RequiredTechCount'],
                'researchLocation': t['ResearchLocation'], 'researchAt': t['ResearchAt'],
                'researchTime': t['ResearchTime'], 'cost': t['Cost'],
                'commands': self.data['Effects'][t['EffectID']]['EffectCommands'],
            }
            self.assertEqual(rows[tid].get('spawn'), expected, tid)

    def test_unknown_raw_companion_is_retained_without_silently_decoding_it(self):
        data = copy.deepcopy(self.data)
        unknown = {'Type': 999, 'A': -1, 'B': -1, 'C': -1, 'D': 1}
        data['Effects'][1039]['EffectCommands'].append(unknown)
        out = self.export(data)
        rows = [r for r in out['civEco']['Wei'] if 1039 <= r.get('tech', -1) <= 1054]
        self.assertEqual(len(rows), 16)
        for row in rows:
            self.assertEqual(row.get('spawn', {}).get('commands', [])[-1:], [unknown])
            self.assertEqual(row['effects'], [{'kind': 'res', 'res': 234, 'label': None, 'op': 'set', 'v': 1}])

    def test_actual_generated_output_is_reproducible(self):
        self.assertEqual(self.generated, self.checked)

    def test_other55_and_all_global_sections_remain_unchanged_no_type7_spread(self):
        for key, value in self.checked.items():
            if key != 'civEco':
                self.assertEqual(self.generated[key], value, key)
        for civ, rows in self.checked['civEco'].items():
            if civ != 'Wei':
                self.assertEqual(self.generated['civEco'][civ], rows, civ)
                self.assertFalse(any('spawn' in row for row in self.generated['civEco'][civ]), civ)


if __name__ == '__main__':
    unittest.main()
