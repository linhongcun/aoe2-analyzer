#!/usr/bin/env python3
"""DE 游戏数据文件 empires2_x2_p1.dat 的唯一来源：下载（固定提交 + sha256）、校验补丁标记、解析。

来源：SiegeEngineers/auto-mods 仓库 dat/empires2_x2_p1.dat（该项目为每个新补丁重新生成 mod 所用的原版 .dat）。
.dat 版权归 Microsoft 所有：仅在构建时下载到 scripts/.cache/（已 gitignore），从不提交或随站点发布；
站点只发布由它派生的数值（data/game/*.json）。

解析：genieutils-py（SiegeEngineers，LGPL-3.0）。首次运行会在 scripts/.cache/venv 建立隔离环境安装固定版本。

用法：
  python3 scripts/dat_source.py --check     # 下载 + 校验 sha256 + 补丁标记（CI/构建前检查）
  from dat_source import load               # 返回与旧 aoe2dat full.json 同形的 dict（Techs/Effects/Civs）
"""
import hashlib, json, math, os, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache'
SOURCES_FILE = ROOT / 'data/sources/data_sources.json'


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
    pop_vals = [r.amount for r in u.resource_storages if r.type == 4]
    return {'Name': u.name, 'Class': u.class_, 'HP': u.hit_points, 'LOS': u.line_of_sight, 'Speed': u.speed, 'Garrison': u.garrison_capacity,
            'CollisionSizeX': u.collision_size_x, 'CollisionSizeY': u.collision_size_y,
            'Attacks': [[a.class_, a.amount] for a in t.attacks] if t else [], 'Armours': [[a.class_, a.amount] for a in t.armours] if t else [],
            'Range': t.max_range if t else 0, 'DisplayedRange': t.displayed_range if t else 0, 'ChargeType': u.creatable.charge_type if u.creatable else 0, 'MinRange': t.min_range if t else 0, 'Reload': t.reload_time if t else 0, 'Accuracy': t.accuracy_percent if t else 0,
            'Projectiles': [t.projectile_unit_id if t else -1, u.creatable.secondary_projectile_unit if u.creatable else -1],
            'ChargeProjectile': u.creatable.charge_projectile_unit if u.creatable else -1,
            'ChargeEvent': u.creatable.charge_event if u.creatable else 0,
            'ChargeTarget': u.creatable.charge_target if u.creatable else 0,
            'RechargeRate': u.creatable.recharge_rate if u.creatable else 0,
            'TotalProjectiles': round(u.creatable.total_projectiles, 4) if u.creatable else 0,
            'MaxTotalProjectiles': int(u.creatable.max_total_projectiles) if u.creatable else 0,
            'Transform': u.building.transform_unit if u.building else -1,
            **({'BlastDamage': t.blast_damage, 'BlastAttackLevel': t.blast_attack_level,
                'FriendlyFireDamage': t.friendly_fire_damage} if t else {}),
            'CombatAbility': t.break_off_combat if t else 0,
            'RegenRate': u.creatable.rear_attack_modifier if u.creatable else 0,
            'ProjectileHitMode': u.projectile.hit_mode if u.projectile else 0,
            'CombatTasks': [{'action': x.action_type, 'attr': x.search_wait_time, 'v1': x.work_value_1, 'v2': x.work_value_2, 'flag': x.combat_level_flag, 'dip': x.target_diplomacy}
                            for x in (u.bird.tasks if u.bird else []) if x.action_type in (157, 158, 160)],
            'SpawnTasks': [{'cls': x.class_id, 'unit': x.unit_id, 'v1': x.work_value_1, 'v2': x.work_value_2}
                           for x in (u.bird.tasks if u.bird else []) if x.action_type == 156],
            'BloodUnitID': u.blood_unit_id,
            'AccuracyDispersion': t.accuracy_dispersion if t else None,
            'DisplayedReloadTime': t.displayed_reload_time if t else None,
            **({'ConversionResistance': {'chanceMod': u.creatable.conversion_chance_mod,
                                         'minTimeMod': u.creatable.min_conversion_time_mod,
                                         'maxTimeMod': u.creatable.max_conversion_time_mod}} if u.creatable else {}),
            'TrainTime': u.creatable.train_locations[0].train_time if u.creatable and u.creatable.train_locations else None,
            'TrainAt': [[l.unit_id, l.train_time] for l in u.creatable.train_locations] if u.creatable else [],
            'Cost': [[c.type, c.amount, c.flag] for c in u.creatable.resource_costs if c.type >= 0 and c.amount] if u.creatable else [],
            'Capacity': u.resource_capacity, 'Food': next((r.amount for r in u.resource_storages if r.type == 0 and r.amount > 0), 0), 'PopSpace': pop_vals[0] if len(pop_vals) == 1 else (None if not pop_vals else pop_vals), 'WorkRate': u.bird.work_rate if u.bird else 0, 'Type': u.type, 'Bld': 1 if u.building else 0}
