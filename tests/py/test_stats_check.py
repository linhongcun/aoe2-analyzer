"""#22/#1330 stats:check：双射程与单位/建筑异构攻击格式对账；清单外差异退出码 1。不依赖 .dat（假数据）。"""
import contextlib, io, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'scripts'))
import stats_crosscheck as sc  # noqa: E402


def dat_unit(rng, disp, charge, minr=0, attacks=None):
    return {'HP': 40, 'LOS': 11, 'Speed': 0.96, 'Attacks': attacks if attacks is not None else [[3, 6]], 'Armours': [[3, 0], [4, 0]],
            'Range': rng, 'DisplayedRange': disp, 'ChargeType': charge, 'MinRange': minr, 'Reload': 3.5, 'Accuracy': 85, 'TrainTime': 17}


def dat_building(hp=850, attacks=(), ma=1, pa=7, rng=8, minr=1, rof=2.0, los=10):
    return {'HP': hp, 'LOS': los, 'Speed': 0.0, 'Attacks': [list(a) for a in attacks], 'Armours': [[3, pa], [4, ma]],
            'Range': rng, 'DisplayedRange': rng, 'ChargeType': 0, 'MinRange': minr, 'Reload': rof, 'Accuracy': 100, 'TrainTime': 80}


def fake_d():
    U = [None] * 1971
    U[1968] = dat_unit(9.0, 5.0, 6)
    U[1970] = dat_unit(10.0, 6.0, 6)
    U[1948] = dat_unit(13.0, 10.0, 6, 3)
    U[74] = dat_unit(0.0, 0.0, 0, attacks=[[4, 12]])
    U[79] = dat_building(hp=850, attacks=[(27, 2), (11, 0), (16, 5), (3, 5), (30, 1)])
    U[12] = dat_building(hp=1200, attacks=[], ma=0, pa=7, rng=0, minr=0, rof=0.0, los=6)
    U[1665] = dat_building(hp=625, attacks=[(27, 0), (3, 0)], ma=0, pa=6, rng=0, minr=1, rof=2.0, los=10)
    U[900] = dat_building(hp=1000, attacks=[(4, 9)], ma=2, pa=8, rng=1, minr=0, rof=2.0, los=8)
    return {'Civs': [None, {'Units': U}]}


def site(i, rng, rngB, minr=0):
    return {'id': i, 'en': 'U%d' % i, 'atks': [['穿刺', 6]], 'hp': 40, 'rng': rng, 'rngBd': rngB - rng, 'minr': minr, 'rof': 3.5, 'acc': 85}


def site_building(i, en, atks, atk=0, hp=850, ma=1, pa=7, rng=8, minr=1, rof=2, los=10):
    return {'id': i, 'en': en, 'atks': atks, 'atk': atk, 'hp': hp, 'ma': ma, 'pa': pa, 'rng': rng, 'minr': minr, 'rof': rof, 'los': los}


