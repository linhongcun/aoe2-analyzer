#!/usr/bin/env python3
"""#1064 / #1489: bounded direct-hit evidence, not a general combat simulator.

Only the audited file can grant coverage. Complete absent classes use the
target's *actual* base armour; an uncollected table never grants coverage.
Run with --check to reproduce data/game/siege.json from the pinned sources.
"""
import argparse
import hashlib
import json
import subprocess
import urllib.request

from dat_source import CACHE, DAT, ROOT, GENIEUTILS, _venv_python, fetch_dat, load, markers_of, pins

OUT = ROOT / 'data/game/siege.json'
AUDITED_DAT = 'd0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f'
TT_SHA = 'e21b3d22d5101257a62fc6298377314852f929c12b0c997a9e986919658fd460'
GUIDE_COMMIT = '5d8cdd0e269b20c7084bfff8793c35b50a4b5d6f'
GUIDE_SHA = '8d03cb7b4f3de5e3bdc64acb5b110f376fc2f86b833c8b44db58a6ec8c63e7c8'
GUIDE_URL = ('https://raw.githubusercontent.com/Divy1211/AoE2DE_UGC_Guide/'
             + GUIDE_COMMIT + '/docs/general/damage_calculation.md')

UNIT_ID = 36
ARMOR_TECH_BUILDING_IDS = (82, 235, 109, 79, 234, 236)
WALL_GATE_BUILDING_IDS = (117, 155, 487)
BUILDING_IDS = (*ARMOR_TECH_BUILDING_IDS, *WALL_GATE_BUILDING_IDS)
ARMOR_TECH_IDS = (50, 51)
ARMOR_TECH_CLASSES = (3, 52)
WALL_GATE_CLASSES = (27, 39)
ARMOR_TECH_EXPECTED_ADDS = ((4, 1), (3, 1), (11, 3))

CANNON_CIVS = (
    'Berbers', 'Bohemians', 'Burgundians', 'Burmese', 'Byzantines',
    'Dravidians', 'Ethiopians', 'Franks', 'Goths', 'Gurjaras',
    'Hindustanis', 'Italians', 'Jurchens', 'Koreans', 'Lithuanians',
    'Malay', 'Malians', 'Persians', 'Poles', 'Portuguese',
    'Saracens', 'Spanish', 'Teutons', 'Turks', 'Vietnamese',
)
DAT_CIV_NAMES = {'Byzantines': 'Byzantine', 'Franks': 'French'}
RAW_CIVS = ('Gaia', 'British', *(DAT_CIV_NAMES.get(c, c) for c in CANNON_CIVS))

CLASSES = {3: '穿刺', 4: '近战', 11: '所有建筑', 13: '石质防御',
           16: '船只', 20: '攻城武器', 37: '重型攻城武器'}

# Known Genie empty-slot command present in Chemistry (47) in DE 188329.
CHEMISTRY_EMPTY_SLOT = {'Type': 4, 'A': -1, 'B': -1, 'C': 9, 'D': 1025.0}

# Exact audited non-damage/non-reload commands hitting unit 36 / class 13 per civ.
# Each entry is (Type, A, B, C, expected_D, tol).
EXPECTED_NON_COMBAT_AUTO = {
    'Dravidians': (876, [(5, -1, 13, 104, 2.0 / 3.0, 1e-5)]),
    'Hindustanis': (520, [(4, 36, -1, 8, 1025.0, 1e-9), (4, 36, -1, 8, 769.0, 1e-9)]),
    'Italians': (500, [(5, 36, -1, 100, 0.8, 1e-6)]),
    'Jurchens': (1009, [(5, -1, 13, 119, 0.5, 1e-9)]),
    'Portuguese': (559, [(5, -1, 13, 105, 0.8, 1e-6)]),
    'Turks': (301, [(5, 36, -1, 0, 1.25, 1e-9)]),
}
EXPECTED_TEAM_COMMANDS = {
    'Jurchens': [(4, 36, -1, 1, 2.0, 1e-9)],
    'Turks': [(5, 36, -1, 101, 0.8, 1e-6)],
}

