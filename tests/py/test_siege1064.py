"""Bounded source audit counterexamples; no network or installed parser needed."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import siege_build as siege


def armor_tech_commands():
    cmds = []
    for cls in siege.ARMOR_TECH_CLASSES:
        cmds.append({'Type': 5, 'A': -1, 'B': cls, 'C': 0, 'D': 1.100000023841858})
        for acls, delta in siege.ARMOR_TECH_EXPECTED_ADDS:
            cmds.append({'Type': 4, 'A': -1, 'B': cls, 'C': 8, 'D': float((acls << 8) | delta)})
    # DE regional castle appearance variant commands on Castle 82 (must not double-stack).
    cmds.append({'Type': 202, 'A': 82, 'B': -1, 'C': 0, 'D': 1.100000023841858})
    for acls, delta in siege.ARMOR_TECH_EXPECTED_ADDS:
        cmds.append({'Type': 201, 'A': 82, 'B': -1, 'C': 8, 'D': float((acls << 8) | delta)})
    return cmds


class Siege1064(unittest.TestCase):
    def setUp(self):
        # Small reconstruction from committed evidence, independent of the
        # ignored local extraction cache. Production --check re-reads .dat.
        saved = json.loads((ROOT / 'data/game/siege.json').read_text())
        combat = {'36': saved['attacker'], **saved['buildings']}
        base = {uid: {k: v for k, v in obj.items() if k not in
                      ['id', 'attacksComplete', 'armorsComplete', 'modifiersVerified']}
                for uid, obj in combat.items()}
        self.raw = {name: copy.deepcopy(base) for name in siege.RAW_CIVS}

        self.tt = {
            'civs': {
                **{civ: {'Unit': [36]} for civ in siege.CANNON_CIVS},
                'Britons': {'Unit': [4]},
            },
            'data': {'Unit': {}, 'Building': {}},
        }
        for uid, obj in base.items():
            self.tt['data']['Unit' if uid == '36' else 'Building'][uid] = {
                'HP': obj['hp'], 'ReloadTime': obj['reload'],
                'Attacks': [{'Class': c, 'Amount': n} for c, n in obj['attacks']],
                'Armours': [{'Class': c, 'Amount': n} for c, n in obj['armors']]}

        civ_audits = saved['audit']['civs']
        max_cid = max(entry['id'] for entry in civ_audits.values())
        civs = [{'Name': 'other', 'TechTreeID': 0, 'TeamBonusID': 0} for _ in range(max_cid + 1)]
        civs[0] = {'Name': 'Gaia', 'TechTreeID': 0, 'TeamBonusID': 0}
        civs[1] = {'Name': 'British', 'TechTreeID': 0, 'TeamBonusID': 0}

        techs = [{'Civ': -1, 'Name': '', 'RequiredTechs': [-1] * 6, 'ResearchLocation': -1, 'EffectID': -1} for _ in range(1200)]
        effects = [{'Name': '', 'EffectCommands': []} for _ in range(1500)]
        next_effect = 1200

        for civ_name, entry in civ_audits.items():
            cid = entry['id']
            tree_id = next_effect
            team_id = next_effect + 1
            next_effect += 2
            civs[cid] = {'Name': entry['datName'], 'TechTreeID': tree_id, 'TeamBonusID': team_id}
            effects[tree_id] = {'Name': civ_name + ' Tech Tree', 'EffectCommands': copy.deepcopy(entry['relevantTreeCommands'])}
            effects[team_id] = {'Name': civ_name + ' Team Bonus', 'EffectCommands': copy.deepcopy(entry['relevantTeamCommands'])}
            for rec in entry['relevantAutoTechs']:
                techs[rec['tech']] = {
                    'Civ': cid,
                    'Name': rec['name'],
                    'RequiredTechs': copy.deepcopy(rec['requires']),
                    'ResearchLocation': rec['location'],
                    'EffectID': rec['effect'],
                }
                if rec['effect'] >= 0:
                    effects[rec['effect']] = {'Name': rec['name'], 'EffectCommands': copy.deepcopy(rec['commands'])}

        chem = saved['audit']['chemistry']
        techs[chem['tech']] = {
            'Civ': -1, 'Name': chem['name'], 'RequiredTechs': [103, -1, -1, -1, -1, -1],
            'ResearchLocation': 209, 'EffectID': chem['effect'],
        }
        effects[chem['effect']] = {'Name': chem['name'], 'EffectCommands': [copy.deepcopy(siege.CHEMISTRY_EMPTY_SLOT)]}

        for rec in saved['audit']['armorTechs']:
            techs[rec['tech']] = {
                'Civ': -1, 'Name': rec['name'], 'RequiredTechs': copy.deepcopy(rec['requires']),
                'ResearchLocation': rec['location'], 'EffectID': rec['effect'],
            }
            effects[rec['effect']] = {'Name': rec['name'], 'EffectCommands': armor_tech_commands()}

        self.d = {'Version': saved['meta']['dat']['version'], 'Civs': civs, 'Techs': techs, 'Effects': effects}
        self.civ_audits = civ_audits

    def generate(self):
        return siege.generate(self.d, self.raw, self.tt, siege.AUDITED_DAT, siege.GUIDE_SHA)

    def test_exact_coverage_and_zero_vs_absence_survive_generation(self):
        result = self.generate()
        self.assertEqual(result['schemaVersion'], 2)
        expanded = {
            (entry['unit'], entry['building'], civ, tuple(armor))
            for entry in result['coverage']
            for civ in entry['civs']
            for armor in entry['armors']
        }
        expected = {
            (36, bid, civ, armor)
            for civ in ('', *siege.CANNON_CIVS)
            for bid in siege.BUILDING_IDS
            for armor in (((), (50,), (51,), (50, 51)) if bid in siege.ARMOR_TECH_BUILDING_IDS else ((),))
        }
        self.assertEqual(len(expanded), 702)
        self.assertEqual(expanded, expected)
        for bid in ('82', '109'):
            self.assertNotIn(13, dict(result['buildings'][bid]['armors']))
            self.assertEqual(result['buildings'][bid]['baseArmor'], 10000)
            self.assertTrue(result['buildings'][bid]['armorsComplete'])
        for bid in ('235', '79', '234', '236', '117', '155', '487'):
            self.assertEqual(dict(result['buildings'][bid]['armors'])[13], 0)
        self.assertEqual(result['civModifiers']['Burgundians']['attackMul'],
                         [[11, 1.25], [16, 1.25], [4, 1.25], [20, 1.25], [13, 1.25], [37, 1.25]])
        self.assertEqual(result['civModifiers']['Spanish']['reloadMul'], 0.85)
        self.assertEqual(set(result['armorTechs'].keys()), {'50', '51'})
        self.assertFalse(result['meta']['engineVerifiedInPinnedBuild'])

    def test_raw_civ_override_cannot_be_hidden_by_shared_parser(self):
        for rname in ('Turks', 'Ethiopians', 'French', 'Byzantine'):
            self.setUp()
            self.raw[rname]['36']['reload'] *= 0.8
            with self.assertRaisesRegex(ValueError, 'override'):
                self.generate()

    def test_missing_raw_table_and_upstream_difference_are_not_zero(self):
        for c in self.raw.values():
            c['235']['armors'] = []
        with self.assertRaises(ValueError):
            self.generate()
        self.setUp()
        self.tt['data']['Building']['82']['Armours'].append({'Class': 13, 'Amount': 0})
        with self.assertRaisesRegex(ValueError, 'mismatch'):
            self.generate()
        self.setUp()
        self.tt['civs']['Britons']['Unit'].append(36)
        with self.assertRaisesRegex(ValueError, 'Trainable cannon civ set mismatch'):
            self.generate()

    def test_new_class_or_modifier_requires_audit(self):
        for c in self.raw.values():
            c['36']['attacks'].append([999, 100])
        with self.assertRaisesRegex(ValueError, 'Unknown attack class'):
            self.generate()
        self.setUp()
        for c in self.raw.values():
            c['36']['modifiers']['projectiles'] = 2
        with self.assertRaisesRegex(ValueError, 'modifier'):
            self.generate()
        self.setUp()
        for c in self.raw.values():
            c['109']['modifiers']['bonusResistance'] = 0.25
        with self.assertRaisesRegex(ValueError, 'resistance/reflection'):
            self.generate()

    def test_civ_and_chemistry_command_tampering_requires_audit(self):
        # Turks auto tech adding reload change
        turks_eff = self.civ_audits['Turks']['relevantAutoTechs'][0]['effect']
        self.d['Effects'][turks_eff]['EffectCommands'].append({'Type': 5, 'A': 36, 'B': -1, 'C': 10, 'D': 0.8})
        with self.assertRaisesRegex(ValueError, 'Turks automatic cannon effect'):
            self.generate()

        # Turks team adding attack change
        self.setUp()
        turks_cid = self.civ_audits['Turks']['id']
        turks_team_id = self.d['Civs'][turks_cid]['TeamBonusID']
        self.d['Effects'][turks_team_id]['EffectCommands'].append({'Type': 5, 'A': 36, 'B': -1, 'C': 9, 'D': 1025})
        with self.assertRaisesRegex(ValueError, 'Turks team damage/reload'):
            self.generate()

        # Neutral civ (Ethiopians) gaining wildcard or tree command
        self.setUp()
        eth_cid = self.civ_audits['Ethiopians']['id']
        eth_tree_id = self.d['Civs'][eth_cid]['TechTreeID']
        self.d['Effects'][eth_tree_id]['EffectCommands'].append({'Type': 5, 'A': -1, 'B': -1, 'C': 10, 'D': 0.9})
        with self.assertRaisesRegex(ValueError, 'Ethiopians tree cannon effect'):
            self.generate()

        # Burgundians altering multiplier percentage
        self.setUp()
        burg_eff = self.civ_audits['Burgundians']['relevantAutoTechs'][0]['effect']
        self.d['Effects'][burg_eff]['EffectCommands'][0]['D'] = float((11 << 8) | 130)
        with self.assertRaisesRegex(ValueError, 'Burgundians attack multiplier'):
            self.generate()

        # Spanish altering reload multiplier
        self.setUp()
        spa_cid = self.civ_audits['Spanish']['id']
        spa_tree_id = self.d['Civs'][spa_cid]['TechTreeID']
        self.d['Effects'][spa_tree_id]['EffectCommands'][0]['D'] = 0.8
        with self.assertRaisesRegex(ValueError, 'Spanish tree cannon effect'):
            self.generate()

        # Chemistry adding a real unit 36 command or an unknown wildcard command
        self.setUp()
        chem_eff = self.d['Techs'][47]['EffectID']
        self.d['Effects'][chem_eff]['EffectCommands'].append({'Type': 4, 'A': 36, 'B': -1, 'C': 9, 'D': 1025.0})
        with self.assertRaisesRegex(ValueError, 'Chemistry affects cannon combat'):
            self.generate()

        self.setUp()
        chem_eff = self.d['Techs'][47]['EffectID']
        self.d['Effects'][chem_eff]['EffectCommands'].append({'Type': 5, 'A': -1, 'B': -1, 'C': 10, 'D': 0.9})
        with self.assertRaisesRegex(ValueError, 'Chemistry contains unreviewed wildcard'):
            self.generate()

    def test_armor_tech_tampering_requires_audit(self):
        # Altered HP multiplier on Masonry
        self.d['Effects'][50]['EffectCommands'][0]['D'] = 1.2
        with self.assertRaisesRegex(ValueError, 'HP multiplier'):
            self.generate()

        # Armor tech unexpectedly targeting stone walls (class 27)
        self.setUp()
        self.d['Effects'][50]['EffectCommands'].append({'Type': 5, 'A': -1, 'B': 27, 'C': 0, 'D': 1.1})
        with self.assertRaisesRegex(ValueError, 'wall/gate class'):
            self.generate()

        # Armor tech adding stone defense (class 13) armor delta on class 52
        self.setUp()
        self.d['Effects'][51]['EffectCommands'].append({'Type': 4, 'A': -1, 'B': 52, 'C': 8, 'D': float((13 << 8) | 1)})
        with self.assertRaisesRegex(ValueError, 'command set'):
            self.generate()

        # Armor tech adding direct non-variant HP multiply on Castle 82
        self.setUp()
        self.d['Effects'][50]['EffectCommands'].append({'Type': 5, 'A': 82, 'B': -1, 'C': 0, 'D': 1.1})
        with self.assertRaisesRegex(ValueError, 'non-variant direct command'):
            self.generate()

        # Armor tech adding an unreviewed wildcard command
        self.setUp()
        self.d['Effects'][50]['EffectCommands'].append({'Type': 5, 'A': -1, 'B': -1, 'C': 0, 'D': 1.1})
        with self.assertRaisesRegex(ValueError, 'wildcard command'):
            self.generate()

    def test_different_file_cannot_reuse_coverage_or_cached_dump(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'different.dat'
            path.write_bytes(b'not the audited game file')
            with self.assertRaisesRegex(ValueError, 'new coverage audit'):
                siege.raw_data(path)
        with self.assertRaisesRegex(ValueError, 'Unaudited sources'):
            siege.generate(self.d, self.raw, self.tt, '0' * 64, siege.GUIDE_SHA)


if __name__ == '__main__':
    unittest.main()
