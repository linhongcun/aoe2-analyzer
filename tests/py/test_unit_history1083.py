"""Final offline unit graph and real-CLI integrity regressions (#1083)."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result
civ, unit = module('civ_history_build'), module('unit_history')

class UnitHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base, cls.base_audit = civ.build()
        cls.data, cls.audit = unit.extend_history(ROOT, cls.base, civ.validate_documents)

    def test_directory_sources_legacy_and_civilization_baseline(self):
        self.assertEqual(len(self.data['units']['rows']), 248)
        self.assertEqual(self.audit['unitLegacyCount'], 238)
        self.assertEqual(self.audit['unitLegacyMigratedCount'], 238)
        self.assertEqual(self.data['legacyMap'], self.base['legacyMap'])
        self.assertEqual(self.data['civilizations'], self.base['civilizations'])
        self.assertEqual(len(self.data['legacyMap']), 366)
        self.assertEqual(self.audit['snapshots'][0]['observedEntryCount'], 8)
        rows = self.data['units']['rows']
        self.assertEqual(sum(r['sourceState'] == 'processed' for r in rows), 2)
        self.assertEqual(sum(r['sourceState'] == 'not-checked' for r in rows), 246)
        # Current numeric stats are never an input to history, only their pinned
        # directory fingerprint is checked. Exact old key/record pointers remain.
        self.assertTrue(all(not e['civRelations'] for e in self.data['events'] if e['id'].startswith('ev-unit-legacy-')))
        again, audit = unit.extend_history(ROOT, self.base, civ.validate_documents)
        self.assertEqual((again, audit), (self.data, self.audit))

    def test_snapshot_is_complete_and_semantic_axes_do_not_change(self):
        section = next(s for s in self.data['sections'] if s['sourceId'] == 'seicing-unit-kipchak')
        entries = [e for e in self.data['sourceEntries'] if e['sectionId'] == section['id']]
        self.assertEqual([sum(e['group'] == group for e in entries) for group in ['最后的可汗', '印度王朝']], [6, 2])
        self.assertEqual(entries[0]['processing'], 'excluded')
        self.assertTrue(all(e['processing'] == 'mapped' and e['eventIds'] for e in entries[1:]))
        self.assertEqual(len(entries[1]['eventIds']), 2)
        self.assertEqual(len(entries[3]['eventIds']), 2)
        old_effects = {f['id']: f for e in self.base['events'] for c in e['claims'] for f in c['effects']}
        effects = {f['id']: f for e in self.data['events'] for c in e['claims'] for f in c['effects']}
        self.assertTrue(old_effects.keys() <= effects.keys())
        for id, old in old_effects.items():
            if old.get('attribute') == '副箭数量':
                self.assertEqual(old, effects[id])

    def test_real_cli_rejects_missing_coverage_bad_merges_and_changed_evidence_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['data/sources/civ_history', 'data/sources/unit_history', 'data/game/patches']:
                shutil.copytree(ROOT / name, root / name)
            for name in [*[f'data/game/{n}.json' for n in ['civs', 'units', 'buildings', 'techs']], 'data/schemas/common.defs.json', 'data/schemas/content-civ-updates.json', 'scripts/civ_history_build.py', 'scripts/unit_history.py', 'scripts/civ_history_validate.mjs', 'scripts/content-schema.mjs', 'scripts/content-schema-catalog.mjs', 'scripts/content-baseline.mjs', 'src/content/schema/policy.mjs']:
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / name, root / name)
            (root / 'node_modules').symlink_to((ROOT / 'node_modules').resolve(), target_is_directory=True)
            def run(*args):
                return subprocess.run([sys.executable, str(root / 'scripts/civ_history_build.py'), *args], cwd=root, capture_output=True, text=True, timeout=60)
            self.assertEqual(run().returncode, 0)
            outputs = [civ.OUTPUT, civ.AUDIT, civ.REPORT, unit.AUDIT, unit.REPORT]
            baseline = {p: (root / p).read_bytes() for p in outputs}
            self.assertEqual(run('--check').returncode, 0)
            def bad_version(v):
                v['attachments'][0]['eventId'] = 'missing-event'
            def bad_merge(v):
                archived = [x for x in v['legacy'] if x['eventId'].startswith('ev-unit-legacy-')]
                same = [x for x in archived if x['key'].startswith('81058:')]
                same[-1]['eventId'], same[-1]['claimId'] = same[0]['eventId'], same[0]['claimId']
            cases = [('catalog.json', lambda v: v['pages'].pop(), 'directory coverage'), ('imports.json', lambda v: v['legacy'].pop(), 'each old unit'), ('imports.json', bad_version, 'missing canonical event'), ('imports.json', bad_merge, 'unequal legacy bullets'), ('imports.json', lambda v: v['events'][0]['scope']['affectedCivIds'].append('missing-civ'), 'dangling scope')]
            cases.append(('imports.json', lambda v: next(r for r in v['relations'] if r['relation'] == 'identity-pending').update(relation='direct'), 'direct unit relation needs exact effect identity'))
            for name, mutate, message in cases:
                path = root / unit.INPUT / name
                original = path.read_text()
                value = json.loads(original); mutate(value); path.write_text(civ.encode(value))
                for args in [(), ('--check',)]:
                    result = run(*args)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(message, result.stderr)
                    self.assertEqual({p: (root / p).read_bytes() for p in outputs}, baseline)
                path.write_text(original)
            catalog = json.loads((root / unit.INPUT / 'catalog.json').read_text())
            snap = root / unit.INPUT / catalog['sectionFiles'][0]['path']
            original = snap.read_bytes();snap.write_bytes(original + b' ')
            self.assertIn('snapshot pin', run('--check').stderr)
            self.assertEqual({p: (root / p).read_bytes() for p in outputs}, baseline)

if __name__ == '__main__':
    unittest.main()