# 产资源（action 151）单位：怯薛、瓜查、瓦兰吉卫队、城堡。任务从文明单位读，不从 unit_headers。
TASK_UNITS = {83, 293, 118, 212, 592, 590, 122, 216, 120, 354, 259, 214, 56, 57, 123, 218, 579, 581, 124, 220, 13, 2703, 2704, 1228, 1230, 2562, 2564, 82, 2418}
# Return of Rome 子游戏专有文明。与本文件里的常规/编年史同名文明（Persians、Romans、Macedonians）不是这些实体，不在此列。
ROR = {'Assyrians', 'Babylonians', 'Carthaginians', 'Choson', 'Egyptians', 'Greeks', 'Hittites', 'Minoans', 'Palmyrans', 'Phoenicians', 'Shang', 'Sumerians', 'Yamato', 'Lac Viet'}
def task_rec(t):
    return {'Action': t.action_type, 'Class': t.class_id, 'Unit': t.unit_id, 'ResIn': t.resource_in, 'ResOut': t.resource_out, 'ResMul': t.resource_multiplier, 'Value': t.work_value_1}
def task_sig(u):
    if u is None: return None
    return tuple((t.action_type, t.class_id, t.unit_id, t.resource_in, t.resource_out, t.resource_multiplier, t.work_value_1) for t in (u.bird.tasks if u.bird else []))
def tasks(i):
    units = d.civs[1].units
    u = units[i] if i < len(units) else None
    return [task_rec(t) for t in (u.bird.tasks if u and u.bird else [])]
base_sigs = [task_sig(u) for u in d.civs[1].units]
bad = []
for c in d.civs:
    if c.name == 'Gaia' or c.name in ROR: continue
    n = max(len(base_sigs), len(c.units))
    for i in range(n):
        a = base_sigs[i] if i < len(base_sigs) else None
        b = task_sig(c.units[i] if i < len(c.units) else None)
        if a != b:
            bad.append('%s #%s' % (c.name, i))
            if len(bad) >= 12: break
    if len(bad) >= 12: break
if bad:
    raise SystemExit('文明单位任务不一致（RoR 以外）：' + '；'.join(bad))
def combat_tasks_sig(u):
    if u is None: return None
    return tuple((x.action_type, x.search_wait_time, x.work_value_1, x.work_value_2, x.combat_level_flag, x.target_diplomacy)
                 for x in (u.bird.tasks if u.bird else []) if x.action_type in (157, 158, 160))
def spawn_tasks_sig(u):
    if u is None: return None
    return tuple((x.class_id, x.unit_id, x.work_value_1, x.work_value_2)
                 for x in (u.bird.tasks if u.bird else []) if x.action_type == 156)
def proj_hit_mode_sig(u):
    if u is None: return None
    return u.projectile.hit_mode if u.projectile else 0
def regen_rate_sig(u):
    if u is None: return None
    return u.creatable.rear_attack_modifier if u.creatable else 0
def pop_space_sig(u):
    if u is None: return None
    return tuple(r.amount for r in u.resource_storages if r.type == 4)
def charge_target_sig(u):
    if u is None: return None
    return u.creatable.charge_target if u.creatable else 0
base_ct = [combat_tasks_sig(u) for u in d.civs[1].units]
base_st = [spawn_tasks_sig(u) for u in d.civs[1].units]
base_hm = [proj_hit_mode_sig(u) for u in d.civs[1].units]
base_rr = [regen_rate_sig(u) for u in d.civs[1].units]
base_ps = [pop_space_sig(u) for u in d.civs[1].units]
base_cht = [charge_target_sig(u) for u in d.civs[1].units]
bad_ct, bad_st, bad_hm, bad_rr, bad_ps, bad_cht = [], [], [], [], [], []
for c in d.civs:
    if c.name == 'Gaia' or c.name in ROR: continue
    n = max(len(base_ct), len(c.units))
    for i in range(n):
        cu = c.units[i] if i < len(c.units) else None
        if (base_ct[i] if i < len(base_ct) else None) != combat_tasks_sig(cu) and len(bad_ct) < 12:
            bad_ct.append('%s #%s' % (c.name, i))
        if (base_st[i] if i < len(base_st) else None) != spawn_tasks_sig(cu) and len(bad_st) < 12:
            bad_st.append('%s #%s' % (c.name, i))
        if (base_hm[i] if i < len(base_hm) else None) != proj_hit_mode_sig(cu) and len(bad_hm) < 12:
            bad_hm.append('%s #%s' % (c.name, i))
        if (base_rr[i] if i < len(base_rr) else None) != regen_rate_sig(cu) and len(bad_rr) < 12:
            bad_rr.append('%s #%s' % (c.name, i))
        if (base_ps[i] if i < len(base_ps) else None) != pop_space_sig(cu) and len(bad_ps) < 12:
            bad_ps.append('%s #%s' % (c.name, i))
        if (base_cht[i] if i < len(base_cht) else None) != charge_target_sig(cu) and len(bad_cht) < 12:
            bad_cht.append('%s #%s' % (c.name, i))
    if len(bad_ct) >= 12 and len(bad_st) >= 12 and len(bad_hm) >= 12 and len(bad_rr) >= 12 and len(bad_ps) >= 12 and len(bad_cht) >= 12: break
