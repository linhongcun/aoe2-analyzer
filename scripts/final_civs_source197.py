#!/usr/bin/env python3
"""Bounded fixed-DAT physical evidence for the final #197 civilizations.

No farm placement, Folwark collection, finite-food or current-client behavior is
inferred here. Complete technology families are indexed by build_sim_source.py.
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat, load

OUTPUT = ROOT / 'docs/design/final-civs197-source-physical.json'
DUMP = r'''
import dataclasses,json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); base=d.civs[1]
def population(u):
    return next(dataclasses.asdict(x) for x in u.creatable.resource_costs if x.type==4)
def folwark(civ,uid):
    u=civ.units[uid]
    return {'unit':uid,'type':u.type,'class':u.class_,'buildTech':u.building.tech_id,
            'trainAt':[[x.unit_id,x.train_time] for x in u.creatable.train_locations],
            'trainTime':u.creatable.train_locations[0].train_time,
            'cost':[[x.type,x.amount,x.flag] for x in u.creatable.resource_costs if x.type>=0],
            'workRate':u.bird.work_rate,
            'populationSource':next(dataclasses.asdict(x) for x in u.resource_storages if x.type==4)}
def farm(civ,uid):
    u=civ.units[uid]
    return {'unit':uid,'type':u.type,'class':u.class_,
            'workRate':round(u.bird.work_rate,4),'capacity':u.resource_capacity}
result={'version':d.version,'engineVerifiedInPinnedBuild':False}
for name in ('Poles','Romans'):
    cid,civ=next((i,c) for i,c in enumerate(d.civs) if c.name==name)
    scout=int(civ.resources[263])
    row={'civId':cid,'treeId':civ.tech_tree_id,'teamId':civ.team_bonus_id,
         'resourceDifferencesFromBase':[{'resource':i,'base':a,name:b}
             for i,(a,b) in enumerate(zip(base.resources,civ.resources)) if a!=b],
         'stockResourceSlots':[{'resource':i,'base':base.resources[i],name:civ.resources[i]}
             for i in (0,1,2,3,91,92,93,94)],
         'startingScout':{'resource':263,'unit':scout,'populationSource':population(civ.units[scout])},
         'villagerPopulation':[{'unit':uid,'populationSource':population(civ.units[uid])} for uid in (83,293)],
         'farms':[farm(civ,uid) for uid in (50,1187)],
         'currentEconomicActorsIdenticalToBase':[
             {'unit':uid,'identical':civ.units[uid]==base.units[uid]}
             for uid in (13,50,1187,83,293,118,212,259,214)]}
    if name=='Poles':
        row['folwarks']=[folwark(civ,uid) for uid in (1734,1711,1720)]
        row['mill']=folwark(civ,68)
        row['farmFoodResources']=[{'resource':rid,'value':civ.resources[rid]} for rid in (36,69,237,238,239)]
    result[name]=row
print(json.dumps(result,ensure_ascii=False,sort_keys=True))
'''


def load_physical():
    path = fetch_dat()  # Verify the original pinned bytes even when reusing cache.
    key = hashlib.sha256((DUMP + DAT['sha256']).encode()).hexdigest()[:16]
    cached = CACHE / ('final-civs197-physical.%s.json' % key)
    if not cached.exists():
        raw = subprocess.check_output([str(_venv_python()), '-c', DUMP, str(path)], text=True)
        json.loads(raw)
        cached.write_text(raw)
    return json.loads(cached.read_text())


def build():
    from eco_build import poles_infrastructure, roman_farm
    data = load()
    return {'schema': 'final-civs197-physical/1', 'generator': 'scripts/final_civs_source197.py',
            'source': {key: DAT[key] for key in ('repo', 'commit', 'path', 'sha256')},
            'physical': load_physical(), 'polesInfrastructure': poles_infrastructure(data, 38),
            'romanFarm': roman_farm()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = json.dumps(build(), ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if len(result.encode()) > 64 * 1024:
        raise SystemExit('Final-civilization physical source report exceeds 64 KiB')
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != result:
            raise SystemExit('Final-civilization physical source report is not reproducible')
        print('Final-civilization physical source report reproducible')
    else:
        OUTPUT.write_text(result)
        print('generated', OUTPUT)


if __name__ == '__main__':
    main()
