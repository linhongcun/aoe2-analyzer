"""#435：历史证据与覆盖检查，不用当前数值假装验证历史快照。"""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import history_build as history  # noqa: E402


class HistoryBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patches, cls.coverages = history.generate()
        cls.identities = history.catalog_identities()

    def patch(self, ident):
        i = list(history.PATCHES).index(ident)
        return copy.deepcopy(self.patches[i]), copy.deepcopy(self.coverages[i])

    def test_generated_outputs_match_verified_inputs(self):
        for patch in self.patches:
            path = ROOT / f'src/data/patches/{patch["id"]}.json'
            self.assertEqual(json.loads(path.read_text()), patch)
        self.assertEqual((ROOT / 'docs/HISTORY-DATA.md').read_text(), history.coverage_report(self.patches, self.coverages))

    def test_missing_mapping_is_rejected(self):
        patch, coverage = self.patch('66692')
        patch['entries'] = [e for e in patch['entries'] if e['sourceBullet'] != '66692-b001']
        with self.assertRaisesRegex(AssertionError, '未映射'):
            history.validate_patch(patch, coverage, self.identities)

    def test_deleting_source_bullet_cannot_claim_complete_coverage(self):
        patch, coverage = self.patch('81058')
        coverage['bullets'].pop()
        with self.assertRaisesRegex(AssertionError, '项目数量'):
            history.validate_patch(patch, coverage, self.identities)

    def test_source_quotation_change_requires_reverification(self):
        patch, coverage = self.patch('125283')
        coverage['bullets'][0]['text'] = 'Changed unofficial summary'
        with self.assertRaisesRegex(AssertionError, '原文清单变化'):
            history.validate_patch(patch, coverage, self.identities)

    def test_wrong_entry_quote_is_rejected(self):
        patch, coverage = self.patch('66692')
        patch['entries'][0]['originalText'] = 'Unrelated quotation'
        with self.assertRaisesRegex(AssertionError, '原文与'):
            history.validate_patch(patch, coverage, self.identities)

    def test_pup_no_change_is_not_a_live_change(self):
        patch, coverage = self.patch('81058')
        excluded = [b for b in coverage['bullets'] if b['status'] == 'excluded']
        self.assertEqual([b['id'] for b in excluded], ['81058-b051'])
        self.assertFalse(any(e['sourceBullet'] == '81058-b051' for e in patch['entries']))

    def test_release_date_is_separate_from_preview_publication(self):
        patch, coverage = self.patch('125283')
        self.assertEqual(patch['announcedAt'], '2024-10-14')
        self.assertEqual(patch['releaseDate'], '2024-10-15')
        self.assertEqual(patch['sourcePublishedAt'], '2024-10-14T12:13:32-07:00')
        self.assertEqual(patch['publishedAt'], '2024-10-15')
        patch['releaseDate'] = patch['announcedAt']
        with self.assertRaisesRegex(AssertionError, 'releaseDate'):
            history.validate_patch(patch, coverage, self.identities)

    def test_source_dates_use_actual_beijing_conversion(self):
        expected = {'66692': '2022-08-30', '81058': '2023-04-12', '125283': '2024-10-15'}
        for ident, public_date in expected.items():
            patch, coverage = self.patch(ident)
            self.assertNotIn('date', patch)
            self.assertEqual(patch['publishedAt'], public_date)
            patch['publishedAt'] = patch['announcedAt']
            with self.assertRaisesRegex(AssertionError, 'publishedAt'):
                history.validate_patch(patch, coverage, self.identities)

    def test_source_timestamp_cannot_be_invented_from_release_date(self):
        patch, coverage = self.patch('66692')
        patch['sourcePublishedAt'] = '2022-08-29T00:00:00+08:00'
        with self.assertRaisesRegex(AssertionError, 'sourcePublishedAt'):
            history.validate_patch(patch, coverage, self.identities)

    def test_ambiguous_date_field_is_rejected(self):
        patch, coverage = self.patch('81058')
        patch['date'] = patch['releaseDate']
        with self.assertRaisesRegex(AssertionError, 'releaseDate'):
            history.validate_patch(patch, coverage, self.identities)

    def test_historical_crossbow_cost_is_not_current_cost(self):
        first, _ = self.patch('66692')
        later, _ = self.patch('125283')
        one = next(e for e in first['entries'] if e['targetType'] == 'unit' and e['targetId'] == 24)
        two = next(e for e in later['entries'] if e['targetType'] == 'unit' and e['targetId'] == 24)
        self.assertEqual((one['before'], one['after']), ('125 食物、75 黄金', '175 食物、125 黄金'))
        self.assertEqual((two['before'], two['after']), ('175 食物、125 黄金', '175 食物、100 黄金'))

    def test_retired_technology_does_not_overwrite_current_id(self):
        patch, coverage = self.patch('81058')
        legacy = next(t for t in patch['archivedTargets'] if t.get('nameEn') == 'Berserkergang')
        self.assertEqual(legacy['targetId'], 'legacy-berserkergang')
        legacy['targetId'] = 49
        with self.assertRaisesRegex(AssertionError, '覆盖当前实体'):
            history.validate_patch(patch, coverage, self.identities)

    def test_unregistered_legacy_target_is_rejected(self):
        patch, coverage = self.patch('81058')
        patch['archivedTargets'] = []
        with self.assertRaisesRegex(AssertionError, '未登记的实体身份'):
            history.validate_patch(patch, coverage, self.identities)

    def test_game_fixes_are_not_source_corrections(self):
        for patch in self.patches:
            for entry in patch['entries']:
                self.assertNotEqual(entry['kind'], 'fix')
                if entry['changeType'] == 'fix':
                    self.assertEqual(entry['kind'], 'adjust')

    def test_unit_and_elite_records_are_separate(self):
        patch, _ = self.patch('66692')
        values = {e['targetId']: (e.get('before'), e.get('after')) for e in patch['entries'] if e['targetType'] == 'unit' and e['targetId'] in {1747, 1749}}
        self.assertEqual(values[1747], ('65 生命值', '55 生命值'))
        self.assertEqual(values[1749], ('75 生命值', '65 生命值'))


if __name__ == '__main__':
    unittest.main()
