"""数据更新流程的纯函数测试：补丁号识别、结构化差异与补丁说明记录、.dat 标记校验（fixtures）。运行：npm run test:py"""
import json, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIXTURES = HERE.parents[1] / 'data/fixtures/py/fixtures'
sys.path.insert(0, str(HERE.parent.parent / 'scripts'))
from data_diff import detect_patch, diff, load_dir  # noqa: E402
import patch_notes  # noqa: E402
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


class Diff(unittest.TestCase):
    def setUp(self):
        self.changes = diff(load_dir(FIXTURES / 'old'), load_dir(FIXTURES / 'new'))

    def test_units(self):
        units = self.changes['units']
        self.assertEqual([len(units[k]) for k in ('added', 'removed', 'changed')], [1, 0, 1])
        self.assertEqual(units['added'][0]['en'], 'Mounted Crossbowman')
        self.assertEqual(units['added'][0]['zh'], '骑马弩兵')
        onager = units['changed'][0]
        self.assertEqual(onager['en'], 'Onager')
        self.assertEqual(onager['fields'], [{'key': 'atk', 'old': 50, 'new': 55}, {'key': 'pa', 'old': 7, 'new': 8}])

    def test_effects_and_bonuses(self):
        self.assertIn({'name': 'Dry Dock', 'added': False}, self.changes['techEffects'])
        self.assertIn({'name': 'Cranequins', 'added': True}, self.changes['techEffects'])
        bonuses = self.changes['civBonuses']
        self.assertIn({'kind': 'newCiv', 'zh': '丹麦', 'en': 'Danes'}, bonuses)
        self.assertTrue(any(b['kind'] == 'bonusText' and b['en'] == 'Britons' and b['index'] == 1 for b in bonuses), bonuses)
        self.assertTrue(any(b['kind'] == 'datBonusChanged' and b['tech'] == 382 and b['name'] == 'C-Bonus, +1 Archer range' for b in bonuses), bonuses)

    def test_no_change(self):
        d = load_dir(FIXTURES / 'new')
        changes = diff(d, d)
        self.assertEqual(changes['techEffects'] + changes['civBonuses'], [])
        for kind in ('units', 'buildings', 'techs'):
            self.assertEqual(changes[kind], {'added': [], 'removed': [], 'changed': []})

    def test_changes_survive_a_json_round_trip(self):
        self.assertEqual(json.loads(json.dumps(self.changes, ensure_ascii=False)), self.changes)


class PatchNotes(unittest.TestCase):
    SOURCES = {'dat': {'repo': 'o/dat', 'commit': 'a' * 40, 'date': '2026-01-02', 'sha256': 'x'}, 'halfon': {'repo': 'o/halfon', 'commit': 'b' * 40, 'date': '2026-01-03'}}

    def note(self):
        return patch_notes.record(200000, 188329, self.SOURCES, diff(load_dir(FIXTURES / 'old'), load_dir(FIXTURES / 'new')))

    def test_record_keeps_full_upstream_identity(self):
        note = self.note()
        self.assertEqual((note['build'], note['base']), (200000, 188329))
        self.assertEqual(note['upstream'], [{'key': 'dat', 'repo': 'o/dat', 'commit': 'a' * 40, 'date': '2026-01-02'},
                                            {'key': 'halfon', 'repo': 'o/halfon', 'commit': 'b' * 40, 'date': '2026-01-03'}])

    def test_write_then_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            view = patch_notes.write(self.note(), root)
            self.assertEqual(view, root / 'docs/patch-notes/200000.md')
            self.assertEqual(json.loads((root / 'data/patch-notes/200000.json').read_text(encoding='utf-8')), self.note())
            self.assertEqual(patch_notes.check(root), [])
            view.unlink()
            self.assertEqual(len(patch_notes.check(root)), 1)
            self.assertEqual(patch_notes.check(root, fix=True), [])
            self.assertEqual(patch_notes.check(root), [])

    def test_handwritten_note_keeps_its_upstream_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            note = dict(self.note(), changes=None)
            view = patch_notes.write(dict(note, changes=diff({}, {})), root)
            (root / 'data/patch-notes/200000.json').write_text(patch_notes.dump(note), encoding='utf-8')
            view.write_text('# 手写说明\n\n' + patch_notes.upstream_line(note) + '\n', encoding='utf-8')
            self.assertEqual(patch_notes.check(root), [])
            view.write_text('# 手写说明\n\n上游：o/dat@0000000（2026-01-02）\n', encoding='utf-8')
            self.assertEqual(patch_notes.check(root), ['docs/patch-notes/200000.md 的「上游：」行与记录不一致'])

    def test_committed_notes_match_their_records(self):
        self.assertEqual(patch_notes.check(ROOT), [])


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
