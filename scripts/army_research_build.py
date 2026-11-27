#!/usr/bin/env python3
"""Pinned .dat research graph for army cost; never infer research identity from names."""
import argparse
import json
from pathlib import Path
from dat_source import DAT, load
from effects_build import CIV_DAT, fx_triggered_techs, is_identity_mul, is_unreachable_tech, r6
from projectile_scope import guided_projectile_ids, split_projectile_units, transform_closure

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'data/game/army_research.json'


def direct_combat_units(commands, units, combat_forms, dat_units, combat_attrs):
    """返回因属性命令实际获得净战斗改动的目录单位 ID 集合。

    Type 0/4 立即计入；Type 5 按 (unit_form, attr, cls_or_none) 连乘聚合
    （属性 8/9 按 divmod(round(D), 256) 解码攻防类别与倍率），
    过滤 |prod - 1| < MUL_IDENTITY_EPS 的抵消残差（如草药学 1365 的 1.0005）。
    """
    out = set()
    for u in units:
        uid = u['id']
        forms = combat_forms[uid]
        form_classes = {f: dat_units[f]['Class'] for f in forms}
        mul_acc = {}
        matched = False
        for c in commands:
            ctype = c['Type']
            attr = c['C']
            if ctype not in (0, 4, 5) or attr not in combat_attrs:
                continue
            a, b = c['A'], c['B']
            if a >= 0:
                hit_forms = [a] if a in forms else []
            else:
                hit_forms = [f for f, cls in form_classes.items() if cls == b]
            if not hit_forms:
                continue
            if ctype in (0, 4):
                matched = True
                break
            if attr in (8, 9):
                cls_key, pct = divmod(int(round(c['D'])), 256)
                factor = pct / 100.0
            else:
                cls_key = None
                factor = float(c['D'])
            for f in hit_forms:
                key = (f, attr, cls_key)
                mul_acc[key] = r6(mul_acc.get(key, 1.0) * r6(factor))
        if matched or any(not is_identity_mul(prod) for prod in mul_acc.values()):
            out.add(uid)
    return out


def build(d):
    techs = json.loads((ROOT / 'data/game/techs.json').read_text())
    units = json.loads((ROOT / 'data/game/units.json').read_text())
    names = {t['id']: t['zh'] for t in techs}
    unit_names = {u['id']: u['zh'] for u in units}
    dat_units = d['Civs'][1]['Units']
    combat_forms = transform_closure(dat_units, [u['id'] for u in units])

    def cmds(effect):
        return d['Effects'][effect]['EffectCommands'] if effect >= 0 else []

    def relevant(c):
        return c['Type'] in (101, 102, 103) or (c['Type'] in (1, 6) and c['A'] == 85)

    nodes = {}
    combat_attrs = {0, 1, 2, 5, 8, 9, 10, 11, 12, 20, 22, 24, 59, 60, 61, 62, 63, 102, 107, 108, 109, 118}
    build_tech_ids = set(d['BuildTech'].values())
    fx_triggered_ids = fx_triggered_techs(d['Effects'])
    for i, t in enumerate(d['Techs']):
        unreachable = is_unreachable_tech(i, t, build_tech_ids, fx_triggered_ids)
        commands = [] if unreachable else cmds(t['EffectID'])
        # Projectile guidance and poison combat fields (Curare): follow actual projectile & charge-projectile users.
        guided = guided_projectile_ids(commands, attrs=(19, 145, 146, 147))
        proj_all, proj_charge_only = split_projectile_units(dat_units, combat_forms, units, guided) if guided else ([], [])
        direct_combat = direct_combat_units(commands, units, combat_forms, dat_units, combat_attrs)
        combat_units = sorted(set(proj_all) | direct_combat)
        charge_only = sorted(set(proj_charge_only) - direct_combat)
        upgrades = [[c['A'], c['B']] for c in commands if c['Type'] == 3]
        enables = [c['A'] for c in commands if c['Type'] == 2 and c['B'] == 1]
        label = (
            names.get(i)
            or next(('升级：' + unit_names[b] for _, b in upgrades if b in unit_names), None)
            or (next(('启用：' + unit_names[u] for u in enables if u in unit_names), None) if t['ResearchLocation'] > 0 else None)
        )
        node = dict(
            name=label,
            civ=t['Civ'],
            requires=[x for x in t['RequiredTechs'] if x >= 0],
            count=t['RequiredTechCount'],
            location=t['ResearchLocation'],
            time=t['ResearchTime'],
            cost=t['Cost'],
            upgrades=upgrades,
            enables=enables,
            mods=[c for c in commands if relevant(c)],
            combatUnits=combat_units,
        )
        if charge_only:
            node['chargeOnlyCombatUnits'] = charge_only
        nodes[str(i)] = node
    civs = {}
    for i, c in enumerate(d['Civs']):
        if not i:
            continue
        civ_cmds = cmds(c['TechTreeID']) + cmds(c['TeamBonusID'])
        civs[CIV_DAT.get(c['Name'], c['Name'])] = dict(
            id=i,
            disabled=sorted({int(round(x['D'])) for x in civ_cmds if x['Type'] == 102}),
            enabled=sorted({int(x['A']) for x in civ_cmds if x['Type'] in (8, 18) and x['B'] == 12 and abs(float(x['D']) - 1.0) < 1e-9}),
            mods=[x for x in civ_cmds if relevant(x) and x['Type'] != 102],
        )
    return dict(meta=dict(generatedBy='scripts/army_research_build.py', patch=DAT['patch'],
                          commit=DAT['commit'], sha256=DAT['sha256']),
                nodes=nodes, civs=civs, buildingTechs=sorted(build_tech_ids),
                fxTriggeredTechs=sorted(fx_triggered_ids), buildingTriggers=d['BuildTech'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = json.dumps(build(load()), ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'
    if args.check:
        if not DEST.exists() or DEST.read_text() != text:
            raise SystemExit('army_research.json drift; run python3 scripts/army_research_build.py')
        print('army research pinned reproduction OK')
    else:
        DEST.write_text(text)
        print(DEST.relative_to(ROOT))


if __name__ == '__main__':
    main()
