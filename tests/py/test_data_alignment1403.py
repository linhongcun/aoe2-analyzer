"""Issue 1403：10 国被动链接与错链修复、草药学 1.0005 残差与 excluded、箭毒 projectilePoison、格查阵亡回血与 4 单位训练时间对齐单测。"""
import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import army_research_build  # noqa: E402
import effects_build  # noqa: E402
import stats_crosscheck  # noqa: E402
import units_build  # noqa: E402


class DataAlignment1403Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.effects = json.loads((ROOT / 'data/game/effects.json').read_text(encoding='utf-8'))
        cls.links = json.loads((ROOT / 'data/sources/effects_links.json').read_text(encoding='utf-8'))
        cls.units = json.loads((ROOT / 'data/game/units.json').read_text(encoding='utf-8'))
        cls.unit_by_id = {u['id']: u for u in cls.units}
        cls.eco = json.loads((ROOT / 'data/game/eco.json').read_text(encoding='utf-8'))
        cls.army_research = json.loads((ROOT / 'data/game/army_research.json').read_text(encoding='utf-8'))

    def test_10_civs_passive_links_and_intentional_exclusions(self):
        civs = self.effects['civs']

        def by_tech(civ):
            return {e['tech']: e for e in civs[civ]['bonus']}

        # 1) Bulgarians: 20 Blacksmith + Siege Workshop food -50% -> bon[1]
        bg = by_tech('Bulgarians')
        for tid in range(-1, -21, -1):
            self.assertEqual(bg[tid]['idx'], 1, f'Bulgarians {tid}')

        # 2) Burgundians: Stable -50% (-1..-11 incl. -8/-9 Cavalier) -> bon[1]; Eco -40% food (-12..-27 incl. -25 Caravan) -> bon[0]
        bu = by_tech('Burgundians')
        for tid in range(-1, -12, -1):
            self.assertEqual(bu[tid]['idx'], 1, f'Burgundians {tid}')
        for tid in range(-12, -28, -1):
            self.assertEqual(bu[tid]['idx'], 0, f'Burgundians {tid}')

        # 3) Byzantines: Imperial Age cost -33% (-6/-7) -> bon[3]
        byz = by_tech('Byzantines')
        self.assertEqual(byz[-6]['idx'], 3)
        self.assertEqual(byz[-7]['idx'], 3)

        # 4) Dravidians: Barracks tech -50% (-1..-19 incl. -15 Supplies) -> bon[3]
        dr = by_tech('Dravidians')
        for tid in range(-1, -20, -1):
            self.assertEqual(dr[tid]['idx'], 3, f'Dravidians {tid}')

        # 5) Italians: Age advance -15% (-1..-3) -> bon[0]; Fishing Ships (-4) -> bon[4]; Dock & Univ -25% (-5..-32 incl. -15/-20) -> bon[2]
        it = by_tech('Italians')
        for tid in (-1, -2, -3):
            self.assertEqual(it[tid]['idx'], 0, f'Italians {tid}')
        self.assertEqual(it[-4]['idx'], 4)
        for tid in range(-5, -33, -1):
            self.assertEqual(it[tid]['idx'], 2, f'Italians {tid}')

        # 6) Mapuche: t:1386 Reveal Castle -> bon[4]
        mp = by_tech('Mapuche')
        self.assertEqual(mp[1386]['idx'], 4)

        # 7) Poles: Bloodlines & Scout Cavalry-line upgrades -50% food (-1..-3) -> bon[3]
        pl = by_tech('Poles')
        for tid in (-1, -2, -3):
            self.assertEqual(pl[tid]['idx'], 3, f'Poles {tid}')

        # 8) Spanish: Blacksmith no gold (-4..-14) -> bon[2]; intentional manual exclusion "-3": null preserved
        sp = by_tech('Spanish')
        self.assertIsNone(self.links['Spanish']['-3'])
        self.assertIsNone(sp[-3]['idx'])
        self.assertEqual(sp[-3]['linked'], 'manual')
        for tid in range(-4, -15, -1):
            self.assertEqual(sp[tid]['idx'], 2, f'Spanish {tid}')

        # 9) Turks: Chemistry free (-1..-3) -> bon[2]; Scout upgrades free (-4..-9) -> bon[1]; Gunpowder tech -50% (-10..-13) -> bon[2]
        tk = by_tech('Turks')
        for tid in (-1, -2, -3, -10, -11, -12, -13):
            self.assertEqual(tk[tid]['idx'], 2, f'Turks {tid}')
        for tid in range(-4, -10, -1):
            self.assertEqual(tk[tid]['idx'], 1, f'Turks {tid}')

        # 10) Vietnamese: Conscription free (-1..-3) -> bon[3]; Eco no wood +100% faster (-4..-33 incl. -20) -> bon[1]
        vn = by_tech('Vietnamese')
        for tid in (-1, -2, -3):
            self.assertEqual(vn[tid]['idx'], 3, f'Vietnamese {tid}')
        for tid in range(-4, -34, -1):
            self.assertEqual(vn[tid]['idx'], 1, f'Vietnamese {tid}')

        # Intentional source exclusion Muisca "1363": null preserved and absent from generated Muisca.bonus
        self.assertIsNone(self.links['Muisca']['1363'])
        self.assertNotIn(1363, by_tech('Muisca'))

        # All 46 non-target civs must remain byte-for-byte drift-free across all bonus links
        # (Issue 1445 intentionally moved Varangians 1488 from [1488, 0, 'auto'] to [1488, 2, 'manual'])
        target_civs = {
            'Bulgarians',
            'Burgundians',
            'Byzantines',
            'Dravidians',
            'Italians',
            'Mapuche',
            'Poles',
            'Spanish',
            'Turks',
            'Vietnamese',
        }
        self.assertEqual(len(civs), 56)
        non_targets = sorted(c for c in civs if c not in target_civs)
        self.assertEqual(len(non_targets), 46)
        non_target_table = {c: [[e['tech'], e['idx'], e['linked']] for e in civs[c]['bonus']] for c in non_targets}
        non_target_digest = hashlib.sha256(
            json.dumps(non_target_table, sort_keys=True, separators=(',', ':')).encode('utf-8')
        ).hexdigest()
        self.assertEqual(non_target_digest, '4c6b30d6846956e9235a4cff7b5ce3e808fad80f035732eb4c599fc6961df474')
        # Spot-check non-target auto tie-breaks (Japanese 341, Romans 889-891)
        self.assertEqual(by_tech('Japanese')[341]['idx'], 1)
        self.assertEqual(by_tech('Japanese')[341]['linked'], 'auto')
        for tid in (889, 890, 891):
            self.assertEqual(by_tech('Romans')[tid]['idx'], 1)
            self.assertEqual(by_tech('Romans')[tid]['linked'], 'auto')

    def test_identity_fx_threshold_and_herbalism_excluded(self):
        # 1.0005 residual & values strictly within |r6(v) - 1| < 1e-3 filtered; exact 1e-3 boundary and Float32 1.001f preserved
        self.assertTrue(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.0005}))
        self.assertTrue(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 0.9995}))
        self.assertTrue(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.000999}))
        self.assertTrue(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 0.999001}))
        self.assertTrue(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.0}))
        self.assertTrue(effects_build.is_identity_fx({'s': 'atk', 'op': 'add', 'v': 0}))
        self.assertTrue(effects_build.is_identity_fx({'s': 'rof', 'v': 0.0}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.001}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 0.999}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.0010000467300415}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 0.9990000128746033}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.05}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 0.95}))
        self.assertFalse(effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': 1.15}))

        # Both effects_build and army_research_build must agree at the 1e-3 / Float32 1.001f boundary
        boundary_vals = [1.000999, 0.999001, 1.001, 0.999, 1.0010000467300415, 0.9990000128746033]
        for val in boundary_vals:
            fx_kept = not effects_build.is_identity_fx({'s': 'spd', 'op': 'mul', 'v': effects_build.r6(val)})
            ar_kept = bool(
                army_research_build.direct_combat_units(
                    [{'Type': 5, 'A': 0, 'B': -1, 'C': 5, 'D': val}],
                    [{'id': 0}],
                    {0: {0}},
                    [{'Class': 0}],
                    {5},
                )
            )
            self.assertEqual(fx_kept, ar_kept, f'boundary divergence at {val}')

        # Only Herbalism emits excluded across all catalog techs; Thumb Ring keeps acc=100 so never excluded
        excluded_techs = {en: t['excluded'] for en, t in self.effects['techs'].items() if 'excluded' in t}
        self.assertEqual(excluded_techs, {'Herbalism': [6, 7, 185, 1155, 2562, 2564]})

        herb_rules = self.effects['techs']['Herbalism']['rules']
        self.assertEqual(len(herb_rules), 1)
        for uid in (6, 7, 185, 1155, 2562, 2564):
            self.assertNotIn(uid, herb_rules[0]['t'])
            self.assertNotIn(uid, self.army_research['nodes']['1365']['combatUnits'])
        for uid in (4, 24, 492, 2550, 2552, 2554, 2588):
            self.assertIn(uid, herb_rules[0]['t'])
            self.assertIn(uid, self.army_research['nodes']['1365']['combatUnits'])

    def test_army_research_direct_combat_decodes_attack_armor_classes(self):
        dat_units = [{'Class': 0}, {'Class': 0}]
        units = [{'id': 0}, {'id': 1}]
        combat_forms = {0: {0}, 1: {1}}
        combat_attrs = {5, 8, 9}
        # Unit 0: scalar spd *1.15 then *0.87 (=1.0005 -> canceled)
        # Unit 1: attack class 4 *1.25 (4*256 + 125 = 1149) -> kept; attack class 3 *1.00 (3*256 + 100 = 868) -> identity
        cmds = [
            {'Type': 5, 'A': -1, 'B': 0, 'C': 5, 'D': 1.15},
            {'Type': 5, 'A': 0, 'B': -1, 'C': 5, 'D': 0.87},
            {'Type': 5, 'A': 1, 'B': -1, 'C': 5, 'D': 0.87},
            {'Type': 5, 'A': 1, 'B': -1, 'C': 9, 'D': 4 * 256 + 125},
            {'Type': 5, 'A': 0, 'B': -1, 'C': 9, 'D': 3 * 256 + 100},
        ]
        hit = army_research_build.direct_combat_units(cmds, units, combat_forms, dat_units, combat_attrs)
        self.assertEqual(hit, {1})

    def test_projectile_poison_exact_scope_excludes_outpost_and_other_civs(self):
        self.assertEqual(
            self.effects['projectilePoison'],
            {'Curare': {'units': [4, 24, 492, 2579, 2581], 'buildings': [79, 82, 109, 234, 235]}},
        )
        # Negative unit/building checks
        for uid in (6, 7, 185):
            self.assertNotIn(uid, self.effects['projectilePoison']['Curare']['units'])
        for bid in (598, 1251, 1665, 1806):
            self.assertNotIn(bid, self.effects['projectilePoison']['Curare']['buildings'])

    def test_death_heal_aura_unit_derivation_and_fail_closed(self):
        # Committed units.json: ONLY 2562 and 2564 have deathHealAura=True
        aura_ids = sorted(u['id'] for u in self.units if u.get('deathHealAura') is True)
        self.assertEqual(aura_ids, [2562, 2564])
        for konnik in (1225, 1227, 1254, 1255):
            self.assertNotIn('deathHealAura', self.unit_by_id[konnik])

        # Pure unit tests + fail-closed validation
        fake_du = [
            {'CombatAbility': 0},
            {'CombatAbility': 32},
            {'CombatAbility': 96},
        ]
        self.assertFalse(units_build.derive_death_heal_aura({'BloodUnitID': -1}, fake_du))
        self.assertFalse(units_build.derive_death_heal_aura({'BloodUnitID': 0}, fake_du))
        self.assertTrue(units_build.derive_death_heal_aura({'BloodUnitID': 1}, fake_du))
        self.assertTrue(units_build.derive_death_heal_aura({'BloodUnitID': 2}, fake_du))
        with self.assertRaises(ValueError):
            units_build.derive_death_heal_aura({'BloodUnitID': 99}, fake_du)
        with self.assertRaises(KeyError):
            units_build.derive_death_heal_aura({}, fake_du)

    def test_training_time_alignment_and_fallback_contract(self):
        # 4 fixed drifting units + 4 unchanged Castle originals
        self.assertEqual(self.unit_by_id[759]['tt'], 16)
        self.assertEqual(self.unit_by_id[761]['tt'], 16)
        self.assertEqual(self.unit_by_id[886]['tt'], 26)
        self.assertEqual(self.unit_by_id[887]['tt'], 24)
        self.assertEqual(self.unit_by_id[41]['tt'], 13)
        self.assertEqual(self.unit_by_id[555]['tt'], 13)
        self.assertEqual(self.unit_by_id[755]['tt'], 14)
        self.assertEqual(self.unit_by_id[757]['tt'], 14)

        # Fallback contract (e.g. unit 1811 whose catalog building 1806 only has TrainAt slot 104):
        # must prefer .dat TrainAt slot, then .dat TrainTime (aligned with stats_crosscheck), even if aoe2techtree fallback_tt differs
        slot_unit = {'TrainAt': [[82, 13], [12, 16]], 'TrainTime': 13}
        self.assertEqual(units_build.resolve_building_train_time(slot_unit, 12, 99), 16)
        self.assertEqual(stats_crosscheck.dat_train_time(slot_unit, 12), 16)

        unit_1811_like = {'TrainAt': [[104, 30]], 'TrainTime': 30}
        self.assertEqual(units_build.resolve_building_train_time(unit_1811_like, 1806, 99), 30)
        self.assertEqual(stats_crosscheck.dat_train_time(unit_1811_like, 1806), 30)

        empty_train_at_unit = {'TrainAt': [], 'TrainTime': 21}
        self.assertEqual(units_build.resolve_building_train_time(empty_train_at_unit, 12, 99), 21)
        self.assertEqual(stats_crosscheck.dat_train_time(empty_train_at_unit, 12), 21)

        # Only falls back to catalog fallback_tt when .dat lacks a valid positive TrainTime
        self.assertEqual(units_build.resolve_building_train_time({'TrainAt': []}, 12, 21), 21)
        self.assertEqual(units_build.resolve_building_train_time({'TrainAt': [], 'TrainTime': 0}, 12, 21), 21)

        # Full 248-unit anti-drift invariant against eco.json
        self.assertEqual(len(self.units), 248)
        for u in self.units:
            eco_u = self.eco['units'][str(u['id'])]
            expected = eco_u.get('timeAt', {}).get(str(u['b']), eco_u['trainTime'])
            self.assertEqual(u['tt'], expected, f"unit {u['id']} ({u['en']}) b={u['b']}")


if __name__ == '__main__':
    unittest.main()
