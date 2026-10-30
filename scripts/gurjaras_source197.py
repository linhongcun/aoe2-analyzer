#!/usr/bin/env python3
"""Bounded fixed-DAT evidence for Gurjara bushes and the ordinary initial scout.

No herdable-income formula or current-client behavior is inferred from this
physical record. Technology commands are indexed separately by build_sim_source.
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat

OUTPUT = ROOT / 'docs/design/gurjaras197-source-physical.json'
DUMP = r'''
import dataclasses,json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); base=d.civs[1]
civ_id,civ=next((i,c) for i,c in enumerate(d.civs) if c.name=='Gurjaras')
scout_id=int(civ.resources[263]); scout=civ.units[scout_id]; bush=d.civs[0].units[1549]
pop=lambda u:next(dataclasses.asdict(x) for x in u.creatable.resource_costs if x.type==4)
print(json.dumps({'version':d.version,'civ':{'id':civ_id,'name':civ.name,
    'treeId':civ.tech_tree_id,'teamId':civ.team_bonus_id},
    'resourceDifferencesFromBase':[{'resource':i,'base':a,'Gurjaras':b}
        for i,(a,b) in enumerate(zip(base.resources,civ.resources)) if a!=b],
    'stockResourceSlots':[{'resource':i,'base':base.resources[i],'Gurjaras':civ.resources[i]}
        for i in (0,1,2,3,91,92,93,94)],
    'startingScout':{'resource':263,'unit':scout_id,'name':scout.name,
        'populationCost':pop(scout)},
    'villager':{'unit':83,'populationCost':pop(civ.units[83])},
    'townCenter':{'unit':109,'populationStorage':dataclasses.asdict(civ.units[109].resource_storages[0])},
    'extraForageBush':{'unit':1549,'owner':'Gaia','name':bush.name,'type':bush.type,'class':bush.class_,
        'resourceStorages':[dataclasses.asdict(x) for x in bush.resource_storages]},
    'engineVerifiedInPinnedBuild':False},ensure_ascii=False,sort_keys=True))
'''


def build():
    path = fetch_dat()  # Verify original bytes even when reusing the derived cache.
    key = hashlib.sha256((DUMP + DAT['sha256']).encode()).hexdigest()[:16]
    cached = CACHE / ('gurjaras197-physical.%s.json' % key)
    if not cached.exists():
        raw = subprocess.check_output([str(_venv_python()), '-c', DUMP, str(path)], text=True)
        json.loads(raw)
        cached.write_text(raw)
    return {'schema': 'gurjaras197-physical/1', 'generator': 'scripts/gurjaras_source197.py',
            'source': {key: DAT[key] for key in ('repo', 'commit', 'path', 'sha256')},
            **json.loads(cached.read_text())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = json.dumps(build(), ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if len(result.encode()) > 64 * 1024:
        raise SystemExit('Gurjara physical source report exceeds 64 KiB')
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != result:
            raise SystemExit('Gurjara physical source report is not reproducible')
        print('Gurjara physical source report reproducible')
    else:
        OUTPUT.write_text(result)
        print('generated', OUTPUT)


if __name__ == '__main__':
    main()
