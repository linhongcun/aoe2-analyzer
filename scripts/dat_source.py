#!/usr/bin/env python3
"""DE 游戏数据文件 empires2_x2_p1.dat 的唯一来源：下载（固定提交 + sha256）、校验补丁标记、解析。

来源：SiegeEngineers/auto-mods 仓库 dat/empires2_x2_p1.dat（该项目为每个新补丁重新生成 mod 所用的原版 .dat）。
.dat 版权归 Microsoft 所有：仅在构建时下载到 scripts/.cache/（已 gitignore），从不提交或随站点发布；
站点只发布由它派生的数值（src/data/*.json）。

解析：genieutils-py（SiegeEngineers，LGPL-3.0）。首次运行会在 scripts/.cache/venv 建立隔离环境安装固定版本。

用法：
  python3 scripts/dat_source.py --check     # 下载 + 校验 sha256 + 补丁标记（CI/构建前检查）
  from dat_source import load               # 返回与旧 aoe2dat full.json 同形的 dict（Techs/Effects/Civs）
"""
import hashlib, json, os, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache'
DAT = {
    'repo': 'SiegeEngineers/auto-mods',
    'commit': '0c38027504532826c9922e4db77e2c1d33554291',
    'path': 'dat/empires2_x2_p1.dat',
    'sha256': '4aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa',
    'patch': 'DE Update 185872 (2026-09-22)',
}
GENIEUTILS = 'genieutils-py==0.1.2'
# 补丁标记：只有 Update 185872 的 .dat 同时满足（见官方补丁说明）
MARKERS = [
    ('civs 数量 = 63（含 Muisca/Mapuche/Tupi/Saxons/Varangians/Danes）', lambda d: len(d['Civs']) == 63 and {'Muisca', 'Mapuche', 'Tupi', 'Saxons', 'Varangians', 'Danes'} <= {c['Name'] for c in d['Civs']}),
    ('科技 1452 = Cranequins（185872 新增）', lambda d: d['Techs'][1452]['Name'] == 'Cranequins'),
    ('单位 2700 = Mounted Crossbowman（185872 新增）', lambda d: d['Civs'][1]['Units'][2700]['Name'] == 'Mounted Crossbowman'),
    ('Onager 攻击 50→55、穿刺护甲 7→8（185872）', lambda d: (lambda u: dict(u['Attacks']).get(4) == 55 and dict(u['Armours']).get(3) == 8)(d['Civs'][1]['Units'][550])),
    ('Hulk HP 90→85、War Hulk 115→110（185872）', lambda d: d['Civs'][1]['Units'][2626]['HP'] == 85 and d['Civs'][1]['Units'][2627]['HP'] == 110),
]


def _venv_python():
    py = CACHE / 'venv' / 'bin' / 'python'
    if not py.exists():
        subprocess.check_call([sys.executable, '-m', 'venv', str(CACHE / 'venv')])
        subprocess.check_call([str(py), '-m', 'pip', 'install', '-q', GENIEUTILS])
    return py


def fetch_dat():
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / ('empires2_x2_p1.%s.dat' % DAT['commit'][:7])
    if not p.exists():
        url = 'https://raw.githubusercontent.com/%s/%s/%s' % (DAT['repo'], DAT['commit'], DAT['path'])
        print('download', url, file=sys.stderr)
        p.write_bytes(urllib.request.urlopen(url).read())
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    if h != DAT['sha256']:
        raise SystemExit('✗ .dat sha256 不符：%s（期望 %s）' % (h, DAT['sha256']))
    return p


# 在 genieutils 环境内运行：把 DatFile 转为精简 JSON（字段名沿用 aoe2dat full.json 以便复用逻辑）
_DUMP = r'''
import json, sys
from genieutils.datfile import DatFile
d = DatFile.parse(sys.argv[1])
def unit(u):
    if u is None: return None
    t = u.type_50
    return {'Name': u.name, 'Class': u.class_, 'HP': u.hit_points, 'LOS': u.line_of_sight, 'Speed': u.speed, 'Garrison': u.garrison_capacity,
            'Attacks': [[a.class_, a.amount] for a in t.attacks] if t else [], 'Armours': [[a.class_, a.amount] for a in t.armours] if t else [],
            'Range': t.max_range if t else 0, 'MinRange': t.min_range if t else 0, 'Reload': t.reload_time if t else 0, 'Accuracy': t.accuracy_percent if t else 0,
            'TrainTime': u.creatable.train_time if u.creatable and hasattr(u.creatable, 'train_time') else None,
            'Cost': [[c.type, c.amount] for c in u.creatable.resource_costs if c.flag] if u.creatable else []}
out = {
  'Techs': [{'Name': t.name, 'EffectID': t.effect_id, 'Civ': t.civ, 'RequiredTechs': list(t.required_techs), 'RequiredTechCount': t.required_tech_count,
             'ResearchLocation': max([r.location_id for r in t.research_locations] or [-1])} for t in d.techs],
  'Effects': [{'Name': e.name, 'EffectCommands': [{'Type': c.type, 'A': c.a, 'B': c.b, 'C': c.c, 'D': c.d} for c in e.effect_commands]} for e in d.effects],
  'Civs': [{'Name': c.name, 'TechTreeID': c.tech_tree_id, 'TeamBonusID': c.team_bonus_id, 'Units': [unit(u) for u in c.units] if i < 2 else None} for i, c in enumerate(d.civs)],
  'Version': d.version,
}
json.dump(out, open(sys.argv[2], 'w'))
'''


def load():
    p = fetch_dat()
    j = CACHE / ('dat.%s.json' % DAT['sha256'][:12])
    if not j.exists():
        try:
            subprocess.check_call([str(_venv_python()), '-c', _DUMP, str(p), str(j)])
        except Exception:
            # creatable.train_time 字段名随版本不同：失败时提示
            raise
    d = json.load(open(j))
    bad = [m for m, f in MARKERS if not _safe(f, d)]
    if bad:
        raise SystemExit('✗ .dat 补丁标记不符：\n  ' + '\n  '.join(bad))
    return d


def _safe(f, d):
    try:
        return bool(f(d))
    except Exception:
        return False


if __name__ == '__main__':
    d = load()
    print('✓ .dat %s@%s sha256 %s… %s；%d 文明 / %d 科技 / %d 效果；补丁标记 %d/%d 通过' % (
        DAT['repo'], DAT['commit'][:7], DAT['sha256'][:12], DAT['patch'], len(d['Civs']), len(d['Techs']), len(d['Effects']), len(MARKERS), len(MARKERS)))
