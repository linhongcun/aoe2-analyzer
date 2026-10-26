#!/usr/bin/env python3
"""从固定版本 .dat 导出开局/经济模拟所需数据 → src/data/eco.json，并与 aoe2techtree 对账 → docs/ECO-DATA.md

导出：
- 单位训练时间/训练地点/费用；建筑建造时间/费用；科技研究时间/地点/费用（含时代升级）
- 村民各任务采集/工作速率（每秒，.dat 原始 work_rate，不含往返行走）、携带量、移速；渔船
- 通用经济科技（城镇中心/磨坊/伐木场/采矿场/市场/船坞）的效果
- 各文明经济相关效果（文明科技树、加成科技、团队加成）：采集速率、携带量、移速、费用、训练/研究时间、资源
用法：python3 scripts/eco_build.py"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dat_source import DAT, load  # noqa: E402
from effects_build import CIV_DAT  # noqa: E402
from res_names import RES_ZH as RES_LABEL  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RES = {0: 'Food', 1: 'Wood', 2: 'Stone', 3: 'Gold'}
# 村民任务单位（男/女）→ 任务名
TASKS = {'build': (118, 212), 'sheep': (592, 590), 'hunt': (122, 216), 'berries': (120, 354), 'farm': (259, 214),
         'fish': (56, 57), 'wood': (123, 218), 'gold': (579, 581), 'stone': (124, 220)}
TASK_OF = {u: k for k, v in TASKS.items() for u in v}
VIL = (83, 293)
ATTR = {5: 'speed', 13: 'workRate', 14: 'carry', 100: 'cost', 101: 'trainTime', 103: 'foodCost', 104: 'woodCost', 105: 'goldCost', 106: 'stoneCost'}
OP = {0: 'set', 4: 'add', 5: 'mul'}
# 效果 101/103（科技费用/时间）的 C 字段：0 = 设为，1 = 加，2 = 乘，-1 = 加（#355）。未知模式仍按设为。
TECH_OP = {0: 'set', 1: 'add', 2: 'mul', -1: 'add'}
ECO_BLDG = {109: 'Town Center', 68: 'Mill', 562: 'Lumber Camp', 584: 'Mining Camp', 84: 'Market', 45: 'Dock'}
AGE_TECHS = {101: 'Feudal Age', 102: 'Castle Age', 103: 'Imperial Age'}


def cost(c):
    """全部资源费用（含 flag=0 项，例如城镇中心的 100 石：.dat 中 flag=0，但游戏内实际收取）。"""
    return {RES[x[0]]: x[1] for x in c if x[0] in RES and x[1]}


def norm(c):
    return {k: v for k, v in (c or {}).items() if v}


def decode(cmds, techs):
    out = []
    for c in cmds:
        t, a, b, cc, dv = c['Type'], c['A'], c['B'], c['C'], c['D']
        if t in OP and cc in ATTR:
            tgt = ('task:' + TASK_OF[a]) if a in TASK_OF else ('villager' if a in VIL else ('unit:%d' % a if a >= 0 else 'class:%d' % b))
            x = {'kind': 'attr', 'target': tgt, 'attr': ATTR[cc], 'op': OP[t], 'v': round(dv, 6)}
            if x not in out: out.append(x)  # 男/女任务单位为同值副本，合并
        elif t in (1, 6):
            out.append({'kind': 'res', 'res': a, 'label': RES_LABEL.get(a), 'op': 'mul' if t == 6 else ('add' if b == 1 else 'set'), 'v': round(dv, 6)})
        elif t == 101 and 0 <= a < len(techs):
            out.append({'kind': 'techCost', 'tech': a, 'techName': techs[a]['Name'], 'res': RES.get(b, b), 'op': TECH_OP.get(cc, 'set'), 'v': dv})
        elif t == 103 and 0 <= a < len(techs):
            out.append({'kind': 'techTime', 'tech': a, 'techName': techs[a]['Name'], 'op': TECH_OP.get(cc, 'set'), 'v': dv})
    return out


def eff(d, eid):
    return d['Effects'][eid]['EffectCommands'] if 0 <= eid < len(d['Effects']) else []


def split_tree_effects(effects):
    """固定 .dat 用研究时间设为 0 标记自动免费科技；仅免某种资源仍是费用修正（#393）。"""
    free_ids = {x['tech'] for x in effects if x['kind'] == 'techTime' and x['op'] == 'set' and x['v'] == 0}
    tree = [x for x in effects if not (x.get('tech') in free_ids and x['kind'] in ('techCost', 'techTime')
                                      and x['op'] == 'set' and x['v'] == 0)]
    free = sorted({x['techName'] for x in effects if x.get('tech') in free_ids})
    return tree, free


