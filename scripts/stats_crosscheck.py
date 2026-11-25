#!/usr/bin/env python3
"""基础数值对账：data/game/units.json / buildings.json（aoe2techtree）vs 原版 .dat（dat_source，185872）。
用法：python3 scripts/stats_crosscheck.py [--json out.json]   不修改任何数据文件。
双射程（#22）：带远程蓄力攻击的单位（火焰弓箭手、楼船…），.dat 的 Range 是对建筑射程，
对单位射程为 DisplayedRange（= Range − 蓄力射程差）。站点 rng 比对单位射程，rng + rngBd（差值，#38）比对建筑射程。
允许差异清单：data/sources/stats_allowlist.json（每条须写 reason）；清单外差异 → 退出码 1。"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from attack_classes import ATTACK_CLASS_NAMES
from dat_source import load

ROOT = Path(__file__).resolve().parent.parent


def unit_range(u):
    """对单位射程：蓄力远程单位用 DisplayedRange，其余用 Range。"""
    dr = u.get('DisplayedRange') or 0
    return dr if u.get('ChargeType') and dr and dr != u['Range'] else u['Range']


def building_range(u):
    """对建筑射程（仅当与对单位射程不同时有意义）。"""
    return u['Range']


def load_allowlist(path=ROOT / 'data/sources/stats_allowlist.json'):
    if not path.exists(): return {}
    items = json.load(open(path))
    for it in items:
        if not it.get('reason'): raise SystemExit('✗ allowlist 条目缺少 reason：%r' % it)
    return {(it['en'], it['key']): it for it in items}


def dat_train_time(u, building_id=None):
    """按目录主建筑匹配 .dat TrainAt 槽位；未命中槽位或无 TrainAt 时回退 TrainTime。"""
    if building_id is not None:
        for slot in u.get('TrainAt') or ():
            if isinstance(slot, list) and len(slot) >= 2 and slot[0] == building_id:
                return slot[1]
    return u.get('TrainTime')


def dat_stats(u, main, building_id=None):
    at, ar = dict(map(tuple, u['Attacks'])), dict(map(tuple, u['Armours']))
    s = {'hp': u['HP'], 'los': round(u['LOS'], 2), 'spd': round(u['Speed'], 3), 'ma': ar.get(4, 0), 'pa': ar.get(3, 0),
         'rng': round(unit_range(u), 2), 'rof': round(u['Reload'], 3), 'acc': u['Accuracy'], 'minr': round(u['MinRange'], 2)}
    if main: s['atk'] = at.get(main, 0)
    tt = dat_train_time(u, building_id)
    if tt is not None: s['tt'] = tt
    return s


def attack_class_name(entry):
    """提取攻击类别名称，兼容单位 [名称, 数值] 与建筑 {classId, amount, label?}。"""
    if isinstance(entry, dict):
        class_id = entry.get('classId')
        if type(class_id) is int and class_id in ATTACK_CLASS_NAMES:
            return ATTACK_CLASS_NAMES[class_id]
        return entry.get('label')
    return entry[0]


def attack_entry(entry):
    """提取 (攻击类别名称, 数值)，兼容单位 [名称, 数值] 与建筑 {classId, amount, label?}。"""
    if isinstance(entry, dict):
        return attack_class_name(entry), entry.get('amount')
    return entry[0], entry[1]


def main_attack_class(obj, is_building):
    """确定与 .dat 比对 atk 的主攻击类别（4 近战 / 3 穿刺）：先非零（近战优先于穿刺），再显式零值（近战优先于穿刺）。"""
    entries = [attack_entry(a) for a in obj.get('atks') or []]
    nonzero = {name for name, amount in entries if amount}
    if '近战' in nonzero:
        return 4
    if '穿刺' in nonzero:
        return 3
    names = {name for name, _ in entries}
    if '近战' in names:
        return 4
    if '穿刺' in names:
        return 3
    return 3 if is_building and obj.get('atk') else None


def main(units=None, blds=None, d=None):
    d = d or load(); U = d['Civs'][1]['Units']
    units = units if units is not None else json.load(open(ROOT / 'data/game/units.json'))
    blds = blds if blds is not None else json.load(open(ROOT / 'data/game/buildings.json'))
    diffs = []
    for o, isb in [(x, False) for x in units] + [(x, True) for x in blds]:
        u = U[o['id']] if o['id'] < len(U) else None
        if not u: diffs.append((o['en'], 'missing', None, None)); continue
        ds = dat_stats(u, main_attack_class(o, isb), None if isb else o.get('b'))
        if o.get('rngBd'):
            o = {**o, 'rngB': round(o['rng'] + o['rngBd'], 2)}
            ds['rngB'] = round(building_range(u), 2)
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
