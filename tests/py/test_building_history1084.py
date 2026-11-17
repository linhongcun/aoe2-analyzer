"""Bounded building sources, exact shared identities and fail-closed CLI (#1084)."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
INPUT = Path('data/sources/building_history')


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


civ, unit, building = (module(name) for name in ['civ_history_build', 'unit_history', 'building_history'])


class BuildingHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base, _ = civ.build()
        cls.base, _ = unit.extend_history(ROOT, base, civ.validate_documents)
        cls.data, cls.audit = building.extend_history(ROOT, cls.base, civ.validate_documents, unit)

    def test_exact_directory_legacy_and_prior_graph_are_conserved(self):
        rows = self.data['buildings']['rows']
        catalog = json.loads((ROOT / 'data/game/buildings.json').read_text())
        self.assertEqual({r['entityId'] for r in rows}, {'building/' + str(b['id']) for b in catalog})
        self.assertEqual(len(rows), len(catalog))
        self.assertEqual(self.audit['buildingLegacyCount'], 25)
        self.assertEqual(self.audit['buildingLegacyMigratedCount'], 25)
        self.assertEqual(self.data['legacyMap'], self.base['legacyMap'])
        self.assertEqual(self.data['units'], self.base['units'])
        old = {f['id']: f for e in self.base['events'] for c in e['claims'] for f in c['effects']}
        new = {f['id']: f for e in self.data['events'] for c in e['claims'] for f in c['effects']}
        self.assertTrue(old.keys() <= new.keys())
        self.assertTrue(all(f == new[id] for id, f in old.items()))
        for before, after in zip(self.base['civilizations'], self.data['civilizations']):
            for field in ['sectionIds', 'sourceEntryCount', 'sourceState']:
                self.assertEqual(before[field], after[field])
        self.assertEqual(sum(r['sourceState'] == 'processed' for r in rows), 2)
        self.assertEqual(sum(r['sourceState'] == 'not-checked' for r in rows), len(rows) - 2)
        self.assertTrue(all(r['sourceUrl'] and r['reason'] and r['identityNote'] for r in rows))
        again, audit = building.extend_history(ROOT, self.base, civ.validate_documents, unit)
        self.assertEqual((again, audit), (self.data, self.audit))

    def test_all_46_originals_have_exact_cited_claim_effect_dispositions_and_pins(self):
        pins = {
            'building/109': ('040c9a0515d2d295f4df4a420a7ae7d37c8db757299f365b39426e58bb621f36', 17),
            'building/79': ('d464b9bb2412508a791a0063563fb95c157cf4ea03b56726d096cce382fd6bbf', 29),
        }
        events = {e['id']: e for e in self.data['events']}
        entries = {e['id']: e for e in self.data['sourceEntries']}
        self.assertEqual(self.data['buildings']['sourceIndex']['documentSha256'], 'd2182ee1ef3bfc59df5c77317325e244597db9080146e8620c6c84c4728decc6')
        for s in [s for s in self.data['sections'] if s.get('entityIds', [None])[0] in pins]:
            digest, count = pins[s['entityIds'][0]]
            self.assertEqual((s['documentSha256'], s['observedEntryCount']), (digest, count))
            originals = [entries[id] for id in s['entryIds']]
            self.assertEqual(len(originals), count)
            self.assertEqual({e['locator'] for e in originals}, {f'#change li[{i}]' for i in range(1, count + 1)})
            self.assertTrue(any(e['processing'] == 'mapped' for e in originals))
            for e in originals:
                self.assertIn(e['processing'], ['mapped', 'excluded', 'pending'])
                self.assertTrue(e['originalText'] and e['reason'])
                for id in e['eventIds']:
                    claims = [c for c in events[id]['claims'] if e['id'] in c['sourceEntryIds']]
                    self.assertTrue(claims and all(c['effects'] for c in claims))
        imported = json.loads((ROOT / INPUT / 'imports.json').read_text())
        self.assertEqual(len(imported['legacy']), 25)
        self.assertEqual(sum(m['disposition'] == 'archive-only' for m in self.base['legacyMap'] if unit.unit_legacy(m['originalRecord'], 'building')), 6)
        self.assertTrue(all(e['verification'] == 'unverified' for e in imported['events']))

    def test_real_cli_rejects_bad_inputs_without_changing_any_output_and_preserves_failed_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['data/sources/civ_history', 'data/sources/unit_history', str(INPUT), 'data/game/patches']:
                shutil.copytree(ROOT / name, root / name)
            for name in [*[f'data/game/{n}.json' for n in ['civs', 'units', 'buildings', 'techs']], 'data/schemas/common.defs.json', 'data/schemas/content-civ-updates.json', *['scripts/' + f for f in ['civ_history_build.py', 'unit_history.py', 'building_history.py', 'civ_history_validate.mjs', 'content-schema.mjs', 'content-schema-catalog.mjs', 'content-baseline.mjs']], 'src/content/schema/policy.mjs']:
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / name, root / name)
            (root / 'node_modules').symlink_to((ROOT / 'node_modules').resolve(), target_is_directory=True)
            def run(*args):
                return subprocess.run([sys.executable, str(root / 'scripts/civ_history_build.py'), *args], cwd=root, capture_output=True, text=True, timeout=60)
            result = run()
            self.assertEqual(result.returncode, 0, result.stderr)
            outputs = [civ.OUTPUT, civ.AUDIT, civ.REPORT, unit.AUDIT, unit.REPORT, building.AUDIT, building.REPORT]
            baseline = {p: (root / p).read_bytes() for p in outputs}
            self.assertEqual(run('--check').returncode, 0)
            def wrong_direct(v):
                row = copy.deepcopy(self.data['buildings']['relations'][0])
                row.update(entityId='building/84', relation='direct')
                v['relations'].append(row)
            cases = [
                ('catalog.json', lambda v: v['pages'].pop(), 'directory coverage'),
                ('catalog.json', lambda v: v['pages'][0].update(sourceUrl='https://invalid.example/building'), 'fixed index'),
                ('catalog.json', lambda v: next(p for p in v['pages'] if p['searchState'] == 'not-checked').update(searchState='no-log'), 'observed source'),
                ('imports.json', lambda v: v['legacy'].pop(), 'each old unit'),
                ('imports.json', lambda v: v['attachments'][0].update(eventId='missing'), 'missing canonical event'),
                ('imports.json', lambda v: v['additionalEffects'][0]['effect'].update(entityRefs=[{'entityId': 'building/missing'}]), 'dangling unit relation'),
                ('imports.json', lambda v: v['additionalEffects'][0]['effect'].update(conditions=['']), 'schema'),
                ('imports.json', lambda v: v['events'][0]['claims'][0].update(sourceEntryIds=['missing']), 'dangling claim citation'),
                ('imports.json', wrong_direct, 'direct unit relation needs exact effect identity'),
            ]
            for file, mutate, error in cases:
                path = root / INPUT / file
                original = path.read_text()
                value = json.loads(original)
                mutate(value)
                path.write_text(civ.encode(value))
                for args in [(), ('--check',)]:
                    result = run(*args)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(error, result.stderr)
                    self.assertEqual({p: (root / p).read_bytes() for p in outputs}, baseline)
                path.write_text(original)
            catalog_path = root / INPUT / 'catalog.json'
            catalog = json.loads(catalog_path.read_text())
            page = next(p for p in catalog['pages'] if p['entityId'] == 'building/109')
            page.update(searchState='read-failed', reason='测试夹具：新读取失败，旧快照保留')
            catalog_path.write_text(civ.encode(catalog))
            self.assertEqual(run().returncode, 0)
            data = json.loads((root / civ.OUTPUT).read_text())
            row = next(r for r in data['buildings']['rows'] if r['entityId'] == page['entityId'])
            self.assertEqual(row['sourceState'], 'read-failed')
            self.assertEqual(row['sourceEntryCount'], 17)
            self.assertEqual(data['events'], self.data['events'])
            snap = root / INPUT / catalog['sectionFiles'][0]['path']
            snap.write_bytes(snap.read_bytes() + b' ')
            self.assertIn('snapshot pin', run('--check').stderr)


if __name__ == '__main__':
    unittest.main()
