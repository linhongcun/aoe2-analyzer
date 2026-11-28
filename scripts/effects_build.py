#!/usr/bin/env python3
"""从 .dat 原始效果表生成 data/game/effects.json（科技 / 文明加成 / 团队加成的结构化效果）。

数据源：DE 原版 empires2_x2_p1.dat（SiegeEngineers/auto-mods@0c38027，DE Update 185872，sha256 固定），
  由 scripts/dat_source.py 在构建时下载、校验（sha256 + 补丁标记）并用 genieutils-py 解析；.dat © Microsoft，不提交、不发布。
  全部 EffectCommands（战斗属性 + 经济/费用 + 资源）均来自这一个文件。
  对账参考（可选）：linhongcun/lhc-aoe2 lib/data/unitTechFx.ts（作者本机 .dat，2026-08）。

用法：python3 scripts/effects_build.py   （下载缓存在 scripts/.cache/）
"""
import json, math, os, re, sys, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dat_source import DAT as DAT_SRC, load as load_dat  # noqa: E402
from projectile_scope import (  # noqa: E402
    guidance_projectile_scopes,
    guided_projectile_ids,
    pass_through_projectile_ids,
    split_projectile_units,
    transform_closure,
)
from res_names import RES_ZH as RES  # noqa: E402
SRC_C = ('https://raw.githubusercontent.com/linhongcun/lhc-aoe2/6fdb912e95ce1ce837eb91b6c6ffc2945a74dc90/lib/data/unitTechFx.ts', 'lhc-unitTechFx.ts')


def fetch(src):
    url, name = src
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    if not p.exists():
        print('download', url, file=sys.stderr)
        req = urllib.request.Request(url)
        if 'lhc-aoe2' in url and os.environ.get('GITHUB_TOKEN'):  # 私有仓库：用 env 中的 token，不落盘
            req.add_header('Authorization', 'token ' + os.environ['GITHUB_TOKEN'])
        try:
            p.write_bytes(urllib.request.urlopen(req).read())
        except Exception as e:  # C 仅用于对账，可缺
            if 'lhc-aoe2' in url: print('skip optional source C:', e, file=sys.stderr); return None
            raise
    return p


# 团队加成由引擎按「区域/团队」触发的隐藏科技（.dat 中无从文明指向它们的命令，只能按 id 列出；数值仍取自 .dat）
TEAM_TECHS = {'Berbers': [599, 601], 'Incas': [730], 'Italians': [522], 'Wu': [1089]}

# 属性号 → 站内 stat（attribute 号见 genieutils / AGE「Attribute」表）
ATTR = {0: 'hp', 1: 'los', 2: 'gar', 5: 'spd', 8: 'armor', 9: 'attack', 10: 'reload', 11: 'acc', 12: 'rng', 20: 'minr', 101: 'tt'}
ECO_ATTR = {10: '信仰恢复时间', 13: '工作效率', 14: '携带量', 100: '造价', 101: '生产/建造时间', 103: '食物造价', 104: '木材造价', 105: '黄金造价', 106: '石料造价',
            102: '箭矢数', 107: '最大箭矢数', 22: '溅射半径', 24: '克制伤害抗性', 108: '驻扎回血', 109: '生命恢复', 110: '人口空间', 63: '特殊能力', 19: '投射物命中', 23: '搜索半径',
            59: '最大充能', 60: '充能速率', 61: '充能触发事件', 62: '充能类型', 118: '近战伤害反弹'}
POP_SPACE_ATTR = 110
CL = {1: '步兵', 3: '穿刺', 4: '近战', 5: '战象', 8: '骑兵', 11: '所有建筑', 13: '石质防御', 15: '弓手', 16: '船只', 17: '冲车', 18: '树木', 19: '独特单位', 20: '攻城武器',
      21: '标准建筑', 22: '城墙/城门', 23: '火药单位', 25: '僧侣', 26: '城堡', 27: '长矛兵', 28: '骑射手', 29: '冲击步兵', 30: '骆驼', 32: '雇佣兵', 34: '渔船', 35: '马穆鲁克', 36: '英雄/国王', 39: '骑乘减伤', 2: '重型战舰', 31: '特殊近战', 37: '重型攻城武器', 38: '掷矛手', 41: '喷火船', 60: '远程战船'}
BUILDER = {118}  # 建造者（男性 id；女性 212 为同值副本，只计一次）
AGE_TECH = {101: 2, 102: 3, 103: 4}
CIV_DAT = {'British': 'Britons', 'French': 'Franks', 'Byzantine': 'Byzantines', 'Mayan': 'Mayans', 'Indians': 'Hindustanis'}
# 未导出多形态单位 ID → 目录规范单位 ID（#1293：展开态巨型投石机 42 ↔ 打包态目录记录 331）
UNIT_FORM_ALIASES = {42: 331}
# .dat 科技 resource_costs 中代表「修道院驻守圣物数」的资源 ID（立陶宛 699–702：Cost=[[7, 1..4, 1]]）
RELIC_RESOURCE_ID = 7
# .dat 乘法抵消浮点残差容差（如穆伊斯卡草药学 1365 对弓兵类 ×1.15 后对掷矛/投石/格查 ×0.87 = 1.0005）
MUL_IDENTITY_EPS = 1e-3
# #1464：马普切「布图马普（1380）」经 Resource 33 = 51（EffectFunction51）覆盖本国城堡独特单位 -15% 造价
BUTALMAPU_TECH_ID = 1380
EFFECT_FUNCTION_RES_ID = 33
BUTALMAPU_EFFECT_FN = 51
CASTLE_BLD_ID = 82


def _is_finite_number(x):
    """排除 bool 与 NaN/Inf，仅接受有限数值。"""
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def r6(x):
    """规范到 6 位小数（接近整数时取 int），供 effects 与 army_research 双管线共用。"""
    x = float(x)
    return int(x) if abs(x - round(x)) < 1e-9 else round(x, 6)


def validate_pop_space_baselines(eco, dat_units, units_by_id, owner=''):
    """#1499：校验全部 C=110 人口空间命令命中的目录单位在固定 .dat 中基线 PopSpace === -1.0（fail-closed）。"""
    for item in eco:
        if not isinstance(item, dict) or item.get('a') != POP_SPACE_ATTR:
            continue
        for uid in item.get('t') or ():
            if uid not in units_by_id:
                continue
            du = dat_units[uid] if 0 <= uid < len(dat_units) else None
            if not isinstance(du, dict) or 'PopSpace' not in du:
                raise ValueError(f'Missing PopSpace baseline for catalog unit {uid} in {owner or "eco"}: {du!r}')
            ps = du['PopSpace']
            if not _is_finite_number(ps) or abs(float(ps) - (-1.0)) >= 1e-9:
                raise ValueError(f'Invalid PopSpace baseline for catalog unit {uid} in {owner or "eco"}: expected -1.0, got {ps!r}')


def castle_unique_units(trees, units_by_id, civ_en):
    """从固定 trees.json 与 units.json 推导指定文明在城堡（82）可训练的本国独特单位 ID（升序去重）。"""
    blocks = (trees.get('t') or {}).get(civ_en) if isinstance(trees, dict) else None
    if not isinstance(blocks, list):
        return []
    found = set()
    for block in blocks:
        if not isinstance(block, list) or len(block) < 4 or block[0] != CASTLE_BLD_ID:
            continue
        cells = block[3]
        if not isinstance(cells, list):
            continue
        for cell in cells:
            if not isinstance(cell, list) or len(cell) < 5 or cell[2] != 'u' or cell[4] != 1:
                continue
            uid = cell[3]
            if not isinstance(uid, int) or isinstance(uid, bool):
                continue
            u = units_by_id.get(uid)
            if (
                isinstance(u, dict)
                and not u.get('_b')
                and u.get('type') == 'UniqueUnit'
                and u.get('b') == CASTLE_BLD_ID
                and u.get('civs') == [civ_en]
            ):
                found.add(uid)
    return sorted(found)


def supplement_script_cost_eco(tech, eco, trees, units_by_id):
    """#1464：在三重固定数据校验全部通过时，为布图马普（1380）补齐马普切本国城堡独特单位 -15% 费用条目。

    完整保留原 eco 顺序（含 res:33 set 51），不原地修改入参；任一守卫不满足则 fail-closed 原样返回。
    """
    out = list(eco)
    if not isinstance(tech, dict) or tech.get('id') != BUTALMAPU_TECH_ID:
        return out
    if tech.get('civs') != ['Mapuche']:
        return out
    desc = tech.get('desc') or ''
    desc_en = tech.get('descEn') or ''
    if '-15%' not in desc or '-15%' not in desc_en:
        return out
    has_effect_fn = any(
        isinstance(e, dict)
        and e.get('res') == EFFECT_FUNCTION_RES_ID
        and e.get('op') == 'set'
        and _is_finite_number(e.get('v'))
        and r6(e['v']) == BUTALMAPU_EFFECT_FN
        for e in out
    )
    if not has_effect_fn:
        return out
    cost_cmds = [e for e in out if isinstance(e, dict) and e.get('a') == 100]
    if not cost_cmds or not all(
        e.get('op') == 'mul' and _is_finite_number(e.get('v')) and r6(e['v']) == 0.85
        for e in cost_cmds
    ):
        return out
    targets = castle_unique_units(trees, units_by_id, 'Mapuche')
    if not targets:
        return out
    existing = {uid for e in cost_cmds for uid in (e.get('t') or ())}
    for uid in targets:
        if uid not in existing:
            out.append({'a': 100, 'op': 'mul', 'v': 0.85, 't': [uid], 'cls': None, 'unit': uid})
    return out


