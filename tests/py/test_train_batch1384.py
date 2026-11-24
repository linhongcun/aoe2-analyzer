"""#1384：图皮（精锐）黑檀木步弓手（2579 / 2581）成对训练（.dat Task 156）导出与一致校验。

覆盖：
1. scripts/dat_source.py 导出 SpawnTasks（action_type == 156）、跨文明一致校验 spawn_tasks_sig 且缓存升至 dat.v24；
2. derive_train_count 对合法与全部非法输入（缺键、非 list、非 dict、bool、NaN/Inf、v1<0、v2<=0、非整数、cls/unit!=-1）均 fail-closed；
3. data/game/units.json 与 data/game/eco.json 全量 248 单位中仅 2579 / 2581 含 trainCount=2，马来爪刀勇士 1123/1125 及 7 副形态与全部 38 座建筑不含 trainCount；
4. 2579/2581 底层目录造价（40 木 + 45 金）与训练时间（18s / 14s）保持每对原值不变；
5. 本地缓存固定 DE 188329 .dat 时全目录 248 单位逐一核验一致。
"""
import inspect
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402


class TrainBatch1384Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.eco = json.loads((ROOT / 'data/game/eco.json').read_text(encoding='utf-8'))
        cls.unit_by_id = {u['id']: u for u in cls.units}

    def test_dat_source_exports_spawn_tasks_and_bumps_cache_to_v24(self):
        dump = dat_source._DUMP
        self.assertIn("'SpawnTasks': [", dump)
        self.assertIn('x.action_type == 156', dump)
        self.assertIn('def spawn_tasks_sig(u):', dump)
        self.assertIn('!= spawn_tasks_sig(cu)', dump)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v24.%s.json', parse_src)
        self.assertNotIn('dat.v23.%s.json', parse_src)

    def test_derive_train_count_semantics_and_fail_closed(self):
        fn = dat_source.derive_train_count
        self.assertEqual(fn({'SpawnTasks': []}, 4), 1)
        self.assertEqual(fn({'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': 1.0}]}, 2579), 2)
        self.assertEqual(
            fn(
                {
                    'SpawnTasks': [
                        {'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': 1.0},
                        {'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': 2.0},
                    ]
                },
                9999,
            ),
            4,
        )

        # 陈旧缓存缺键或非字典输入必须 ValueError，不得静默返回 1
        for bad_unit in ({}, None, []):
            with self.assertRaises(ValueError, msg=f'Expected reject for {bad_unit!r}'):
                fn(bad_unit, 2579)

        # 非 list / 非 dict / 缺字段 / 非法类型或越界参数均 ValueError
        bad_inputs = [
            {'SpawnTasks': None},
            {'SpawnTasks': {}},
            {'SpawnTasks': '[]'},
            {'SpawnTasks': [None]},
            {'SpawnTasks': [123]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0}]},
            {'SpawnTasks': [{'cls': 0, 'unit': -1, 'v1': 2579.0, 'v2': 1.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': 2579, 'v1': 2579.0, 'v2': 1.0}]},
            {'SpawnTasks': [{'cls': True, 'unit': -1, 'v1': 2579.0, 'v2': 1.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': -1.0, 'v2': 1.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': True, 'v2': 1.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': True}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': 0.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': -1.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': 1.5}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': math.nan, 'v2': 1.0}]},
            {'SpawnTasks': [{'cls': -1, 'unit': -1, 'v1': 2579.0, 'v2': math.inf}]},
        ]
        for payload in bad_inputs:
            with self.assertRaises(ValueError, msg=f'Expected reject for {payload!r}'):
                fn(payload, 2579)

    def test_committed_units_and_eco_only_mark_2579_and_2581_and_keep_pair_raw_values(self):
        self.assertEqual(len(self.units), 248)
        pair_units = sorted(u['id'] for u in self.units if 'trainCount' in u)
        self.assertEqual(pair_units, [2579, 2581])

        eco_pair_units = sorted(int(uid) for uid, rec in self.eco['units'].items() if 'trainCount' in rec)
        self.assertEqual(eco_pair_units, [2579, 2581])

        for uid, expected_tt in ((2579, 18), (2581, 14)):
            u = self.unit_by_id[uid]
            e = self.eco['units'][str(uid)]
            self.assertEqual(u['trainCount'], 2)
            self.assertEqual(e['trainCount'], 2)
            # 底层造价与训练时间保留每对原值
            self.assertEqual(u['cost'], {'Gold': 45, 'Wood': 40})
            self.assertEqual(e['cost'], {'Gold': 45, 'Wood': 40})
            self.assertEqual(u['tt'], expected_tt)
            self.assertEqual(e['trainTime'], expected_tt)

        # 半人口单只训练反例（马来爪刀勇士 1123/1125）不得受影响
        for uid in (1123, 1125):
            self.assertNotIn('trainCount', self.unit_by_id[uid])
            self.assertNotIn('trainCount', self.eco['units'][str(uid)])

        # 副形态与全部建筑均不携带 trainCount
        for u in self.units:
            if 'form' in u:
                self.assertNotIn('trainCount', u['form'])
        for bid, rec in self.eco['buildings'].items():
            self.assertNotIn('trainCount', rec, f'building {bid} must not have trainCount')

    def test_matches_pinned_dat_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        for u in self.units:
            uid = u['id']
            tc = dat_source.derive_train_count(du[uid], uid)
            self.assertEqual(u.get('trainCount', 1), tc, f'unit {uid} mismatch vs pinned .dat')
            self.assertEqual(self.eco['units'][str(uid)].get('trainCount', 1), tc, f'eco unit {uid} mismatch vs pinned .dat')


if __name__ == '__main__':
    unittest.main()
