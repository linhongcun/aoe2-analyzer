"""Civilization-history input reconciliation and immutable migration checks."""
import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
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

    def test_migrated_citations_keep_each_exact_source_url_including_anchors(self):
        entries = {entry['id']: entry for entry in self.payload['sourceEntries']}
        sources = {source['id']: source for source in self.payload['sources']}
        claims = {claim['id']: claim for event in self.payload['events'] for claim in event['claims']}
        for mapping in self.payload['legacyMap']:
            if mapping['disposition'] != 'migrated':
                continue
            citations = [entries[sid] for sid in claims[mapping['claimId']]['sourceEntryIds'] if mapping['key'] in entries[sid]['legacyKeys']]
            self.assertTrue(citations)
            self.assertEqual({sources[entry['sourceId']]['url'] for entry in citations}, {mapping['originalRecord']['source']})
        changed = copy.deepcopy(self.inputs)
        patch = next(patch for _, patch in changed['archives'] if patch['id'] == '185872')
        next(record for record in patch['entries'] if record['id'] == '185872-24')['source'] = 'javascript:alert(1)'
        with self.assertRaisesRegex(ValueError, 'Unsafe legacy entry source'):
            build.assemble(changed)

    def test_a_missing_original_or_legacy_mapping_fails_closed(self):
        changed = copy.deepcopy(self.inputs)
        changed['snapshots'][0][1]['entries'].pop()
        with self.assertRaisesRegex(ValueError, 'count mismatch'):
            build.assemble(changed)
        changed = copy.deepcopy(self.inputs)
        changed['legacy-map']['entries'].pop()
        with self.assertRaisesRegex(ValueError, 'Unmapped legacy'):
            build.assemble(changed)

    def test_medical_corps_is_a_technology_with_distinct_source_claims(self):
        event = next(e for e in self.payload['events'] if e['id'] == 'ev-se-86e20f2d-15b8-4637-83e4-35efde6ea57b')
        self.assertEqual(event['scope']['scopeKind'], 'civ')
        self.assertEqual(event['scope']['beneficiary'], 'self')
        self.assertEqual(event['scope']['providerCivIds'], [])
        self.assertEqual(len(event['claims']), 3)
        self.assertEqual(sorted(c['verification'] for c in event['claims']), ['unverified', 'verified', 'verified'])
        self.assertEqual(len({sid for c in event['claims'] for sid in c['sourceEntryIds']}), 3)
        for claim in event['claims']:
            for effect in claim['effects']:
                self.assertEqual(effect['type'], 'numeric')
                self.assertEqual(effect['entityRefs'], [{'entityId': 'tech/831'}])
                self.assertNotEqual((effect['scope'] or event['scope'])['scopeKind'], 'team')
        community = next(c for c in event['claims'] if c['id'].startswith('cl-se-'))
        self.assertEqual([(f['before'], f['after'], f['unit']) for f in community['effects']], [(350, 300, '食物'), (250, 200, '黄金'), (20, 30, None)])
        official = next(c for c in event['claims'] if '81058:81058-62' in c['legacyKeys'])
        self.assertEqual(official['effects'][0]['unit'], 'HP/分钟')

    def test_explicit_legacy_team_bonuses_retain_provider_beneficiary_and_old_projection(self):
        events = {e['id']: e for e in self.payload['events']}
        mappings = {m['key']: m for m in self.payload['legacyMap']}
        for key, provider in [('125283:125283-014-017', 'Chinese'), ('81058:81058-39', 'Britons'), ('81058:81058-64', 'Ethiopians'), ('81058:81058-83', 'Incas')]:
            with self.subTest(key=key):
                mapping = mappings[key]
                event = events[mapping['eventId']]
                claim = next(c for c in event['claims'] if c['id'] == mapping['claimId'])
                for scope in [event['scope'], *(f['scope'] for f in claim['effects'])]:
                    self.assertEqual((scope['scopeKind'], scope['providerCivIds'], scope['beneficiary']), ('team', [provider], 'team'))
                    self.assertEqual(scope['affectedCivIds'], [])
                self.assertTrue(any(r['civId'] == provider and r['relation'] == 'provider' for r in event['civRelations']))
                self.assertEqual(mapping['projections'], build.legacy_projections(mapping['originalRecord'], [c['en'] for c in self.inputs['civs']]))

    def test_reported_numeric_objects_resources_zero_and_age_conditions_are_structured(self):
        events = {e['id']: e for e in self.payload['events']}
        def effects(prefix):
            return next(e for e in events.values() if e['id'].startswith('ev-se-' + prefix))['claims'][0]['effects']
        indigo = effects('82143c48')
        self.assertEqual([(f['entityRefs'], f['before'], f['after']) for f in indigo], [([{'entityId': 'unit/232'}], 65, 70), ([{'entityId': 'unit/534'}], 80, 85)])
        wagon = effects('9456ae2b')
        # Mule Cart is building/1808 in this repository's current directory.
        self.assertTrue(all(f['entityRefs'] == [{'entityId': 'building/1808'}] for f in wagon))
        self.assertEqual([(f['unit'], f['before'], f['after']) for f in wagon], [('木材', 100, 80), ('食物', 20, 20)])
        church = effects('b83f1013')
        self.assertTrue(all(f['entityRefs'] == [{'entityId': 'building/1806'}] for f in church))
        self.assertEqual([(f['before'], f['after']) for f in church if f['type'] == 'numeric'], [(5, 0), (6, 4)])
        serjeant = effects('4de99517')
        self.assertEqual([(f['before'], f['after'], f['conditions']) for f in serjeant if f['attribute'] == '生命值'], [(45, 50, ['封建时代']), (65, 75, ['城堡时代'])])
        speed = next(f for f in serjeant if f['delta'] is not None)
        self.assertEqual((speed['before'], speed['after'], speed['delta'], speed['conditions']), (None, None, -25, ['封建时代']))
        self.assertEqual([(f['unit'], f['before'], f['after']) for f in serjeant if f['attribute'].startswith('升级')], [('食物', 1100, 800), ('黄金', 800, 675)])
        for key in ['81058:81058-120', '81058:81058-121', '81058:81058-122', '81058:81058-123']:
            mapping = next(m for m in self.payload['legacyMap'] if m['key'] == key)
            claim = next(c for c in events[mapping['eventId']]['claims'] if c['id'] == mapping['claimId'])
            effect = next(f for f in claim['effects'] if f['id'] == 'ef-legacy-' + mapping['entryId'])
            self.assertEqual(effect['type'], 'numeric')
            self.assertIn(mapping['originalRecord']['scopeNote'], effect['conditions'])
            self.assertIn(mapping['originalRecord']['scopeNote'], effect['scope']['conditions'])
        elephants = effects('4dcf4df6')
        self.assertEqual([(f['entityRefs'][0]['entityId'], f['before'], f['after']) for f in elephants if f['type'] == 'numeric'], [('unit/1132', 7, 4), ('unit/1134', 10, 7)])
        self.assertEqual(len([f for f in elephants if f['type'] == 'mechanic' and '碰撞体积' in f['text']]), 1)

    def test_shared_berserker_targets_and_unspecified_goth_discount_resource(self):
        berserk = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-8321b7f4'))
        effect = berserk['claims'][0]['effects'][0]
        self.assertEqual(effect['entityRefs'], [{'entityId': 'unit/692'}, {'entityId': 'unit/694'}])
        self.assertEqual((effect['attribute'], effect['before'], effect['after'], effect['unit']), ('生命值恢复量', 20, 40, None))
        goths = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-725580de'))
        discounts = [f for f in goths['claims'][0]['effects'] if f['type'] == 'numeric']
        self.assertEqual([(f['before'], f['after'], f['unit'], f['conditions']) for f in discounts], [(None, 10, '%', ['封建时代']), (None, 15, '%', ['城堡时代']), (None, 25, '%', ['帝王时代'])])
        self.assertTrue(all(f['attribute'] == '训练成本折扣率' and f['entityRefs'] == [{'unresolvedName': '步兵', 'type': 'unit'}] for f in discounts))

    def test_other_explicit_values_in_compound_source_claims_are_numeric(self):
        cases = [
            ('5a574943', '食物成本', 60, 70, '食物', [{'entityId': 'unit/879'}]),
            ('940b9170', '效率', 1.2, 1.8, '食物/分钟', [{'entityId': 'tech/1061'}]),
            ('d81f1c94', '生产量', 7, 5, None, [{'entityId': 'tech/756'}]),
            ('fdf0ba33', '远程护甲加成', 1, 2, None, [{'unresolvedName': '长枪兵', 'type': 'unit'}, {'unresolvedName': '投矛手', 'type': 'unit'}]),
        ]
        for prefix, attribute, before, after, unit, refs in cases:
            with self.subTest(prefix=prefix):
                event = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-' + prefix))
                claim = next(c for c in event['claims'] if c['id'].startswith('cl-se-'))
                effect = next(f for f in claim['effects'] if f.get('attribute') == attribute)
                self.assertEqual((effect['type'], effect['before'], effect['after'], effect['unit'], effect['entityRefs']), ('numeric', before, after, unit, refs))
                self.assertEqual(claim['verification'], 'unverified')
                self.assertEqual((effect['scope'] or event['scope'])['affectedCivIds'], event['scope']['affectedCivIds'])
                if prefix == 'd81f1c94':
                    self.assertNotIn('城镇中心', effect['text'])
                    self.assertEqual(effect['conditions'], [])
                if prefix == 'fdf0ba33':
                    self.assertEqual(effect['conditions'], ['塔盾科技效果'])
        inca = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-5a574943'))
        discounts = [f for f in inca['claims'][0]['effects'] if f.get('attribute') == '食物折扣率']
        self.assertEqual([(f['before'], f['after']) for f in discounts], [(5, 15), (10, 20), (15, 25), (20, 30)])
        self.assertTrue(all('未注明' in f['conditions'][0] for f in discounts))

    def test_bounded_related_multi_object_and_compound_changes(self):
        def effects(prefix):
            return next(e for e in self.payload['events'] if e['id'].startswith('ev-se-' + prefix))['claims'][0]['effects']
        for prefix, attribute, ids, values in [
            ('8c92eed8', '食物成本', ['unit/1123', 'unit/1125'], (30, 25)),
            ('c59f126b', '训练时间', ['unit/239', 'unit/558'], (31, 25)),
            ('8d25eadb', '移动速度', ['unit/876', 'unit/878'], (1.4, 1.3)),
            ('220fafb8', '重型攻城器护甲', ['unit/1120', 'unit/1122'], (20, 10)),
        ]:
            with self.subTest(prefix=prefix):
                effect = next(f for f in effects(prefix) if f.get('attribute') == attribute)
                self.assertEqual(effect['entityRefs'], [{'entityId': identity} for identity in ids])
                self.assertEqual((effect['before'], effect['after']), values)
        for prefix, attribute, values, refs in [
            ('32192b74', '远程护甲', (0, 1), [{'unresolvedName': '印度剑客', 'type': 'unit'}]),
            ('30a6793e', '生命值', (70, 75), [{'entityId': 'unit/869'}]),
            ('95611fa0', '对战象加成', (80, 130), [{'entityId': 'unit/1263'}]),
            ('883a3b65', '生命值加成', (30, 20), [{'unresolvedName': '骆驼单位', 'type': 'unit'}]),
        ]:
            with self.subTest(prefix=prefix):
                effect = next(f for f in effects(prefix) if f.get('attribute') == attribute)
                self.assertEqual((effect['before'], effect['after']), values)
                self.assertEqual(effect['entityRefs'], refs)
        india = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-32192b74'))
        self.assertIsNone(india['versionId'])
        formula = next(f for f in effects('30a6793e') if f['type'] == 'mechanic')
        self.assertEqual(formula['entityRefs'], [{'unresolvedName': '雇佣军', 'type': 'tech'}])
        self.assertIn('黄金成本用食物代替', formula['text'])

    def test_remaining_shared_unit_speed_gold_and_unknown_version_training_time(self):
        def event(prefix):
            return next(e for e in self.payload['events'] if e['id'].startswith('ev-se-' + prefix))
        woad = event('b5e648e5')
        speed = next(f for f in woad['claims'][0]['effects'] if f.get('attribute') == '基础移动速度')
        self.assertEqual((speed['before'], speed['after'], speed['entityRefs']), (1.2, 1.17, [{'entityId': 'unit/232'}, {'entityId': 'unit/534'}]))
        attack = next(f for f in woad['claims'][0]['effects'] if f.get('attribute') == '基础攻击力')
        self.assertEqual((attack['before'], attack['after'], attack['entityRefs']), (14, 15, [{'entityId': 'unit/534'}]))
        shotel = event('4cf9db92')
        numeric = [f for f in shotel['claims'][0]['effects'] if f['type'] == 'numeric']
        self.assertEqual([(f['attribute'], f['before'], f['after'], f['unit'], f['entityRefs']) for f in numeric], [('黄金成本', 35, 30, '黄金', [{'entityId': 'unit/1016'}, {'entityId': 'unit/1018'}])])
        food = next(f for f in shotel['claims'][0]['effects'] if f['type'] == 'mechanic')
        self.assertIn('食物成本不变', food['text'])
        self.assertIsNone(food['legacyBefore'])
        self.assertIsNone(food['legacyAfter'])
        boyar = event('c840ac79')
        self.assertIsNone(boyar['versionId'])
        self.assertEqual([(f['type'], f['attribute'], f['before'], f['after'], f['unit'], f['entityRefs']) for f in boyar['claims'][0]['effects']], [('numeric', '训练时间', 23, 15, '秒', [{'entityId': 'unit/876'}]), ('numeric', '训练时间', 20, 15, '秒', [{'entityId': 'unit/878'}])])
        self.assertEqual((woad['versionId'], shotel['versionId']), ('de-141935', 'de-42848'))
        for e in [woad, shotel, boyar]:
            self.assertEqual(e['verification'], 'unverified')
            self.assertTrue(all(c['verification'] == 'unverified' for c in e['claims']))

    def test_deduplication_preserves_claim_ids_and_does_not_absorb_other_candidates(self):
        mappings = {m['key']: m for m in self.payload['legacyMap']}
        events = {e['id']: e for e in self.payload['events']}
        for key, eid in [('81058:81058-61', 'ev-se-86e20f2d-15b8-4637-83e4-35efde6ea57b'), ('81058:81058-62', 'ev-se-86e20f2d-15b8-4637-83e4-35efde6ea57b'), ('81058:81058-83', 'ev-se-f62ee4b7-a8ff-40e9-8fdd-5c41070930cc')]:
            self.assertEqual(mappings[key]['eventId'], eid)
            self.assertTrue(any(c['id'] == mappings[key]['claimId'] and key in c['legacyKeys'] for c in events[eid]['claims']))
        self.assertTrue({'ev-legacy-81058-b053', 'ev-legacy-81058-b054', 'ev-legacy-81058-b072'}.isdisjoint(events))
        self.assertIn('ev-legacy-81058-b052', events)
        inca = events['ev-se-f62ee4b7-a8ff-40e9-8fdd-5c41070930cc']
        self.assertEqual(len(inca['claims']), 2)
        self.assertEqual(sorted(c['verification'] for c in inca['claims']), ['unverified', 'verified'])

    def test_related_cost_and_array_patterns_keep_resource_formulas_and_unknown_units(self):
        events = self.payload['events']
        def effects(prefix):
            return next(e for e in events if e['id'].startswith('ev-se-' + prefix))['claims'][0]['effects']
        for prefix, expected in [('ac1f9073', [(30, 30, '食物'), (60, 50, '黄金')]), ('5bdb4e6a', [(400, 600, '木材'), (400, 500, '黄金')]), ('3603773e', [(125, 100, '木材')]), ('ab7df1d2', [(60, 50, '食物'), (35, 35, '黄金')]), ('ca9daf51', [(65, 65, '食物'), (25, 20, '黄金')])]:
            with self.subTest(prefix=prefix):
                self.assertEqual([(f['before'], f['after'], f['unit']) for f in effects(prefix)], expected)
        formula = [f for f in effects('fff7e4f6') if f['type'] == 'numeric']
        self.assertEqual([(f['before'], f['after']) for f in formula], [(1200, 200), (650, 150), (None, 10), (None, 5)])
        self.assertTrue(all('基础项不等于总价格' in f['conditions'][0] for f in formula))
        named = effects('2875bac3')
        self.assertEqual([(f['entityRefs'][0]['unresolvedName'], f['before'], f['after']) for f in named], [('黑光铠骑兵', 15, 20), ('鲜卑掠骑兵', 15, 30)])
        unknown = effects('ca1e6894')
        self.assertTrue(all(f['unit'] is None and '未注明' in f['conditions'][0] for f in unknown))

    def test_japanese_samurai_shorthand_does_not_link_to_man_at_arms(self):
        event = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-dd42a04b'))
        self.assertTrue(all(f['entityRefs'] == [{'entityId': 'unit/291'}] for c in event['claims'] for f in c['effects']))

    def test_multi_object_changes_do_not_inherit_another_subject(self):
        def effects(prefix):
            return next(e for e in self.payload['events'] if e['id'].startswith('ev-se-' + prefix))['claims'][0]['effects']
        for prefix in ['0ae70ba6', '190d318e', 'a20e4a32']:
            self.assertFalse(any(f['type'] == 'mechanic' for f in effects(prefix)))
        hp = next(f for f in effects('0ae70ba6') if f.get('attribute') == '生命值')
        self.assertEqual(hp['entityRefs'], [{'entityId': 'unit/1016'}])
        train = next(f for f in effects('a571b1ab') if f.get('attribute') == '训练时间')
        self.assertEqual(train['entityRefs'], [{'unresolvedName': '佣兵钦察骑射手', 'type': 'unit'}])
        self.assertEqual((train['before'], train['after']), (None, 12))
        for prefix in ['edbd545e', 'b145e310']:
            for effect in effects(prefix):
                if effect.get('attribute', '').startswith('升级'):
                    self.assertEqual(effect['entityRefs'][0]['type'], 'tech')
                    self.assertIn('未注明', effect['conditions'][-1])

    def test_building_and_game_mode_restrictions_apply_to_each_effect(self):
        for prefix, condition, count in [('da5947ed', '定居点训练', 4), ('c5f73078', '正常模式', 2)]:
            event = next(e for e in self.payload['events'] if e['id'].startswith('ev-se-' + prefix))
            effects = event['claims'][0]['effects']
            self.assertEqual(len(effects), count)
            self.assertTrue(all(condition in effect['conditions'] for effect in effects))

    def test_observation_boundaries_and_unknown_array_mapping_remain_explicit(self):
        events = {e['id']: e for e in self.payload['events']}
        cannon = next(m for m in self.payload['legacyMap'] if m['key'] == '185872:185872-116')
        self.assertNotEqual(cannon['eventId'], 'ev-se-148a5eb7-053d-4293-b614-a7d8c77c8c6b')
        self.assertIn(cannon['eventId'], events)
        removal = events['ev-se-f76fb4bc-98ec-433e-b3d8-b961eaa89489-later-removal']
        self.assertIsNone(removal['versionId'])
        self.assertIn('攻击速度加成', removal['claims'][0]['effects'][0]['entityRefs'][0]['unresolvedName'])
        self.assertEqual(events['ev-se-f76fb4bc-98ec-433e-b3d8-b961eaa89489']['versionId'], 'de-73855')
        unknown = next(e for e in events.values() if e['id'].startswith('ev-se-c896da2a'))
        numeric = [f for f in unknown['claims'][0]['effects'] if f['type'] == 'numeric']
        self.assertEqual([(f['before'], f['after']) for f in numeric], [(-10, -5), (-15, -10), (-20, -15)])
        self.assertTrue(all('未注明' in f['conditions'][0] for f in numeric))
        paper = next(e for e in events.values() if e['id'].startswith('ev-se-9e6e9081'))
        cost = {f['unit']: f for f in paper['claims'][0]['effects'] if f['type'] == 'numeric'}
        self.assertIsNone(cost['食物']['before'])
        self.assertIsNone(cost['黄金']['after'])
        bad_names = {'效果', 'O', '0', '射程', '生命值', '训练时间', '近战护甲', '攻击力', '远程防御'}
        self.assertFalse(any(ref.get('unresolvedName') in bad_names for event in events.values() for claim in event['claims'] for effect in claim['effects'] if effect['type'] in ['numeric', 'bonus'] for ref in effect['entityRefs']))

    def test_legacy_effect_scope_is_bounded_by_old_projections_in_real_cli(self):
        # Unlike build(root) below, launch the actual script/main and --check.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / build.INPUT, root / build.INPUT)
            shutil.copytree(ROOT / 'data/game/patches', root / 'data/game/patches')
            shutil.copytree(ROOT / 'data/sources/unit_history', root / 'data/sources/unit_history')
            for relative in [
                *[f'data/game/{name}.json' for name in ['civs', 'units', 'buildings', 'techs']],
                'data/schemas/common.defs.json', 'data/schemas/content-civ-updates.json',
                'scripts/civ_history_build.py', 'scripts/civ_history_validate.mjs', 'scripts/unit_history.py',
                'scripts/content-schema.mjs', 'scripts/content-baseline.mjs',
                'scripts/content-schema-catalog.mjs', 'src/content/schema/policy.mjs',
            ]:
                (root / relative).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / relative, root / relative)
            (root / 'node_modules').symlink_to((ROOT / 'node_modules').resolve(), target_is_directory=True)

            def cli(*args):
                return subprocess.run([sys.executable, str(root / 'scripts/civ_history_build.py'), *args], cwd=root, capture_output=True, text=True, timeout=60)

            for args in [(), ('--check',)]:
                result = cli(*args)
                self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads((root / build.OUTPUT).read_text())
            medical = next(e for e in payload['events'] if e['id'].startswith('ev-se-86e20f2d'))
            medical_claim = next(c for c in medical['claims'] if '81058:81058-61' in c['legacyKeys'])
            self.assertEqual(medical_claim['effects'][0]['scope']['affectedCivIds'], ['Dravidians'])
            team = next(e for e in payload['events'] if e['id'].startswith('ev-se-f62ee4b7'))
            self.assertTrue(all(f['scope']['providerCivIds'] == ['Incas'] and f['scope']['beneficiary'] == 'team' for c in team['claims'] if c['legacyKeys'] for f in c['effects']))

            path = root / build.INPUT / 'legacy-map.json'
            original = json.loads(path.read_text())
            # Explicit scopes may include every civilization the original record
            # actually projected to; they need not be restricted to one civ.
            supported = copy.deepcopy(original)
            mapping = next(m for m in supported['entries'] if len(m['projections']) > 1)
            old = next(m for m in payload['legacyMap'] if m['key'] == mapping['key'])
            claim = next(c for e in payload['events'] for c in e['claims'] if c['id'] == old['claimId'])
            effect = copy.deepcopy(next(f for f in claim['effects'] if f['id'] == 'ef-legacy-' + old['entryId']))
            effect['scope']['affectedCivIds'] = [p['civId'] for p in mapping['projections']]
            mapping['effects'] = [effect]
            path.write_text(build.encode(supported))
            for args in [(), ('--check',)]:
                result = cli(*args)
                self.assertEqual(result.returncode, 0, result.stderr)
            outputs = {relative: (root / relative).read_bytes() for relative in [build.OUTPUT, build.AUDIT, build.REPORT]}

            for field in ['affectedCivIds', 'providerCivIds']:
                with self.subTest(field=field):
                    changed = copy.deepcopy(original)
                    mapping = next(m for m in changed['entries'] if m['key'] == '81058:81058-61')
                    scope = copy.deepcopy(mapping['scope'])
                    scope[field] = ['Saracens']
                    mapping['effects'][0]['scope'] = scope
                    path.write_text(build.encode(changed))
                    for args in [(), ('--check',)]:
                        result = cli(*args)
                        self.assertNotEqual(result.returncode, 0, result.stdout)
                        self.assertIn('Legacy scope cannot introduce an unsupported civilization', result.stderr)
                        self.assertEqual({relative: (root / relative).read_bytes() for relative in outputs}, outputs)

    def test_real_build_rejects_bad_candidates_links_catalog_targets_and_build_keys(self):
        # Use real files/load_inputs/build/schema calls, without mocking assembly.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / build.INPUT, root / build.INPUT)
            (root / 'data/game').mkdir(parents=True, exist_ok=True)
            for name in ['civs', 'units', 'buildings', 'techs']:
                shutil.copy2(ROOT / f'data/game/{name}.json', root / f'data/game/{name}.json')
            shutil.copytree(ROOT / 'data/game/patches', root / 'data/game/patches')
            payload, audit = build.build(root)
            self.assertEqual(audit, self.audit)
            self.assertTrue(any(entity['id'] == 'civ/Armenians' and entity['status'] == 'current' and entity['linkPath'] == '/civ/Armenians' for entity in payload['entities']))
            self.assertTrue(any(entity['status'] == 'retired' and entity['linkPath'] is None for entity in payload['entities']))
            self.assertTrue(any('unresolvedName' in ref for event in payload['events'] for claim in event['claims'] for effect in claim['effects'] for ref in effect['entityRefs']))
            cases = [
                ('events', 'missing-candidate', 'candidate', lambda value: value['events'][0]['candidates'].append({'eventId': 'missing-event', 'reason': 'synthetic negative'})),
                ('events', 'self-candidate', 'candidate', lambda value: value['events'][0]['candidates'].append({'eventId': value['events'][0]['id'], 'reason': 'synthetic negative'})),
                ('identities', 'external-link', 'identity link', lambda value: value['entities'][0].update(linkPath='https://invalid.example')),
                ('identities', 'mismatched-link', 'identity link', lambda value: value['entities'][0].update(linkPath='/unit/1231')),
                ('identities', 'retired-link', 'Retired identity', lambda value: next(entity for entity in value['entities'] if entity['status'] == 'retired').update(linkPath='/tech/716')),
                ('identities', 'missing-current-target', 'no catalog target', lambda value: next(entity for entity in value['entities'] if entity['id'] == 'unit/1231').update(catalogId='999999999', linkPath='/unit/999999999')),
                ('events', 'wrong-key', 'canonical orderKey', lambda value: value['versions'][0].update(orderKey='2:9999999999')),
                ('events', 'missing-key', 'canonical orderKey', lambda value: value['versions'][0].update(orderKey=None)),
                ('legacy-map', 'wrong-historical-target', 'preserve the historical target', lambda value: next(row for row in value['entries'] if row['key'] == '81058:81058-55')['effects'][0].update(entityRefs=[{'entityId': 'unit/534'}])),
                ('legacy-map', 'unsupported-provider', 'unsupported civilization', lambda value: next(row for row in value['entries'] if row['key'] == '81058:81058-83')['scope'].update(providerCivIds=['Saracens'])),
            ]
            for name, label, error, mutate in cases:
                with self.subTest(label=label):
                    path = root / build.INPUT / f'{name}.json'
                    original = path.read_text()
                    value = json.loads(original)
                    mutate(value)
                    path.write_text(build.encode(value))
                    with self.assertRaisesRegex(ValueError, error):
                        build.build(root)
                    self.assertFalse((root / build.OUTPUT).exists())
                    path.write_text(original)

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

    def test_saracen_95810_changes_a_flat_health_bonus_to_a_percentage(self):
        event = next(e for e in self.payload['events'] if e['id'] == 'ev-se-78a3783c-8ff1-4564-a815-4e5eab998ee7')
        effect = event['claims'][0]['effects'][0]
        self.assertEqual((effect['before'], effect.get('beforeUnit', effect['unit'])), (10, 'HP'))
        self.assertEqual((effect['after'], effect.get('afterUnit', effect['unit'])), (25, '%'))

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
