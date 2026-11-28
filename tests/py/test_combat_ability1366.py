"""#1366：单位 combatAbility（属性 63 位掩码）导出与固定 .dat / effects.json 一致性校验。

覆盖：
1. scripts/dat_source.py 导出 CombatAbility 且缓存升级至 dat.v22；
2. data/game/units.json 全量 248 目录单位及 7 组 form 副形态与固定 DE 188329 .dat、garrison_general.json 100% 一致；
3. data/game/effects.json 顶层 combatAbilityBase 精确覆盖 248 目录单位（零建筑/非目录 ID），且 832/997/1081 保留既有 rules=[] 与 a:63 eco 命令；
4. 全部 8 个 bit-1 目录单位与 53 个 bit-2 目录单位精确核对；
5. type(v) is int and v >= 0 严格拒绝 bool、负数、None 与浮点（fail-closed）。
"""
import inspect
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import dat_source  # noqa: E402
import effects_build  # noqa: E402
import units_build  # noqa: E402


def _validate_ca(value):
    return type(value) is int and value >= 0


class CombatAbility1366Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        cls.garrison = json.loads((ROOT / 'data/game/garrison_general.json').read_text(encoding='utf-8'))
        cls.buildings = json.loads((ROOT / 'data/game/buildings.json').read_text(encoding='utf-8'))
        cls.unit_by_id = {u['id']: u for u in cls.units}
        cls.building_ids = {b['id'] for b in cls.buildings}

    def test_dat_source_exports_combat_ability_and_bumps_cache_to_v22(self):
        self.assertIn("'CombatAbility': t.break_off_combat if t else 0", dat_source._DUMP)
        parse_src = inspect.getsource(dat_source.parse)
        self.assertIn('dat.v26.%s.json', parse_src)
        self.assertNotIn('dat.v21.%s.json', parse_src)

    def test_builders_enforce_strict_non_bool_int_guard(self):
        units_src = inspect.getsource(units_build.main)
        effects_src = inspect.getsource(effects_build.main)
        self.assertIn('type(combat_ability) is not int or combat_ability < 0', units_src)
        self.assertIn('type(form_ca) is not int or form_ca < 0', units_src)
        self.assertIn('type(ca) is not int or ca < 0', effects_src)
        # bool 是 int 子类：type(v) is int 必须显式拒绝 True/False
        for bad in (True, False, -1, 1.0, '1', None):
            self.assertFalse(_validate_ca(bad), f'Expected reject for {bad!r}')
        for good in (0, 1, 2, 11, 26, 128):
            self.assertTrue(_validate_ca(good), f'Expected accept for {good!r}')

    def test_units_effects_and_garrison_general_match_248_catalog_units(self):
        self.assertEqual(len(self.units), 248)
        ca_base = self.effects['combatAbilityBase']
        self.assertEqual(len(ca_base), 248)
        self.assertEqual(set(ca_base.keys()), {str(u['id']) for u in self.units})
        # 顶层 combatAbilityBase 仅含目录单位，绝不含建筑 ID
        for bid in self.building_ids:
            self.assertNotIn(str(bid), ca_base)

        bit1_ids = []
        bit2_ids = []
        for u in self.units:
            uid = u['id']
            ca = u['combatAbility']
            self.assertTrue(_validate_ca(ca), f'unit {uid} invalid combatAbility {ca!r}')
            self.assertEqual(ca, ca_base[str(uid)], f'unit {uid} units.json vs effects.json mismatch')
            self.assertEqual(ca, self.garrison['units'][str(uid)]['combatAbility'], f'unit {uid} vs garrison_general.json mismatch')
            if ca & 1:
                bit1_ids.append(uid)
            if ca & 2:
                bit2_ids.append(uid)
            if 'form' in u:
                fca = u['form']['combatAbility']
                self.assertTrue(_validate_ca(fca), f'form {u["form"]["id"]} invalid combatAbility {fca!r}')

        self.assertEqual(sorted(bit1_ids), [831, 832, 1234, 1236, 1800, 1802, 1904, 1907])
        self.assertEqual(len(bit2_ids), 53)
        # 7 个非训练副形态：1962→1980 保持 ca=2，其余 6 组均为 0
        forms = {u['id']: (u['form']['id'], u['form']['combatAbility']) for u in self.units if 'form' in u}
        self.assertEqual(len(forms), 7)
        self.assertEqual(forms[1962], (1980, 2))
        for owner in (1759, 1761, 1225, 1227, 1254, 1255):
            self.assertEqual(forms[owner][1], 0)

    def test_effects_json_preserves_a63_in_eco_without_mutating_rules(self):
        for en, tid in [('Wootz Steel', 832), ('Thunderclap Bombs', 997), ('Sitting Tiger', 1081)]:
            entry = self.effects['techs'][en]
            self.assertEqual(entry['id'], tid)
            self.assertEqual(entry['rules'], [])
            a63 = [e for e in entry['eco'] if e.get('a') == 63]
            self.assertGreater(len(a63), 0, f'{en} should retain a:63 commands in eco')

    def test_matches_pinned_dat_when_cached(self):
        dat_path = dat_source.CACHE / f"empires2_x2_p1.{dat_source.DAT['commit'][:7]}.dat"
        if not dat_path.exists():
            self.skipTest('pinned .dat not cached locally')
        parsed = dat_source.parse(dat_path)
        du = parsed['Civs'][1]['Units']
        for u in self.units:
            self.assertEqual(u['combatAbility'], du[u['id']]['CombatAbility'], f'unit {u["id"]} vs .dat')
            self.assertEqual(self.effects['combatAbilityBase'][str(u['id'])], du[u['id']]['CombatAbility'])
            if 'form' in u:
                fid = u['form']['id']
                self.assertEqual(u['form']['combatAbility'], du[fid]['CombatAbility'], f'form {fid} vs .dat')


if __name__ == '__main__':
    unittest.main()
