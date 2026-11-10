"""覆盖清单：真实仓库必须通过；漏登记、编排漂移、补丁历史和失败即停必须失败。不跑生成器。"""
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import data_update  # noqa: E402
import data_update_coverage as coverage  # noqa: E402


def load():
    return json.loads((ROOT / 'scripts/data_update_coverage.json').read_text(encoding='utf-8'))


class CoveragePasses(unittest.TestCase):
    def test_real_repo_has_no_errors(self):
        self.assertEqual(coverage.check(ROOT), [])

    def test_cli_exits_zero_without_running_generators(self):
        completed = subprocess.run([sys.executable, 'scripts/data_update_coverage.py'], cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn('未运行生成器', completed.stdout)
        self.assertNotIn('import subprocess', (ROOT / 'scripts/data_update_coverage.py').read_text(encoding='utf-8'))
        self.assertNotIn('urlopen', (ROOT / 'scripts/data_update_coverage.py').read_text(encoding='utf-8'))


class CoverageDrift(unittest.TestCase):
    def test_unlisted_generator_is_rejected(self):
        errors = coverage.check(ROOT, extra_build_scripts=['new_bonus_build.py'])
        self.assertTrue(any('漏登记：scripts/new_bonus_build.py' in error for error in errors), errors)

    def test_removed_orchestrated_step_is_rejected(self):
        manifest = load()
        manifest['orchestrated'] = [step for step in manifest['orchestrated'] if step['script'] != 'scripts/effects_build.py']
        errors = coverage.check(ROOT, manifest=manifest)
        self.assertTrue(any('编排漂移' in error for error in errors), errors)
        self.assertTrue(any('漏登记：scripts/effects_build.py' in error for error in errors), errors)

    def test_source_dropping_effects_is_rejected(self):
        source = (ROOT / 'scripts/data_update.py').read_text(encoding='utf-8').replace("'effects', ", '')
        errors = coverage.check(ROOT, sources={'scripts/data_update.py': source})
        joined = '\n'.join(errors)
        self.assertIn('编排漂移', joined)
        self.assertIn('effects_build.py', joined)

    def test_new_context_tech_without_alias_is_rejected(self):
        source = (ROOT / 'scripts/eco_build.py').read_text(encoding='utf-8') + '\nFOO_CONTEXT_TECHS = (1,)\n'
        errors = coverage.check(ROOT, sources={'scripts/eco_build.py': source})
        self.assertTrue(any('漏登记：eco_build.py 的 FOO_CONTEXT_TECHS' in error for error in errors), errors)

    def test_unimported_economy_module_is_rejected(self):
        errors = coverage.check(ROOT, extra_economy=['ghostEconomy.ts'])
        self.assertTrue(any('ghostEconomy.ts' in error for error in errors), errors)

    def test_doc_missing_a_path_is_rejected(self):
        document = (ROOT / 'docs/DATA-UPDATE.md').read_text(encoding='utf-8').replace('scripts/effects_build.py', 'scripts/effects_build_REMOVED.py')
        errors = coverage.check(ROOT, sources={'docs/DATA-UPDATE.md': document})
        self.assertTrue(any('DATA-UPDATE.md' in error and 'effects_build.py' in error for error in errors), errors)


class FailClosed(unittest.TestCase):
    def test_run_stops_on_nonzero_exit(self):
        with mock.patch('builtins.print'), self.assertRaises(subprocess.CalledProcessError):
            data_update.run(sys.executable, '-c', 'import sys; sys.exit(3)')

    def test_silent_text_correction_is_rejected(self):
        source = (ROOT / 'scripts/civs_build.py').read_text(encoding='utf-8')
        source = source.replace('unique-tech source changed; review civ_text_corrections.json', 'continue')
        errors = coverage.check(ROOT, sources={'scripts/civs_build.py': source})
        self.assertTrue(any('失败即停' in error and 'civ_text_corrections.json' in error for error in errors), errors)

    def test_unchecked_run_is_rejected(self):
        source = (ROOT / 'scripts/data_update.py').read_text(encoding='utf-8')
        source = source.replace('subprocess.run(cmd, cwd=ROOT, check=True)', 'subprocess.run(cmd, cwd=ROOT, check=False)')
        errors = coverage.check(ROOT, sources={'scripts/data_update.py': source})
        self.assertTrue(any('失败即停：data_update.run' in error for error in errors), errors)

    def test_coverage_failure_stops_before_network_and_generators(self):
        with mock.patch.object(sys, 'argv', ['data_update.py']), mock.patch('data_update_coverage.check', return_value=['boom']), mock.patch.object(
            data_update, 'latest', side_effect=AssertionError('network')
        ), mock.patch.object(data_update, 'run', side_effect=AssertionError('generator')), mock.patch('builtins.print'):
            with self.assertRaises(SystemExit) as caught:
                data_update.main()
        self.assertIn('未运行生成器', str(caught.exception))

    def test_data_update_must_not_name_patch_generators(self):
        source = (ROOT / 'scripts/data_update.py').read_text(encoding='utf-8') + "\nNOTE = 'patches_build.py'\n"
        errors = coverage.check(ROOT, sources={'scripts/data_update.py': source})
        self.assertTrue(any('补丁历史' in error and 'patches_build.py' in error for error in errors), errors)


class PatchHistory(unittest.TestCase):
    def test_moved_pin_must_not_rewrite_188329(self):
        pins = json.loads((ROOT / 'scripts/data_sources.json').read_text(encoding='utf-8'))
        pins['patch']['build'] = 999999
        errors = coverage.check(ROOT, sources={'scripts/data_sources.json': json.dumps(pins)})
        joined = '\n'.join(errors)
        self.assertIn('999999', joined)
        self.assertIn('不要改写', joined)
        self.assertIn('188329', joined)


if __name__ == '__main__':
    unittest.main()
