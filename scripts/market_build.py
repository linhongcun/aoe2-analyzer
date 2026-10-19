#!/usr/bin/env python3
"""Export market fees from the pinned .dat; keep engine rules and their evidence separate.

python3 scripts/market_build.py [--check]
The proprietary .dat and parsed cache are never distributed.
"""
import json
import subprocess
import sys
from pathlib import Path

from dat_source import DAT, CACHE, _venv_python, fetch_dat

ROOT = Path(__file__).resolve().parent.parent
DUMP = r'''
import json, sys
from genieutils.datfile import DatFile
d = DatFile.parse(sys.argv[1])
json.dump({'baseFee': round(d.civs[1].resources[78], 6),
 'feeEffects': [{'tech': i, 'civ': t.civ, 'name': t.name,
                'fee': round(c.d, 6)} for i, t in enumerate(d.techs)
               if t.effect_id >= 0 for c in d.effects[t.effect_id].effect_commands
               if c.type == 1 and c.a == 78 and c.b == 0]}, open(sys.argv[2], 'w'))
'''


def build(raw, techs, rules):
    fees = {r['tech']: r for r in raw['feeEffects']}
    guilds = next(t for t in techs if t['id'] == 15)
    special = next(t for t in techs if t['id'] == 506)
    assert fees[15]['civ'] == -1 and fees[355]['civ'] == 9 and fees[506]['civ'] == 20
    return {'meta': {'generatedBy': 'scripts/market_build.py', 'patch': DAT['patch'],
                     'datCommit': DAT['commit'], 'datSha256': DAT['sha256'],
                     'feeResource': 78, 'engineVerifiedInPinnedBuild': False},
            'baseFee': raw['baseFee'],
            'guilds': {'tech': 15, 'fee': fees[15]['fee'], 'civs': guilds['civs']},
            'civFees': {'Saracens': {'tech': 355, 'fee': fees[355]['fee']}},
            'uniqueFees': {c: {'tech': 506, 'name': special['zh'], 'fee': fees[506]['fee']} for c in special['civs']},
            'engine': rules}


def main():
    path = fetch_dat()
    cache = CACHE / ('market.v1.%s.json' % DAT['sha256'][:12])
    if not cache.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(cache)])
    result = build(json.loads(cache.read_text()), json.loads((ROOT / 'src/data/techs.json').read_text()),
                   json.loads((ROOT / 'scripts/market_rules.json').read_text()))
    content = json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n'
    target = ROOT / 'src/data/market.json'
    if '--check' in sys.argv:
        if target.read_text() != content:
            raise SystemExit('market.json is stale; run python3 scripts/market_build.py')
    else:
        target.write_text(content)
    print('市场数据：固定 .dat 费率及独立引擎规则配置校验通过')


if __name__ == '__main__':
    main()
