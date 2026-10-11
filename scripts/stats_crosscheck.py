#!/usr/bin/env python3
"""基础数值对账：src/data/units.json / buildings.json（aoe2techtree）vs 原版 .dat（dat_source，185872）。
用法：python3 scripts/stats_crosscheck.py [--json out.json]   不修改任何数据文件。
双射程（#22）：带远程蓄力攻击的单位（火焰弓箭手、楼船…），.dat 的 Range 是对建筑射程，
对单位射程为 DisplayedRange（= Range − 蓄力射程差）。站点 rng 比对单位射程，rngB 比对建筑射程。
允许差异清单：scripts/stats_allowlist.json（每条须写 reason）；清单外差异 → 退出码 1。"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dat_source import load

ROOT = Path(__file__).resolve().parent.parent


def unit_range(u):
    """对单位射程：蓄力远程单位用 DisplayedRange，其余用 Range。"""
    dr = u.get('DisplayedRange') or 0
    return dr if u.get('ChargeType') and dr and dr != u['Range'] else u['Range']


def building_range(u):
    """对建筑射程（仅当与对单位射程不同时有意义）。"""
    return u['Range']


def load_allowlist(path=ROOT / 'scripts/stats_allowlist.json'):
    if not path.exists(): return {}
    items = json.load(open(path))
    for it in items:
        if not it.get('reason'): raise SystemExit('✗ allowlist 条目缺少 reason：%r' % it)
    return {(it['en'], it['key']): it for it in items}


def dat_stats(u, main):
    at, ar = dict(map(tuple, u['Attacks'])), dict(map(tuple, u['Armours']))
    s = {'hp': u['HP'], 'los': round(u['LOS'], 2), 'spd': round(u['Speed'], 3), 'ma': ar.get(4, 0), 'pa': ar.get(3, 0),
         'rng': round(unit_range(u), 2), 'rof': round(u['Reload'], 3), 'acc': u['Accuracy'], 'minr': round(u['MinRange'], 2)}
    if main: s['atk'] = at.get(main, 0)
    if u.get('TrainTime') is not None: s['tt'] = u['TrainTime']
    return s


def main(units=None, blds=None, d=None):
    d = d or load(); U = d['Civs'][1]['Units']
    units = units if units is not None else json.load(open(ROOT / 'src/data/units.json'))
    blds = blds if blds is not None else json.load(open(ROOT / 'src/data/buildings.json'))
    diffs = []
    for o, isb in [(x, False) for x in units] + [(x, True) for x in blds]:
        u = U[o['id']] if o['id'] < len(U) else None
        if not u: diffs.append((o['en'], 'missing', None, None)); continue
        names = [a[0] for a in o.get('atks', [])]
        main = 4 if '近战' in names else 3 if '穿刺' in names else (3 if isb and o.get('atk') else None)
        ds = dat_stats(u, main)
        if 'rngB' in o: ds['rngB'] = round(building_range(u), 2)
        for k, v in ds.items():
            if k not in o or (isb and k in ('spd', 'acc', 'tt')): continue
            ov = o[k]
            if isinstance(ov, (int, float)) and abs(ov - v) > (0.011 if k in ('spd', 'rof', 'los', 'rng', 'rngB') else 0.001):
                diffs.append((o['en'], k, ov, v))
    allow = load_allowlist()
    bad = [r for r in diffs if (r[0], r[1]) not in allow]
    for r in diffs: print('%s %-28s %-5s site=%-8s dat=%s' % ((('  ' if (r[0], r[1]) in allow else '✗ '),) + tuple(r)))
    print('diffs', len(diffs), 'allowlisted', len(diffs) - len(bad), 'unlisted', len(bad), 'objects', len(units) + len(blds))
    if '--json' in sys.argv: json.dump(diffs, open(sys.argv[sys.argv.index('--json') + 1], 'w'), ensure_ascii=False)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
