"""固定源充能字段校验（#1223 非常规恢复速率精度 + #1522 .dat ChargeTarget 导出与跨文明一致性）。"""
import inspect
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402
import units_build  # noqa: E402

EXPECTED_CHARGE_TARGETS = {
    529: 64,
    532: 64,
    831: -1,
    832: -1,
    1103: 64,
    1302: 64,
    1901: 127,
    1903: 127,
    1948: 127,
    1952: 127,
    1968: 191,
    1970: 191,
    2569: 63,
    2571: 63,
    2703: 127,
    2704: 127,
    2705: 127,
    2706: 127,
    2711: 320,
    2712: 320,
}


class UnitCharge1223(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        catalog = ROOT / 'data/game/units.json'
        cls.units_list = json.loads(catalog.read_text(encoding='utf-8'))
        cls.units = {unit['id']: unit for unit in cls.units_list}

    def test_catalog_preserves_unsafe_integer_recharge_rates(self):
        for unit_id in (1968, 1970):
            with self.subTest(unit_id=unit_id):
                rate = self.units[unit_id]['rechargeRate']
                self.assertIsInstance(rate, int)
                self.assertEqual(rate, 3199999949781598208)

    def test_dat_source_exports_charge_target_cross_civ_check_and_bumps_cache_to_v27(self):
        dump = dat_source._DUMP
        self.assertIn("'ChargeTarget': u.creatable.charge_target if u.creatable else 0", dump)
        self.assertIn('def charge_target_sig(u):', dump)
        self.assertIn('!= charge_target_sig(cu)', dump)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v27.%s.json', parse_src)
        self.assertNotIn('dat.v26.%s.json', parse_src)

    def test_derive_charge_target_semantics_and_fail_closed(self):
        fn = units_build.derive_charge_target
        self.assertIsNone(fn({'ChargeTarget': 0}))
        for val in (-1, 63, 64, 127, 191, 320):
            out = fn({'ChargeTarget': val})
            self.assertEqual(out, val)
            self.assertIs(type(out), int)
        with self.assertRaises(KeyError):
            fn({})
        for bad in (True, False, 64.0, 1.5, '64', None):
            with self.assertRaises(ValueError, msg=f'Expected reject for {bad!r}'):
                fn({'ChargeTarget': bad})

    def test_units_json_charge_target_exact_20_units_form_isolation_and_ship_class_equivalence(self):
        self.assertEqual(len(self.units_list), 248)
        actual = {u['id']: u['chargeTarget'] for u in self.units_list if 'chargeTarget' in u}
        self.assertEqual(actual, EXPECTED_CHARGE_TARGETS)
        for u in self.units_list:
            if 'form' in u:
                self.assertNotIn('chargeTarget', u['form'], f'form {u["form"]["id"]} must not carry chargeTarget')
        dock_units = {u['id'] for u in self.units_list if u['b'] == 45}
        ship_cls_units = {u['id'] for u in self.units_list if 16 in u['cls']}
        self.assertEqual(dock_units, ship_cls_units)
        self.assertEqual(len(dock_units), 28)

    def test_charge_target_matches_pinned_dat_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        for u in self.units_list:
            uid = u['id']
            expected = units_build.derive_charge_target(du[uid])
            self.assertEqual(u.get('chargeTarget'), expected, f'unit {uid} chargeTarget mismatch vs pinned .dat')
            if 'form' in u:
                fid = u['form']['id']
                self.assertIsNone(units_build.derive_charge_target(du[fid]), f'form {fid} expected 0 ChargeTarget')


if __name__ == '__main__':
    unittest.main()
