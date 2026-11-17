"""Technology coverage, shared claim conservation and real CLI failure safety."""
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
INPUT = Path('data/sources/tech_history')


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


civ, unit, building, tech = [module(n) for n in ['civ_history_build', 'unit_history', 'building_history', 'tech_history']]


class TechHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base, _ = civ.build()
        base, _ = unit.extend_history(ROOT, base, civ.validate_documents)
        cls.base, _ = building.extend_history(ROOT, base, civ.validate_documents, unit)
        cls.data, cls.audit = tech.extend_history(ROOT, cls.base, civ.validate_documents)

    def test_conserves_directory_retired_originals_and_previous_projections(self):
        rows = self.data['techs']['rows']
        directory = json.loads((ROOT / 'data/game/techs.json').read_text())
        self.assertEqual(len(rows), 199)
        self.assertEqual({r['entityId'] for r in rows}, {'tech/' + str(t['id']) for t in directory})
        self.assertEqual({r['entityId'] for r in self.data['techs']['historicalRows']}, {'tech/716@retired', 'tech/legacy-berserkergang@retired', 'tech/legacy-zealotry@retired'})
        for key in ['units', 'buildings', 'civilizations', 'legacyMap']:
            self.assertEqual(self.base[key], self.data[key])
        self.assertEqual(self.data['events'][:len(self.base['events'])], self.base['events'])
        self.assertEqual(self.data['sourceEntries'][:len(self.base['sourceEntries'])], self.base['sourceEntries'])
        self.assertTrue(all(r['sourceState'] == 'not-checked' and r['checkedAt'] is None and r['sourceEntryCount'] is None for r in rows))
        self.assertEqual((self.audit['techLegacyCount'], self.audit['techLegacyReusedCount'], self.audit['techLegacyImportedCount']), (97, 94, 3))
        for row in self.data['techs']['legacyMap']:
            matches = [(e, c) for e in self.data['events'] for c in e['claims'] if row['key'] in c['legacyKeys']]
            self.assertEqual(len(matches), 1)
            event, claim = matches[0]
            self.assertEqual((event['id'], claim['id']), (row['eventId'], row['claimId']))
            self.assertTrue(set(row['effectIds']) <= {e['id'] for e in claim['effects']})
            self.assertEqual(event['versionId'], 'de-' + row['key'].split(':')[0])
        self.assertEqual((self.data, self.audit), tech.extend_history(ROOT, self.base, civ.validate_documents))

    def test_rejects_corrupt_inputs_before_generation(self):
        mutations = [
            ('catalog.json', lambda x: x['directory'].update(count=198)),
            ('catalog.json', lambda x: x['directory'].update(sha256='0' * 64)),
            ('catalog.json', lambda x: x['pages'].append(copy.deepcopy(x['pages'][0]))),
            ('catalog.json', lambda x: x['retiredIds'].pop()),
            ('imports.json', lambda x: x['legacy'].pop()),
            ('imports.json', lambda x: x['legacy'].append(copy.deepcopy(x['legacy'][0]))),
            ('imports.json', lambda x: x['legacy'][0].update(eventId='missing-event')),
            ('imports.json', lambda x: x['legacy'][0].update(effectIds=['missing-effect'])),
            ('imports.json', lambda x: x['newEvents'][0].update(versionId='de-81058')),
            ('imports.json', lambda x: x['identityBindings'].update({'81058:81058-13': 'tech/373'})),
            ('imports.json', lambda x: x['effectKinds'].pop(next(iter(x['effectKinds'])))),
            ('imports.json', lambda x: x['relations'].append({'entityId': 'tech/690', 'eventId': 'evt-legacy-61321-61321-06', 'effectIds': ['not-in-claim'], 'relation': 'direct', 'note': 'negative fixture'})),
        ]
        for filename, mutate in mutations:
            with self.subTest(filename=filename, mutation=mutate), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                shutil.copytree(ROOT / INPUT, root / INPUT)
                (root / 'data/game').mkdir(parents=True)
                shutil.copy(ROOT / 'data/game/techs.json', root / 'data/game/techs.json')
                path = root / INPUT / filename
                doc = json.loads(path.read_text())
                mutate(doc)
                path.write_text(json.dumps(doc, ensure_ascii=False))
                with self.assertRaises(ValueError):
                    tech.extend_history(root, self.base, civ.validate_documents)

    def test_duplicate_existing_claim_fails_instead_of_importing_again(self):
        base = copy.deepcopy(self.base)
        row = self.data['techs']['legacyMap'][0]
        event = next(e for e in base['events'] if e['id'] == row['eventId'])
        event['claims'].append(copy.deepcopy(next(c for c in event['claims'] if c['id'] == row['claimId'])))
        with self.assertRaisesRegex(ValueError, 'duplicated'):
            tech.extend_history(ROOT, base, civ.validate_documents)

    def test_real_cli_reproducibility_and_no_outputs_overwritten_on_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for directory in ['scripts', 'data/sources', 'data/game', 'data/schemas', 'data/content', 'data/reports']:
                shutil.copytree(ROOT / directory, root / directory, ignore=shutil.ignore_patterns('.cache', '__pycache__'))
            (root / 'docs/reports').mkdir(parents=True)
            shutil.copytree(ROOT / 'src/content/schema', root / 'src/content/schema')
            (root / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
            command = [sys.executable, str(root / 'scripts/civ_history_build.py')]
            result = subprocess.run(command, cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / civ.OUTPUT).read_bytes(), (ROOT / civ.OUTPUT).read_bytes())
            result = subprocess.run([*command, '--check'], cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            outputs = [civ.OUTPUT, civ.AUDIT, unit.AUDIT, building.AUDIT, tech.AUDIT]
            saved = {p: (root / p).read_bytes() for p in outputs}
            path = root / INPUT / 'imports.json'
            doc = json.loads(path.read_text())
            doc['legacy'].pop()
            path.write_text(json.dumps(doc))
            result = subprocess.run(command, cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(saved, {p: (root / p).read_bytes() for p in outputs})


if __name__ == '__main__':
    unittest.main()