# A dedicated extraction preserves raw Units for Gaia, British and all 25 cannon civs
# (shared dat_source only retains Gaia/Britons). Cache identity includes this program and file hash.
DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1])
ids=[36,82,235,109,79,234,236,117,155,487]
want=set(json.loads(sys.argv[3]))
def rec(u):
    t=u.type_50; c=u.creatable
    return {'hp':u.hit_points,'class':u.class_,
            'attacks':[[a.class_,a.amount] for a in t.attacks],
            'armors':[[a.class_,a.amount] for a in t.armours],
            'baseArmor':t.base_armor,'reload':t.reload_time,
            'modifiers':{'bonusResistance':t.bonus_damage_resistance,
                         'reflection':t.damage_reflection,'blastDamage':t.blast_damage,
                         'accuracy':t.accuracy_percent,'projectiles':c.total_projectiles,
                         'maxProjectiles':c.max_total_projectiles,
                         'secondaryProjectile':c.secondary_projectile_unit,
                         'specialAbility':c.special_ability,'chargeType':c.charge_type,
                         'chargeEvent':c.charge_event,'rear':c.rear_attack_modifier,
                         'flank':c.flank_attack_modifier}}
json.dump({c.name:{str(i):rec(c.units[i]) for i in ids}
           for n,c in enumerate(d.civs) if n in [0,1] or c.name in want},open(sys.argv[2],'w'))
