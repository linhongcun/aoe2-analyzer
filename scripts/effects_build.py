#!/usr/bin/env python3
"""从 .dat 原始效果表生成 src/data/effects.json（科技 / 文明加成 / 团队加成的结构化效果）。

数据源：DE 原版 empires2_x2_p1.dat（SiegeEngineers/auto-mods@0c38027，DE Update 185872，sha256 固定），
  由 scripts/dat_source.py 在构建时下载、校验（sha256 + 补丁标记）并用 genieutils-py 解析；.dat © Microsoft，不提交、不发布。
  全部 EffectCommands（战斗属性 + 经济/费用 + 资源）均来自这一个文件。
  对账参考（可选）：linhongcun/lhc-aoe2 lib/data/unitTechFx.ts（作者本机 .dat，2026-08）。

用法：python3 scripts/effects_build.py   （下载缓存在 scripts/.cache/）
"""
import json, os, re, sys, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dat_source import DAT as DAT_SRC, load as load_dat  # noqa: E402
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
            102: '箭矢数', 107: '最大箭矢数', 22: '溅射半径', 24: '克制伤害抗性', 108: '驻扎回血', 109: '生命恢复', 63: '特殊能力', 19: '投射物命中', 23: '搜索半径'}
RES = {0: '起始食物', 1: '起始木材', 2: '起始石料', 3: '起始黄金', 4: '人口上限', 32: '额外人口', 77: '征服', 92: '贸易收益(%)', 93: '钓鱼/采集', 190: '村民生产速度',
       47: '交易手续费', 79: '贸易收益', 194: '农田食物量', 216: '城镇中心与村民', 214: '牧场'}
CL = {1: '步兵', 3: '穿刺', 4: '近战', 5: '战象', 8: '骑兵', 11: '所有建筑', 13: '石质防御', 15: '弓手', 16: '船只', 17: '冲车', 18: '树木', 19: '独特单位', 20: '攻城武器',
      21: '标准建筑', 22: '城墙/城门', 23: '火药单位', 25: '僧侣', 26: '城堡', 27: '长矛兵', 28: '骑射手', 29: '冲击步兵', 30: '骆驼', 32: '雇佣兵', 34: '渔船', 35: '马穆鲁克', 36: '英雄/国王', 39: '村民', 2: '重型战舰', 31: '特殊近战', 37: '重型攻城武器', 38: '掷矛手', 41: '喷火船', 60: '远程战船'}
BUILDER = {118}  # 建造者（男性 id；女性 212 为同值副本，只计一次）
AGE_TECH = {101: 2, 102: 3, 103: 4}
CIV_DAT = {'British': 'Britons', 'French': 'Franks', 'Byzantine': 'Byzantines', 'Mayan': 'Mayans', 'Indians': 'Hindustanis'}


