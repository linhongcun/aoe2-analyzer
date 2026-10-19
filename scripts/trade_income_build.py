#!/usr/bin/env python3
"""#226: export trade population directly from pinned .dat resource storage 4.

No route, payout or game-client verification is inferred from this export.
"""
import argparse
import hashlib
import json
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat

OUT = ROOT / 'src/data/trade_income.json'
DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1])
out={}
for i in (17,128):
    values=[]
    for c in d.civs[1:]:
        u=c.units[i]
        if u:
            values.append(-sum(s.amount for s in u.resource_storages if s.type==4))
    assert values and len(set(values))==1 and values[0]>0, ('population differs',i,values)
    out[str(i)]={'population':values[0]}
json.dump(out,open(sys.argv[2],'w'))
'''


def build(units):
    assert set(units) == {'17', '128'}
    assert all(isinstance(v.get('population'), (int, float)) and 0 < v['population'] < 100 for v in units.values())
    return {'meta': {'generatedBy': 'scripts/trade_income_build.py', 'datSha256': DAT['sha256'],
                     'patch': DAT['patch'], 'populationSource': 'unit.resource_storages[type=4], negated; all civ templates agree',
                     'engineVerifiedInPinnedBuild': False}, 'units': units}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    dat = fetch_dat()
    key = hashlib.sha256((DAT['sha256'] + DUMP).encode()).hexdigest()[:16]
    cache = CACHE / ('trade-population.' + key + '.json')
    if not cache.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(dat), str(cache)])
    rendered = json.dumps(build(json.loads(cache.read_text())), ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != rendered:
            raise SystemExit('trade_income.json differs from pinned .dat; rerun scripts/trade_income_build.py')
    else:
        OUT.write_text(rendered)
    print('trade population: 2 units, all civ templates agree')


if __name__ == '__main__':
    main()