'''


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256_json(obj):
    raw = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def checked_bytes(url, name, sha):
    path = CACHE / name
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(url).read())
    content = path.read_bytes()
    require(hashlib.sha256(content).hexdigest() == sha, 'Unreviewed source: ' + url)
    return content


def raw_data(path):
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    require(sha == AUDITED_DAT, 'A different .dat requires a new coverage audit')
    civ_arg = json.dumps(list(RAW_CIVS))
    prog_sig = hashlib.sha256((DUMP + civ_arg).encode()).hexdigest()[:12]
    dest = CACHE / ('siege.%s.%s.json' % (sha[:12], prog_sig))
    if not dest.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(dest), civ_arg])
    return json.loads(dest.read_text())


def effect_record(d, tid):
    t = d['Techs'][tid]
    return {'tech': tid, 'effect': t['EffectID'], 'name': t['Name'],
            'requires': t['RequiredTechs'], 'location': t['ResearchLocation'],
            'commands': d['Effects'][t['EffectID']]['EffectCommands'] if t['EffectID'] >= 0 else []}


def applicable(command, uid, unit_class):
    return command['A'] == uid or (command['A'] == -1 and command['B'] == unit_class)


def applicable_or_wildcard(command, uid, unit_class):
    return applicable(command, uid, unit_class) or (
        command['Type'] in (0, 4, 5, 10, 14, 15) and command['A'] == -1 and command['B'] == -1
    )


def command_matches(cmd, spec):
    ctype, a, b, c, expected_d, tol = spec
    return (cmd['Type'] == ctype and cmd['A'] == a and cmd['B'] == b
            and cmd['C'] == c and abs(cmd['D'] - expected_d) <= tol)


def match_command_set(cmds, specs):
    if len(cmds) != len(specs):
        return False
    used = set()
    for spec in specs:
        idx = next((i for i, cmd in enumerate(cmds) if i not in used and command_matches(cmd, spec)), None)
        if idx is None:
            return False
        used.add(idx)
    return True


def decode_class_value(val):
    iv = int(round(val))
    require(iv >= 0 and abs(val - float(iv)) < 1e-9, 'Malformed class-packed command value')
    return iv >> 8, iv & 0xFF


def audit_armor_techs(d, base):
    armor_techs = {}
    armor_audit = []
    for bid in ARMOR_TECH_BUILDING_IDS:
        bobj = base[str(bid)]
        require(bobj['class'] in ARMOR_TECH_CLASSES, 'Unexpected armor-tech building class: %s' % bid)
        explicit_classes = {cls for cls, _ in bobj['armors']}
        require({3, 4, 11} <= explicit_classes, 'Armor-tech building missing explicit armor classes 3/4/11: %s' % bid)
    for bid in WALL_GATE_BUILDING_IDS:
        require(base[str(bid)]['class'] in WALL_GATE_CLASSES, 'Unexpected wall/gate building class: %s' % bid)

    for tid in ARMOR_TECH_IDS:
        rec = effect_record(d, tid)
        cmds = rec['commands']
        require(rec['name'] == ('Masonry' if tid == 50 else 'Architecture'), 'Unexpected armor tech name: %s' % tid)
        for cls in WALL_GATE_CLASSES:
            require(not any(c['A'] == -1 and c['B'] == cls for c in cmds),
                    'Armor tech %s unexpectedly targets wall/gate class %s' % (tid, cls))
        for bid in BUILDING_IDS:
            direct = [c for c in cmds if c['A'] == bid]
            if bid == 82:
                require(all(c['Type'] in (201, 202) for c in direct),
                        'Armor tech %s has non-variant direct command on castle 82' % tid)
            else:
                require(not direct, 'Armor tech %s has direct command on building %s' % (tid, bid))
        for cls in ARMOR_TECH_CLASSES:
            cls_cmds = [c for c in cmds if c['A'] == -1 and c['B'] == cls]
            hp_cmds = [c for c in cls_cmds if c['Type'] == 5 and c['C'] == 0]
            arm_cmds = [c for c in cls_cmds if c['Type'] == 4 and c['C'] == 8]
            require(len(hp_cmds) == 1 and len(arm_cmds) == 3 and len(cls_cmds) == 4,
                    'Unreviewed armor tech %s command set for class %s' % (tid, cls))
            require(abs(hp_cmds[0]['D'] - 1.1) < 1e-6, 'Unexpected armor tech %s HP multiplier' % tid)
            decoded = tuple(decode_class_value(c['D']) for c in arm_cmds)
            require(set(decoded) == set(ARMOR_TECH_EXPECTED_ADDS),
                    'Unexpected armor tech %s armor deltas for class %s' % (tid, cls))
        armor_techs[str(tid)] = {
            'name': rec['name'],
            'classes': list(ARMOR_TECH_CLASSES),
            'hpMul': 1.1,
            'armorAdd': [[c, v] for c, v in ARMOR_TECH_EXPECTED_ADDS],
            'verified': True,
        }
        armor_audit.append({
            'tech': rec['tech'],
            'effect': rec['effect'],
            'name': rec['name'],
            'requires': rec['requires'],
            'location': rec['location'],
            'matchedClasses': list(ARMOR_TECH_CLASSES),
            'commandsSha256': sha256_json(cmds),
        })
    return armor_techs, armor_audit


def audit_civs(d, attacker):
    dat_civ_by_name = {c['Name']: (i, c) for i, c in enumerate(d['Civs'])}
    civ_modifiers = {}
    civ_audits = {}
    expected_attack_classes = [cls for cls, _ in attacker['attacks']]

    for name in CANNON_CIVS:
        dname = DAT_CIV_NAMES.get(name, name)
        require(dname in dat_civ_by_name, 'Missing .dat civ: ' + dname)
        cid, civ = dat_civ_by_name[dname]
        autos = [effect_record(d, i) for i, t in enumerate(d['Techs'])
                 if t['Civ'] == cid and t['ResearchLocation'] in (-1, 0)]
        tree = d['Effects'][civ['TechTreeID']]
        team = d['Effects'][civ['TeamBonusID']]

        rel_auto_techs = []
        for t in autos:
            rel = [c for c in t['commands'] if applicable_or_wildcard(c, UNIT_ID, attacker['class'])]
            if rel:
                rel_auto_techs.append({**t, 'commands': rel})
        rel_tree = [c for c in tree['EffectCommands'] if applicable_or_wildcard(c, UNIT_ID, attacker['class'])]
        rel_team = [c for c in team['EffectCommands'] if applicable_or_wildcard(c, UNIT_ID, attacker['class'])]

        combat_effect = 'none'
        if name == 'Burgundians':
            require(len(rel_auto_techs) == 1 and rel_auto_techs[0]['tech'] == 769
                    and rel_auto_techs[0]['requires'] == [-1, -1, -1, -1, -1, -1],
                    'Unreviewed Burgundians automatic cannon effect')
            b_cmds = rel_auto_techs[0]['commands']
            require(len(b_cmds) == len(expected_attack_classes), 'Burgundians attack class count mismatch')
            mul_by_class = {}
            for c in b_cmds:
                require(c['Type'] == 5 and c['A'] == UNIT_ID and c['B'] == -1 and c['C'] == 9,
                        'Unreviewed Burgundians automatic cannon effect')
                cls, pct = decode_class_value(c['D'])
                require(pct == 125 and cls not in mul_by_class, 'Unreviewed Burgundians attack multiplier')
                mul_by_class[cls] = pct / 100.0
            require(set(mul_by_class.keys()) == set(expected_attack_classes),
                    'Burgundians attack multiplier classes do not match cannon attacks')
            require(not rel_tree, 'Unreviewed Burgundians tree cannon effect')
            require(not rel_team, 'Unreviewed Burgundians team cannon effect')
            civ_modifiers[name] = {
                'attackMul': [[cls, mul_by_class[cls]] for cls in expected_attack_classes],
                'reloadMul': 1,
                'source': 'Tech 769 (C-Bonus, Gunpowder units +25% attack)',
            }
            combat_effect = 'attackMul'
        elif name == 'Spanish':
            require(not rel_auto_techs, 'Unreviewed Spanish automatic cannon effect')
            require(match_command_set(rel_tree, [(5, UNIT_ID, -1, 10, 0.85, 1e-6)]),
                    'Unreviewed Spanish tree cannon effect')
            require(not rel_team, 'Unreviewed Spanish team cannon effect')
            civ_modifiers[name] = {
                'attackMul': [],
                'reloadMul': 0.85,
                'source': 'Effect %d (TechTreeID: unit 36 reload x0.85)' % civ['TechTreeID'],
            }
            combat_effect = 'reloadMul'
        else:
            if name in EXPECTED_NON_COMBAT_AUTO:
                exp_tid, exp_specs = EXPECTED_NON_COMBAT_AUTO[name]
                require(len(rel_auto_techs) == 1 and rel_auto_techs[0]['tech'] == exp_tid
                        and match_command_set(rel_auto_techs[0]['commands'], exp_specs),
                        'Unreviewed %s automatic cannon effect' % name)
            else:
                require(not rel_auto_techs, 'Unreviewed %s automatic cannon effect' % name)
            require(not rel_tree, 'Unreviewed %s tree cannon effect' % name)
            exp_team = EXPECTED_TEAM_COMMANDS.get(name, [])
            require(match_command_set(rel_team, exp_team),
                    'Unreviewed %s team damage/reload effect' % name)

        civ_audits[name] = {
            'id': cid,
            'datName': dname,
            'combatEffect': combat_effect,
            'relevantAutoTechs': rel_auto_techs,
            'relevantTreeCommands': rel_tree,
            'relevantTeamCommands': rel_team,
            'commandsSha256': sha256_json({'autos': autos, 'tree': tree, 'team': team}),
        }

    return civ_modifiers, civ_audits


def generate(d, raw, tt, actual_sha, guide_sha):
    require(actual_sha == AUDITED_DAT and guide_sha == GUIDE_SHA, 'Unaudited sources')
    require(d['Version'] == 'VER 8.9', 'Unreviewed .dat format')

    # Verify trainable civ set matches pinned aoe2techtree data.
    tt_civs = sorted(c for c, entry in tt['civs'].items() if UNIT_ID in entry.get('Unit', []))
    require(tuple(tt_civs) == CANNON_CIVS, 'Trainable cannon civ set mismatch with aoe2techtree')

    # Verify Gaia, British and all 25 cannon civs share identical raw unit/building combat records.
    require('British' in raw and set(RAW_CIVS) <= set(raw.keys()), 'Missing raw civ extraction')
    base = raw['British']
    for rname in RAW_CIVS:
        require(raw[rname] == base, 'Raw civilizational combat override requires review: ' + rname)

    attacker = base[str(UNIT_ID)]
    require(set(c for c, _ in attacker['attacks']) <= CLASSES.keys(), 'Unknown attack class')
    mods = attacker['modifiers']
    require(mods == {'bonusResistance': 0, 'reflection': 0, 'blastDamage': 1,
                     'accuracy': 100, 'projectiles': 1, 'maxProjectiles': 1,
                     'secondaryProjectile': -1, 'specialAbility': 0, 'chargeType': 0,
                     'chargeEvent': 0, 'rear': 0, 'flank': 1}, 'Unreviewed cannon modifier')

    for uid in (UNIT_ID, *BUILDING_IDS):
        obj = base[str(uid)]
        other = tt['data']['Unit' if uid == UNIT_ID else 'Building'][str(uid)]
        require(obj['hp'] == other['HP'] and obj['reload'] == other['ReloadTime'], 'Tech tree scalar mismatch')
        for field, key in [('attacks', 'Attacks'), ('armors', 'Armours')]:
            require(obj[field] == [[v['Class'], v['Amount']] for v in other[key]], 'Tech tree class mismatch')
        require(len(obj['armors']) > 0 and obj['baseArmor'] == 10000, 'Missing raw armor table or unexpected baseArmor')
        require(obj['modifiers']['bonusResistance'] == 0 and obj['modifiers']['reflection'] == 0,
                'Defender resistance/reflection requires review')

    civ_modifiers, civ_audits = audit_civs(d, attacker)

    chemistry = effect_record(d, 47)
    require(not any(applicable(c, UNIT_ID, attacker['class']) for c in chemistry['commands']),
            'Chemistry affects cannon combat')
    chem_wildcards = [c for c in chemistry['commands']
                      if c['Type'] in (0, 4, 5, 10, 14, 15) and c['A'] == -1 and c['B'] == -1]
    require(all(c == CHEMISTRY_EMPTY_SLOT for c in chem_wildcards),
            'Chemistry contains unreviewed wildcard command')

    armor_techs, armor_audit = audit_armor_techs(d, base)

    all_civs = ['', *CANNON_CIVS]
    armor_combos = [[], [50], [51], [50, 51]]
    coverage = [
        {
            'unit': UNIT_ID,
            'building': bid,
            'civs': list(all_civs),
            'armors': [list(a) for a in (armor_combos if bid in ARMOR_TECH_BUILDING_IDS else [[]])],
            'status': 'verified',
        }
        for bid in BUILDING_IDS
    ]

    return {
        'schemaVersion': 2,
        'meta': {'generatedBy': 'scripts/siege_build.py', 'patch': DAT['patch'],
                 'dat': {'repo': DAT['repo'], 'commit': DAT['commit'], 'path': DAT['path'],
                         'sha256': actual_sha, 'version': d['Version'], 'markers': markers_of(d), 'parser': GENIEUTILS},
                 'techtree': {**{k: pins()['sources']['aoe2techtree'][k] for k in ['repo', 'commit']},
                              'path': 'data/data.json', 'sha256': TT_SHA, 'matches': True},
                 'mechanics': {'url': GUIDE_URL, 'sha256': guide_sha,
                               'section': '3.3 steps 2-4: explicit armor or target base armor; sum; minimum 1',
                               'limitation': 'Guide warns it omits modern modifiers. Only its class/base-armor rule is used; neutral direct-hit modifiers are audited separately.'},
                 'model': 'flat terrain; full-health ordinary building; direct intended hit; one projectile; first volley t=0; audited passive civ bonuses and defender Masonry/Architecture only; no optional attacker techs, team bonuses, garrison, movement, flight, repairs or counterattack',
                 'engineVerifiedInPinnedBuild': False,
                 'fields': ['Civs[Gaia/British + 25 cannon civs].Units[36/82/235/109/79/234/236/117/155/487].hit_points',
                            'Unit.type_50.attacks/armours/base_armor/reload_time',
                            'Unit.type_50.bonus_damage_resistance/damage_reflection/blast_damage/accuracy_percent',
                            'Unit.creatable.total_projectiles/max_total_projectiles/secondary_projectile_unit/special_ability/charge_type/charge_event/rear_attack_modifier/flank_attack_modifier',
                            'Techs[25 cannon civs automatic/47/50/51], Effects[25 cannon civs tech_tree_id/team_bonus_id]']},
        'classes': {str(k): v for k, v in CLASSES.items()},
        'attacker': {**attacker, 'id': UNIT_ID, 'attacksComplete': True, 'armorsComplete': True, 'modifiersVerified': True},
        'buildings': {str(uid): {**base[str(uid)], 'attacksComplete': True, 'armorsComplete': True, 'modifiersVerified': True} for uid in BUILDING_IDS},
        'civModifiers': civ_modifiers,
        'armorTechs': armor_techs,
        'coverage': coverage,
        'audit': {
            'rawCivsCompared': list(RAW_CIVS),
            'rawCombatEqual': True,
            'civs': civ_audits,
            'chemistry': {
                'tech': chemistry['tech'],
                'effect': chemistry['effect'],
                'name': chemistry['name'],
                'relevantCommands': [],
                'commandsSha256': sha256_json(chemistry['commands']),
            },
            'armorTechs': armor_audit,
            'armorTechCoverage': 'Granted for Masonry (50) and Architecture (51) on audited Class 3/52 buildings (82, 235, 109, 79, 234, 236); excluded for wall/gate buildings (117, 155, 487).',
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = fetch_dat()
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    d = load()
    raw = raw_data(path)
    pin = pins()['sources']['aoe2techtree']
    tt_url = 'https://raw.githubusercontent.com/%s/%s/data/data.json' % (pin['repo'], pin['commit'])
    tt = json.loads(checked_bytes(tt_url, 'siege-techtree.%s.json' % pin['commit'][:12], TT_SHA))
    guide = checked_bytes(GUIDE_URL, 'siege-mechanics.%s.txt' % GUIDE_COMMIT[:12], GUIDE_SHA)
    data = generate(d, raw, tt, actual, hashlib.sha256(guide).hexdigest())
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n'
    if args.check:
        require(OUT.exists() and OUT.read_text() == text, 'siege.json differs; run scripts/siege_build.py')
    else:
        OUT.write_text(text)
    print('siege %s; actual dat SHA-256 %s; Version %s; markers %s' % (
        'reproducible' if args.check else 'generated', actual, d['Version'], markers_of(d)))


if __name__ == '__main__':
    main()
