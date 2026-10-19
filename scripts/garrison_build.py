#!/usr/bin/env python3
"""#218: pinned .dat -> village-garrison inputs, without changing the shared dump.

python3 scripts/garrison_build.py [--check]
The small raw cache is ignored; all published numbers are reproducible from DAT.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from dat_source import CACHE, DAT, _venv_python, fetch_dat, load
from effects_build import CIV_DAT

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/data/garrison.json'
IDS = (83, 293, 109, 79, 234, 235)
ATTRS = {2: 'capacity', 9: 'attack', 10: 'reload', 102: 'total', 107: 'max', 130: 'firepower'}
# Technologies that influence the supported buildings or villager firepower.
TECHS = (3, 47, 199, 200, 201, 482, 484, 576, 608)

DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1])
def rec(u):
    t=u.type_50;c=u.creatable
    return {'class':u.class_,'attack':next((a.amount for a in t.attacks if a.class_==3),0),
            'reload':t.reload_time,'capacity':u.garrison_capacity,'firepower':t.garrison_firepower,
            'total':c.total_projectiles,'max':c.max_total_projectiles,'projectile':t.projectile_unit_id}
json.dump({c.name:{str(i):rec(c.units[i]) for i in (83,293,109,79,234,235)} for c in d.civs[1:]},open(sys.argv[2],'w'))
'''


def bases():
    p = fetch_dat()
    cache = CACHE / ('garrison.raw.v1.%s.json' % hashlib.sha256(p.read_bytes()).hexdigest()[:12])
    if not cache.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(p), str(cache)])
    return json.loads(cache.read_text())


def decode(commands, units):
    """Only attribute changes relevant to arrow counts; preserve target/type/order."""
    out = []
    for c in commands:
        if c['Type'] not in (0, 4, 5) or c['C'] not in ATTRS:
            continue
        targets = [i for i in IDS if c['A'] == i or (c['A'] == -1 and c['B'] == units[str(i)]['class'])]
        if not targets:
            continue
        v = c['D']
        if c['C'] == 9:
            # Genie encodes armor class in the high byte; melee attacks do not
            # contribute to the villagers' flat garrison firepower.
            if int(abs(v)) // 256 != 3:
                continue
            v = (-1 if v < 0 else 1) * (int(abs(v)) % 256)
        out.extend({'unit': i, 'stat': ATTRS[c['C']], 'op': {0: 'set', 4: 'add', 5: 'mul'}[c['Type']], 'value': v} for i in targets)
    return out


def generate(d, raw):
    civs = json.loads((ROOT / 'src/data/civs.json').read_text())
    techs = d['Techs']
    names = {CIV_DAT.get(c['Name'], c['Name']): (i, c) for i, c in enumerate(d['Civs'])}
    baseline = raw[names[civs[0]['en']][1]['Name']]
    # Stop a future patch from silently treating a civilization-specific base
    # unit or a different male/female villager as the common baseline.
    different = [c['en'] for c in civs if raw[names[c['en']][1]['Name']] != baseline]
    if different:
        raise ValueError('Civilization base differences need explicit support: ' + ', '.join(different))
    if baseline['83'] != baseline['293']:
        raise ValueError('Male/female garrison properties differ')

    def effects(eid):
        return decode(d['Effects'][eid]['EffectCommands'], baseline) if eid >= 0 else []

    def rule(tid):
        t = techs[tid]
        return {'id': tid, 'requires': [x for x in t['RequiredTechs'] if x >= 0],
                'count': t['RequiredTechCount'], 'effects': effects(t['EffectID'])}

    result = {'meta': {'generatedBy': 'scripts/garrison_build.py', 'patch': DAT['patch'],
                       'repo': DAT['repo'], 'commit': DAT['commit'], 'sha256': DAT['sha256']},
              'units': baseline, 'techs': {str(i): rule(i) for i in TECHS},
              'conditional': [rule(i) for i, t in enumerate(techs) if t['Civ'] == -1 and t['ResearchLocation'] < 1 and effects(t['EffectID'])],
              'civs': {}}
    for civ in civs:
        k, c = names[civ['en']]
        automatic = [{'id': -1, 'requires': [], 'count': 0, 'effects': effects(c['TechTreeID'])}]
        automatic += [rule(i) for i, t in enumerate(techs) if t['Civ'] == k and t['ResearchLocation'] < 1 and '+ BL' not in t['Name'] and effects(t['EffectID'])]
        for entry in automatic:
            if any(tid not in (101, 102, 103, 104) for tid in entry['requires']):
                raise ValueError('Unverified conditional civilization garrison bonus: %s tech %s' % (civ['en'], entry['id']))
        team = effects(c['TeamBonusID'])
        if team:
            automatic.append({'id': -2, 'requires': [], 'count': 0, 'effects': team})
        # Explicitly free and instantaneous, not merely one zero resource cost.
        commands = d['Effects'][c['TechTreeID']]['EffectCommands']
        free = [tid for tid in TECHS if any(x['Type'] == 103 and x['A'] == tid and x['C'] == 0 and x['D'] == 0 for x in commands)
                and all(any(x['Type'] == 101 and x['A'] == tid and x['B'] in (r[0], -1) and x['C'] == 0 and x['D'] == 0 for x in commands)
                        for r in techs[tid]['Cost'] if r[1] > 0)]
        result['civs'][civ['en']] = {'automatic': [r for r in automatic if r['effects']], 'free': free}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = generate(load(), bases())
    text = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            raise SystemExit('garrison.json differs from pinned .dat; run python3 scripts/garrison_build.py')
        print('garrison.json reproducible from pinned .dat')
    else:
        OUT.write_text(text)
        print('wrote', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