def is_identity_mul(v):
    """按 6 位小数规范后的偏差判定乘法恒等残差：|round(v, 6) - 1| < 1e-3（避免 1.001 - 1 浮点减法误判）。"""
    return round(abs(r6(v) - 1.0), 6) < MUL_IDENTITY_EPS


def is_identity_fx(f):
    """判断单条合并后效果是否为零增益/恒等残差（add/rof 0，或 |round(mul, 6) - 1| < 1e-3）。"""
    op = f.get('op', 'add')
    v = f['v']
    if op == 'add':
        return v == 0
    if op == 'mul':
        return is_identity_mul(v)
    return False


def rules_have_owned_target(rules, civ_en, ours):
    """判断 rules 是否至少命中 1 个本文明目录可拥有的单位或建筑。"""
    for r in rules:
        is_bld = bool(r.get('b'))
        for tid in r.get('t') or ():
            obj = ours.get(tid)
            if obj is not None and bool(obj.get('_b')) == is_bld and civ_en in (obj.get('civs') or ()):
                return True
    return False


def building_can_attack(b):
    """判断目录建筑是否具备攻击能力（与 src/domain/buildingSim.ts buildingCanAttack 同口径）。"""
    return (
        (b.get('atk') or 0) > 0
        or (b.get('rng') or 0) > 0
        or (b.get('minr') or 0) > 0
        or (b.get('rof') or 0) > 0
        or bool(b.get('atks'))
    )


def tech_resource_costs(tech):
    """返回科技的非空资源消耗/触发条件列表 [[type, amount, flag], ...]（仅计有效消耗/条件：type>=0、amount>0、flag!=0）。"""
    return [c for c in (tech.get('Cost') or []) if len(c) >= 3 and c[0] >= 0 and c[1] > 0 and c[2] != 0]


def relic_condition(rcosts):
    """识别单一圣物驻守条件（resource_type=7 且数量 >= 1），否则返回 None。"""
    if len(rcosts) == 1 and rcosts[0][0] == RELIC_RESOURCE_ID and rcosts[0][1] >= 1:
        return {'kind': 'relics', 'min': int(round(rcosts[0][1]))}
    return None


def fx_triggered_techs(AE):
    """收集由效果命令 Type 8/18（B=12，D=1 启用或 D=3 强制研究）激活的科技 ID。"""
    triggered = set()
    for e in AE:
        for c in e.get('EffectCommands') or []:
            if c.get('Type') in (8, 18) and c.get('B') == 12:
                d = float(c.get('D', 0))
                if abs(d - 1.0) < 1e-9 or abs(d - 3.0) < 1e-9:
                    tid = c.get('A', -1)
                    if isinstance(tid, int) and tid >= 0:
                        triggered.add(tid)
    return triggered


def is_unreachable_tech(tid, tech, build_tech_ids=(), fx_triggered_ids=()):
    """判断 .dat 科技是否永不可达：排除 BuildTech 建筑触发与 Type 8/18 B=12 激活后，RequiredTechCount 大于有效前置（>= 0）数。"""
    if tid in build_tech_ids or tid in fx_triggered_ids:
        return False
    reqs = [r for r in (tech.get('RequiredTechs') or []) if r >= 0]
    need = tech.get('RequiredTechCount') or 0
    return need > len(reqs)


def conditional_age_req(AT, tech_to_blds, blds_by_id, tech_by_id, tid, civ_en, seen=None):
    """推导带条件隐藏科技的生效时代与前置科技（环路保护；经 BuildTech 查该文明可用目录建筑，推导不出 >= 城堡时代则 fail-closed）。"""
    is_root = seen is None
    seen = set() if is_root else seen
    seen.add(tid)
    req = [x for x in AT[tid]['RequiredTechs'] if x >= 0] if 0 <= tid < len(AT) else []
    age, pre = 1, []
    for r in req:
        if r in AGE_TECH:
            age = max(age, AGE_TECH[r])
            continue
        if r in tech_by_id:
            pre.append(tech_by_id[r]['en'])
            age = max(age, tech_by_id[r].get('age', 1))
            continue
        if r in tech_to_blds:
            matched_ages = [blds_by_id[bid]['age'] for bid in tech_to_blds[r] if bid in blds_by_id and civ_en in blds_by_id[bid].get('civs', [])]
            if matched_ages:
                age = max(age, min(matched_ages))
                continue
        nm = AT[r]['Name'] if 0 <= r < len(AT) else ''
        m = re.search(r'(Feudal|Castle|Imperial)', nm or '')
        if m and 'Age' in nm:
            age = max(age, {'Feudal': 2, 'Castle': 3, 'Imperial': 4}[m.group(1)])
            continue
        if r not in seen:
            a2, p2 = conditional_age_req(AT, tech_to_blds, blds_by_id, tech_by_id, r, civ_en, seen)
            age = max(age, a2)
            pre += p2
    if is_root and age < 3:
        raise ValueError(f'Conditional tech {tid} ({civ_en}) failed to derive >= Castle Age from .dat (got age={age})')
    return age, sorted(set(pre))


def main_atk(o):
    """站内单位的主攻击类别（4 近战 / 3 穿刺）；建筑固定按穿刺 3 处理。先非零（近战优先于穿刺），再显式零值。"""
    if o.get('_b'):
        return 3
    atks = o.get('atks', [])
    nonzero = {x[0] for x in atks if x[1]}
    if '近战' in nonzero:
        return 4
    if '穿刺' in nonzero:
        return 3
    names = {x[0] for x in atks}
    return 4 if '近战' in names else 3 if '穿刺' in names else None


def resolve_unit_alias(a, attr, op):
    """将未导出多形态单位 ID 映射为目录规范单位 ID；语义守卫不通过时返回 None。"""
    if a not in UNIT_FORM_ALIASES:
        return a
    # 展开态 42 基础准确度为 15%，目录打包记录 331 为 92%（#711/#746）；
    # 仅绝对赋值 set（如战狼号 =100）可无歧义落地，相对加值（如匈奴 +35）会产出 127% 失真。
    if a == 42 and attr == 11 and op != 'set':
        return None
    return UNIT_FORM_ALIASES[a]


