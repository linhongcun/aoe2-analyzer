#!/usr/bin/env python3
"""补丁数据差异摘要（纯函数，便于用 fixture 测试）：比较两份 src/data/*.json，输出 Markdown。"""
import json, re

UNIT_KEYS = ['hp', 'atk', 'ma', 'pa', 'rng', 'minr', 'spd', 'los', 'rof', 'acc', 'tt', 'cost', 'atks', 'arms']
BLD_KEYS = ['hp', 'ma', 'pa', 'barm', 'bt', 'gar', 'atk', 'rng', 'los', 'cost', 'pop']
TECH_KEYS = ['cost', 'time', 'age', 'descEn']

PATCH_RE = re.compile(r'(?:DE\s+)?Update\s+(\d{5,7})', re.I)


def detect_patch(messages):
    """从上游提交信息（如 halfon「Implement DE Update 185872」）中识别补丁号；返回最大的 build 号或 None。"""
    builds = [int(m) for msg in messages if msg for m in PATCH_RE.findall(msg)]
    return max(builds) if builds else None


def _fmt(v):
    if isinstance(v, dict): return ', '.join('%s %s' % (k, v[k]) for k in sorted(v))
    if isinstance(v, list): return json.dumps(v, ensure_ascii=False)
    return str(v)


def _diff_objs(old, new, keys, name=lambda o: o.get('zh') or o.get('en')):
    o = {x['id']: x for x in old}; n = {x['id']: x for x in new}
    added = [n[i] for i in n if i not in o]; removed = [o[i] for i in o if i not in n]
    changed = []
    for i in n:
        if i not in o: continue
        ch = [(k, o[i].get(k), n[i].get(k)) for k in keys if o[i].get(k) != n[i].get(k)]
        if ch: changed.append((n[i], ch))
    return added, removed, changed


def _section(title, added, removed, changed, label):
    out = []
    if not (added or removed or changed): return out
    out.append('## %s（新增 %d / 移除 %d / 变更 %d）' % (title, len(added), len(removed), len(changed)))
    out.append('')
    for x in added: out.append('- 新增：%s' % label(x))
    for x in removed: out.append('- 移除：%s' % label(x))
    for x, ch in changed:
        out.append('- %s：%s' % (label(x), '；'.join('%s %s → %s' % (k, _fmt(a), _fmt(b)) for k, a, b in ch if k != 'descEn') + ('（说明文字有改动）' if any(k == 'descEn' for k, _, _ in ch) else '')))
    out.append('')
    return out


def _bonus_diff(old_civs, new_civs, old_fx, new_fx):
    out = []
    o = {c['en']: c for c in old_civs}
    for c in new_civs:
        p = o.get(c['en'])
        if not p:
            out.append('- 新文明：%s（%s）' % (c['zh'], c['en'])); continue
        for i, t in enumerate(c.get('bonEn', [])):
            ot = p.get('bonEn', [])[i] if i < len(p.get('bonEn', [])) else None
            if ot != t: out.append('- %s 加成 #%d 文本：%s → %s' % (c['zh'], i + 1, ot or '（无）', t))
        if p.get('tbEn') != c.get('tbEn'): out.append('- %s 团队加成文本：%s → %s' % (c['zh'], p.get('tbEn'), c.get('tbEn')))
        oc = (old_fx or {}).get('civs', {}).get(c['en'], {}); nc = (new_fx or {}).get('civs', {}).get(c['en'], {})
        key = lambda e: (e['tech'], json.dumps(e.get('rules'), sort_keys=True), json.dumps(e.get('eco'), sort_keys=True))
        ob = {e['tech']: e for e in oc.get('bonus', [])}; nb = {e['tech']: e for e in nc.get('bonus', [])}
        for t, e in nb.items():
            if t not in ob: out.append('- %s：新 .dat 加成科技 #%s `%s`' % (c['zh'], t, e['name']))
            elif key(ob[t]) != key(e): out.append('- %s：.dat 加成科技 #%s `%s` 数值变化' % (c['zh'], t, e['name']))
        for t, e in ob.items():
            if t not in nb: out.append('- %s：.dat 加成科技 #%s `%s` 已移除' % (c['zh'], t, e['name']))
        if json.dumps(oc.get('team'), sort_keys=True) != json.dumps(nc.get('team'), sort_keys=True) and oc:
            out.append('- %s：团队加成 .dat 数值变化' % c['zh'])
    return out


def summarize(old, new, title='数据变化'):
    """old/new：{'units': [...], 'techs': [...], 'buildings': [...], 'civs': [...], 'effects': {...}}"""
    out = ['# %s' % title, '']
    nm = lambda x: '%s（%s）' % (x.get('zh') or x.get('en'), x.get('en'))
    n0 = len(out)
    out += _section('单位', *_diff_objs(old.get('units', []), new.get('units', []), UNIT_KEYS), nm)
    out += _section('建筑', *_diff_objs(old.get('buildings', []), new.get('buildings', []), BLD_KEYS), nm)
    out += _section('科技', *_diff_objs(old.get('techs', []), new.get('techs', []), TECH_KEYS), nm)
    # 科技 .dat 效果
    ot = (old.get('effects') or {}).get('techs', {}); nt = (new.get('effects') or {}).get('techs', {})
    fx = [t for t in nt if t in ot and json.dumps(ot[t].get('rules'), sort_keys=True) != json.dumps(nt[t].get('rules'), sort_keys=True)]
    fx += [t for t in nt if t not in ot]
    if fx:
        out += ['## 科技效果（.dat）变化（%d）' % len(fx), ''] + ['- %s%s' % (t, '（新）' if t not in ot else '') for t in sorted(fx)] + ['']
    b = _bonus_diff(old.get('civs', []), new.get('civs', []), old.get('effects'), new.get('effects'))
    if b: out += ['## 文明加成（%d）' % len(b), ''] + b + ['']
    if len(out) == n0: out += ['无数据变化。', '']
    return '\n'.join(out)


def load_dir(d):
    from pathlib import Path
    d = Path(d); r = {}
    for k in ('units', 'techs', 'buildings', 'civs', 'effects'):
        p = d / (k + '.json')
        r[k] = json.load(open(p)) if p.exists() else ([] if k != 'effects' else {})
    return r
