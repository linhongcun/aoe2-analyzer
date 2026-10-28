"""#478 source evidence: reproducible bounded reports, complete known tech refs."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_sim_source as source  # noqa: E402


def raw_data():
    empty = {'Name': 'no effect', 'EffectCommands': []}
    techs = [{'Name': 'tech%d' % i, 'Civ': -1, 'EffectID': -1, 'RequiredTechs': [-1],
              'RequiredTechCount': 0, 'ResearchLocation': -1, 'ResearchTime': 0,
              'ResearchAt': [], 'Cost': []} for i in range(8)]
    techs[1].update(Civ=1, EffectID=2, RequiredTechs=[2, -1])
    techs[2].update(RequiredTechs=[1])  # cycle must terminate
    techs[3].update(EffectID=3)
    return {
        'Version': 'fixture',
        'Civs': [{'Name': 'Gaia'}, {'Name': 'Mayan', 'TechTreeID': 0, 'TeamBonusID': 1}],
        'Techs': techs,
        'Effects': [
            {'Name': 'tree', 'EffectCommands': [{'Type': 102, 'A': -1, 'D': 3.0}]},
            empty,
            {'Name': 'bonus', 'EffectCommands': [{'Type': 1, 'A': 7, 'D': 50}]},
            {'Name': 'chain', 'EffectCommands': [{'Type': 103, 'A': 4, 'D': 0}, {'Type': 8, 'A': 5, 'D': 0}]},
        ],
    }


class BuildSimSource478(unittest.TestCase):
    def test_known_references_include_type102_d_and_recursive_prerequisites(self):
        report, raw = source.build(raw_data(), 'Mayans', [6, 1, 6])
        self.assertEqual(report['closure']['ids'], [1, 2, 3, 4, 5, 6])
        self.assertEqual([r['id'] for r in report['selectedTechs']], [1, 6])
        self.assertEqual(report['selectedTechs'][0]['commands'], [{'Type': 1, 'A': 7, 'D': 50}])
        self.assertEqual(report['closure']['sha256'], source.fingerprint(raw['techClosure']))
        self.assertEqual(report['civ'], {'id': 1, 'name': 'Mayans', 'rawName': 'Mayan'})

    def test_omitted_closure_changes_still_change_fingerprint(self):
        data = raw_data()
        before, _ = source.build(data, 'Mayans')
        data['Techs'][4]['Cost'] = [[0, 100, 1]]
        after, _ = source.build(data, 'Mayans')
        self.assertNotEqual(before['closure']['sha256'], after['closure']['sha256'])
        self.assertEqual(before['selectedTechs'], after['selectedTechs'])

    def test_deterministic_and_does_not_modify_source_or_treat_resource_ids_as_techs(self):
        data = raw_data()
        original = copy.deepcopy(data)
        first, _ = source.build(data, 'Mayans', [6, 1])
        second, _ = source.build(data, 'Mayans', [1, 6])
        self.assertEqual(source.render(first), source.render(second))
        self.assertNotIn(7, first['closure']['ids'])
        self.assertEqual(data, original)

    def test_invalid_civ_tech_and_fractional_tech_reference_are_rejected(self):
        with self.assertRaises(ValueError):
            source.build(raw_data(), 'Missing')
        with self.assertRaises(ValueError):
            source.build(raw_data(), 'Mayans', [999])
        data = raw_data()
        data['Effects'][0]['EffectCommands'][0]['D'] = 3.5
        with self.assertRaises(ValueError):
            source.build(data, 'Mayans')

    def test_new_or_changed_large_report_is_rejected_but_exact_history_is_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'docs/design/mayans197-source.json'
            path.parent.mkdir(parents=True)
            content = b' ' * (source.MAX_REPORT_BYTES + 1)
            path.write_bytes(content)
            baseline = {path.relative_to(root).as_posix(): hashlib.sha256(content).hexdigest()}
            self.assertEqual(source.check_budget(root, baseline), [])
            path.write_bytes(content + b' ')
            self.assertEqual(len(source.check_budget(root, baseline)), 1)
            path.write_bytes(b'{}\n')  # shrinking an old record must not evade its fingerprint
            self.assertEqual(len(source.check_budget(root, baseline)), 1)
            path.unlink()
            self.assertEqual(len(source.check_budget(root, baseline)), 1)
            path.write_bytes(content)
            path.with_name('new197-source.json').write_bytes(content)
            self.assertEqual(len(source.check_budget(root, baseline)), 1)
        with self.assertRaises(ValueError):
            source.render({'dump': 'a' * source.MAX_REPORT_BYTES})

    def test_repo_source_reports_respect_budget(self):
        self.assertEqual(source.check_budget(), [])

    def test_raw_output_cannot_be_written_outside_ignored_cache(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/build_sim_source.py'),
                                 '--civ', 'Mayans', '--output', 'unused.json',
                                 '--raw-output', str(ROOT / 'docs/design/full-dump.json')],
                                text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn('inside ignored scripts/.cache', result.stderr)

    def test_checked_example_is_reproducible_from_verified_fixed_dat(self):
        report, _ = source.build(source.load(), 'Mayans', [554])
        self.assertEqual(source.render(report), (ROOT / 'docs/design/mayans197-source-summary.json').read_bytes())
        self.assertLess(len(source.render(report)), source.MAX_REPORT_BYTES)
        self.assertEqual(report['source']['sha256'], source.DAT['sha256'])


if __name__ == '__main__':
    unittest.main()