class StatsCheck(unittest.TestCase):
    def setUp(self):
        self._orig_load_allowlist = sc.load_allowlist
        sc.load_allowlist = lambda *a, **k: {}

    def tearDown(self):
        sc.load_allowlist = self._orig_load_allowlist

    def good(self):
        return [site(1968, 5, 9), site(1970, 6, 10), site(1948, 10, 13, 3)]

    def good_mixed(self):
        units = [
            {'id': 74, 'en': 'Militia', 'atks': [['近战', 12]], 'atk': 12, 'hp': 40, 'ma': 0, 'pa': 0, 'rng': 0, 'minr': 0, 'rof': 3.5, 'acc': 85, 'los': 11, 'spd': 0.96, 'tt': 17},
            {'id': 1968, 'en': 'U1968', 'atks': [['穿刺', 6]], 'atk': 6, 'hp': 40, 'ma': 0, 'pa': 0, 'rng': 5, 'rngBd': 4, 'minr': 0, 'rof': 3.5, 'acc': 85, 'los': 11, 'spd': 0.96, 'tt': 17},
        ]
        blds = [
            site_building(79, 'Watch Tower', [
                {'classId': 27, 'amount': 2, 'label': '长矛兵'},
                {'classId': 11, 'amount': 0, 'label': '所有建筑'},
                {'classId': 16, 'amount': 5, 'label': '船只'},
                {'classId': 3, 'amount': 5, 'label': '穿刺'},
                {'classId': 30, 'amount': 1, 'label': '骆驼'},
            ], atk=5),
            site_building(12, 'Barracks', [], atk=0, hp=1200, ma=0, pa=7, rng=0, minr=0, rof=0, los=6),
            site_building(1665, 'Donjon', [
                {'classId': 27, 'amount': 0, 'label': '长矛兵'},
                {'classId': 3, 'amount': 0, 'label': '穿刺'},
            ], atk=0, hp=625, ma=0, pa=6, rng=0, minr=1, rof=2, los=10),
            # 建筑对象无 label 字段时按 classId 映射到主攻击类别，未知 classId 不抛错
            site_building(900, 'Melee Fort', [{'classId': 999, 'amount': 1}, {'classId': 4, 'amount': 9}],
                          atk=9, hp=1000, ma=2, pa=8, rng=1, minr=0, rof=2, los=8),
        ]
        return units, blds

    def test_dual_range_ok(self):
        self.assertEqual(sc.main(self.good(), [], fake_d()), 0)

    def test_wrong_building_delta_nonzero(self):
        # #38：差值写错（对建筑 = rng + rngBd ≠ .dat Range）应失败
        u = self.good(); u[0]['rngBd'] = 3
        self.assertEqual(sc.main(u, [], fake_d()), 1)

    def test_unlisted_diff_nonzero(self):
        u = self.good(); u[0]['hp'] = 999
        self.assertEqual(sc.main(u, [], fake_d()), 1)

    def test_allowlisted_diff_zero(self):
        u = self.good(); u[0]['hp'] = 999
        sc.load_allowlist = lambda *a, **k: {('U1968', 'hp'): {'reason': 'test'}}
        self.assertEqual(sc.main(u, [], fake_d()), 0)

    def test_main_attack_class_formats(self):
        self.assertEqual(sc.main_attack_class({'atks': [['近战', 12]]}, False), 4)
        self.assertEqual(sc.main_attack_class({'atks': [['穿刺', 6]]}, False), 3)
        self.assertEqual(sc.main_attack_class({'atks': [['近战', 0], ['穿刺', 11]]}, False), 3)
        self.assertEqual(sc.main_attack_class({'atks': [['穿刺', 0], ['近战', 10]]}, False), 4)
        self.assertEqual(sc.main_attack_class({'atks': [['穿刺', 5], ['近战', 7]]}, False), 4)
        self.assertEqual(sc.main_attack_class({'atks': [['穿刺', 0], ['近战', 0]]}, False), 4)
        self.assertEqual(sc.main_attack_class({'atks': [['穿刺', 0]]}, False), 3)
        self.assertEqual(sc.main_attack_class({'atks': [{'classId': 3, 'amount': 5, 'label': '穿刺'}]}, True), 3)
        self.assertEqual(sc.main_attack_class({'atks': [{'classId': 4, 'amount': 0}, {'classId': 3, 'amount': 5}]}, True), 3)
        self.assertEqual(sc.main_attack_class({'atks': [{'classId': 4, 'amount': 9}]}, True), 4)
        self.assertEqual(sc.main_attack_class({'atks': [{'classId': 3, 'amount': 0}, {'classId': 4, 'amount': 0}]}, True), 4)
        self.assertIsNone(sc.main_attack_class({'atks': [{'classId': 999, 'amount': 1}], 'atk': 0}, True))
        self.assertEqual(sc.main_attack_class({'atks': [], 'atk': 5}, True), 3)
        self.assertIsNone(sc.main_attack_class({'atks': [], 'atk': 0}, True))

    def test_unit_array_and_building_object_atks_ok(self):
        units, blds = self.good_mixed()
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = sc.main(units, blds, fake_d())
        self.assertEqual(code, 0)
        self.assertIn('diffs 0 allowlisted 0 unlisted 0 objects 6', buf.getvalue())

    def test_building_object_unlisted_atk_diff_nonzero(self):
        units, blds = self.good_mixed()
        blds[0]['atk'] = 6  # Watch Tower: site=6 vs dat=5（带 label 对象格式）
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = sc.main(units, blds, fake_d())
        self.assertEqual(code, 1)
        self.assertIn('unlisted 1 objects 6', buf.getvalue())

    def test_building_object_without_label_unlisted_atk_diff_nonzero(self):
        units, blds = self.good_mixed()
        blds[3]['atk'] = 8  # Melee Fort: site=8 vs dat=9（无 label，按 classId=4 比对近战攻击）
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = sc.main(units, blds, fake_d())
        self.assertEqual(code, 1)
        self.assertIn('unlisted 1 objects 6', buf.getvalue())

        sc.load_allowlist = lambda *a, **k: {('Melee Fort', 'atk'): {'reason': 'test'}}
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sc.main(units, blds, fake_d()), 0)

    def test_unit_array_unlisted_atk_diff_with_buildings_nonzero(self):
        units, blds = self.good_mixed()
        units[0]['atk'] = 11  # Militia: site=11 vs dat=12（数组格式单位攻击）
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = sc.main(units, blds, fake_d())
        self.assertEqual(code, 1)
        self.assertIn('unlisted 1 objects 6', buf.getvalue())

    def test_unit_train_time_matches_primary_building_slot_with_fallback(self):
        d = fake_d()
        # Unit 74 trained at building 12 takes 16s via TrainAt, while TrainTime default is 13s
        d['Civs'][1]['Units'][74]['TrainTime'] = 13
        d['Civs'][1]['Units'][74]['TrainAt'] = [[82, 13], [12, 16]]
        units, blds = self.good_mixed()
        units[0]['b'] = 12
        units[0]['tt'] = 16
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sc.main(units, blds, d), 0)
        # Mismatching primary building slot fails
        units[0]['tt'] = 13
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sc.main(units, blds, d), 1)
        # Missing building slot falls back to TrainTime
        units[0]['b'] = 1806
        units[0]['tt'] = 13
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sc.main(units, blds, d), 0)


if __name__ == '__main__':
    unittest.main()
