#!/usr/bin/env python3
"""Bounded current-DAT Mapuche settlement and training-location evidence.

The technology closure is generated separately with build_sim_source.py. This
extractor keeps only the physical fields missing from dat_source's normalized
export, without claiming a current-client experiment.
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat, load

OUTPUT = ROOT / 'docs/design/mapuche197-source-physical.json'
DUMP = r'''
import dataclasses,json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); civ_id,civ=next((i,c) for i,c in enumerate(d.civs) if c.name=='Mapuche')
def settlement(uid):
    u=civ.units[uid]
    return {'unit':uid,'type':u.type,'class':u.class_,
            'trainAt':[[x.unit_id,x.train_time] for x in u.creatable.train_locations],
            'trainTime':u.creatable.train_locations[0].train_time,
            'cost':[[x.type,x.amount,x.flag] for x in u.creatable.resource_costs if x.type>=0],
            'workRate':u.bird.work_rate,
            'populationSource':dataclasses.asdict(u.resource_storages[0])}
scout=int(civ.resources[263]); u=civ.units[scout]
print(json.dumps({'civId':civ_id,'treeId':civ.tech_tree_id,
    'settlements':[settlement(uid) for uid in (2556,2558,2560)],
    'startingScout':{'resource':263,'unit':scout,
                     'populationSource':next(dataclasses.asdict(x) for x in u.creatable.resource_costs if x.type==4)},
    'baseTrain93':{'unit':93,'trainAt':[[x.unit_id,x.train_time] for x in civ.units[93].creatable.train_locations],
                   'trainTime':civ.units[93].creatable.train_locations[0].train_time},
    'foragerDropSites':{str(uid):civ.units[uid].bird.drop_sites for uid in (120,354)},
    'engineVerifiedInPinnedBuild':False}, ensure_ascii=False,sort_keys=True))
'''


def load_physical():
    path = fetch_dat()  # Also checks actual cached DAT bytes.
    key = hashlib.sha256((DUMP + DAT['sha256']).encode()).hexdigest()[:16]
    cached = CACHE / ('mapuche197-physical.%s.json' % key)
    if not cached.exists():
        raw = subprocess.check_output([str(_venv_python()), '-c', DUMP, str(path)], text=True)
        json.loads(raw)
        cached.write_text(raw)
    return json.loads(cached.read_text())


def build():
    from eco_build import mapuche_infrastructure
    data = load()
    return {'schema': 'mapuche197-physical/1', 'generator': 'scripts/mapuche_source197.py',
            'source': {key: DAT[key] for key in ('repo', 'commit', 'path', 'sha256')},
            'physical': load_physical(), 'infrastructure': mapuche_infrastructure(data, 58)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = json.dumps(build(), ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if len(result.encode()) > 64 * 1024:
        raise SystemExit('Mapuche physical source report exceeds 64 KiB')
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != result:
            raise SystemExit('Mapuche physical source report is not reproducible')
        print('Mapuche physical source report reproducible')
    else:
        OUTPUT.write_text(result)
        print('generated', OUTPUT)


if __name__ == '__main__':
    main()
