#!/usr/bin/env python3
"""Bounded Chinese TC storage / technology-type evidence from the current pinned DAT.

The standard technology closure remains in build_sim_source.py. These fields are
not present in its normalized export; no client behavior is asserted by this file.
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat

OUTPUT = ROOT / 'docs/design/chinese197-source-physical.json'
DUMP = r'''
import dataclasses,json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); base=d.civs[1]
civ_id,civ=next((i,c) for i,c in enumerate(d.civs) if c.name=='Chinese')
def storage(c,uid):
    u=c.units[uid]
    return {'unit':uid,'name':u.name,'type':u.type,'class':u.class_,
            'resourceStorages':[dataclasses.asdict(s) for s in u.resource_storages]}
ids=(101,102,103,14,22,199,202,203,408)
print(json.dumps({'version':d.version,'civ':{'id':civ_id,'name':civ.name,
                  'treeId':civ.tech_tree_id,'teamId':civ.team_bonus_id},
    'resourcesDifferentFromBase':[{'id':i,'base':a,'Chinese':b}
        for i,(a,b) in enumerate(zip(base.resources,civ.resources)) if a!=b],
    'townCenters':{label:[storage(c,uid) for uid in (109,71,141,142,444)]
                   for label,c in [('base',base),('Chinese',civ)]},
    'researchTypes':[{'tech':tid,'raw':dataclasses.asdict(d.techs[tid])} for tid in ids]},
    ensure_ascii=False,sort_keys=True))
'''


def build():
    # fetch_dat checks original bytes even when the derived cache already exists.
    path = fetch_dat()
    key = hashlib.sha256((DUMP + DAT['sha256']).encode()).hexdigest()[:16]
    cached = CACHE / ('chinese197-physical.%s.json' % key)
    if not cached.exists():
        raw = subprocess.check_output([str(_venv_python()), '-c', DUMP, str(path)], text=True)
        json.loads(raw)
        cached.write_text(raw)
    return {'schema': 'chinese197-physical/1', 'generator': 'scripts/chinese_source197.py',
            'source': {key: DAT[key] for key in ('repo', 'commit', 'path', 'sha256')},
            'engineVerifiedInPinnedBuild': False, **json.loads(cached.read_text())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = json.dumps(build(), ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if len(result.encode()) > 64 * 1024:
        raise SystemExit('Chinese physical source report exceeds 64 KiB')
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != result:
            raise SystemExit('Chinese physical source report is not reproducible')
        print('Chinese physical source report reproducible')
    else:
        OUTPUT.write_text(result)
        print('generated', OUTPUT)


if __name__ == '__main__':
    main()
