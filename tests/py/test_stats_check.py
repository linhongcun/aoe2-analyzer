"""#22 stats:check：双射程用对单位射程比对；清单外差异退出码 1。不依赖 .dat（假数据）。"""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'scripts'))
import stats_crosscheck as sc  # noqa: E402


def dat_unit(rng, disp, charge, minr=0):
    return {'HP': 40, 'LOS': 11, 'Speed': 0.96, 'Attacks': [[3, 6]], 'Armours': [[3, 0], [4, 0]],
            'Range': rng, 'DisplayedRange': disp, 'ChargeType': charge, 'MinRange': minr, 'Reload': 3.5, 'Accuracy': 85, 'TrainTime': 17}


def fake_d():
    U = [None] * 1971
    U[1968] = dat_unit(9.0, 5.0, 6)
    U[1970] = dat_unit(10.0, 6.0, 6)
    U[1948] = dat_unit(13.0, 10.0, 6, 3)
    return {'Civs': [None, {'Units': U}]}


def site(i, rng, rngB, minr=0):
    return {'id': i, 'en': 'U%d' % i, 'atks': [['穿刺', 6]], 'hp': 40, 'rng': rng, 'rngB': rngB, 'minr': minr, 'rof': 3.5, 'acc': 85}


class StatsCheck(unittest.TestCase):
    def setUp(self):
        sc.load_allowlist = lambda *a, **k: {}

    def good(self):
        return [site(1968, 5, 9), site(1970, 6, 10), site(1948, 10, 13, 3)]

    def test_dual_range_ok(self):
        self.assertEqual(sc.main(self.good(), [], fake_d()), 0)

    def test_unlisted_diff_nonzero(self):
        u = self.good(); u[0]['hp'] = 999
        self.assertEqual(sc.main(u, [], fake_d()), 1)

    def test_allowlisted_diff_zero(self):
        u = self.good(); u[0]['hp'] = 999
        sc.load_allowlist = lambda *a, **k: {('U1968', 'hp'): {'reason': 'test'}}
        self.assertEqual(sc.main(u, [], fake_d()), 0)


if __name__ == '__main__':
    unittest.main()