def cmd_dedup_key(t, attr, d):
    """属性修改命令的去重键：(归一化类型, 属性号, 攻防编码类别或 None)。"""
    t_norm = t - 10 if 10 <= t <= 16 else t
    cls_key = None
    if attr in (8, 9):
        dv = int(round(d))
        cls_key = (dv // 256) if t_norm == 5 or dv >= 0 else ((-dv) // 256)
    return (t_norm, attr, cls_key)


def filter_aliased_cmds(cmds, ours, dcls):
    """将未导出多形态属性命令改写为规范单位 ID；规范目标已有非别名直接/类别命中时去重跳过。
    非属性命令（t_norm ∉ {0, 4, 5}）原样透传；返回新列表，不原地修改输入。"""
    direct = set()
    for c in cmds:
        t, a, b, attr, d = c
        t_norm = t - 10 if 10 <= t <= 16 else t
        if t_norm not in (0, 4, 5) or a in UNIT_FORM_ALIASES:
            continue
        key = cmd_dedup_key(t, attr, d)
        if a >= 0:
            if a in ours:
                direct.add((a, *key))
        else:
            for i in ours:
                if dcls.get(i) == b:
                    direct.add((i, *key))
    out = []
    for c in cmds:
        t, a, b, attr, d = c
        t_norm = t - 10 if 10 <= t <= 16 else t
        if t_norm not in (0, 4, 5) or a not in UNIT_FORM_ALIASES:
            out.append(c)
            continue
        op = {0: 'set', 4: 'add', 5: 'mul'}[t_norm]
        mapped = resolve_unit_alias(a, attr, op)
        if mapped is None or mapped not in ours:
            continue
        if (mapped, *cmd_dedup_key(t, attr, d)) in direct:
            continue
        out.append((t, mapped, b, attr, d))
    return out


def building_age_forms(A, catalog_ids):
    """各时代建筑 id。从升级时代科技（101 封建 / 102 城堡 / 103 帝王）的单位替换（效果类型 3）推导，不手写名单。"""
    U = A['Civs'][1]['Units']

    def is_b(i):
        return isinstance(i, int) and 0 <= i < len(U) and U[i] is not None and U[i].get('Bld') == 1

    forms = {i: [i, i, i, i] for i in catalog_ids}
    aliases = {i: {i} for i in catalog_ids}
    for age, tid in ((2, 101), (3, 102), (4, 103)):
        eid = A['Techs'][tid]['EffectID'] if 0 <= tid < len(A['Techs']) else -1
        cmds = A['Effects'][eid]['EffectCommands'] if 0 <= eid < len(A['Effects']) else []
        for original in catalog_ids:
            forms[original][age - 1] = forms[original][age - 2]
            for c in cmds:
                if c['Type'] == 3 and c['A'] in aliases[original] and is_b(c['B']):
                    aliases[original].add(c['B'])
                    forms[original][age - 1] = c['B']
    return forms


def annotate_building_ages(eco, cmds, forms):
    """同一建筑各时代形态的乘法倍率不同时，记到目录形态的 byAge。v 与 t 仍是目录 id，避免各时代连乘。"""
    rev = {}
    for base, seq in forms.items():
        for idx, uid in enumerate(seq):
            rev.setdefault(uid, (base, idx + 1))
    series = {}
    for raw in cmds:
        t, a, _b, attr, d = raw
        if 10 <= t <= 16:
            t -= 10
        if t != 5 or a not in rev:
            continue
        base, age = rev[a]
        series.setdefault((base, attr), {})[age] = d
    for e in eco:
        if e.get('op') != 'mul' or 'a' not in e or e.get('unit') is None:
            continue
        ages = series.get((e['unit'], e['a']))
        if not ages or len(ages) < 2:
            continue
        ordered = [ages[i] for i in range(1, 5) if i in ages]
        rounded = [int(v) if abs(float(v) - round(float(v))) < 1e-9 else round(float(v), 6) for v in ordered]
        if len(rounded) == len(ages) and len(set(rounded)) > 1:
            e['byAge'] = rounded


def tech_cost_op(c):
    """效果 101/103 的 C：0 设为，2 乘，1 与 -1 加（#355）。"""
    if c == 0: return 'set'
    if c == 2: return 'mul'
    return 'add'


def tech_cost_what(b):
    """效果 101 的 B：-1 为全部资源。"""
    return {0: '食物', 1: '木材', 2: '石料', 3: '黄金', -1: '全部资源'}.get(b, '资源%d' % b)


def global_disabled_techs(AT, AE):
    """收集开局全局禁用隐藏科技（Civ=-1、不可研究、无前置、RequiredTechCount=0）中 Type=102 禁用的科技 ID。"""
    disabled = set()
    for t in AT:
        if t['Civ'] != -1 or t['ResearchLocation'] > 0 or t['EffectID'] < 0:
            continue
        rq = [r for r in t['RequiredTechs'] if r >= 0]
        if rq or (t['RequiredTechCount'] or 0) != 0:
            continue
        eid = t['EffectID']
        if eid >= len(AE):
            continue
        for c in AE[eid]['EffectCommands']:
            if c['Type'] == 102:
                tid = int(round(c['D']))
                if tid >= 0:
                    disabled.add(tid)
    return disabled


def regional_unit_unlocks(AT, AE, AC, ours, adat, catalog_civ_ens):
    """解析被开局全局禁用、再由目录文明 TechTreeID 重新启用的纯目录非建筑单位解锁隐藏科技（如 433 鹰斥候解锁）。"""
    disabled = global_disabled_techs(AT, AE)
    reenabled = defaultdict(set)
    for en in catalog_civ_ens:
        ai = adat.get(en)
        if ai is None or ai >= len(AC):
            continue
        eid = AC[ai]['TechTreeID']
        if eid is None or eid < 0 or eid >= len(AE):
            continue
        for c in AE[eid]['EffectCommands']:
            if c['Type'] == 8 and c['B'] == 12 and abs(float(c['D']) - 1.0) < 1e-9:
                reenabled[c['A']].add(en)
    unlocks = {}
    for r in sorted(disabled):
        if r < 0 or r >= len(AT):
            continue
        t = AT[r]
        if t['Civ'] != -1 or t['ResearchLocation'] > 0 or t['EffectID'] < 0:
            continue
        rq = [x for x in t['RequiredTechs'] if x >= 0]
        need = t['RequiredTechCount'] or len(rq)
        if not all(x in AGE_TECH or x == 104 for x in rq) or len(rq) != need:
            continue
        eid = t['EffectID']
        if eid >= len(AE):
            continue
        cmds = AE[eid]['EffectCommands']
        if not cmds or not all(c['Type'] == 2 and c['B'] == 1 and c['A'] in ours and not ours[c['A']].get('_b') for c in cmds):
            continue
        civ_list = sorted(reenabled.get(r, ()))
        if not civ_list:
            continue
        unlock_age = max([AGE_TECH[x] for x in rq if x in AGE_TECH] or [1])
        unlocks[r] = {'civs': civ_list, 'units': frozenset(c['A'] for c in cmds), 'age': unlock_age}
    return unlocks


NON_NEGATIVE_STATS = frozenset({'minr', 'rng', 'hp', 'atk', 'los', 'gar', 'bt'})


def age_alias_techs(AT, tech_by_id, disabled=(), build_tech_ids=(), fx_triggered_ids=()):
    """识别 .dat 中指向 AGE_TECH 的时代别名隐藏科技（如 115 Dupl. Imperial Age -> 4）。"""
    aliases = {}
    for i, t in enumerate(AT):
        if i in AGE_TECH or i in tech_by_id or i in disabled or i in fx_triggered_ids:
            continue
        if t['Civ'] != -1 or t['ResearchLocation'] > 0 or t['EffectID'] >= 0:
            continue
        if tech_resource_costs(t) or is_unreachable_tech(i, t, build_tech_ids, fx_triggered_ids):
            continue
        rq = [r for r in t['RequiredTechs'] if r >= 0]
        need = t['RequiredTechCount'] or len(rq)
        if len(rq) == 1 and need == 1 and rq[0] in AGE_TECH and 'Age' in (t.get('Name') or ''):
            aliases[i] = AGE_TECH[rq[0]]
    return aliases


def building_activation_markers(AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, disabled=None, build_tech_ids=(), fx_triggered_ids=()):
    """识别两类目录建筑激活/替换隐藏标记：
    (a) 文明专属建筑替换隐藏科技（Civ > 0，Type=3 全部升级为该文明实际拥有的目录建筑，如 930/941 -> 1806）；
    (b) 开局全局禁用并由目录文明 TechTreeID 重新启用的纯目录建筑解锁隐藏科技（Type=2, B=1，如 1353 -> 2556）。
    """
    if disabled is None:
        disabled = global_disabled_techs(AT, AE)
    catalog_civ_set = set(catalog_civ_ens)
    dat_to_en = {ai: en for en, ai in adat.items() if en in catalog_civ_set}
    reenabled = defaultdict(set)
    for en in catalog_civ_ens:
        ai = adat.get(en)
        if ai is None or ai >= len(AC):
            continue
        eid = AC[ai]['TechTreeID']
        if eid is None or eid < 0 or eid >= len(AE):
            continue
        for c in AE[eid]['EffectCommands']:
            if c['Type'] == 8 and c['B'] == 12 and abs(float(c['D']) - 1.0) < 1e-9:
                reenabled[c['A']].add(en)
    markers = {}
    for i, t in enumerate(AT):
        if i in tech_by_id or t['ResearchLocation'] > 0 or t['EffectID'] < 0:
            continue
        if tech_resource_costs(t) or is_unreachable_tech(i, t, build_tech_ids, fx_triggered_ids):
            continue
        eid = t['EffectID']
        if eid >= len(AE):
            continue
        cmds = AE[eid]['EffectCommands']
        if not cmds:
            continue
        if t['Civ'] > 0:
            if i in disabled:
                continue
            en = dat_to_en.get(t['Civ'])
            if not en:
                continue
            if not all(c['Type'] == 3 and c['B'] in ours and ours[c['B']].get('_b') for c in cmds):
                continue
            bids = frozenset(c['B'] for c in cmds if en in ours[c['B']].get('civs', ()))
            if not bids:
                continue
            markers[i] = {'civs': [en], 'buildings': bids, 'age': 1}
        elif t['Civ'] == -1 and i in disabled:
            rq = [x for x in t['RequiredTechs'] if x >= 0]
            need = t['RequiredTechCount'] or len(rq)
            if not all(x in AGE_TECH or x == 104 for x in rq) or len(rq) != need:
                continue
            if not all(c['Type'] == 2 and c['B'] == 1 and c['A'] in ours and ours[c['A']].get('_b') for c in cmds):
                continue
            civ_list = sorted(reenabled.get(i, ()))
            if not civ_list:
                continue
            bids = frozenset(c['A'] for c in cmds)
            unlock_age = max([AGE_TECH[x] for x in rq if x in AGE_TECH] or [1])
            markers[i] = {'civs': civ_list, 'buildings': bids, 'age': unlock_age}
    return markers


def _filter_redundant_building_rules(rules, kept_bids, mine, tech_rules_by_en):
    """按单建筑×单属性粒度过滤与触发科技已设 0 的非负属性相矛盾的负 add 增量（如 322 设 minr=0 后的 947 minr-1），并按 fx 归并。"""
    zero_set_by_bid = defaultdict(set)
    if tech_rules_by_en and mine:
        for tn in mine:
            trec = tech_rules_by_en.get(tn)
            if not isinstance(trec, dict):
                continue
            for tr in trec.get('rules') or ():
                if not tr.get('b'):
                    continue
                zero_stats = {
                    f['s']
                    for f in (tr.get('fx') or ())
                    if f.get('op') == 'set' and f.get('v') == 0 and f.get('s') in NON_NEGATIVE_STATS
                }
                if zero_stats:
                    for bid in tr.get('t') or ():
                        zero_set_by_bid[bid].update(zero_stats)
    groups = defaultdict(list)
    for r in rules:
        if not r.get('b'):
            continue
        for bid in r['t']:
            if bid not in kept_bids:
                continue
            zstats = zero_set_by_bid.get(bid)
            fx = [
                f
                for f in r['fx']
                if not (zstats and f.get('s') in zstats and f.get('op', 'add') == 'add' and f.get('v', 0) < 0)
            ]
            if fx:
                groups[json.dumps(fx, ensure_ascii=False, sort_keys=True)].append(bid)
    out = []
    for k, ids in groups.items():
        out.append({'t': sorted(set(ids)), 'fx': json.loads(k), 'b': 1})
    out.sort(key=lambda r: (-len(r['t']), r['t'][0]))
    return out


def build_generic_entries(AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens, a_cmds, compile_cmds, build_tech_ids=(), fx_triggered_ids=None, tech_rules_by_en=None):
    """导出通用与限定文明隐藏科技：时代科技自身单位属性（101/102/103）+ 常规/区域解锁/建筑条件隐藏科技。"""
    if fx_triggered_ids is None:
        fx_triggered_ids = fx_triggered_techs(AE)
    disabled = global_disabled_techs(AT, AE)
    unlocks = regional_unit_unlocks(AT, AE, AC, ours, adat, catalog_civ_ens)
    age_aliases = age_alias_techs(AT, tech_by_id, disabled=disabled, build_tech_ids=build_tech_ids, fx_triggered_ids=fx_triggered_ids)
    bld_markers = building_activation_markers(
        AT, AE, AC, ours, tech_by_id, adat, catalog_civ_ens,
        disabled=disabled, build_tech_ids=build_tech_ids, fx_triggered_ids=fx_triggered_ids,
    )
    generic = []
    for i, t in enumerate(AT):
        if i in AGE_TECH:
            if t['EffectID'] < 0:
                continue
            cmds = [c for c in a_cmds(t['EffectID']) if c[0] in (0, 4, 5)]
            rules, _eco = compile_cmds(cmds)
            unit_rules = [r for r in rules if not r.get('b')]
            if not unit_rules:
                continue
            name = tech_by_id[i]['en'] if i in tech_by_id else t['Name']
            generic.append({'tech': i, 'name': name, 'age': AGE_TECH[i], 'req': [], 'any': False, 'rules': unit_rules})
            continue
        if t['Civ'] != -1 or t['ResearchLocation'] > 0 or t['EffectID'] < 0 or i in tech_by_id:
            continue
        if is_unreachable_tech(i, t, build_tech_ids, fx_triggered_ids):
            continue
        rq = [r for r in t['RequiredTechs'] if r >= 0]
        if not rq:
            continue
        ages = [AGE_TECH[r] for r in rq if r in AGE_TECH]
        mine = [tech_by_id[r]['en'] for r in rq if r in tech_by_id and r not in AGE_TECH]
        other = [r for r in rq if r not in AGE_TECH and r not in tech_by_id]
        # 需要的前置数 = RequiredTechCount；只收录「我方可识别的前置」满足要求的条目
        need = t['RequiredTechCount'] or len(rq)
        if len(ages) + len(mine) >= need:
            cmds = [c for c in a_cmds(t['EffectID']) if c[0] in (0, 4, 5)]
            rules, _eco = compile_cmds(cmds)
            if not rules:
                continue
            generic.append({'tech': i, 'name': t['Name'], 'age': max(ages or [1]), 'req': mine, 'any': len(ages) + len(mine) > need, 'rules': rules})
            continue
        # 区域单位解锁隐藏前置（严格全量 AND，如 387 = 城堡时代 102 + 鹰斥候解锁 433）
        unlock_reqs = [r for r in other if r in unlocks]
        if unlock_reqs and len(unlock_reqs) == len(other):
            if len(ages) + len(mine) + len(unlock_reqs) != need:
                continue
            civ_list = sorted(set.intersection(*(set(unlocks[r]['civs']) for r in unlock_reqs)))
            if not civ_list:
                continue
            reg_ages = [unlocks[r]['age'] for r in unlock_reqs]
            cmds = [c for c in a_cmds(t['EffectID']) if c[0] in (0, 4, 5)]
            rules, _eco = compile_cmds(cmds)
            if not rules or any(r.get('b') for r in rules):
                continue
            unlocked_units = set().union(*(unlocks[r]['units'] for r in unlock_reqs))
            rule_units = {uid for r in rules for uid in r['t']}
            if not rule_units or not rule_units.issubset(unlocked_units):
                continue
            generic.append({
                'tech': i,
                'name': t['Name'],
                'age': max(ages + reg_ages or [1]),
                'req': mine,
                'any': False,
                'civs': civ_list,
                'rules': rules,
            })
            continue
        # 建筑条件隐藏科技（need == 2：单触发项 + 一个或一组两两互斥的同建筑集文明建筑激活/替换标记）
        if i in disabled or tech_resource_costs(t):
            continue
        alias_ages = [age_aliases[r] for r in other if r in age_aliases]
        rem_other = [r for r in other if r not in age_aliases]
        if len(ages) + len(alias_ages) + len(mine) != 1 or need != 2:
            continue
        marker_reqs = [r for r in rem_other if r in bld_markers]
        if not marker_reqs or len(marker_reqs) != len(rem_other):
            continue
        if len(marker_reqs) == 1:
            target_buildings = bld_markers[marker_reqs[0]]['buildings']
            civ_set = set(bld_markers[marker_reqs[0]]['civs'])
        else:
            bsets = [bld_markers[r]['buildings'] for r in marker_reqs]
            if len(set(bsets)) != 1:
                continue
            civ_set = set()
            disjoint = True
            for r in marker_reqs:
                rcivs = set(bld_markers[r]['civs'])
                if civ_set & rcivs:
                    disjoint = False
                    break
                civ_set.update(rcivs)
            if not disjoint:
                continue
            target_buildings = bsets[0]
        if not civ_set or not target_buildings:
            continue
        cmds = [c for c in a_cmds(t['EffectID']) if c[0] in (0, 4, 5)]
        rules, _eco = compile_cmds(cmds)
        if not rules or any(not r.get('b') for r in rules):
            continue
        kept_bids = {
            bid
            for bid in target_buildings
            if bid in ours and ours[bid].get('_b') and (set(ours[bid].get('civs', ())) & civ_set)
        }
        if not kept_bids:
            continue
        filtered_rules = _filter_redundant_building_rules(rules, kept_bids, mine, tech_rules_by_en)
        if not filtered_rules:
            continue
        used_bids = {bid for r in filtered_rules for bid in r['t']}
        civ_list = sorted(c for c in civ_set if any(c in ours[bid].get('civs', ()) for bid in used_bids))
        if not civ_list:
            continue
        marker_ages = [bld_markers[r]['age'] for r in marker_reqs]
        generic.append({
            'tech': i,
            'name': t['Name'],
            'age': max(ages + alias_ages + marker_ages or [1]),
            'req': mine,
            'any': False,
            'civs': civ_list,
            'rules': filtered_rules,
        })
    return generic


def main():
    A = load_dat()
    pc = fetch(SRC_C); lhc_src = pc.read_text() if pc else ''
    units = json.load(open(ROOT / 'data/game/units.json'))
    blds = json.load(open(ROOT / 'data/game/buildings.json'))
    techs = json.load(open(ROOT / 'data/game/techs.json'))
    civs = json.load(open(ROOT / 'data/game/civs.json'))
    trees = json.load(open(ROOT / 'data/game/trees.json'))
    units_by_id = {u['id']: u for u in units}
    ours = {u['id']: u for u in units}
    ours.update({b['id']: dict(b, _b=1) for b in blds})
    forms = building_age_forms(A, [b['id'] for b in blds])
    blds_by_id = {b['id']: b for b in blds}
    tech_to_blds = defaultdict(list)
    for bid_str, btid in (A.get('BuildTech') or {}).items():
        if isinstance(btid, int) and btid >= 0:
            tech_to_blds[btid].append(int(bid_str))
    tech_by_id = {t['id']: t for t in techs}
    AT, AE, AC = A['Techs'], A['Effects'], A['Civs']
    build_tech_ids = set(tech_to_blds.keys())
    fx_triggered_ids = fx_triggered_techs(AE)

    dcls = {i: u['Class'] for i, u in enumerate(AC[0]['Units']) if u}


    def targets(a, b):
        if a >= 0: return [a] if a in ours else []
        return [i for i in ours if dcls.get(i) == b]

    # ---- 一条命令 → [(unitId, effect)] / 经济文本 ----
    def cmd_fx(c, team=False):
        t, a, b, attr, d = c
        if t >= 10 and t <= 16: t -= 10  # 团队变体
        if t not in (0, 4, 5) or attr not in ATTR and attr not in ECO_ATTR: return [], None
        op = {0: 'set', 4: 'add', 5: 'mul'}[t]
        ids = targets(a, b)
        if a in BUILDER and attr == 13 and op == 'mul':
            return [(i, {'s': 'bt', 'op': 'mul', 'v': r6(1 / d)}) for i in ours if ours[i].get('_b')], None
        if attr in (19, 23): return [], None  # 投射物/搜索半径：与面板无关
        if attr == 13 and op == 'mul' and ids and all(ours[i]['en'] == 'Villager' for i in ids) and a in BUILDER:
            # 建造者工作效率 ×k ⇒ 建筑建造时间 ×1/k（Treadmill Crane、西班牙建造者等）
            return [(i, {'s': 'bt', 'op': 'mul', 'v': r6(1 / d)}) for i in ours if ours[i].get('_b')], None
        if attr in ECO_ATTR and (attr not in ATTR or attr == 101):
            if attr == 101 and ids:
                return [(i, {'s': 'bt', 'op': op, 'v': r6(d)}) for i in ids], None
            if not ids and a >= 0 and a not in ours: return [], None
            return [], {'a': attr, 'op': op, 'v': r6(d), 't': sorted(ids), 'cls': b if a < 0 else None, 'unit': a if a >= 0 else None}
        if attr == 10 and ids and all(dcls.get(i) == 18 for i in ids):
            # 僧侣的「攻击间隔」= 信仰恢复时间（不是攻速）→ 经济/机制文本
            return [], {'a': 10, 'op': op, 'v': r6(d), 't': sorted(ids), 'cls': b if a < 0 else None, 'unit': a if a >= 0 else None}
        out = []
        s = ATTR[attr]
        for i in ids:
            o = ours[i]
            if s in ('armor', 'attack'):
                if op == 'mul':
                    # DE 乘法编码：D = 类别*256 + 百分比（例 Burgundians 火药 7037=27*256+125 → 对类别27 ×1.25）
                    cls, pct = divmod(int(round(d)), 256)
                    f = r6(pct / 100)
                    if s == 'attack':
                        if cls in (3, 4):
                            if main_atk(o) == cls: out.append((i, {'s': 'atk', 'op': 'mul', 'v': f}))
                        else: out.append((i, {'s': 'bonus', 'vs': CL.get(cls, '类别%d' % cls), 'op': 'mul', 'v': f}))
                    else:
                        st = {4: 'ma', 3: 'pa'}.get(cls)
                        out.append((i, {'s': st, 'op': 'mul', 'v': f} if st else {'s': 'armc', 'vs': CL.get(cls, '类别%d' % cls), 'op': 'mul', 'v': f}))
                    continue
                dv = int(round(d))
                cls, amt = (dv // 256, dv % 256) if dv >= 0 else ((-dv) // 256, -((-dv) % 256))
                if s == 'armor':
                    st = {4: 'ma', 3: 'pa'}.get(cls) or ('barm' if cls == 11 and o.get('_b') else None)
                    if st: out.append((i, {'s': st, 'op': op, 'v': amt}))
                    else: out.append((i, {'s': 'armc', 'vs': CL.get(cls, '类别%d' % cls), 'op': op, 'v': amt}))
                else:
                    if cls in (3, 4):
                        if main_atk(o) == cls: out.append((i, {'s': 'atk', 'op': op, 'v': amt}))
                    else: out.append((i, {'s': 'bonus', 'vs': CL.get(cls, '类别%d' % cls), 'op': op, 'v': amt}))
            elif s == 'reload':
                base = o.get('rof') or 0
                if not base: continue
                new = base * d if op == 'mul' else base + d if op == 'add' else d
                if new > 0 and abs(new - base) > 1e-9: out.append((i, {'s': 'rof', 'v': r6(base / new - 1)}))
            elif s == 'tt':
                out.append((i, {'s': 'bt', 'op': op, 'v': r6(d)}))
            else:
                out.append((i, {'s': s, 'op': op, 'v': r6(d)}))
        return out, None

    def tech_name(i):
        if i in tech_by_id: return tech_by_id[i]['en']
        return AT[i]['Name'] if 0 <= i < len(AT) else str(i)

    def res_txt(c):
        t, a, b, cc, d = c
        if t in (11, 16): t -= 10
        if t == 1: return {'res': a, 'name': RES.get(a, '资源%d' % a), 'op': 'set' if b == 0 else 'add', 'v': r6(d)}
        if t in (101, 103):
            tn = tech_name(a)
            op = tech_cost_op(cc)
            if t == 101: return {'tech': tn, 'tid': a, 'what': tech_cost_what(b), 'op': op, 'v': r6(d)}
            return {'tech': tn, 'tid': a, 'what': '研究时间', 'op': op, 'v': r6(d)}
        if t == 6: return {'res': a, 'name': RES.get(a, '资源%d' % a), 'op': 'mul', 'v': r6(d)}
        return None

    def compile_cmds(cmds, return_excluded=False):
        """命令列表 → 规则 [{t:[ids], fx:[...]}] + 经济项；同一单位多条命令合并（加法求和、乘法连乘）。"""
        cmds = filter_aliased_cmds(cmds, ours, dcls)
        per = defaultdict(list); eco = []
        for c in cmds:
            fx, e = cmd_fx(c)
            for i, f in fx: per[i].append(f)
            if e: eco.append(e)
            r = res_txt(c)
            if r: eco.append(r)
        groups = defaultdict(list)
        canceled_units = set()
        for i, l in per.items():
            m = {}
            mul_counts = defaultdict(int)
            for f in l:
                k = (f['s'], f.get('op', 'add'), f.get('vs'))
                if f.get('op') == 'mul':
                    mul_counts[k] += 1
                if k not in m: m[k] = dict(f); continue
                g = m[k]
                if f['s'] == 'rof': g['v'] = r6((1 + g['v']) * (1 + f['v']) - 1)
                elif g.get('op', 'add') == 'add': g['v'] = r6(g['v'] + f['v'])
                elif g['op'] == 'mul': g['v'] = r6(g['v'] * f['v'])
                else: g['v'] = f['v']
            dropped_mul = any(
                k[1] == 'mul' and mul_counts[k] >= 2 and is_identity_mul(f['v'])
                for k, f in m.items()
            )
            fx = [f for f in m.values() if not is_identity_fx(f)]
            for f in fx:
                if f.get('op') == 'add' or f['s'] == 'rof': f.pop('op', None)
            fx.sort(key=lambda f: (f['s'], f.get('vs') or '', f.get('op') or ''))
            if fx:
                groups[json.dumps(fx, ensure_ascii=False, sort_keys=True)].append(i)
            elif dropped_mul and not ours[i].get('_b'):
                canceled_units.add(i)
        rules = []
        for k, ids in groups.items():
            u = sorted(i for i in ids if not ours[i].get('_b')); b = sorted(i for i in ids if ours[i].get('_b'))
            if u: rules.append({'t': u, 'fx': json.loads(k)})
            if b: rules.append({'t': b, 'fx': json.loads(k), 'b': 1})
        rules.sort(key=lambda r: (-len(r['t']), r['t'][0]))
        annotate_building_ages(eco, cmds, forms)
        if return_excluded:
            eco_units = {uid for x in eco for uid in (x.get('t') or ())}
            excluded = sorted(i for i in canceled_units if i not in eco_units)
            return rules, eco, excluded
        return rules, eco

    def a_cmds(eid):
        if eid is None or eid < 0 or eid >= len(AE): return []
        return [(c['Type'], c['A'], c['B'], c['C'], c['D']) for c in AE[eid]['EffectCommands']]

    def merged_cmds(tid):
        """科技的全部命令（战斗 + 经济），全部来自同一 .dat。"""
        return (a_cmds(AT[tid]['EffectID']) if 0 <= tid < len(AT) else []), True

    def age_req(tid, seen=None):
        """解析触发时代与前置科技（递归穿过隐藏科技）。"""
        seen = seen or set()
        req = [x for x in AT[tid]['RequiredTechs'] if x >= 0] if tid < len(AT) else []
        age, pre = 1, []
        for r in req:
            if r in AGE_TECH: age = max(age, AGE_TECH[r]); continue
            if r in tech_by_id: pre.append(tech_by_id[r]['en']); continue
            nm = AT[r]['Name'] if r < len(AT) else ''
            m = re.search(r'(Feudal|Castle|Imperial)', nm or '')
            if m and 'Age' in nm: age = max(age, {'Feudal': 2, 'Castle': 3, 'Imperial': 4}[m.group(1)]); continue
            if r not in seen:
                seen.add(r); a2, p2 = age_req(r, seen); age = max(age, a2); pre += p2
        return age, sorted(set(pre))

    out = {'meta': {
        'generated_by': 'scripts/effects_build.py',
        'sources': [
            {'id': 'DAT', 'repo': DAT_SRC['repo'], 'commit': DAT_SRC['commit'][:7], 'file': DAT_SRC['path'], 'sha256': DAT_SRC['sha256'], 'patch': DAT_SRC['patch'], 'use': '全部 EffectCommands（战斗 + 经济/费用）、科技前置、文明科技树/团队加成；datVersion %s' % A.get('Version')},
            {'id': 'C', 'repo': 'linhongcun/lhc-aoe2', 'commit': '6fdb912', 'file': 'lib/data/unitTechFx.ts', 'patch': '作者本机 .dat（2026-08）', 'use': '对账参考（仅 EFFECTS-AUDIT 第五节；不影响 effects.json）'},
        ]}, 'techs': {}, 'civs': {}}

    # ---- 通用科技 ----
    for t in techs:
        if t['id'] in AGE_TECH: continue
        cmds, ok = merged_cmds(t['id'])
        rules, eco, excluded = compile_cmds(cmds, return_excluded=True)
        eco = supplement_script_cost_eco(t, eco, trees, units_by_id)
        age, pre = age_req(t['id'])
        rec = {'id': t['id'], 'combat': ok, 'rules': rules, 'eco': eco}
        if excluded:
            rec['excluded'] = excluded
        out['techs'][t['en']] = rec

    adat = {CIV_DAT.get(c['Name'], c['Name']): i for i, c in enumerate(AC)}

    # ---- 通用/限定文明隐藏科技（Civ=-1、不可研究）与时代科技自身单位属性（101/102/103） ----
    out['generic'] = build_generic_entries(
        AT, AE, AC, ours, tech_by_id, adat, [c['en'] for c in civs], a_cmds, compile_cmds,
        build_tech_ids=build_tech_ids, fx_triggered_ids=fx_triggered_ids, tech_rules_by_en=out['techs'],
    )

    # ---- 文明：bonus techs + tech tree + team ----
    for c in civs:
        en = c['en']
        ai = adat.get(en)
        entries = []
        conditional_entries = []
        # tech tree 效果（开局即有）
        # 科技树效果里的「禁用单位/科技」(2/102/103) 与本站无关，compile_cmds 自然忽略
        tree_cmds = a_cmds(AC[ai]['TechTreeID']) if ai is not None else []
        rules, eco = compile_cmds(tree_cmds)
        # tech tree 效果可能分属多条加成文本：逐规则/逐经济项拆成独立条目（tech = -1, -2, ...）
        k = 0
        for r in rules:
            k += 1; entries.append({'tech': -k, 'name': 'Tech tree #%d' % k, 'age': 1, 'req': [], 'combat': ai is not None, 'rules': [r], 'eco': []})
        for x in eco:
            k += 1; entries.append({'tech': -k, 'name': 'Tech tree #%d' % k, 'age': 1, 'req': [], 'combat': ai is not None, 'rules': [], 'eco': [x]})
        ids = {i for i, t in enumerate(AT) if ai is not None and t['Civ'] == ai and t['ResearchLocation'] <= 0 and t['EffectID'] >= 0} - set(TEAM_TECHS.get(en, []))
        for tid in sorted(ids):
            if tid in tech_by_id: continue
            if is_unreachable_tech(tid, AT[tid], build_tech_ids, fx_triggered_ids): continue
            cmds, ok = merged_cmds(tid)
            rules, eco = compile_cmds(cmds)
            if not rules and not eco and ok: continue
            nm = AT[tid]['Name']
            if '+ BL' in nm: continue  # 「已研究血统」时的引擎替换副本（与无 BL 版本数值相同），不重复计入
            rcosts = tech_resource_costs(AT[tid])
            if rcosts:
                # 凡带非空 resource_costs 的文明隐藏科技（如立陶宛圣物 699–702、后帝王 790/791）绝不进常驻 bonus
                cond = relic_condition(rcosts)
                if cond and (rules or eco):
                    c_age, c_pre = conditional_age_req(AT, tech_to_blds, blds_by_id, tech_by_id, tid, en)
                    conditional_entries.append({'tech': tid, 'name': nm, 'age': c_age, 'req': c_pre, 'combat': ok, 'rules': rules, 'eco': eco, 'condition': cond})
                continue
            age, pre = age_req(tid)
            entries.append({'tech': tid, 'name': nm, 'age': age, 'req': pre, 'combat': ok, 'rules': rules, 'eco': eco})
        team_cmds = a_cmds(AC[ai]['TeamBonusID']) if ai is not None else []
        trules, teco = compile_cmds(team_cmds)
        for tt in TEAM_TECHS.get(en, []):
            cm, _ = merged_cmds(tt); r2, e2 = compile_cmds(cm)
            trules += [r for r in r2 if r not in trules]; teco += [x for x in e2 if x not in teco]
        for e in entries:
            if e['rules'] and not rules_have_owned_target(e['rules'], en, ours):
                e['rulesUnowned'] = True
        for e in conditional_entries:
            if e['rules'] and not rules_have_owned_target(e['rules'], en, ours):
                e['rulesUnowned'] = True
        civ_rec = {'dat': ai is not None, 'bonus': entries, 'team': {'combat': ai is not None, 'rules': trules, 'eco': teco}}
        if conditional_entries:
            civ_rec['conditional'] = conditional_entries
        out['civs'][en] = civ_rec

    # ---- 关联 ----
    links = json.load(open(ROOT / 'data/sources/effects_links.json')) if (ROOT / 'data/sources/effects_links.json').exists() else {}
    CLASSW = ['Infantry', 'Cavalry', 'Mounted', 'Archer', 'Ship', 'Monk', 'Villager', 'Siege', 'Gunpowder', 'Camel', 'Elephant', 'Town Center', 'Castle', 'Scout', 'Galley', 'Knight', 'Spearman', 'Skirmisher', 'Tower', 'Dock', 'Farm', 'Building']
    bld_names = {b['id']: b['en'] for b in blds}
    tech_blds = {}
    upgrade_techs = set()
    for tid, tdat in enumerate(AT):
        locs = [loc[0] for loc in (tdat.get('ResearchAt') or []) if isinstance(loc, list) and loc]
        if not locs and (tdat.get('ResearchLocation') or -1) > 0:
            locs = [tdat['ResearchLocation']]
        bnames = sorted({bld_names[bid] for bid in locs if bid in bld_names})
        if bnames:
            tech_blds[tid] = bnames
        eid = tdat.get('EffectID', -1)
        if 0 <= eid < len(AE) and any(
            cmd.get('Type') == 3 and cmd.get('A') in ours and cmd.get('B') in ours and not ours[cmd['A']].get('_b')
            for cmd in (AE[eid].get('EffectCommands') or [])
        ):
            upgrade_techs.add(tid)
    for c in civs:
        ent = out['civs'][c['en']]
        L = links.get(c["en"], {})
        all_entries = ent['bonus'] + ent.get('conditional', [])
        for e in all_entries:
            names = {re.sub(r'^Elite ', '', ours[i]['en']) for r in e['rules'] for i in r['t']} | {re.sub(r'^Elite ', '', ours[i]['en']) for x in e['eco'] for i in x.get('t', []) if i in ours}
            names |= {w for w in CLASSW if any(w.lower() in n.lower() for n in names)}
            sc = [link_score(e, b, names, tech_blds=tech_blds, bld_names=bld_names, upgrade_techs=upgrade_techs) for b in c['bonEn']]
            if sc:
                mx = max(sc)
                if mx > 0 and (e['tech'] >= 0 or sc.count(mx) == 1):
                    best = sc.index(mx)
                else:
                    best = None
            else:
                best = None
            e['auto'] = best
            k = str(e['tech'])
            e['idx'] = L[k] if k in L else e['auto']
            e['linked'] = 'manual' if k in L else 'auto'
        for e in all_entries: e.pop('auto', None)

    # ---- 新鲜度：dat 数值 vs 当前补丁的游戏内加成文本（civs.json，来自当前 aoe2techtree 字符串） ----
    for c in civs:
        ent = out['civs'][c['en']]
        groups = defaultdict(list)
        for e in ent['bonus'] + ent.get('conditional', []):
            if e['idx'] is not None: groups[e['idx']].append(e)
        fr = {}
        for idx, es in groups.items():
            fr[str(idx)] = freshness(c['bonEn'][idx], es)
        fr['team'] = freshness(c['tbEn'], [{'age': 1, 'rules': ent['team']['rules'], 'eco': ent['team']['eco'], 'combat': ent['team']['combat']}])
        ent['fresh'] = fr

    # ---- #24 结构化训练费用折扣：仅由 .dat 费用效果（属性 100/103–106，乘法，非科技触发）逐时代累计得出 ----
    out['costDiscounts'] = cost_discounts(out, civs)

    # ---- #1328 弹道学（科技 93）弹丸适用单位（与 army_research_build.py 共用同一推导模块） ----
    dat_units = AC[1]['Units']

    # ---- #1499 人口空间属性（C=110）命中目录单位的固定 .dat 基线强校验（PopSpace === -1.0，fail-closed） ----
    for tech_en, rec in out['techs'].items():
        validate_pop_space_baselines(rec.get('eco') or (), dat_units, units_by_id, owner=f'tech:{tech_en}')
    for civ_en, cre in out['civs'].items():
        for ent in cre.get('bonus') or ():
            validate_pop_space_baselines(ent.get('eco') or (), dat_units, units_by_id, owner=f'civ:{civ_en}:bonus:{ent.get("tech")}')
        for ent in cre.get('conditional') or ():
            validate_pop_space_baselines(ent.get('eco') or (), dat_units, units_by_id, owner=f'civ:{civ_en}:conditional:{ent.get("tech")}')
        validate_pop_space_baselines((cre.get('team') or {}).get('eco') or (), dat_units, units_by_id, owner=f'civ:{civ_en}:team')
    unit_forms = transform_closure(dat_units, [u['id'] for u in units])
    ballistics_eid = AT[93]['EffectID']
    ballistics_cmds = AE[ballistics_eid]['EffectCommands'] if 0 <= ballistics_eid < len(AE) else []
    ballistics_units, ballistics_charge_only = split_projectile_units(
        dat_units,
        unit_forms,
        units,
        guided_projectile_ids(ballistics_cmds, attrs=(19,)),
    )
    out['ballistics'] = {'units': ballistics_units, 'chargeOnly': ballistics_charge_only}

    # ---- #1403 投射物剧毒科技（属性 145/146/147，如箭毒 1393）适用单位与有攻建筑（零硬编码 ID，按科技文明取交集） ----
    bld_forms = transform_closure(dat_units, [b['id'] for b in blds])
    attacking_blds = [b for b in blds if building_can_attack(b)]
    projectile_poison = {}
    for t in techs:
        tid = t['id']
        eid = AT[tid]['EffectID'] if 0 <= tid < len(AT) else -1
        raw_cmds = AE[eid]['EffectCommands'] if 0 <= eid < len(AE) else []
        poison_pids = guided_projectile_ids(raw_cmds, attrs=(145, 146, 147))
        if not poison_pids:
            continue
        tech_civs = set(t.get('civs') or ())
        scoped_units = [u for u in units if not tech_civs or (set(u.get('civs') or ()) & tech_civs)]
        scoped_blds = [b for b in attacking_blds if not tech_civs or (set(b.get('civs') or ()) & tech_civs)]
        p_units, _ = split_projectile_units(dat_units, unit_forms, scoped_units, poison_pids)
        p_blds, _ = split_projectile_units(dat_units, bld_forms, scoped_blds, poison_pids)
        if p_units or p_blds:
            projectile_poison[t['en']] = {'units': p_units, 'buildings': p_blds}
    out['projectilePoison'] = projectile_poison

    # ---- #1446 科技赋予投射物直线穿透（同弹丸 C=67 HitMode=1 且 C=119 > 0，如烟火之术 902 / 突袭 1379，零硬编码 ID，按科技文明取交集） ----
    projectile_pass_through = {}
    for t in techs:
        tid = t['id']
        eid = AT[tid]['EffectID'] if 0 <= tid < len(AT) else -1
        raw_cmds = AE[eid]['EffectCommands'] if 0 <= eid < len(AE) else []
        pt_pids = pass_through_projectile_ids(raw_cmds)
        if not pt_pids:
            continue
        tech_civs = set(t.get('civs') or ())
        scoped_units = [u for u in units if not tech_civs or (set(u.get('civs') or ()) & tech_civs)]
        scoped_blds = [b for b in attacking_blds if not tech_civs or (set(b.get('civs') or ()) & tech_civs)]
        pt_units, _ = split_projectile_units(dat_units, unit_forms, scoped_units, pt_pids)
        pt_blds, _ = split_projectile_units(dat_units, bld_forms, scoped_blds, pt_pids)
        if pt_units or pt_blds:
            projectile_pass_through[t['en']] = {'units': pt_units, 'buildings': pt_blds}
    out['projectilePassThrough'] = projectile_pass_through

    # ---- #1509 投射物追踪（C=19 bit 0）与弹速提升（Type==60 投射物 C=5 净正增量）科技范围（跳过 93 弹道学，其余零硬编码 ID） ----
    projectile_guidance = {}
    for t in techs:
        tid = t['id']
        if tid == 93:
            continue
        eid = AT[tid]['EffectID'] if 0 <= tid < len(AT) else -1
        raw_cmds = AE[eid]['EffectCommands'] if 0 <= eid < len(AE) else []
        track_pids, speed_pids = guidance_projectile_scopes(raw_cmds, dat_units)
        if not track_pids and not speed_pids:
            continue
        tech_civs = set(t.get('civs') or ())
        scoped_units = [u for u in units if not tech_civs or (set(u.get('civs') or ()) & tech_civs)]
        scoped_blds = [b for b in attacking_blds if not tech_civs or (set(b.get('civs') or ()) & tech_civs)]
        t_units, _ = split_projectile_units(dat_units, unit_forms, scoped_units, track_pids) if track_pids else ([], [])
        t_blds, _ = split_projectile_units(dat_units, bld_forms, scoped_blds, track_pids) if track_pids else ([], [])
        s_units, _ = split_projectile_units(dat_units, unit_forms, scoped_units, speed_pids) if speed_pids else ([], [])
        s_blds, _ = split_projectile_units(dat_units, bld_forms, scoped_blds, speed_pids) if speed_pids else ([], [])
        g_units = sorted(set(t_units) | set(s_units))
        g_blds = sorted(set(t_blds) | set(s_blds))
        if g_units or g_blds:
            projectile_guidance[t['en']] = {
                'units': g_units,
                'buildings': g_blds,
                'tracking': bool(t_units or t_blds),
                'speed': bool(s_units or s_blds),
            }
    out['projectileGuidance'] = projectile_guidance

    # ---- #1366 目录单位基础 combatAbility（属性 63 位掩码；全量 248 目录单位，供 effects.ts 零耦合折叠 a:63） ----
    combat_ability_base = {}
    for u in sorted(units, key=lambda x: x['id']):
        uid = u['id']
        du = dat_units[uid] if 0 <= uid < len(dat_units) else None
        ca = du.get('CombatAbility') if du else None
        if type(ca) is not int or ca < 0:
            raise ValueError(f'Missing or invalid CombatAbility for catalog unit {uid}: {ca!r}')
        combat_ability_base[str(uid)] = ca
    out['combatAbilityBase'] = combat_ability_base

    # .dat 中不存在的站内单位/建筑（应为空）：其科技/加成作用范围由运行时回退到手工判定
    U0 = AC[0]['Units']
    out['meta']['newIds'] = sorted(i for i in ours if i >= len(U0) or U0[i] is None)
    out['meta']['unmatchedCivs'] = [c['en'] for c in civs if c['en'] not in adat]
    (ROOT / 'data/game/effects.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(v['bonus']) for v in out['civs'].values())
    print('techs', len(out['techs']), 'civ bonus techs', n, 'size', (ROOT / 'data/game/effects.json').stat().st_size)



# ---------------- 关联：dat 加成科技 → civs.json 加成文本序号 ----------------
# 自动打分（科技内部名/作用单位/属性 与英文加成文本的词汇重合），data/sources/effects_links.json 人工校正关联（只校正「属于哪条」，不改数值）。
STAT_WORDS = {'hp': ['hp'], 'spd': ['move', 'faster'], 'rof': ['attack', 'faster', 'fire'], 'los': ['line of sight'], 'rng': ['range'], 'ma': ['armor'], 'pa': ['armor'],
              'atk': ['attack'], 'bonus': ['attack vs', 'bonus damage', 'damage'], 'bt': ['train', 'built', 'faster', 'work'], 'gar': ['garrison'], 'acc': ['accura'], 'minr': ['minimum range']}
ECO_WORDS = {100: ['cost'], 103: ['cost', 'food'], 104: ['cost', 'wood'], 105: ['cost', 'gold'], 106: ['cost', 'stone'], 13: ['work', 'faster'], 14: ['carry'], 109: ['regenerat'], 24: ['bonus damage'],
             107: ['projectile', 'arrow'], 101: ['train', 'faster']}
STOP = {'bonus', 'with', 'from', 'cost', 'make', 'avail', 'faster', 'units', 'unit', 'age1', 'age2', 'age3', 'age4', 'castle', 'imperial', 'feudal', 'dark'}


def tokens(s):
    s = s.lower().replace('-', ' ')
    return {w.rstrip('s') for w in re.findall(r'[a-z]{4,}', s)} - STOP, set(re.findall(r'\d+', s))


WHAT_RES_EN = {'食物': 'food', '木材': 'wood', '石料': 'stone', '黄金': 'gold'}
ECO_BLD_NAMES = {'Mill', 'Lumber Camp', 'Mining Camp', 'Market'}


def link_score(e, text, unames, tech_blds=None, bld_names=None, upgrade_techs=None):
    t = text.lower()
    is_tree = e.get('tech', 0) < 0
    if is_tree:
        nt, nn = set(), set()
    else:
        nt, nn = tokens(re.sub(r'^c-bonus,?\s*', '', e['name'], flags=re.I))
    tt, tn = tokens(text)
    sc = 3 * len(nt & tt) + 2 * len(nn & tn)
    for r in e['rules']:
        for f in r['fx']:
            sc += any(w in t for w in STAT_WORDS.get(f['s'], []))
    for x in e['eco']:
        if 'a' in x: sc += any(w in t for w in ECO_WORDS.get(x['a'], []))
        if 'tech' in x:
            sc += 2 * (x['tech'].lower() in t) + ('free' in t and x['v'] == 0)
            if is_tree:
                tid = x.get('tid')
                op = x.get('op')
                v = x.get('v')
                what = x.get('what') or ''
                res_en = WHAT_RES_EN.get(what)
                has_tech_kw = 'technolog' in t or 'upgrade' in t
                if tid in AGE_TECH and 'advanc' in t:
                    sc += 4
                if tech_blds and tid in tech_blds and has_tech_kw:
                    bnames = tech_blds[tid]
                    if any(bn.lower() in t for bn in bnames):
                        sc += 3
                    if 'economic' in t and any(bn in ECO_BLD_NAMES for bn in bnames):
                        sc += 2
                if op == 'set' and v == 0:
                    if res_en and f'no {res_en}' in t:
                        sc += 3
                    if upgrade_techs and tid in upgrade_techs and 'upgrade' in t and 'free' in t:
                        sc += 2
                elif op == 'mul' and isinstance(v, (int, float)) and v > 0 and v != 1:
                    if what == '研究时间':
                        pct_spd = str(round((1 / v - 1) * 100))
                        if ('research' in t or 'faster' in t) and pct_spd in tn:
                            sc += 3
                    else:
                        pct_cost = str(round((1 - v) * 100))
                        if (has_tech_kw or 'advanc' in t) and pct_cost in tn:
                            sc += 2
                            if res_en and res_en in t:
                                sc += 1
        if x.get('res') == 204 and bld_names and 'reveal' in t:
            bid = int(round(x['v']))
            bn = bld_names.get(bid)
            if bn and bn.lower() in t:
                sc += 3
    sc += 2 * len({n for n in unames if n.lower() in t})
    return sc



def candidates(kind, op, v):
    """一个累计值可能在文本中的写法（百分比/整数）。"""
    if op == 'mul':
        return {round(abs(v - 1) * 100), round(abs(1 / v - 1) * 100) if v else 0}
    if kind == 'rof': return {round(v * 100)}
    return {round(abs(v), 2), round(abs(v))}


COST_RES = {100: ['Food', 'Wood', 'Gold', 'Stone'], 103: ['Food'], 104: ['Wood'], 105: ['Gold'], 106: ['Stone']}
AGE_N = {'Dark': 1, 'Feudal': 2, 'Castle': 3, 'Imperial': 4}


def text_pcts(text, start):
    """加成文本里的费用百分比 → {时代: p}；只用于与 .dat 对账，不作为数值来源。读不出返回 None。"""
    m = re.search(r'-(\d+(?:/\d+)*)%', text)
    if not m: return None
    ps = [int(x) for x in m.group(1).split('/')]
    st = re.search(r'starting in (Dark|Feudal|Castle|Imperial) Age', text)
    ag = re.search(r'in ((?:(?:Dark|Feudal|Castle|Imperial)/?)+) Age', text)
    if st: ages = [a for a in (1, 2, 3, 4) if a >= AGE_N[st.group(1)]]
    elif ag: ages = [AGE_N[x] for x in ag.group(1).split('/')]
    else: ages = [a for a in (1, 2, 3, 4) if a >= start]
    if len(ps) == 1: ps = ps * len(ages)
    if len(ps) != len(ages): return None
    return dict(zip(ages, ps))


def cost_discounts(out, civs):
    """civ → [{idx, techs, groups:[{units, res, tiers:{时代: 累计乘数}}], text:{时代: p}|None, ok}]。
    tiers 是 .dat 原始乘数的累计，运行时直接拿来乘（src/domain/costPolicy.ts）。
    text 只用于对账。ok=True 表示这一序号下每个分组的整数百分比都等于本句文本；
    运行时不看这个总开关，而是按组对账，一组还能对上同一文明的另一句费用文本。
    文本没列出的时代不给档（tiers 不含该时代）。对不上任何句子的组不计入。"""
    res = {}
    for c in civs:
        ent = out['civs'].get(c['en'])
        if not ent: continue
        by_idx = defaultdict(list)
        for e in ent['bonus']:
            if e.get('req'): continue
            for x in e['eco']:
                if x.get('a') in COST_RES and x.get('op') == 'mul' and x.get('t'):
                    by_idx[e['idx']].append((e['tech'], e['age'], x))
        lst = []
        for idx, xs in by_idx.items():
            per_unit = defaultdict(lambda: defaultdict(lambda: {a: 1.0 for a in (1, 2, 3, 4)}))
            first = {}
            for tech, age, x in xs:
                for u in x['t']:
                    key = tuple(COST_RES[x['a']])
                    first[(u, key)] = min(first.get((u, key), 9), age)
                    for a in (1, 2, 3, 4):
                        if a >= age: per_unit[u][key][a] *= x['v']
            text = text_pcts(c['bonEn'][idx], min(a for _, a, _ in xs)) if idx is not None and idx >= 0 else None
            groups = defaultdict(list)
            ok = text is not None
            for u, by_res in per_unit.items():
                for key, ser in by_res.items():
                    tiers = {a: round(ser[a], 6) for a in (1, 2, 3, 4) if a >= first[(u, key)] and (text is None or a in text)}
                    if text is not None:
                        for a, p in text.items():
                            if a >= first[(u, key)] and round((1 - ser[a]) * 100) != p: ok = False
                    groups[(key, json.dumps(tiers, sort_keys=True))].append(u)
            lst.append({
                'idx': idx,
                'techs': sorted({t for t, _, _ in xs}),
                'groups': [{'units': sorted(us), 'res': list(k[0]), 'tiers': json.loads(k[1])} for k, us in groups.items()],
                'text': text,
                'ok': ok,
            })
        if lst: res[c['en']] = lst
    return res


def freshness(text, es):
    """返回 {'ok': bool|None, 'dat': [...], 'text': [...]}；ok=None 表示无可比数值。"""
    nums = {float(x) for x in re.findall(r'\d+(?:\.\d+)?', text)}
    if not nums: return {'ok': None, 'dat': [], 'text': []}
    seen = []
    # 战斗：按 stat 取首个规则的首个单位，逐时代累计
    stat_series = defaultdict(lambda: {a: None for a in (1, 2, 3, 4)})
    for e in sorted(es, key=lambda e: e['age']):
        if e.get('req') or e.get('rulesUnowned'): continue  # 由科技触发，或规则目标均为非本文明可拥有对象
        for r in e['rules']:
            for f in r['fx']:
                k = (f['s'], f.get('op', 'add'), f.get('vs'), r['t'][0])
                if k[0] == 'armc': continue
                ser = stat_series[k]
                for a in (1, 2, 3, 4):
                    if a >= e['age']:
                        cur = ser[a]
                        if f['s'] == 'rof': ser[a] = (1 + (cur or 0)) * (1 + f['v']) - 1
                        elif k[1] == 'mul': ser[a] = (cur or 1) * f['v']
                        elif k[1] == 'set': ser[a] = f['v']
                        else: ser[a] = (cur or 0) + f['v']
    for e in sorted(es, key=lambda e: e['age']):
        done = set()
        for x in e['eco']:
            if 'a' not in x or x['a'] not in (100, 103, 104, 105, 106, 13, 14, 109, 101) or x['a'] in done: continue
            done.add(x['a'])
            k = ('eco%d' % x['a'], x['op'], json.dumps(x.get('t', [])[:1]))
            ser = stat_series[k]
            for a in (1, 2, 3, 4):
                if a >= e['age']:
                    cur = ser[a]
                    ser[a] = (cur or 1) * x['v'] if x['op'] == 'mul' else x['v'] if x['op'] == 'set' else (cur or 0) + x['v']
    for k, ser in stat_series.items():
        vals = []
        for a in (1, 2, 3, 4):
            v = ser[a]
            if v is not None and (vals == [] or abs(vals[-1] - v) > 1e-6): vals.append(v)
        seen.append((k[0], k[1], vals))
    if not seen: return {'ok': None, 'dat': [], 'text': sorted(nums)}
    ok = True; dat = []
    for kind, op, vals in seen:
        for v in vals:
            if op == 'set' or (op == 'add' and v == 0) or (op == 'mul' and abs(v - 1) < 1e-6): continue
            cs = candidates(kind, op, v)
            dat.append(sorted(cs)[0] if len(cs) == 1 else sorted(cs))
            tol = 0.01 if (op == 'add' and kind != 'rof' and not kind.startswith('eco')) else 1  # 绝对加值须精确，百分比允许取整误差
            if not any(abs(cn - n) <= tol for cn in cs for n in nums): ok = False
    return {'ok': ok if dat else None, 'dat': dat, 'text': sorted(nums)}


if __name__ == '__main__':
    main()
