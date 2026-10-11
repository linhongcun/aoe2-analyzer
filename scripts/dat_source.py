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
SOURCES_FILE = ROOT / 'scripts' / 'data_sources.json'


def pins():
    return json.load(open(SOURCES_FILE))


def _dat_pin():
    p = pins()
    d = dict(p['sources']['dat'])
    d['patch'] = '%s (%s)' % (p['patch']['name'], p['patch']['date'])
    return d


DAT = _dat_pin()
GENIEUTILS = 'genieutils-py==0.1.2'


def markers_of(d):
    """从解析结果计算可记录的特征（data:update 时写入 data_sources.json，之后每次构建按此校验）。"""
    return {'civs': len(d['Civs']), 'techs': len(d['Techs']), 'effects': len(d['Effects']), 'newestCivs': [c['Name'] for c in d['Civs'][-3:]]}


def check_markers(d, expect):
    """数据驱动的补丁标记 + 最小常识检查；返回失败项列表。"""
    bad = []
    if len(d['Civs']) < 40 or len(d['Techs']) < 1000 or len(d['Effects']) < 1000:
        bad.append('常识检查失败：文明/科技/效果数量过少（文件损坏或非 DE .dat）')
    got = markers_of(d)
    for k, v in (expect or {}).items():
        if got.get(k) != v:
            bad.append('标记 %s：期望 %r，实际 %r' % (k, v, got.get(k)))
    return bad


def _venv_python():
    py = CACHE / 'venv' / 'bin' / 'python'
    if not py.exists():
        subprocess.check_call([sys.executable, '-m', 'venv', str(CACHE / 'venv')])
        subprocess.check_call([str(py), '-m', 'pip', 'install', '-q', GENIEUTILS])
    return py


def fetch_dat(pin=None):
    pin = pin or DAT
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / ('empires2_x2_p1.%s.dat' % pin['commit'][:7])
    if not p.exists():
        url = 'https://raw.githubusercontent.com/%s/%s/%s' % (pin['repo'], pin['commit'], pin['path'])
        print('download', url, file=sys.stderr)
        p.write_bytes(urllib.request.urlopen(url).read())
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    if pin.get('sha256') and h != pin['sha256']:
        raise SystemExit('✗ .dat sha256 不符：%s（期望 %s）' % (h, pin['sha256']))
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
            'TrainTime': u.creatable.train_locations[0].train_time if u.creatable and u.creatable.train_locations else None,
            'TrainAt': [[l.unit_id, l.train_time] for l in u.creatable.train_locations] if u.creatable else [],
            'Cost': [[c.type, c.amount, c.flag] for c in u.creatable.resource_costs if c.type >= 0 and c.amount] if u.creatable else [],
            'Capacity': u.resource_capacity, 'WorkRate': u.bird.work_rate if u.bird else 0, 'Type': u.type}
TASK_UNITS = {83, 293, 118, 212, 592, 590, 122, 216, 120, 354, 259, 214, 56, 57, 123, 218, 579, 581, 124, 220, 13}
def tasks(i):
    h = d.unit_headers[i] if i < len(d.unit_headers) else None
    return [{'Action': t.action_type, 'Class': t.class_id, 'Unit': t.unit_id, 'ResIn': t.resource_in, 'ResOut': t.resource_out, 'Value': t.work_value_1}
            for t in (h.task_list or [])] if h else []
out = {
  'Techs': [{'Name': t.name, 'EffectID': t.effect_id, 'Civ': t.civ, 'RequiredTechs': list(t.required_techs), 'RequiredTechCount': t.required_tech_count,
             'ResearchLocation': max([r.location_id for r in t.research_locations] or [-1]),
             'ResearchTime': max([r.research_time for r in t.research_locations] or [0]),
             'ResearchAt': [[r.location_id, r.research_time] for r in t.research_locations if r.location_id >= 0],
             'Cost': [[c.type, c.amount, c.flag] for c in t.resource_costs if c.type >= 0 and c.amount]} for t in d.techs],
  'Tasks': {str(i): tasks(i) for i in sorted(TASK_UNITS)},
  'Effects': [{'Name': e.name, 'EffectCommands': [{'Type': c.type, 'A': c.a, 'B': c.b, 'C': c.c, 'D': c.d} for c in e.effect_commands]} for e in d.effects],
  'Civs': [{'Name': c.name, 'TechTreeID': c.tech_tree_id, 'TeamBonusID': c.team_bonus_id, 'Units': [unit(u) for u in c.units] if i < 2 else None} for i, c in enumerate(d.civs)],
  'Version': d.version,
}
json.dump(out, open(sys.argv[2], 'w'))
'''


def parse(p):
    """解析任意 .dat 文件为精简 JSON（按文件 sha256 缓存）。"""
    j = CACHE / ('dat.v4.%s.json' % hashlib.sha256(Path(p).read_bytes()).hexdigest()[:12])
    if not j.exists():
        try:
            subprocess.check_call([str(_venv_python()), '-c', _DUMP, str(p), str(j)])
        except Exception:
            # creatable.train_time 字段名随版本不同：失败时提示
            raise
    return json.load(open(j))


def load():
    d = parse(fetch_dat())
    bad = check_markers(d, DAT.get('markers'))
    if bad:
        raise SystemExit('✗ .dat 补丁标记不符：\n  ' + '\n  '.join(bad))
    return d


if __name__ == '__main__':
    d = load()
    print('✓ .dat %s@%s sha256 %s… %s；%d 文明 / %d 科技 / %d 效果；补丁标记 %d 项通过' % (
        DAT['repo'], DAT['commit'][:7], DAT['sha256'][:12], DAT['patch'], len(d['Civs']), len(d['Techs']), len(d['Effects']), len(DAT.get('markers') or {}) + 1))
