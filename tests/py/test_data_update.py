"""数据更新流程的纯函数测试：补丁号识别、差异摘要、.dat 标记校验（fixtures）。运行：npm run test:py"""
import sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / 'scripts'))
from data_diff import detect_patch, load_dir, summarize  # noqa: E402
from dat_source import check_markers, markers_of  # noqa: E402
from data_update import beijing_date, beijing_today, frozen, parse_args  # noqa: E402
from unittest.mock import patch


class FrozenSources(unittest.TestCase):
    def test_requires_complete_reviewed_source_set(self):
        with self.assertRaises(SystemExit):
            parse_args(['--source-ref', 'dat=' + 'a' * 40])
        args = parse_args(sum((['--source-ref', name + '=' + 'a' * 40] for name in ('dat', 'aoe2techtree', 'halfon')), []))
        self.assertEqual(set(args.source_refs), {'dat', 'aoe2techtree', 'halfon'})

    def test_rejects_branches_short_refs_and_duplicates(self):
        for values in (['dat=main'], ['dat=abcdef0'], ['dat=' + 'a' * 40, 'dat=' + 'a' * 40]):
            with self.assertRaises(SystemExit):
                parse_args(sum((['--source-ref', value] for value in values), []))

    def test_exact_ref_metadata_and_response_identity(self):
        value = {'sha': 'a' * 40, 'commit': {'committer': {'date': '2026-10-27T19:58:16Z'}, 'message': 'Update dat for game update 188329\n\nOfficial URL'}}
        with patch('data_update.gh', return_value=value) as gh:
            actual = frozen('SiegeEngineers/auto-mods', 'a' * 40)
        gh.assert_called_once_with('repos/SiegeEngineers/auto-mods/commits/' + 'a' * 40)
        self.assertEqual(actual, {'commit': 'a' * 40, 'date': '2026-10-28', 'message': 'Update dat for game update 188329'})
        with patch('data_update.gh', return_value=value), self.assertRaises(SystemExit):
            frozen('SiegeEngineers/auto-mods', 'b' * 40)



class BeijingDate(unittest.TestCase):
    """#335：上游提交时间按北京时间取日期（patch.date 与来源表日期）"""
    def test_utc_evening_is_next_day(self):
        self.assertEqual(beijing_date('2026-09-22T19:21:29Z'), '2026-09-23')

    def test_boundary(self):
        self.assertEqual(beijing_date('2026-09-22T15:59:59Z'), '2026-09-22')
        self.assertEqual(beijing_date('2026-09-22T16:00:00Z'), '2026-09-23')

    def test_today_injected(self):
        import datetime
        utc = datetime.timezone.utc
        self.assertEqual(beijing_today(datetime.datetime(2026, 9, 22, 19, 21, 29, tzinfo=utc)), '2026-09-23')
        self.assertEqual(beijing_today(datetime.datetime(2026, 9, 22, 15, 59, 59, tzinfo=utc)), '2026-09-22')
        self.assertEqual(beijing_today('2026-12-31T16:00:00Z'), '2027-01-01')
        with self.assertRaises(ValueError):
            beijing_today(datetime.datetime(2026, 9, 22, 19, 0))

    def test_offset_and_morning(self):
        self.assertEqual(beijing_date('2026-10-07T11:52:25Z'), '2026-10-07')
        self.assertEqual(beijing_date('2026-09-22T10:16:33-07:00'), '2026-09-23')


class DetectPatch(unittest.TestCase):
    def test_halfon_message(self):
        self.assertEqual(detect_patch(['Implement DE Update 185872']), 185872)

    def test_takes_max_and_ignores_noise(self):
        self.assertEqual(detect_patch(['Add The Viking Sagas', 'Implement DE Update 177723', 'update 185872 hotfix', None]), 185872)

    def test_none(self):
        self.assertIsNone(detect_patch(['Build and publish mods with GitHub Pages']))


class Summarize(unittest.TestCase):
    def setUp(self):
        self.md = summarize(load_dir(HERE / 'fixtures/old'), load_dir(HERE / 'fixtures/new'), 'T')

    def test_units(self):
        self.assertIn('## 单位（新增 1 / 移除 0 / 变更 1）', self.md)
        self.assertIn('中型投石车（Onager）：atk 50 → 55；pa 7 → 8', self.md)
        self.assertIn('新增：骑马弩兵（Mounted Crossbowman）', self.md)

    def test_effects_and_bonuses(self):
        self.assertIn('- Dry Dock', self.md)
        self.assertIn('- Cranequins（新）', self.md)
        self.assertIn('新文明：丹麦（Danes）', self.md)
        self.assertIn('不列颠 加成 #1 文本', self.md)
        self.assertIn('#382 `C-Bonus, +1 Archer range` 数值变化', self.md)

    def test_no_change(self):
        d = load_dir(HERE / 'fixtures/new')
        self.assertIn('无数据变化', summarize(d, d))


class Markers(unittest.TestCase):
    def dat(self, n):
        return {'Civs': [{'Name': 'C%d' % i} for i in range(n)], 'Techs': [{}] * 1510, 'Effects': [{}] * 1500}

    def test_recorded_markers_pass_and_fail(self):
        d = self.dat(63)
        self.assertEqual(check_markers(d, markers_of(d)), [])
        self.assertTrue(check_markers(self.dat(62), markers_of(d)))

    def test_sanity(self):
        self.assertTrue(check_markers({'Civs': [], 'Techs': [], 'Effects': []}, None))


if __name__ == '__main__':
    unittest.main()
