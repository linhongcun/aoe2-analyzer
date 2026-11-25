#!/usr/bin/env python3
"""Pinned .dat research graph for army cost; never infer research identity from names."""
import argparse
import json
from pathlib import Path
from dat_source import DAT, load
from effects_build import CIV_DAT
from projectile_scope import guided_projectile_ids, split_projectile_units, transform_closure

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'data/game/army_research.json'


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
    combat_attrs = {0, 1, 2, 5, 8, 9, 10, 11, 12, 20, 22, 24, 63, 102, 107, 108, 109}
    for i, t in enumerate(d['Techs']):
        commands = cmds(t['EffectID'])
        # Projectile guidance and poison combat fields (Curare): follow actual projectile & charge-projectile users.
        guided = guided_projectile_ids(commands, attrs=(19, 145, 146, 147))
        proj_all, proj_charge_only = split_projectile_units(dat_units, combat_forms, units, guided) if guided else ([], [])
        direct_combat = {
            u['id']
            for u in units
            if any(
                c['Type'] in (0, 4, 5)
                and c['C'] in combat_attrs
                and (c['A'] in combat_forms[u['id']] or (c['A'] < 0 and any(dat_units[f]['Class'] == c['B'] for f in combat_forms[u['id']])))
                for c in commands
            )
        }
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
                nodes=nodes, civs=civs, buildingTechs=sorted(set(d['BuildTech'].values())), buildingTriggers=d['BuildTech'])


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