def main():
    A = load_dat()
    pc = fetch(SRC_C); lhc_src = pc.read_text() if pc else ''
    units = json.load(open(ROOT / 'src/data/units.json'))
    blds = json.load(open(ROOT / 'src/data/buildings.json'))
    techs = json.load(open(ROOT / 'src/data/techs.json'))
    civs = json.load(open(ROOT / 'src/data/civs.json'))
    ours = {u['id']: u for u in units}
    ours.update({b['id']: dict(b, _b=1) for b in blds})
    tech_by_id = {t['id']: t for t in techs}
    AT, AE, AC = A['Techs'], A['Effects'], A['Civs']

    dcls = {i: u['Class'] for i, u in enumerate(AC[0]['Units']) if u}
    # 站内单位的主攻击类别（4 近战 / 3 穿刺）
    def main_atk(o):
        n = [x[0] for x in o.get('atks', [])]
        if o.get('_b'): return 3
        return 4 if '近战' in n else 3 if '穿刺' in n else None


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

    def r6(x):
        x = float(x)
        return int(x) if abs(x - round(x)) < 1e-9 else round(x, 6)

    def tech_name(i):
        if i in tech_by_id: return tech_by_id[i]['en']
        return AT[i]['Name'] if 0 <= i < len(AT) else str(i)

    def res_txt(c):
        t, a, b, _, d = c
        if t in (11, 16): t -= 10
        if t == 1: return {'res': a, 'name': RES.get(a, '资源%d' % a), 'op': 'set' if b == 0 else 'add', 'v': r6(d)}
        if t in (101, 103):
            tn = tech_name(a)
            if t == 101: return {'tech': tn, 'tid': a, 'what': {0: '食物', 1: '木材', 2: '石料', 3: '黄金'}.get(b, '资源%d' % b), 'op': 'set' if c[3] == 0 else 'add', 'v': r6(d)}
            return {'tech': tn, 'tid': a, 'what': '研究时间', 'op': 'set' if c[3] == 0 else 'add', 'v': r6(d)}
        if t == 6: return {'res': a, 'name': RES.get(a, '资源%d' % a), 'op': 'mul', 'v': r6(d)}
        return None

    def compile_cmds(cmds):
        """命令列表 → 规则 [{t:[ids], fx:[...]}] + 经济项；同一单位多条命令合并（加法求和、乘法连乘）。"""
        per = defaultdict(list); eco = []
        for c in cmds:
            fx, e = cmd_fx(c)
            for i, f in fx: per[i].append(f)
            if e: eco.append(e)
            r = res_txt(c)
            if r: eco.append(r)
        groups = defaultdict(list)
        for i, l in per.items():
            m = {}
            for f in l:
                k = (f['s'], f.get('op', 'add'), f.get('vs'))
                if k not in m: m[k] = dict(f); continue
                g = m[k]
                if f['s'] == 'rof': g['v'] = r6((1 + g['v']) * (1 + f['v']) - 1)
                elif g.get('op', 'add') == 'add': g['v'] = r6(g['v'] + f['v'])
                elif g['op'] == 'mul': g['v'] = r6(g['v'] * f['v'])
                else: g['v'] = f['v']
            fx = [f for f in m.values() if not (f.get('op', 'add') == 'add' and f['v'] == 0) and not (f.get('op') == 'mul' and f['v'] == 1)]
            for f in fx:
                if f.get('op') == 'add' or f['s'] == 'rof': f.pop('op', None)
            fx.sort(key=lambda f: (f['s'], f.get('vs') or '', f.get('op') or ''))
            if fx: groups[json.dumps(fx, ensure_ascii=False, sort_keys=True)].append(i)
        rules = []
        for k, ids in groups.items():
            u = sorted(i for i in ids if not ours[i].get('_b')); b = sorted(i for i in ids if ours[i].get('_b'))
            if u: rules.append({'t': u, 'fx': json.loads(k)})
            if b: rules.append({'t': b, 'fx': json.loads(k), 'b': 1})
        rules.sort(key=lambda r: (-len(r['t']), r['t'][0]))
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
        rules, eco = compile_cmds(cmds)
        age, pre = age_req(t['id'])
        out['techs'][t['en']] = {'id': t['id'], 'combat': ok, 'rules': rules, 'eco': eco}

    # ---- 通用隐藏科技（Civ=-1、不可研究）：时代自动效果（如 Tracking、城墙随时代加血）与组合效果（如 Arrowslits + Keep） ----
    out['generic'] = []
    for i, t in enumerate(AT):
        if t['Civ'] != -1 or t['ResearchLocation'] > 0 or t['EffectID'] < 0 or i in tech_by_id or i in AGE_TECH: continue
        rq = [r for r in t['RequiredTechs'] if r >= 0]
        if not rq: continue
        ages = [AGE_TECH[r] for r in rq if r in AGE_TECH]
        mine = [tech_by_id[r]['en'] for r in rq if r in tech_by_id and r not in AGE_TECH]
        other = [r for r in rq if r not in AGE_TECH and r not in tech_by_id]
        # 需要的前置数 = RequiredTechCount；只收录「我方可识别的前置」恰好满足数量的条目
        need = t['RequiredTechCount'] or len(rq)
        if len(ages) + len(mine) < need: continue
        cmds = [c for c in a_cmds(t['EffectID']) if c[0] in (0, 4, 5)]
        rules, eco = compile_cmds(cmds)
        if not rules: continue
        out['generic'].append({'tech': i, 'name': t['Name'], 'age': max(ages or [1]), 'req': mine, 'any': len(ages) + len(mine) > need, 'rules': rules})

    # ---- 文明：bonus techs + tech tree + team ----
    adat = {CIV_DAT.get(c['Name'], c['Name']): i for i, c in enumerate(AC)}
    for c in civs:
        en = c['en']
        ai = adat.get(en)
        entries = []
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
            cmds, ok = merged_cmds(tid)
            rules, eco = compile_cmds(cmds)
            if not rules and not eco and ok: continue
            age, pre = age_req(tid)
            nm = AT[tid]['Name']
            if '+ BL' in nm: continue  # 「已研究血统」时的引擎替换副本（与无 BL 版本数值相同），不重复计入
            entries.append({'tech': tid, 'name': nm, 'age': age, 'req': pre, 'combat': ok, 'rules': rules, 'eco': eco})
        team_cmds = a_cmds(AC[ai]['TeamBonusID']) if ai is not None else []
        trules, teco = compile_cmds(team_cmds)
        for tt in TEAM_TECHS.get(en, []):
            cm, _ = merged_cmds(tt); r2, e2 = compile_cmds(cm)
            trules += [r for r in r2 if r not in trules]; teco += [x for x in e2 if x not in teco]
        out['civs'][en] = {'dat': ai is not None, 'bonus': entries, 'team': {'combat': ai is not None, 'rules': trules, 'eco': teco}}

    # ---- 关联 ----
    links = json.load(open(ROOT / 'scripts/effects_links.json')) if (ROOT / 'scripts/effects_links.json').exists() else {}
    CLASSW = ['Infantry', 'Cavalry', 'Mounted', 'Archer', 'Ship', 'Monk', 'Villager', 'Siege', 'Gunpowder', 'Camel', 'Elephant', 'Town Center', 'Castle', 'Scout', 'Galley', 'Knight', 'Spearman', 'Skirmisher', 'Tower', 'Dock', 'Farm', 'Building']
    for c in civs:
        ent = out['civs'][c['en']]
        L = links.get(c["en"], {})
        for e in ent['bonus']:
            names = {re.sub(r'^Elite ', '', ours[i]['en']) for r in e['rules'] for i in r['t']} | {re.sub(r'^Elite ', '', ours[i]['en']) for x in e['eco'] for i in x.get('t', []) if i in ours}
            names |= {w for w in CLASSW if any(w.lower() in n.lower() for n in names)}
            sc = [link_score(e, b, names) for b in c['bonEn']]
            best = max(range(len(sc)), key=lambda i: sc[i]) if sc else None
            e['auto'] = best if sc and sc[best] > 0 else None
            k = str(e['tech'])
            e['idx'] = L[k] if k in L else e['auto']
            e['linked'] = 'manual' if k in L else 'auto'
        for e in ent['bonus']: e.pop('auto', None)

    # ---- 新鲜度：dat 数值 vs 当前补丁的游戏内加成文本（civs.json，来自当前 aoe2techtree 字符串） ----
    for c in civs:
        ent = out['civs'][c['en']]
        groups = defaultdict(list)
        for e in ent['bonus']:
            if e['idx'] is not None: groups[e['idx']].append(e)
        fr = {}
        for idx, es in groups.items():
            fr[str(idx)] = freshness(c['bonEn'][idx], es)
        fr['team'] = freshness(c['tbEn'], [{'age': 1, 'rules': ent['team']['rules'], 'eco': ent['team']['eco'], 'combat': ent['team']['combat']}])
        ent['fresh'] = fr

    # ---- #24 结构化训练费用折扣：仅由 .dat 费用效果（属性 100/103–106，乘法，非科技触发）逐时代累计得出 ----
    out['costDiscounts'] = cost_discounts(out, civs)

    # .dat 中不存在的站内单位/建筑（应为空）：其科技/加成作用范围由运行时回退到手工判定
    U0 = AC[0]['Units']
    out['meta']['newIds'] = sorted(i for i in ours if i >= len(U0) or U0[i] is None)
    out['meta']['unmatchedCivs'] = [c['en'] for c in civs if c['en'] not in adat]
    (ROOT / 'src/data/effects.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(v['bonus']) for v in out['civs'].values())
    print('techs', len(out['techs']), 'civ bonus techs', n, 'size', (ROOT / 'src/data/effects.json').stat().st_size)



# ---------------- 关联：dat 加成科技 → civs.json 加成文本序号 ----------------
# 自动打分（科技内部名/作用单位/属性 与英文加成文本的词汇重合），scripts/effects_links.json 人工校正关联（只校正「属于哪条」，不改数值）。
STAT_WORDS = {'hp': ['hp'], 'spd': ['move', 'faster'], 'rof': ['attack', 'faster', 'fire'], 'los': ['line of sight'], 'rng': ['range'], 'ma': ['armor'], 'pa': ['armor'],
              'atk': ['attack'], 'bonus': ['attack vs', 'bonus damage', 'damage'], 'bt': ['train', 'built', 'faster', 'work'], 'gar': ['garrison'], 'acc': ['accura'], 'minr': ['minimum range']}
ECO_WORDS = {100: ['cost'], 103: ['cost', 'food'], 104: ['cost', 'wood'], 105: ['cost', 'gold'], 106: ['cost', 'stone'], 13: ['work', 'faster'], 14: ['carry'], 109: ['regenerat'], 24: ['bonus damage'],
             107: ['projectile', 'arrow'], 101: ['train', 'faster']}
STOP = {'bonus', 'with', 'from', 'cost', 'make', 'avail', 'faster', 'units', 'unit', 'age1', 'age2', 'age3', 'age4', 'castle', 'imperial', 'feudal', 'dark'}


def tokens(s):
    s = s.lower().replace('-', ' ')
    return {w.rstrip('s') for w in re.findall(r'[a-z]{4,}', s)} - STOP, set(re.findall(r'\d+', s))


def link_score(e, text, unames):
    t = text.lower()
    nt, nn = tokens(re.sub(r'^c-bonus,?\s*', '', e['name'], flags=re.I))
    tt, tn = tokens(text)
    sc = 3 * len(nt & tt) + 2 * len(nn & tn)
    for r in e['rules']:
        for f in r['fx']:
            sc += any(w in t for w in STAT_WORDS.get(f['s'], []))
    for x in e['eco']:
        if 'a' in x: sc += any(w in t for w in ECO_WORDS.get(x['a'], []))
        if 'tech' in x: sc += 2 * (x['tech'].lower() in t) + ('free' in t and x['v'] == 0)
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
    ok=True 仅当每个分组在文本列出的每个时代，.dat 累计折扣四舍五入到整数百分比都与文本一致；
    文本没列出的时代不给档（tiers 不含该时代）。ok=False 的加成前端显示「折扣未计入」、按原价。"""
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
        if e.get('req'): continue  # 由科技触发（如「每项寺院科技 +5HP」），单值即可
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
