"""v0.30.0 #335 验收（PR #351 范围追加，Steve 2026-10-22）：站内日期一律按北京时间（UTC+8）。
scripts/data_update.py 从上游提交时间（GitHub API 的 ISO 8601 UTC 时间戳）取日期时，必须换算成北京时间的日期，
不能直接截取 UTC 字符串的前 10 位（f856c9e 的 latest() 用的是 [:10]）。

约定的函数（Linus 实现）：scripts/data_update.py 模块级
    def beijing_date(ts: str) -> str
    输入 ISO 8601 时间戳（'Z' 或 ±HH:MM 偏移），返回北京时间（UTC+8）日期 'YYYY-MM-DD'；与运行机器的本地时区无关。
latest(repo, path) 返回的 'date' 必须用它换算；patch.date 取自 latest() 的 date，因此一并按北京时间。
运行：npm run test:py。Kent Beck 2026-10-22。"""
import os, sys, time, unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / 'scripts'))
import data_update  # noqa: E402


def bd():
    f = getattr(data_update, 'beijing_date', None)
    if not callable(f):
        raise AssertionError('scripts/data_update.py 缺少模块级函数 beijing_date(ts: str) -> str（#335：上游提交时间换算成北京时间日期）')
    return f


def commit(ts, sha='3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f', msg='Implement DE Update 185872'):
    return [{'sha': sha, 'commit': {'committer': {'date': ts}, 'author': {'date': '2026-09-11T20:26:11Z'}, 'message': msg + '\n\nbody'}}]


class BeijingDate(unittest.TestCase):
    def test_aoe2techtree_3bb43b1_commit(self):
        # aoe2techtree@3bb43b1 committer.date（GitHub API）= 2026-09-22T19:21:29Z → 北京时间 2026-09-23 03:21
        self.assertEqual(bd()('2026-09-22T19:21:29Z'), '2026-09-23')

    def test_halfon_abb48fd_commit(self):
        # halfon@abb48fd committer.date = 2026-09-22T19:26:06Z → 北京时间 2026-09-23 03:26
        self.assertEqual(bd()('2026-09-22T19:26:06Z'), '2026-09-23')

    def test_boundary_before_1600z_same_day(self):
        self.assertEqual(bd()('2026-09-22T15:59:59Z'), '2026-09-22')

    def test_boundary_at_1600z_next_day(self):
        self.assertEqual(bd()('2026-09-22T16:00:00Z'), '2026-09-23')

    def test_month_and_year_rollover(self):
        self.assertEqual(bd()('2026-09-30T16:00:00Z'), '2026-10-01')
        self.assertEqual(bd()('2026-12-31T23:59:59Z'), '2027-01-01')

    def test_offset_inputs(self):
        self.assertEqual(bd()('2026-09-22T10:16:33-07:00'), '2026-09-23')  # 官方 185872 补丁说明发布时间
        self.assertEqual(bd()('2026-09-23T01:17:00+08:00'), '2026-09-23')
        self.assertEqual(bd()('2026-09-22T23:59:59+08:00'), '2026-09-22')

    def test_dat_0c38027_unchanged(self):
        # 对照：auto-mods@0c38027 committer.date 2026-10-07T11:52:25Z → 北京时间仍是 2026-10-07
        self.assertEqual(bd()('2026-10-07T11:52:25Z'), '2026-10-07')

    def test_independent_of_machine_timezone(self):
        if not hasattr(time, 'tzset'):
            self.skipTest('no tzset')
        old = os.environ.get('TZ')
        try:
            for tz in ('UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'):
                os.environ['TZ'] = tz
                time.tzset()
                self.assertEqual(bd()('2026-09-22T19:21:29Z'), '2026-09-23', tz)
                self.assertEqual(bd()('2026-09-22T15:59:59Z'), '2026-09-22', tz)
        finally:
            if old is None:
                os.environ.pop('TZ', None)
            else:
                os.environ['TZ'] = old
            time.tzset()


class LatestUsesBeijingDate(unittest.TestCase):
    """latest() 是 data:update 写 sources.*.date 与 patch.date 的唯一来源；不联网，替换 gh()。"""

    def latest_at(self, ts):
        with mock.patch.object(data_update, 'gh', return_value=commit(ts)) as g:
            out = data_update.latest('SiegeEngineers/aoe2techtree', 'data/data.json')
        g.assert_called_once()
        return out

    def test_19_21_29z_gives_0923(self):
        self.assertEqual(self.latest_at('2026-09-22T19:21:29Z')['date'], '2026-09-23')

    def test_boundaries(self):
        self.assertEqual(self.latest_at('2026-09-22T15:59:59Z')['date'], '2026-09-22')
        self.assertEqual(self.latest_at('2026-09-22T16:00:00Z')['date'], '2026-09-23')

    def test_offset_timestamps_through_latest(self):
        # 不能只做「UTC 加 8 小时」：带偏移的时间戳也要按实际时刻换算（Codex 复核：只测 Z 输入会放过错误实现）
        self.assertEqual(self.latest_at('2026-09-22T23:59:59+08:00')['date'], '2026-09-22')
        self.assertEqual(self.latest_at('2026-09-23T00:00:00+08:00')['date'], '2026-09-23')
        self.assertEqual(self.latest_at('2026-09-22T10:16:33-07:00')['date'], '2026-09-23')

    def test_latest_agrees_with_beijing_date(self):
        f = bd()
        for ts in ('2026-09-22T19:21:29Z', '2026-09-22T15:59:59Z', '2026-09-22T16:00:00Z', '2026-09-22T23:59:59+08:00', '2026-10-07T11:52:25Z'):
            self.assertEqual(self.latest_at(ts)['date'], f(ts), ts)

    def test_other_fields_unchanged(self):
        out = self.latest_at('2026-09-22T19:21:29Z')
        self.assertEqual(out['commit'], '3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f')
        self.assertEqual(out['message'], 'Implement DE Update 185872')

    def test_uses_committer_date_not_author_date(self):
        # 与 f856c9e 一致取 committer.date（作者时间 09-11 不应被使用）
        self.assertNotEqual(self.latest_at('2026-09-22T19:21:29Z')['date'], '2026-09-12')


if __name__ == '__main__':
    unittest.main()
