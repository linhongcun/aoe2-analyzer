#!/usr/bin/env python3
"""Pinned .dat research graph for army cost; never infer research identity from names."""
import argparse
import json
from pathlib import Path
from dat_source import DAT, load
from effects_build import CIV_DAT

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'data/game/army_research.json'


def build(d):
    techs = json.loads((ROOT / 'data/game/techs.json').read_text())
    units = json.loads((ROOT / 'data/game/units.json').read_text())
    names = {t['id']: t['zh'] for t in techs}
    unit_names = {u['id']: u['zh'] for u in units}

    def cmds(effect):
        return d['Effects'][effect]['EffectCommands'] if effect >= 0 else []

    def relevant(c):
        return c['Type'] in (101, 102, 103) or (c['Type'] in (1, 6) and c['A'] == 85)

    nodes = {}
    for i, t in enumerate(d['Techs']):
        commands = cmds(t['EffectID'])
        upgrades = [[c['A'], c['B']] for c in commands if c['Type'] == 3]
        label = names.get(i) or next(('升级：' + unit_names[b] for _, b in upgrades if b in unit_names), None)
        nodes[str(i)] = dict(name=label, civ=t['Civ'], requires=[x for x in t['RequiredTechs'] if x >= 0],
                             count=t['RequiredTechCount'], location=t['ResearchLocation'], time=t['ResearchTime'],
                             cost=t['Cost'], upgrades=upgrades, enables=[c['A'] for c in commands if c['Type'] == 2 and c['B'] == 1], mods=[c for c in commands if relevant(c)])
    civs = {}
    for i, c in enumerate(d['Civs']):
        if not i:
            continue
        tree = cmds(c['TechTreeID'])
        civs[CIV_DAT.get(c['Name'], c['Name'])] = dict(id=i, disabled=[int(x['D']) for x in tree if x['Type'] == 102],
                               mods=[x for x in tree + cmds(c['TeamBonusID']) if relevant(x) and x['Type'] != 102])
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
