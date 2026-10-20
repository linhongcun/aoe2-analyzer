#!/usr/bin/env python3
"""Derive #229 static building healing inputs from the pinned DE .dat.

No game client is run. Eligibility is an explicit conservative model policy,
not an invented can-be-healed boolean in the original data.
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat, load

OUT = ROOT / 'src/data/garrison_healing.json'
ORGANIC_CLASSES = {0, 4, 6, 12, 18, 23, 36, 43, 44, 47, 59}
DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); ids=json.load(open(sys.argv[2]))
def rec(u):
    if not u:return None
    b=u.building
    return {'hp':u.hit_points,'class':u.class_,'type':u.type,
            'healRate':b.garrison_heal_rate if b else None,
            'repairRate':b.garrison_repair_rate if b else None}
base={str(i):rec(d.civs[1].units[i] or d.civs[0].units[i]) for i in ids}
overrides={c.name:{str(i):rec(c.units[i]) for i in ids if c.units[i] and rec(c.units[i])!=base[str(i)]} for c in d.civs[1:]}
json.dump({'units':base,'overrides':overrides},open(sys.argv[3],'w'))
'''


def raw_data():
    ids = sorted(int(i) for i in json.loads((ROOT / 'src/data/garrison_general.json').read_text())['units'])
    path = fetch_dat()
    key = hashlib.sha256((DUMP + json.dumps(ids)).encode()).hexdigest()[:12]
    stem = 'garrison-healing.%s.%s' % (hashlib.sha256(path.read_bytes()).hexdigest()[:12], key)
    cache = CACHE / (stem + '.json')
    if not cache.exists():
        manifest = CACHE / (stem + '.ids.json')
        manifest.write_text(json.dumps(ids))
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(manifest), str(cache)])
    return json.loads(cache.read_text())


def eligibility(unit, uid):
    if uid == 285 or unit['type'] < 70:
        return 'ineligible'
    if unit['type'] == 70 and unit['class'] in ORGANIC_CLASSES:
        return 'organic'
    return 'unverified'


def generate(d, raw):
    general = json.loads((ROOT / 'src/data/garrison_general.json').read_text())
    units = raw['units']
    if any(raw['overrides'].values()):
        raise ValueError('New civilization base healing/HP override requires a model audit')
    for key, unit in units.items():
        if not unit:
            raise ValueError('Missing healing object ' + key)
        unit['eligibility'] = eligibility(unit, int(key))
    # Attribute 108 is a building rate in HP/game-second. Type 202 is not
    # interpreted as another global ordinary attribute multiplication.
    effects = {}
    for tid, tech in enumerate(d['Techs']):
        if tech['EffectID'] < 0:
            continue
        commands = []
        for c in d['Effects'][tech['EffectID']]['EffectCommands']:
            if c['Type'] not in (0, 4, 5) or c['C'] != 108:
                continue
            targets = sorted(int(k) for k, u in units.items()
                             if c['A'] == int(k) or c['A'] == -1 and c['B'] == u['class'])
            commands.append({'units': targets, 'op': {0: 'set', 4: 'add', 5: 'mul'}[c['Type']], 'value': c['D']})
        if commands:
            effects[str(tid)] = {'requires': [i for i in tech['RequiredTechs'] if i >= 0],
                                 'count': tech['RequiredTechCount'], 'effects': commands}
    # The currently supported pinned build has one direct researched rate
    # technology. A new automatic/conditional rate source must be audited
    # before a later data update can silently change this model.
    if set(effects) != {'441'}:
        raise ValueError('New healing-rate technology requires a model audit: ' + ','.join(effects))
    return {
        'meta': {'generatedBy': 'scripts/garrison_healing_build.py', 'patch': DAT['patch'],
                 'repo': DAT['repo'], 'commit': DAT['commit'], 'sha256': DAT['sha256'],
                 'engineVerifiedInPinnedBuild': False,
                 'fields': ['Unit.hit_points', 'Unit.class_', 'Unit.type',
                            'Building.garrison_heal_rate', 'Building.garrison_repair_rate',
                            'EffectCommand attribute 108'],
                 'eligibilityPolicy': 'organic-classes-v1; special mechanical, herdable and mobile-building cases paused'},
        'units': units,
        'baseOverrides': {name: {k: v for k, v in raw['overrides'].get(name, {}).items()}
                          for name in raw['overrides'] if raw['overrides'][name]},
        'rateTechs': effects,
        'organicClasses': sorted(ORGANIC_CLASSES),
        'hostIds': sorted(int(k) for k in general['buildings']
                          if int(k) in json.loads((ROOT / 'src/data/garrison_hosts.json').read_text())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = generate(load(), raw_data())
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            raise SystemExit('garrison_healing.json differs from pinned .dat; rerun scripts/garrison_healing_build.py')
    else:
        OUT.write_text(text)
    print('garrison healing data %s from pinned .dat: %d objects, %d hosts' % (
        'reproducible' if args.check else 'generated', len(data['units']), len(data['hostIds'])))


if __name__ == '__main__':
    main()
