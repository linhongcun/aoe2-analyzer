#!/usr/bin/env python3
"""基础数值对账：src/data/units.json / buildings.json（aoe2techtree）vs 原版 .dat（dat_source，185872）。
用法：python3 scripts/stats_crosscheck.py [--json out.json]   不修改任何数据文件。"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dat_source import load

ROOT = Path(__file__).resolve().parent.parent


def dat_stats(u, main):
    at, ar = dict(map(tuple, u['Attacks'])), dict(map(tuple, u['Armours']))
    s = {'hp': u['HP'], 'los': round(u['LOS'], 2), 'spd': round(u['Speed'], 3), 'ma': ar.get(4, 0), 'pa': ar.get(3, 0),
         'rng': round(u['Range'], 2), 'rof': round(u['Reload'], 3), 'acc': u['Accuracy'], 'minr': round(u['MinRange'], 2)}
    if main: s['atk'] = at.get(main, 0)
    if u.get('TrainTime') is not None: s['tt'] = u['TrainTime']
    return s


def main():
    d = load(); U = d['Civs'][1]['Units']
    units = json.load(open(ROOT / 'src/data/units.json')); blds = json.load(open(ROOT / 'src/data/buildings.json'))
    diffs = []
    for o, isb in [(x, False) for x in units] + [(x, True) for x in blds]:
        u = U[o['id']] if o['id'] < len(U) else None
        if not u: diffs.append((o['en'], 'missing', None, None)); continue
        names = [a[0] for a in o.get('atks', [])]
        main = 4 if '近战' in names else 3 if '穿刺' in names else (3 if isb and o.get('atk') else None)
        ds = dat_stats(u, main)
        for k, v in ds.items():
            if k not in o or (isb and k in ('spd', 'acc', 'tt')): continue
            ov = o[k]
            if isinstance(ov, (int, float)) and abs(ov - v) > (0.011 if k in ('spd', 'rof', 'los', 'rng') else 0.001):
                diffs.append((o['en'], k, ov, v))
    for r in diffs: print('%-28s %-5s site=%-8s dat=%s' % r)
    print('diffs', len(diffs), 'objects', len(units) + len(blds))
    if '--json' in sys.argv: json.dump(diffs, open(sys.argv[sys.argv.index('--json') + 1], 'w'), ensure_ascii=False)


if __name__ == '__main__':
    main()