def main():
    d = load(); U = d['Civs'][1]['Units']; T = d['Techs']
    units = json.load(open(ROOT / 'src/data/units.json')); techs = json.load(open(ROOT / 'src/data/techs.json'))
    blds = json.load(open(ROOT / 'src/data/buildings.json')); civs = json.load(open(ROOT / 'src/data/civs.json'))
    fx = json.load(open(ROOT / 'src/data/effects.json'))
    out = {'meta': {'generated_by': 'scripts/eco_build.py', 'source': '%s@%s %s' % (DAT['repo'], DAT['commit'][:7], DAT['path']), 'patch': DAT['patch'],
                    'units': '训练时间为秒（不含文明/科技加成）', 'tasks': '采集速率为 .dat work_rate（资源/秒，纯采集，不含往返行走与放下资源）'},
           'units': {}, 'buildings': {}, 'techs': {}}
    diffs = []

    def put(kind, i, en, time_key, ref_time, ref_cost):
        u = U[i] if i < len(U) else None
        if not u: diffs.append((kind, i, en, '.dat 中不存在', '', '')); return
        rec = {'en': en, time_key: u['TrainTime'], 'at': [x[0] for x in u['TrainAt']], 'cost': cost(u['Cost'])}
        if kind in ('units', 'buildings'): rec['class'] = u['Class']  # #42/#197：按类别的单位/建筑费用
        if len({x[1] for x in u['TrainAt']}) > 1: rec['timeAt'] = {str(x[0]): x[1] for x in u['TrainAt']}
        out[kind][str(i)] = rec
        if ref_time is not None and ref_time != rec[time_key] and ref_time not in rec.get('timeAt', {}).values(): diffs.append((kind, i, en, time_key, ref_time, rec[time_key]))
        if ref_cost is not None and norm(ref_cost) != rec['cost']: diffs.append((kind, i, en, 'cost', ref_cost, rec['cost']))

    for x in units: put('units', x['id'], x['en'], 'trainTime', x.get('tt'), x.get('cost'))
    if '83' not in out['units']: put('units', 83, 'Villager', 'trainTime', None, None)
    for x in blds: put('buildings', x['id'], x['en'], 'buildTime', x.get('bt'), x.get('cost'))
    for b in (50, 70, 68, 562, 584, 45, 109, 12, 87, 101, 49, 103, 84):
        if str(b) not in out['buildings']: put('buildings', b, U[b]['Name'], 'buildTime', None, None)
    tech_ids = {x['id']: x for x in techs}
    for i in sorted(set(tech_ids) | set(AGE_TECHS)):
        t = T[i]; x = tech_ids.get(i)
        rec = {'en': x['en'] if x else AGE_TECHS[i], 'researchTime': t['ResearchTime'], 'at': t['ResearchLocation'], 'cost': cost(t['Cost'])}
        out['techs'][str(i)] = rec
        if x and x.get('rt') is not None and x['rt'] != rec['researchTime']: diffs.append(('techs', i, rec['en'], 'researchTime', x['rt'], rec['researchTime']))
        if x and x.get('cost') is not None and norm(x['cost']) != rec['cost']: diffs.append(('techs', i, rec['en'], 'cost', x['cost'], rec['cost']))

    # 村民
    def task_rec(uid):
        u = U[uid]; return {'unit': uid, 'workRate': round(u['WorkRate'], 4), 'carry': u['Capacity'], 'speed': round(u['Speed'], 4)}
    out['villager'] = {'unit': 83, 'trainTime': U[83]['TrainTime'], 'cost': cost(U[83]['Cost']), 'speed': round(U[83]['Speed'], 4),
                       'carry': U[83]['Capacity'], 'hp': U[83]['HP'], 'tasks': {k: task_rec(v[0]) for k, v in TASKS.items()},
                       'female': {k: task_rec(v[1]) for k, v in TASKS.items()}}
    # #42 哥特：猎物/家畜所含食物（unit 资源储量 type 0），猎物倍率 res 268 的基数从这里读，不写死
    G = d['Civs'][0]['Units']; out['animals'] = {k: {'unit': uid, 'en': G[uid]['Name'], 'food': G[uid]['Food']} for k, uid in (('boar', 48), ('deer', 65), ('sheep', 594))}
    out['fishingShip'] = task_rec(13) | {'trainTime': U[13]['TrainTime'], 'cost': cost(U[13]['Cost'])}
    # Deep-sea fish use class 5 gather task (action 5); retain multiplier from pinned .dat.
    out['fishingShip']['deepFishMultiplier'] = next(t['Value'] for t in d['Tasks']['13'] if t['Action'] == 5 and t['Class'] == 5)
    memo = {}

    def age_of(i, depth=0):
        """科技最早可用时代：沿 RequiredTechs 递归，遇到时代科技 101/102/103 → 2/3/4。"""
        if i in memo: return memo[i]
        if depth > 20: return 1
        r = [x for x in T[i]['RequiredTechs'] if x >= 0]
        a = max([{101: 2, 102: 3, 103: 4}.get(x) or age_of(x, depth + 1) for x in r] or [1])
        if i in AGE_TECHS: a = max(a, {101: 2, 102: 3, 103: 4}[i])
        memo[i] = a; return a
    # 通用经济科技
    out['ecoTechs'] = {}
    for i, t in enumerate(T):
        at = [ECO_BLDG[l] for l, _ in t['ResearchAt'] if l in ECO_BLDG]
        if t['Civ'] == -1 and at and (i in tech_ids or i in AGE_TECHS):
            out['ecoTechs'][str(i)] = {'name': t['Name'], 'en': tech_ids[i]['en'] if i in tech_ids else AGE_TECHS[i], 'at': at[0],
                                       'researchTime': next(x for l, x in t['ResearchAt'] if l in ECO_BLDG), 'cost': cost(t['Cost']), 'age': age_of(i),
                                       'effects': decode(eff(d, t['EffectID']), T)}
    # 文明经济效果
    dat_civ = {c['Name']: k for k, c in enumerate(d['Civs'])}
    out['civEco'] = {}
    for c in civs:
        e = fx['civs'].get(c['en'], {}); k = dat_civ.get(c['en'], dat_civ.get({v: kk for kk, v in CIV_DAT.items()}.get(c['en'])))
        if k is None: continue
        dc = d['Civs'][k]; rows = []
        tree, free = split_tree_effects(decode(eff(d, dc['TechTreeID']), T))
        if tree: rows.append({'source': 'tree', 'name': 'Tech tree', 'age': 1, 'effects': tree})
        if free: rows.append({'source': 'tree', 'name': 'Free techs', 'age': 1, 'effects': [{'kind': 'freeTech', 'techName': n} for n in free]})
        # 加成科技：本文明专属、无研究地点（引擎自动生效），与 effects_build 相同的选取规则，但不过滤「站内无对应单位」的经济效果
        for i, t in enumerate(T):
            if t['Civ'] != k or t['ResearchLocation'] > 0 or t['EffectID'] < 0 or '+ BL' in t['Name']: continue
            ef = decode(eff(d, t['EffectID']), T)
            if ef: rows.append({'source': 'bonus', 'tech': i, 'name': t['Name'], 'age': age_of(i), 'requires': [x for x in t['RequiredTechs'] if x >= 0], 'effects': ef})
        team = decode(eff(d, dc['TeamBonusID']), T)
        if team: rows.append({'source': 'team', 'name': 'Team bonus', 'age': 1, 'effects': team})
        out['civEco'][c['en']] = rows
    # 升级时代的前置建筑（#3 根因 3）：时代科技 101/102/103 的非时代前置（Shadow Node+ 659/660/661）按 .dat 展开成条件树。
    # 叶子：建成时触发该科技的建筑（Building.tech_id，dat_source BuildTech）；或本文明专属、无前置的科技（如高棉 638，自动满足）。
    # 节点：{n: 需满足的子项个数, of: [...]}；叶子：{b: [建筑 id], zh: 名称} / {civ: [文明]}；无法在开局中满足的叶子（由效果触发的 Port built 等）略去。
    BT = {}
    for u, tid in d.get('BuildTech', {}).items(): BT.setdefault(tid, []).append(int(u))
    BZH = {b['id']: b['zh'] for b in json.load(open(ROOT / 'src/data/buildings.json'))}
    civ_en = {k: c['en'] for c in civs for k in [dat_civ.get(c['en'], dat_civ.get({v: kk for kk, v in CIV_DAT.items()}.get(c['en'])))] if k is not None}
    def req(i, depth=0):
        t = T[i]; kids = [r for r in t['RequiredTechs'] if r >= 0]
        if i in BT:
            ids = sorted(BT[i]); zh = next((BZH[b] for b in ids if b in BZH), t['Name'])
            return {'b': ids, 'zh': zh}
        if not kids:
            if t['RequiredTechCount'] == 0 and t['Civ'] >= 0 and t['Civ'] in civ_en: return {'civ': [civ_en[t['Civ']]]}
            return None
        of = [x for x in (req(r, depth + 1) for r in kids) if x]
        n = t['RequiredTechCount']
        if not of or len(of) < n: return None
        return {'n': n, 'of': of}
    out['ageReq'] = {}
    for i, a in ((101, 2), (102, 3), (103, 4)):
        pre = [r for r in T[i]['RequiredTechs'] if r >= 0 and r not in (101, 102, 103, 104)]
        out['ageReq'][str(a)] = {'tech': i, 'req': req(pre[0]) if pre else None}
    # 键序排序：与 units.json 的排序解耦，输出确定
    (ROOT / 'src/data/eco.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':'), sort_keys=True))

    md = ['# 经济/开局数据导出与对账', '', '由 `scripts/eco_build.py` 从 %s（%s）生成 `src/data/eco.json`。' % (out['meta']['source'], DAT['patch']), '',
          '## 村民（.dat 原始值）', '', '| 任务 | 任务单位 | work_rate（/秒） | 携带量 |', '| --- | --- | --- | --- |']
    for k, v in out['villager']['tasks'].items(): md.append('| %s | %d | %s | %s |' % (k, v['unit'], v['workRate'], v['carry']))
    md += ['', '村民：训练 %ss，%s，移速 %s，基础携带 %s。渔船：work_rate %s，携带 %s。' % (out['villager']['trainTime'], out['villager']['cost'], out['villager']['speed'], out['villager']['carry'], out['fishingShip']['workRate'], out['fishingShip']['carry']),
           '', '猎物/家畜食物：' + '，'.join('%s（unit %d）%s' % (k, v['unit'], v['food']) for k, v in out['animals'].items()) + '。',
           '', '> work_rate 是纯采集速率；实际每分钟收入还取决于往返距离、放下资源时间等，模拟时需另建模型。', '',
           '## 与 aoe2techtree 对账（训练/建造/研究时间、费用）', '']
    real = [x for x in diffs if x[3] != '.dat 中不存在']
    md.append('共比较 单位 %d / 建筑 %d / 科技 %d；差异 %d 项：' % (len(units), len(blds), len(techs), len(real)))
    md += ['', '| 类型 | ID | 名称 | 字段 | aoe2techtree | .dat |', '| --- | --- | --- | --- | --- | --- |']
    md += ['| %s | %s | %s | %s | %s | %s |' % x for x in real] or ['| — | | | | | |']
    miss = [x for x in diffs if x[3] == '.dat 中不存在']
    if miss: md += ['', '.dat 中不存在的 ID：' + '、'.join('%s %s' % (x[1], x[2]) for x in miss)]
    (ROOT / 'docs/ECO-DATA.md').write_text('\n'.join(md) + '\n')
    print('eco.json units %d buildings %d techs %d ecoTechs %d civs %d；对账差异 %d' % (len(out['units']), len(out['buildings']), len(out['techs']), len(out['ecoTechs']), len(out['civEco']), len(real)))
    for x in real: print('  diff', x)


if __name__ == '__main__':
    main()
