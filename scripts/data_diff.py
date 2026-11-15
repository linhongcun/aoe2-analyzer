#!/usr/bin/env python3
"""补丁数据差异（纯函数，便于用 fixture 测试）：diff() 比较两份 data/game/*.json 得到结构化差异，render() 排成 Markdown。"""
import json, re

UNIT_KEYS = ['hp', 'atk', 'ma', 'pa', 'rng', 'minr', 'spd', 'los', 'rof', 'acc', 'tt', 'cost', 'atks', 'armc', 'cls']
BLD_KEYS = ['hp', 'ma', 'pa', 'barm', 'bt', 'gar', 'atk', 'rng', 'los', 'cost', 'pop']
TECH_KEYS = ['cost', 'time', 'age', 'descEn']

PATCH_RE = re.compile(r'(?:DE\s+)?Update\s+(\d{5,7})', re.I)


def detect_patch(messages):
    """从上游提交信息（如 halfon「Implement DE Update 185872」）中识别补丁号；返回最大的 build 号或 None。"""
    builds = [int(m) for msg in messages if msg for m in PATCH_RE.findall(msg)]
    return max(builds) if builds else None


def _ref(x):
    return {'id': x['id'], 'zh': x.get('zh') or x.get('en'), 'en': x.get('en')}


def _diff_objs(old, new, keys):
    o = {x['id']: x for x in old}; n = {x['id']: x for x in new}
    changed = []
    for i in n:
        if i not in o: continue
        ch = [{'key': k, 'old': o[i].get(k), 'new': n[i].get(k)} for k in keys if o[i].get(k) != n[i].get(k)]
        if ch: changed.append(dict(_ref(n[i]), fields=ch))
    return {'added': [_ref(n[i]) for i in n if i not in o], 'removed': [_ref(o[i]) for i in o if i not in n], 'changed': changed}


def _bonus_diff(old_civs, new_civs, old_fx, new_fx):
    out = []
    o = {c['en']: c for c in old_civs}
    for c in new_civs:
        row = lambda kind, **extra: out.append(dict({'kind': kind, 'zh': c['zh'], 'en': c['en']}, **extra))
        p = o.get(c['en'])
        if not p:
            row('newCiv'); continue
        for i, t in enumerate(c.get('bonEn', [])):
            ot = p.get('bonEn', [])[i] if i < len(p.get('bonEn', [])) else None
            if ot != t: row('bonusText', index=i + 1, old=ot, new=t)
        if p.get('tbEn') != c.get('tbEn'): row('teamBonusText', old=p.get('tbEn'), new=c.get('tbEn'))
        oc = (old_fx or {}).get('civs', {}).get(c['en'], {}); nc = (new_fx or {}).get('civs', {}).get(c['en'], {})
        key = lambda e: (e['tech'], json.dumps(e.get('rules'), sort_keys=True), json.dumps(e.get('eco'), sort_keys=True))
        ob = {e['tech']: e for e in oc.get('bonus', [])}; nb = {e['tech']: e for e in nc.get('bonus', [])}
        for t, e in nb.items():
            if t not in ob: row('datBonusAdded', tech=t, name=e['name'])
            elif key(ob[t]) != key(e): row('datBonusChanged', tech=t, name=e['name'])
        for t, e in ob.items():
            if t not in nb: row('datBonusRemoved', tech=t, name=e['name'])
        if json.dumps(oc.get('team'), sort_keys=True) != json.dumps(nc.get('team'), sort_keys=True) and oc:
            row('datTeamBonusChanged')
    return out


