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


class Siege1064(unittest.TestCase):
    def setUp(self):
        # Small reconstruction from committed raw evidence, independent of the
        # ignored local extraction cache. Production --check re-reads .dat.
        saved = json.loads((ROOT / 'data/game/siege.json').read_text())
        audit = saved['audit']['turks']
        combat = {'36': saved['attacker'], **saved['buildings']}
        base = {uid: {k: v for k, v in obj.items() if k not in
                     ['id', 'attacksComplete', 'armorsComplete', 'modifiersVerified']}
                for uid, obj in combat.items()}
        self.raw = {name: copy.deepcopy(base) for name in ['Gaia', 'British', 'Turks']}
        self.tt = {'data': {'Unit': {}, 'Building': {}}}
        for uid, obj in base.items():
            self.tt['data']['Unit' if uid == '36' else 'Building'][uid] = {
                'HP': obj['hp'], 'ReloadTime': obj['reload'],
                'Attacks': [{'Class': c, 'Amount': n} for c, n in obj['attacks']],
                'Armours': [{'Class': c, 'Amount': n} for c, n in obj['armors']]}
        techs = [{'Civ': -1} for _ in range(600)]
        effects = [{} for _ in range(600)]
        for rec in [*audit['automaticTechs'], audit['chemistry'], *saved['audit']['armorTechs']]:
            techs[rec['tech']] = {'Civ': 10 if rec in audit['automaticTechs'] else -1,
                                 'Name': rec['name'], 'RequiredTechs': rec['requires'],
                                 'ResearchLocation': rec['location'], 'EffectID': rec['effect']}
            if rec['effect'] >= 0:
                effects[rec['effect']] = {'Name': rec['name'], 'EffectCommands': rec['commands']}
        effects[263] = audit['tree']
        effects[410] = audit['team']
        civs = [{'Name': name} for name in ['Gaia', 'British'] + ['other'] * 8 + ['Turks']]
        civs[10].update(TechTreeID=263, TeamBonusID=410)
        self.d = {'Version': saved['meta']['dat']['version'], 'Civs': civs, 'Techs': techs, 'Effects': effects}

    def generate(self):
        return siege.generate(self.d, self.raw, self.tt, siege.AUDITED_DAT, siege.GUIDE_SHA)

    def test_exact_coverage_and_zero_vs_absence_survive_generation(self):
        result = self.generate()
        self.assertEqual({(c['unit'], c['building'], c['civ'], tuple(c['armor'])) for c in result['coverage']},
                         {(36, b, civ, ()) for b in [82, 235] for civ in ['', 'Turks']})
        self.assertNotIn(13, dict(result['buildings']['82']['armors']))
        self.assertEqual(dict(result['buildings']['235']['armors'])[13], 0)
        self.assertTrue(result['buildings']['82']['armorsComplete'])
        self.assertEqual(result['buildings']['82']['baseArmor'], 10000)
        self.assertFalse(result['meta']['engineVerifiedInPinnedBuild'])

    def test_turks_override_cannot_be_hidden_by_shared_parser(self):
        self.raw['Turks']['36']['reload'] *= 0.8
        with self.assertRaisesRegex(ValueError, 'override'):
            self.generate()

    def test_missing_raw_table_and_upstream_difference_are_not_zero(self):
        self.raw['British']['235']['armors'] = []
        with self.assertRaises(ValueError):
            self.generate()
        self.setUp()
        self.tt['data']['Building']['82']['Armours'].append({'Class': 13, 'Amount': 0})
        with self.assertRaisesRegex(ValueError, 'mismatch'):
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

    def test_new_turks_damage_or_team_reload_effect_requires_audit(self):
        self.d['Effects'][296]['EffectCommands'].append({'Type': 5, 'A': 36, 'B': -1, 'C': 10, 'D': 0.8})
        with self.assertRaisesRegex(ValueError, 'automatic cannon effect'):
            self.generate()
        self.setUp()
        self.d['Effects'][410]['EffectCommands'].append({'Type': 5, 'A': 36, 'B': -1, 'C': 9, 'D': 1025})
        with self.assertRaisesRegex(ValueError, 'team damage/reload'):
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