if bad_ct:
    raise SystemExit('文明单位特殊战斗任务（157/158/160）不一致（RoR 以外）：' + '；'.join(bad_ct))
if bad_st:
    raise SystemExit('文明单位成对生成任务（156）不一致（RoR 以外）：' + '；'.join(bad_st))
if bad_hm:
    raise SystemExit('文明投射物穿透标记不一致（RoR 以外）：' + '；'.join(bad_hm))
if bad_rr:
    raise SystemExit('文明单位固有生命回复不一致（RoR 以外）：' + '；'.join(bad_rr))
if bad_ps:
    raise SystemExit('文明单位人口空间存储不一致（RoR 以外）：' + '；'.join(bad_ps))
if bad_cht:
    raise SystemExit('文明单位充能目标掩码不一致（RoR 以外）：' + '；'.join(bad_cht))
out = {
  'Techs': [{'Name': t.name, 'EffectID': t.effect_id, 'Civ': t.civ, 'RequiredTechs': list(t.required_techs), 'RequiredTechCount': t.required_tech_count,
             'ResearchLocation': max([r.location_id for r in t.research_locations] or [-1]),
             'ResearchTime': max([r.research_time for r in t.research_locations] or [0]),
             'ResearchAt': [[r.location_id, r.research_time] for r in t.research_locations if r.location_id >= 0],
             'Cost': [[c.type, c.amount, c.flag] for c in t.resource_costs if c.type >= 0 and c.amount]} for t in d.techs],
  'Tasks': {str(i): tasks(i) for i in sorted(TASK_UNITS)},
  'CasterTasks': {str(i): [{'action': t.action_type, 'value1': t.work_value_1, 'value2': t.work_value_2}
                           for t in d.civs[1].units[i].bird.tasks
                           if t.action_type in (104, 105) and t.class_id == -1 and t.unit_id == -1]
                  for i in (125, 775) if i < len(d.civs[1].units) and d.civs[1].units[i] and d.civs[1].units[i].bird},
  'Effects': [{'Name': e.name, 'EffectCommands': [{'Type': c.type, 'A': c.a, 'B': c.b, 'C': c.c, 'D': c.d} for c in e.effect_commands]} for e in d.effects],
  'Civs': [{'Name': c.name, 'TechTreeID': c.tech_tree_id, 'TeamBonusID': c.team_bonus_id, 'Units': [unit(u) for u in c.units] if i < 2 else None} for i, c in enumerate(d.civs)],
  # 建筑建成时触发的科技（Building.tech_id），所有文明合并：升级时代前置建筑判定用（#3 根因 3）
  'BuildTech': {str(i): u.building.tech_id for c in d.civs for i, u in enumerate(c.units) if u is not None and u.building is not None and u.building.tech_id >= 0},
  'Version': d.version,
}
json.dump(out, open(sys.argv[2], 'w'))
'''


def derive_train_count(source_unit, unit_id=None):
    """#1384：从固定 .dat 的 Task 156（SpawnTasks）推导每批训练产出数（fail-closed，无条目返回 1）。"""
    if not isinstance(source_unit, dict) or 'SpawnTasks' not in source_unit:
        raise ValueError(f'Missing SpawnTasks for unit {unit_id}: {source_unit!r}')
    tasks = source_unit['SpawnTasks']
    if not isinstance(tasks, list):
        raise ValueError(f'Invalid SpawnTasks for unit {unit_id}: {tasks!r}')
    if not tasks:
        return 1
    extra = 0
    for task in tasks:
        if not isinstance(task, dict):
            raise ValueError(f'Invalid SpawnTask entry for unit {unit_id}: {task!r}')
        for key in ('cls', 'unit', 'v1', 'v2'):
            if key not in task:
                raise ValueError(f'Missing {key!r} in SpawnTask for unit {unit_id}: {task!r}')
        cls_id, tgt_unit, v1, v2 = task['cls'], task['unit'], task['v1'], task['v2']
        if isinstance(cls_id, bool) or cls_id != -1 or isinstance(tgt_unit, bool) or tgt_unit != -1:
            raise ValueError(f'Unsupported SpawnTask target for unit {unit_id}: {task!r}')
        if isinstance(v1, bool) or not isinstance(v1, (int, float)) or not math.isfinite(v1) or v1 < 0 or abs(v1 - round(v1)) >= 1e-6:
            raise ValueError(f'Invalid SpawnTask v1 for unit {unit_id}: {task!r}')
        if isinstance(v2, bool) or not isinstance(v2, (int, float)) or not math.isfinite(v2) or v2 <= 0 or abs(v2 - round(v2)) >= 1e-6:
            raise ValueError(f'Invalid SpawnTask v2 for unit {unit_id}: {task!r}')
        extra += int(round(v2))
    return 1 + extra


def parse(p):
    """解析任意 .dat 文件为精简 JSON（按文件 sha256 缓存）。"""
    j = CACHE / ('dat.v27.%s.json' % hashlib.sha256(Path(p).read_bytes()).hexdigest()[:12])
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