def diff(old, new):
    """old/new：{'units': [...], 'techs': [...], 'buildings': [...], 'civs': [...], 'effects': {...}}；返回可直接存成 JSON 的差异。"""
    ot = (old.get('effects') or {}).get('techs', {}); nt = (new.get('effects') or {}).get('techs', {})
    fx = [t for t in nt if t not in ot or json.dumps(ot[t].get('rules'), sort_keys=True) != json.dumps(nt[t].get('rules'), sort_keys=True)]
    return {
        'units': _diff_objs(old.get('units', []), new.get('units', []), UNIT_KEYS),
        'buildings': _diff_objs(old.get('buildings', []), new.get('buildings', []), BLD_KEYS),
        'techs': _diff_objs(old.get('techs', []), new.get('techs', []), TECH_KEYS),
        'techEffects': [{'name': t, 'added': t not in ot} for t in sorted(fx)],
        'civBonuses': _bonus_diff(old.get('civs', []), new.get('civs', []), old.get('effects'), new.get('effects')),
    }


def _fmt(v):
    if isinstance(v, dict): return ', '.join('%s %s' % (k, v[k]) for k in sorted(v))
    if isinstance(v, list): return json.dumps(v, ensure_ascii=False)
    return str(v)


def _section(title, part):
    added, removed, changed = part['added'], part['removed'], part['changed']
    if not (added or removed or changed): return []
    label = lambda x: '%s（%s）' % (x['zh'], x['en'])
    out = ['## %s（新增 %d / 移除 %d / 变更 %d）' % (title, len(added), len(removed), len(changed)), '']
    for x in added: out.append('- 新增：%s' % label(x))
    for x in removed: out.append('- 移除：%s' % label(x))
    for x in changed:
        fields = x['fields']
        out.append('- %s：%s' % (label(x), '；'.join('%s %s → %s' % (f['key'], _fmt(f['old']), _fmt(f['new'])) for f in fields if f['key'] != 'descEn') + ('（说明文字有改动）' if any(f['key'] == 'descEn' for f in fields) else '')))
    out.append('')
    return out


def _bonus_line(b):
    kind = b['kind']
    if kind == 'newCiv': return '- 新文明：%s（%s）' % (b['zh'], b['en'])
    if kind == 'bonusText': return '- %s 加成 #%d 文本：%s → %s' % (b['zh'], b['index'], b['old'] or '（无）', b['new'])
    if kind == 'teamBonusText': return '- %s 团队加成文本：%s → %s' % (b['zh'], b['old'], b['new'])
    if kind == 'datBonusAdded': return '- %s：新 .dat 加成科技 #%s `%s`' % (b['zh'], b['tech'], b['name'])
    if kind == 'datBonusChanged': return '- %s：.dat 加成科技 #%s `%s` 数值变化' % (b['zh'], b['tech'], b['name'])
    if kind == 'datBonusRemoved': return '- %s：.dat 加成科技 #%s `%s` 已移除' % (b['zh'], b['tech'], b['name'])
    if kind == 'datTeamBonusChanged': return '- %s：团队加成 .dat 数值变化' % b['zh']
    raise ValueError('未知的文明加成差异类型：%s' % kind)


def render(changes, title='数据变化'):
    """把 diff() 的结果排成给人看的 Markdown。"""
    out = ['# %s' % title, '']
    n0 = len(out)
    out += _section('单位', changes['units'])
    out += _section('建筑', changes['buildings'])
    out += _section('科技', changes['techs'])
    fx = changes['techEffects']
    if fx:
        out += ['## 科技效果（.dat）变化（%d）' % len(fx), ''] + ['- %s%s' % (t['name'], '（新）' if t['added'] else '') for t in fx] + ['']
    b = changes['civBonuses']
    if b: out += ['## 文明加成（%d）' % len(b), ''] + [_bonus_line(x) for x in b] + ['']
    if len(out) == n0: out += ['无数据变化。', '']
    return '\n'.join(out)


def load_dir(d):
    from pathlib import Path
    d = Path(d); r = {}
    for k in ('units', 'techs', 'buildings', 'civs', 'effects'):
        p = d / (k + '.json')
        r[k] = json.load(open(p)) if p.exists() else ([] if k != 'effects' else {})
    return r
