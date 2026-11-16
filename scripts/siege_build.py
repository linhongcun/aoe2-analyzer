#!/usr/bin/env python3
"""#1064: bounded direct-hit evidence, not a general combat simulator.

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
CLASSES = {3: '穿刺', 4: '近战', 11: '所有建筑', 13: '石质防御',
           16: '船只', 20: '攻城武器', 37: '重型攻城武器'}

# A dedicated extraction preserves Turks raw Units (shared dat_source only
# retains Gaia/Britons). Cache identity includes this program and file hash.
DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1])
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
json.dump({c.name:{str(i):rec(c.units[i]) for i in [36,82,235]}
           for n,c in enumerate(d.civs) if n in [0,1] or c.name=='Turks'},open(sys.argv[2],'w'))
'''


def require(condition, message):
    if not condition:
        raise ValueError(message)


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
    dest = CACHE / ('siege.%s.%s.json' % (sha[:12], hashlib.sha256(DUMP.encode()).hexdigest()[:12]))
    if not dest.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(dest)])
    return json.loads(dest.read_text())


def effect_record(d, tid):
    t = d['Techs'][tid]
    return {'tech': tid, 'effect': t['EffectID'], 'name': t['Name'],
            'requires': t['RequiredTechs'], 'location': t['ResearchLocation'],
            'commands': d['Effects'][t['EffectID']]['EffectCommands'] if t['EffectID'] >= 0 else []}


def applicable(command, uid, unit_class):
    return command['A'] == uid or command['A'] == -1 and command['B'] == unit_class


def generate(d, raw, tt, actual_sha, guide_sha):
    require(actual_sha == AUDITED_DAT and guide_sha == GUIDE_SHA, 'Unaudited sources')
    require(d['Version'] == 'VER 8.9', 'Unreviewed .dat format')
    base = raw['British']
    require(raw['Gaia'] == base and raw['Turks'] == base, 'Raw civilizational combat override requires review')
    attacker = base['36']
    require(set(c for c, _ in attacker['attacks']) <= CLASSES.keys(), 'Unknown attack class')
    mods = attacker['modifiers']
    require(mods == {'bonusResistance': 0, 'reflection': 0, 'blastDamage': 1,
                     'accuracy': 100, 'projectiles': 1, 'maxProjectiles': 1,
                     'secondaryProjectile': -1, 'specialAbility': 0, 'chargeType': 0,
                     'chargeEvent': 0, 'rear': 0, 'flank': 1}, 'Unreviewed cannon modifier')
    for uid in [36, 82, 235]:
        obj = base[str(uid)]
        other = tt['data']['Unit' if uid == 36 else 'Building'][str(uid)]
        require(obj['hp'] == other['HP'] and obj['reload'] == other['ReloadTime'], 'Tech tree scalar mismatch')
        for field, key in [('attacks', 'Attacks'), ('armors', 'Armours')]:
            require(obj[field] == [[v['Class'], v['Amount']] for v in other[key]], 'Tech tree class mismatch')
        require(obj['modifiers']['bonusResistance'] == 0 and obj['modifiers']['reflection'] == 0,
                'Defender resistance/reflection requires review')

    turks = next((i, c) for i, c in enumerate(d['Civs']) if c['Name'] == 'Turks')
    cid, civ = turks
    autos = [effect_record(d, i) for i, t in enumerate(d['Techs'])
             if t['Civ'] == cid and t['ResearchLocation'] in [-1, 0]]
    # Preserve all automatic techs, tree and team commands for review, including
    # noncombat commands which the effects adapter intentionally omits.
    relevant = [c for t in autos for c in t['commands'] if applicable(c, 36, attacker['class'])]
    require(relevant == [{'Type': 5, 'A': 36, 'B': -1, 'C': 0, 'D': 1.25}],
            'Unreviewed Turks automatic cannon effect')
    tree = d['Effects'][civ['TechTreeID']]
    require(all(c['Type'] in [8, 101, 102, 103] for c in tree['EffectCommands']), 'New tree combat effect')
    team = d['Effects'][civ['TeamBonusID']]
    require([c for c in team['EffectCommands'] if applicable(c, 36, attacker['class'])]
            == [{'Type': 5, 'A': 36, 'B': -1, 'C': 101, 'D': 0.800000011920929}],
            'New team damage/reload effect')
    chemistry = effect_record(d, 47)
    require(not any(applicable(c, 36, attacker['class']) for c in chemistry['commands']),
            'Chemistry affects cannon combat')
    coverage = [{'unit': 36, 'building': bid, 'civ': name, 'armor': [], 'status': 'verified'}
                for name in ['', 'Turks'] for bid in [82, 235]]
    return {
        'schemaVersion': 1,
        'meta': {'generatedBy': 'scripts/siege_build.py', 'patch': DAT['patch'],
                 'dat': {'repo': DAT['repo'], 'commit': DAT['commit'], 'path': DAT['path'],
                         'sha256': actual_sha, 'version': d['Version'], 'markers': markers_of(d), 'parser': GENIEUTILS},
                 'techtree': {**{k: pins()['sources']['aoe2techtree'][k] for k in ['repo', 'commit']},
                              'path': 'data/data.json', 'sha256': TT_SHA, 'matches': True},
                 'mechanics': {'url': GUIDE_URL, 'sha256': guide_sha,
                               'section': '3.3 steps 2-4: explicit armor or target base armor; sum; minimum 1',
                               'limitation': 'Guide warns it omits modern modifiers. Only its class/base-armor rule is used; neutral direct-hit modifiers are audited separately.'},
                 'model': 'flat terrain; full-health ordinary building; direct intended hit; one projectile; first volley t=0; no optional techs, garrison, movement, flight, repairs or counterattack',
                 'engineVerifiedInPinnedBuild': False,
                 'fields': ['Civs[0/1/10].Units[36/82/235].hit_points',
                            'Unit.type_50.attacks/armours/base_armor/reload_time',
                            'Unit.type_50.bonus_damage_resistance/damage_reflection/blast_damage/accuracy_percent',
                            'Unit.creatable.total_projectiles/max_total_projectiles/secondary_projectile_unit/special_ability/charge_type/charge_event/rear_attack_modifier/flank_attack_modifier',
                            'Techs[Turks automatic/47/50/51], Effects[Civs[10].tech_tree_id/team_bonus_id]']},
        'classes': {str(k): v for k, v in CLASSES.items()},
        'attacker': {**attacker, 'id': 36, 'attacksComplete': True, 'armorsComplete': True, 'modifiersVerified': True},
        'buildings': {str(uid): {**base[str(uid)], 'attacksComplete': True, 'armorsComplete': True, 'modifiersVerified': True} for uid in [82, 235]},
        'coverage': coverage,
        'audit': {'rawCivsCompared': ['Gaia', 'British', 'Turks'], 'rawCombatEqual': True,
                  'turks': {'id': cid, 'automaticTechs': autos, 'tree': tree, 'team': team,
                            'chemistry': chemistry,
                            'conclusion': 'Only automatic HP x1.25 applies to cannon; team changes training time, not reload. Chemistry has no matching cannon command. No attack/interval change.'},
                  'armorTechs': [effect_record(d, tid) for tid in [50, 51]],
                  'armorTechCoverage': 'Not granted: raw effects preserved; cannon configurations with 50/51 remain unknown.'},
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
