#!/usr/bin/env python3
"""#227: reproducible ordinary-villager construction inputs from pinned DE185872.

Keep actual TC construction annexes separate from the completed TC object.
No game client is executed. python3 scripts/construction_build.py [--check]
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat, load
from effects_build import CIV_DAT, TEAM_TECHS

OUT = ROOT / 'src/data/construction.json'
DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); catalog=json.load(open(sys.argv[2])); forms={}
for bid in catalog:
    current=621 if bid==109 else bid; seq=[current]
    for eid in (101,102,103):
        for cmd in d.effects[eid].effect_commands:
            if cmd.type==3 and cmd.a in seq:current=cmd.b
        seq.append(current)
    forms[bid]=seq
ids={i for seq in forms.values() for i in seq}|{118,212}
def rec(u):
    return {'class':u.class_,'time':u.creatable.train_locations[0].train_time if u.creatable and u.creatable.train_locations else 0,
            'at':[x.unit_id for x in u.creatable.train_locations] if u.creatable else [],
            'rate':u.bird.work_rate if u.bird else 0}
json.dump({'forms':forms,'units':{c.name:{str(i):rec(c.units[i] or d.civs[1].units[i]) for i in sorted(ids)} for c in d.civs[1:]}},open(sys.argv[3],'w'))
'''


def raw_units(buildings):
    path = fetch_dat()
    key = hashlib.sha256((DUMP + json.dumps(buildings) + DAT['sha256']).encode()).hexdigest()[:12]
    output = CACHE / ('construction.%s.json' % key)
    if not output.exists():
        manifest = CACHE / ('construction.%s.ids.json' % key)
        manifest.write_text(json.dumps(buildings))
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(manifest), str(output)])
    return json.loads(output.read_text())


def build(d, units):
    buildings = json.loads((ROOT / 'src/data/buildings.json').read_text())
    civs = json.loads((ROOT / 'src/data/civs.json').read_text())
    catalog_techs = {t['id'] for t in json.loads((ROOT / 'src/data/techs.json').read_text())}
    relevant_ids = {int(i) for objects in units['units'].values() for i in objects}
    classes = {r['class'] for objects in units['units'].values() for r in objects.values()}

    def commands(eid):
        if eid < 0: return []
        return [dict(c, index=i) for i, c in enumerate(d['Effects'][eid]['EffectCommands'])
                if c['Type'] in (0, 4, 5, 10, 14, 15) and c['C'] in (13, 101)
                and (c['A'] in relevant_ids or c['A'] == -1 and c['B'] in classes)]

    def rule(i):
        t = d['Techs'][i]
        return {'id': i, 'name': t['Name'], 'effect': t['EffectID'], 'requires': [x for x in t['RequiredTechs'] if x >= 0],
                'count': t['RequiredTechCount'], 'commands': commands(t['EffectID'])}

    research = {str(i): rule(i) for i in sorted(catalog_techs) if commands(d['Techs'][i]['EffectID'])}
    out = {'meta': {'generatedBy': 'scripts/construction_build.py', 'patch': DAT['patch'], 'sha256': DAT['sha256'],
                    'source': '%s@%s/%s' % (DAT['repo'], DAT['commit'], DAT['path']), 'engineVerifiedInPinnedBuild': False},
           'buildings': {}, 'research': research, 'civs': {}}
    for b in buildings:
        forms = units['forms'][str(b['id'])]
        supported = all(118 in objects[str(form)]['at'] for objects in units['units'].values() for form in forms)
        out['buildings'][str(b['id'])] = {'forms': forms, 'supported': supported,
                                         'reason': '渔栅由渔船建造，本工具仅支持普通村民。' if not supported and b['id'] == 199 else
                                         ('原始施工地点未确认普通村民，本组合暂停。' if not supported else '')}
    for c in civs:
        name = next((n for n in units['units'] if CIV_DAT.get(n, n) == c['en']), None)
        if name is None: raise ValueError('Missing civilization ' + c['en'])
        dc = next(x for x in d['Civs'] if x['Name'] == name)
        team_hidden = {i for ids in TEAM_TECHS.values() for i in ids}
        eligible = {i for i, t in enumerate(d['Techs']) if t['Civ'] in (-1, d['Civs'].index(dc)) and t['ResearchLocation'] <= 0
                    and (i not in team_hidden or i in TEAM_TECHS.get(c['en'], []))}
        roots = {i for i in eligible if commands(d['Techs'][i]['EffectID'])}
        pending = list(roots)
        while pending:
            i = pending.pop()
            for p in d['Techs'][i]['RequiredTechs']:
                if p >= 0 and p in eligible and p not in roots:
                    roots.add(p); pending.append(p)
        out['civs'][c['en']] = {'units': units['units'][name], 'tree': commands(dc['TechTreeID']),
                                'team': commands(dc['TeamBonusID']), 'automatic': [rule(i) for i in sorted(roots)]}
    return out


def compact(data):
    """Intern identical inputs without dropping any calculation/provenance field."""
    result = dict(data, civs={})
    for field, pool in (('units', 'unitSets'), ('automatic', 'automaticSets')):
        result[pool] = []
        keys = {}
        for name, civ in data['civs'].items():
            key = json.dumps(civ[field], sort_keys=True, separators=(',', ':'))
            if key not in keys:
                keys[key] = len(result[pool])
                result[pool].append(civ[field])
            result['civs'].setdefault(name, dict(civ))[field] = keys[key]
    return result


def expand(data):
    """The source regressions inspect the exact same expanded inputs as the UI."""
    return dict((key, value) for key, value in data.items() if key not in ('unitSets', 'automaticSets')) | {
        'civs': {name: dict(civ, units=data['unitSets'][civ['units']], automatic=data['automaticSets'][civ['automatic']])
                 for name, civ in data['civs'].items()}}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
    buildings = [b['id'] for b in json.loads((ROOT / 'src/data/buildings.json').read_text())]
    result = json.dumps(compact(build(load(), raw_units(buildings))), ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != result: raise SystemExit('construction.json is not reproducible')
        print('construction.json reproducible: 38 buildings / 56 civilizations')
    else:
        OUT.write_text(result); print('generated', OUT)


if __name__ == '__main__': main()
