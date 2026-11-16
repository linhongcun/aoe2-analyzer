"""Civilization-history input reconciliation and immutable migration checks."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('civ_history_build', ROOT / 'scripts/civ_history_build.py')
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class CivHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = build.load_inputs()
        cls.payload, cls.audit = build.assemble(cls.inputs)

    def test_entire_directory_and_observed_source_reconciliation(self):
        self.assertEqual({c['civId'] for c in self.payload['civilizations']}, {c['en'] for c in self.inputs['civs']})
        self.assertEqual(self.audit['sourceEntryCount'], sum(s['observedEntryCount'] for _, s in self.inputs['snapshots']))
        self.assertEqual(self.audit['sourceEntryCount'], 1109)
        self.assertEqual(len({e['id'] for e in self.payload['sourceEntries']}), len(self.payload['sourceEntries']))
        for civ in ['Danes', 'Saxons']:
            row = next(c for c in self.payload['civilizations'] if c['civId'] == civ)
            self.assertEqual(row['sourceState'], 'no-log')
        build.validate_documents([build.document('payload', 'runtime', self.payload), build.document('audit', 'auditReport', self.audit)])

    def test_all_legacy_keys_records_and_old_projections_survive(self):
        mappings = {m['key']: m for m in self.payload['legacyMap']}
        for baseline, patch in self.inputs['archives']:
            self.assertEqual(baseline['entryCount'], len(patch['entries']))
            stored = next(b for b in self.payload['meta']['legacyBaseline'] if b['path'] == baseline['path'])
            self.assertEqual(stored['metadata'], {k: v for k, v in patch.items() if k != 'entries'})
            for record in patch['entries']:
                mapping = mappings[patch['id'] + ':' + record['id']]
                self.assertEqual(mapping['originalRecord'], record)
                self.assertEqual(mapping['projections'], build.legacy_projections(record, [c['en'] for c in self.inputs['civs']]))
        self.assertEqual((self.audit['legacyRecordCount'], self.audit['legacyMigratedCount'], self.audit['legacyArchiveOnlyCount'], self.audit['legacyProjectionCount']), (366, 289, 77, 365))
        actual_keys = [key for event in self.payload['events'] for claim in event['claims'] for key in claim['legacyKeys']]
        self.assertEqual(len(actual_keys), 289)
        self.assertEqual(len(set(actual_keys)), 289)

    def test_reordering_inputs_preserves_persistent_event_claim_and_effect_ids(self):
        changed = copy.deepcopy(self.inputs)
        changed['events']['events'].reverse()
        changed['events']['versions'].reverse()
        changed['legacy-map']['entries'].reverse()
        changed['snapshots'].reverse()
        actual, _ = build.assemble(changed)
        for collection in ['events', 'entities', 'sourceEntries']:
            before = {r['id'] for r in self.payload[collection]}
            after = {r['id'] for r in actual[collection]}
            self.assertEqual(before, after)
        claims = lambda p: {c['id'] for e in p['events'] for c in e['claims']}
        effects = lambda p: {f['id'] for e in p['events'] for c in e['claims'] for f in c['effects']}
        self.assertEqual(claims(actual), claims(self.payload))
        self.assertEqual(effects(actual), effects(self.payload))
        again, _ = build.assemble(self.inputs)
        self.assertEqual(build.encode(again), build.encode(self.payload))

    def test_a_missing_original_or_legacy_mapping_fails_closed(self):
        changed = copy.deepcopy(self.inputs)
        changed['snapshots'][0][1]['entries'].pop()
        with self.assertRaisesRegex(ValueError, 'count mismatch'):
            build.assemble(changed)
        changed = copy.deepcopy(self.inputs)
        changed['legacy-map']['entries'].pop()
        with self.assertRaisesRegex(ValueError, 'Unmapped legacy'):
            build.assemble(changed)

    def test_multisource_and_multieffect_claims_keep_both_forms_and_unknowns(self):
        cumans = next(s for _, s in self.inputs['snapshots'] if s['civId'] == 'Cumans')
        events = {e['id']: e for e in self.payload['events']}
        hp = events[cumans['entries'][3]['eventIds'][0]]['claims'][0]['effects']
        self.assertEqual([(e['before'], e['after']) for e in hp], [(50, 40), (55, 45)])
        self.assertNotEqual(hp[0]['entityRefs'], hp[1]['entityRefs'])
        delta = events[cumans['entries'][6]['eventIds'][0]]['claims'][0]['effects'][0]
        self.assertEqual((delta['before'], delta['after'], delta['delta']), (None, None, 1))
        discount = events[cumans['entries'][16]['eventIds'][0]]['claims'][0]['effects']
        self.assertTrue(all(e['type'] == 'bonus' and e['operation'] == 'absolute-discount' and e['before'] is None and e['after'] == 75 for e in discount))
        self.assertGreater(len(events[cumans['entries'][6]['eventIds'][0]]['claims'][0]['sourceEntryIds']), 1)
        for entity in self.payload['entities']:
            if entity['status'] == 'retired':
                self.assertIsNone(entity['linkPath'])
        self.assertTrue(any(e['catalogId'] == '716' and e['status'] == 'retired' for e in self.payload['entities']))

    def test_multiple_versions_and_unknown_later_reversal_are_distinct_events(self):
        events = {e['id']: e for e in self.payload['events']}
        for civ, entry_index in [('Malay', 3), ('Incas', 31)]:
            snapshot = next(s for _, s in self.inputs['snapshots'] if s['civId'] == civ)
            row = snapshot['entries'][entry_index]
            self.assertEqual(len(row['eventIds']), 2)
            self.assertNotEqual(events[row['eventIds'][0]]['versionId'], events[row['eventIds'][1]]['versionId'])
            if civ == 'Incas':
                self.assertIsNone(events[row['eventIds'][1]]['versionId'])
            for eid in row['eventIds']:
                self.assertTrue(any(row['id'] in claim['sourceEntryIds'] for claim in events[eid]['claims']))

    def test_schema_rejects_fabricated_value_types_and_missing_pending_reason(self):
        event = copy.deepcopy(self.inputs['events']['events'][0])
        event['claims'][0]['effects'][0] = {'id': 'bad', 'type': 'numeric', 'entityRefs': [{'unresolvedName': 'unknown', 'type': None}], 'text': 'fixture', 'conditions': [], 'scope': None, 'attribute': 'hp', 'before': 'unknown', 'after': 0, 'delta': None, 'unit': None, 'operation': 'set'}
        with self.assertRaisesRegex(ValueError, 'fixture'):
            build.validate_documents([build.document('fixture', 'eventInput', {'schemaVersion': 1, 'versions': [], 'events': [event], 'merges': []})])
        snapshot = copy.deepcopy(self.inputs['snapshots'][0][1])
        snapshot['entries'][0].update({'processing': 'pending', 'reason': ''})
        with self.assertRaisesRegex(ValueError, 'fixture'):
            build.validate_documents([build.document('fixture', 'sectionSnapshot', snapshot)])
        changed = copy.deepcopy(self.inputs)
        changed['snapshots'][0][1]['entries'][0].update({'processing': 'pending', 'reason': ' '})
        with self.assertRaisesRegex(ValueError, 'explicit processing reason'):
            build.assemble(changed)

    def test_both_claims_of_a_conflict_survive_without_selecting_a_winner(self):
        changed = copy.deepcopy(self.inputs)
        snapshot = next(s for _, s in changed['snapshots'] if s['civId'] == 'Cumans')
        event = next(e for e in changed['events']['events'] if e['id'] == snapshot['entries'][3]['eventIds'][0])
        alternate = copy.deepcopy(event['claims'][0])
        alternate['id'] += ':fixture-alternate'
        for effect in alternate['effects']:
            effect['id'] += ':fixture-alternate'
        alternate['effects'][0]['after'] = 17  # Deliberately synthetic, never a production claim.
        event['claims'].append(alternate)
        event.update({'verification': 'conflict', 'verificationNote': '测试夹具：同一原文的两种解释，不是已确认的游戏事实。'})
        payload, _ = build.assemble(changed)
        actual = next(e for e in payload['events'] if e['id'] == event['id'])
        self.assertEqual(actual['verification'], 'conflict')
        self.assertEqual([c['effects'][0]['after'] for c in actual['claims']], [40, 17])
        build.validate_documents([build.document('fixture', 'runtime', payload)])

    def test_a_new_section_and_entry_revision_retains_the_previous_identity(self):
        changed = copy.deepcopy(self.inputs)
        previous = next(s for _, s in changed['snapshots'] if s['civId'] == 'Varangians')
        revision = copy.deepcopy(previous)
        revision.update({'revisionId': 'fixture-revision-2', 'supersedesRevisionId': previous['revisionId'], 'documentSha256': 'f' * 64})
        identities = {}
        for entry in revision['entries']:
            old = entry['id']
            entry['id'] += ':fixture-revision-2'
            entry['supersedesEntryIds'] = [old]
            identities[old] = entry['id']
        relative = 'sections/Varangians-fixture-revision-2.json'
        changed['snapshots'].append((str(build.INPUT / relative), revision))
        page = next(p for p in changed['catalog']['pages'] if p['civId'] == 'Varangians')
        page['sectionFiles'].append({'path': relative, 'sha256': 'e' * 64})
        merges = {merge['eventId']: merge for merge in changed['events']['merges']}
        for event in changed['events']['events']:
            for claim in event['claims']:
                claim['sourceEntryIds'] += [identities[sid] for sid in claim['sourceEntryIds'] if sid in identities]
            refs = sorted({sid for claim in event['claims'] for sid in claim['sourceEntryIds']})
            if not set(refs) & set(identities.values()):
                continue
            if event['id'] not in merges:
                merge = {'eventId': event['id'], 'sourceKeys': refs, 'reason': '测试夹具：显式核对同一原文的新旧章节修订。'}
                changed['events']['merges'].append(merge)
            else:
                merges[event['id']]['sourceKeys'] = refs
        payload, audit = build.assemble(changed)
        self.assertEqual(len([s for s in payload['sections'] if s['civId'] == 'Varangians']), 2)
        entries = {entry['id']: entry for entry in payload['sourceEntries']}
        for old, new in identities.items():
            self.assertIn(old, entries)
            self.assertEqual(entries[new]['supersedesEntryIds'], [old])
            self.assertEqual(entries[old]['originalText'], entries[new]['originalText'])
        build.validate_documents([build.document('fixture', 'runtime', payload), build.document('fixture audit', 'auditReport', audit)])

    def test_previous_revision_cannot_be_deleted_or_cyclic(self):
        changed = copy.deepcopy(self.inputs)
        changed['snapshots'][0][1]['supersedesRevisionId'] = 'deleted-revision'
        with self.assertRaisesRegex(ValueError, 'Previous source revision'):
            build.assemble(changed)
        changed = copy.deepcopy(self.inputs)
        snapshot = changed['snapshots'][0][1]
        snapshot['supersedesRevisionId'] = snapshot['revisionId']
        with self.assertRaisesRegex(ValueError, 'Cyclic'):
            build.assemble(changed)


if __name__ == '__main__':
    unittest.main()
