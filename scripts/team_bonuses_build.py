#!/usr/bin/env python3
"""Export #228 team sources without effects_build's lossy type normalization.

Only fixed .dat operands create target links; descriptions never create links.
python3 scripts/team_bonuses_build.py [--check]
"""
import argparse
import json

from dat_source import DAT, ROOT, load, pins
from effects_build import CIV_DAT

OUT = ROOT / 'src/data/team_bonuses.json'
AGE_TECHS = {101: 2, 102: 3, 103: 4}
RESOURCE_NAMES = {0: 'Food', 1: 'Wood', 2: 'Stone', 3: 'Gold'}
# Exact raw operands, not a name/text classifier. A future data update must audit
# unknown references before expanding this deliberately small interpretation.
REVIEWED_CHAIN_MODES = {(-1, 0): 'research-time-zero', (12, 1): 'enable',
                        (12, 3): 'research'}
EFFECT_TYPES = ('attack', 'attack-speed', 'health', 'armor', 'range', 'vision',
                'production', 'cost', 'attributes', 'resource', 'unlock', 'research', 'other')


def is_team(command):
    return 10 <= command['Type'] <= 19


def base_type(command):
    return command['Type'] - 10 if is_team(command) else command['Type']


def effect_type(command, has_building=False, combat_reload=False):
    """A UI category, not a number or effect-strength calculation."""
    typ = base_type(command)
    if typ in (0, 4, 5):
        attr = command['C']
        if attr == 10:
            # The same field can be a Monk's faith-recovery interval. Only call
            # it attack speed when raw target records have attacks and reload.
            return 'attack-speed' if combat_reload else 'attributes'
        if attr == 13:
            return 'production' if has_building else 'attributes'
        if attr in (100, 103, 104, 105, 106):
            return 'cost'
        return {0: 'health', 1: 'vision', 8: 'armor', 9: 'attack',
                12: 'range', 20: 'range', 101: 'production'}.get(attr, 'attributes')
    if typ in (1, 6):
        return 'resource'
    if typ in (2, 3):
        return 'unlock'
    if typ == 8 or command['Type'] in (101, 102, 103):
        return 'research'
    return 'other'


def effect_commands(data, effect_id, indices=None):
    if not 0 <= effect_id < len(data['Effects']):
        return []
    return [dict(command, effectId=effect_id, index=index)
            for index, command in enumerate(data['Effects'][effect_id]['EffectCommands'])
            if indices is None or index in indices]


def building_aliases(data, buildings):
    """Retain all age-form IDs (e.g. Archery Range 10/14 -> catalogue 87)."""
    aliases = {b['id']: {b['id']} for b in buildings}
    upgrades = [c for eid in (101, 102, 103)
                for c in data['Effects'][eid]['EffectCommands'] if c['Type'] == 3]
    while True:
        before = sum(map(len, aliases.values()))
        for ids in aliases.values():
            for command in upgrades:
                if command['A'] in ids:
                    ids.add(command['B'])
        if before == sum(map(len, aliases.values())):
            return aliases


def build(data=None, civs=None, units=None, buildings=None, techs=None):
    data = data if data is not None else load()
    read = lambda name: json.loads((ROOT / 'src/data' / (name + '.json')).read_text())
    civs = civs if civs is not None else read('civs')
    units = units if units is not None else read('units')
    buildings = buildings if buildings is not None else read('buildings')
    techs = techs if techs is not None else read('techs')
    unit_ids = {u['id'] for u in units}
    building_ids = {b['id'] for b in buildings}
    objects = data['Civs'][1]['Units']
    aliases = building_aliases(data, buildings)
    dat_civs = {CIV_DAT.get(c['Name'], c['Name']): (index, c)
                for index, c in enumerate(data['Civs'])}
    visible_techs = {t['id']: t for t in techs}
    building_labels = {b['id']: b['zh'] for b in buildings}
    site_ids = unit_ids | building_ids

    def canonical(raw_id):
        return ({raw_id} if raw_id in site_ids else set()) | {
            bid for bid, ids in aliases.items() if raw_id in ids}

    def targets(command):
        typ = base_type(command)
        raw_targets = set()
        classes = []
        if typ in (0, 4, 5):
            if command['A'] >= 0:
                raw_targets.add(command['A'])
            elif command['B'] >= 0:
                classes.append(command['B'])
                raw_targets.update(i for i in site_ids
                                   if i < len(objects) and objects[i]
                                   and objects[i]['Class'] == command['B'])
        elif typ == 2:
            raw_targets.add(command['A'])
        elif typ == 3:
            raw_targets.update((command['A'], command['B']))
        mapped = set().union(*(canonical(i) for i in raw_targets)) if raw_targets else set()
        unmapped = sorted(i for i in raw_targets if not canonical(i))
        return mapped & unit_ids, mapped & building_ids, classes, unmapped

    def production_units(command, targets_buildings):
        # Attribute 13 is work rate. Catalogue location and raw TrainAt are
        # independent fixed-data directories, across every civilization.
        if base_type(command) not in (0, 4, 5) or command['C'] != 13:
            return set()
        raw_locations = set().union(*(aliases[b] for b in targets_buildings)) if targets_buildings else set()
        return {u['id'] for u in units if u.get('b') in raw_locations or (
            u['id'] < len(objects) and objects[u['id']] and any(
                location[0] in raw_locations for location in objects[u['id']].get('TrainAt', [])))}

    def describe(commands):
        linked_units, linked_buildings, production = set(), set(), set()
        kinds, effect_types, unknowns, relations = set(), set(), [], []
        for c in commands:
            typ = base_type(c)
            us, bs, classes, missing = targets(c)
            indirect = production_units(c, bs)
            linked_units.update(us)
            linked_buildings.update(bs)
            production.update(indirect)
            raw_targets = us | bs
            combat_reload = bool(raw_targets) and all(
                objects[i] and objects[i]['Attacks'] and objects[i]['Reload'] > 0 for i in raw_targets)
            effect_types.add(effect_type(c, has_building=bool(bs), combat_reload=combat_reload))
            if typ in (0, 4, 5):
                kinds.add('production' if c['C'] == 101 or (c['C'] == 13 and bs) else
                          'economy' if c['C'] in (100, 103, 104, 105, 106) else 'attributes')
                if not us and not bs:
                    unknowns.append({'effectId': c['effectId'], 'index': c['index'],
                                     'reason': '属性目标未映射到站内对象'})
            elif typ in (2, 3):
                kinds.add('unlock')
            elif typ in (1, 6):
                kinds.add('economy')
                unknowns.append({'effectId': c['effectId'], 'index': c['index'],
                                 'reason': '资源/引擎函数没有可靠的单位目标映射'})
            elif typ == 8 or c['Type'] in (101, 102, 103):
                kinds.add('research')
                # Tech references are not unit effects. A separately recorded
                # chain may give partial links but never proves full coverage.
                unknowns.append({'effectId': c['effectId'], 'index': c['index'],
                                 'reason': '科技修改或解锁仅记录依赖链，不推断完整目标'})
            else:
                kinds.add('other')
                unknowns.append({'effectId': c['effectId'], 'index': c['index'],
                                 'reason': '命令类型尚未解释'})
            if missing:
                unknowns.append({'effectId': c['effectId'], 'index': c['index'],
                                 'reason': '原始对象不在站内目录', 'rawIds': missing})
            relations.append({'effectId': c['effectId'], 'index': c['index'],
                              'unitIds': sorted(us), 'buildingIds': sorted(bs),
                              'classIds': classes, 'productionUnitIds': sorted(indirect)})
        has_targets = bool(linked_units or linked_buildings or production)
        return {'targetUnits': sorted(linked_units), 'targetBuildings': sorted(linked_buildings),
                'productionUnits': sorted(production), 'kinds': sorted(kinds or {'other'}),
                'effectTypes': sorted(effect_types or {'other'}),
                'targetCoverage': 'partial' if unknowns and has_targets else
                                  'unknown' if unknowns or not has_targets else 'complete',
                'unknownTargets': unknowns, 'targetRelations': relations}

    def chain_from(commands):
        """Record tech modifications with their real modes, following safe refs.

        A Type18 is not unconditionally 'research technology': B=-1 changes
        research time; B=12,D=1 enables; B=12,D=3 researches. Never apply effects.
        """
        chain, queue, seen = [], list(commands), set()
        while queue:
            command = queue.pop(0)
            if base_type(command) != 8:
                continue
            tid = command['A']
            mode = REVIEWED_CHAIN_MODES.get((command['B'], command['D']))
            if mode is None or tid in seen or not 0 <= tid < len(data['Techs']):
                continue
            seen.add(tid)
            tech = data['Techs'][tid]
            child = effect_commands(data, tech['EffectID'])
            chain.append({'techId': tid, 'effectId': tech['EffectID'], 'mode': mode,
                          'sourceEffectId': command['effectId'], 'sourceIndex': command['index'],
                          'prerequisites': [x for x in tech['RequiredTechs'] if x >= 0],
                          'requiredCount': tech['RequiredTechCount'],
                          'researchLocations': [x[0] for x in tech.get('ResearchAt', [])],
                          'commands': child})
            queue.extend(child)
        return chain

    def chain_notes(chain):
        """Make conditional target relations legible without implying ownership."""
        notes = []
        age_labels = {1: '黑暗时代', 2: '封建时代', 3: '城堡时代', 4: '帝王时代'}
        for link in chain:
            direct_ages = [AGE_TECHS[x] for x in link['prerequisites'] if x in AGE_TECHS]
            age = age_labels[max(direct_ages)] if direct_ages else '无直接时代前置'
            raw_prerequisites = '、'.join(str(x) for x in link['prerequisites']) or '空'
            mode = {'enable': '仅启用，不代表已经研究',
                    'research': '原始命令为研究触发，未作客户端实测',
                    'research-time-zero': '仅将研究时间改为0，不按无条件立即完成处理'}[link['mode']]
            locations = '、'.join(building_labels.get(x, '建筑编号%s' % x)
                                 for x in link['researchLocations'])
            location = '；仍需在%s完成研究' % locations if locations and link['mode'] == 'enable' else ''
            notes.append('关联科技编号%s：%s；%s%s；原始前置为%s，所需数量为%s。' % (
                link['techId'], age, mode, location, raw_prerequisites, link['requiredCount']))
        return notes

    permanent = []
    extra_hidden = []
    for civ in civs:
        dat_index, raw_civ = dat_civs[civ['en']]
        eid = raw_civ['TeamBonusID']
        commands = effect_commands(data, eid)
        sources = [{'kind': 'civ-team-bonus', 'effectId': eid, 'datCiv': dat_index}]
        # Some real team effects live in the civilization technology tree.
        tree_team = [c for c in effect_commands(data, raw_civ['TechTreeID']) if is_team(c)]
        if tree_team:
            commands.extend(tree_team)
            sources.append({'kind': 'civ-tech-tree-team', 'effectId': raw_civ['TechTreeID'],
                            'indices': [c['index'] for c in tree_team]})
        for tid, tech in enumerate(data['Techs']):
            if tech['Civ'] != dat_index or tech['ResearchLocation'] > 0:
                continue
            team = [c for c in effect_commands(data, tech['EffectID']) if is_team(c)]
            if not team or tech['EffectID'] == eid:
                continue
            # Pure resource-33 team commands also occur in a non-TB effect
            # (Danes razing notification). Audit them without claiming a new TB.
            if all(base_type(c) == 1 and c['A'] == 33 for c in team):
                extra_hidden.append({'civ': civ['en'], 'techId': tid,
                                     'effectId': tech['EffectID'], 'commands': team,
                                     'reason': '只有资源33团队命令，未认定为额外常驻加成'})
                continue
            commands.extend(team)
            sources.append({'kind': 'hidden-civ-team-tech', 'techId': tid,
                            'effectId': tech['EffectID'], 'indices': [c['index'] for c in team]})
        # A root effect can also be attached to a hidden civ technology (Wu).
        commands = list({(c['effectId'], c['index']): c for c in commands}.values())
        chain = chain_from(commands)
        all_commands = commands + [c for link in chain for c in link['commands']]
        info = describe(all_commands)
        notes = ['同一文明来源只展示一次，并列出所有提供者；不据此推断效果叠加倍率。']
        if info['targetCoverage'] != 'complete':
            notes.append('单位目标关联未完全核实；未知资源、科技修改与引擎函数不按文案猜测。')
        if chain:
            notes.append('依赖链保留启用、研究和修改研究时间的区别；启用升级科技不代表已经研究。')
            notes.extend(chain_notes(chain))
        permanent.append({'id': civ['en'] + '-team', 'civ': civ['en'], 'effectId': eid,
                          'commands': commands, 'sources': sources, 'chain': chain,
                          **info, 'notes': notes})

    technologies, team_audit = [], []
    for tid, raw in enumerate(data['Techs']):
        commands = effect_commands(data, raw['EffectID'])
        team = [c for c in commands if is_team(c)]
        if not team:
            continue
        team_audit.append({'techId': tid, 'effectId': raw['EffectID'],
                           'researchable': raw['ResearchLocation'] > 0,
                           'catalogued': tid in visible_techs,
                           'teamIndices': [c['index'] for c in team]})
        if raw['ResearchLocation'] <= 0 or tid not in visible_techs:
            continue
        tech = visible_techs[tid]
        chain = chain_from(team)
        info = describe(commands + [c for link in chain for c in link['commands']])
        notes = ['仅按原始团队命令辨识；默认未研究，不改变任何现有模拟器数值。']
        notes.extend(chain_notes(chain))
        if info['targetCoverage'] != 'complete':
            notes.append('存在资源/引擎函数、科技修改或目录外对象，适用目标关联仅部分核实。')
        if tid == 1380:
            notes.append('原始命令直接列出掷石绳骑兵；其余城堡独特单位的引擎目标未核实，保留说明但不编造关联。')
        technologies.append({'id': tid, 'civs': tech['civs'], 'effectId': raw['EffectID'],
                             'commands': commands, 'teamCommands': team, 'chain': chain,
                             'age': max([AGE_TECHS[x] for x in raw['RequiredTechs'] if x in AGE_TECHS] or [tech['age']]),
                             'building': raw['ResearchLocation'],
                             'prerequisites': [x for x in raw['RequiredTechs'] if x >= 0],
                             'requiredCount': raw['RequiredTechCount'],
                             'cost': {RESOURCE_NAMES[k]: amount for k, amount, flag in raw['Cost']
                                      if flag and k in RESOURCE_NAMES},
                             'researchTime': raw['ResearchTime'], **info, 'notes': notes})

    return {'meta': {'generated_by': 'scripts/team_bonuses_build.py',
                     'patch': pins()['patch']['build'],
                     'dat': {k: DAT[k] for k in ('repo', 'commit', 'path', 'sha256')},
                     'interpretationSources': [{'repo': 'Tapsa/AGE',
                                                'commit': '0bd1b417ca6d77aa0b8a2e84a37f2d5f178944de',
                                                'path': 'AGE_Frame/Techs.cpp',
                                                'use': '区分Type18修改研究时间、启用与研究模式'}],
                     'engineVerifiedInPinnedBuild': False,
                     'scopeNotes': ['只枚举站内56文明的常驻来源和固定.dat中可研究的团队命令科技。',
                                    '属性单位/类别目标与生产目录为静态关联；不合成队伍倍率，不作客户端实测声明。',
                                    '生产单位是全目录间接关联，不限定为加成来源文明。',
                                    '当前时代只约束团队科技的研究记录；目标关系是跨时代来源审计，不表示当前已解锁。',
                                    '未知资源、引擎函数和启用/研究条件均不从说明文案推断目标。'],
                     'counts': {'civilizations': len(permanent), 'researchableTeamTechnologies': len(technologies),
                                'catalogUnits': len(units), 'catalogBuildings': len(buildings)},
                     'teamCommandAudit': team_audit, 'unclassifiedHiddenTeamCommands': extra_hidden},
            'permanent': permanent, 'technologies': technologies}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build()
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != encoded:
            raise SystemExit('team_bonuses.json cannot be reproduced; run scripts/team_bonuses_build.py')
    else:
        OUT.write_text(encoded)
    print('team sources', len(data['permanent']), 'team research technologies',
          len(data['technologies']), 'fixed DE', data['meta']['patch'])


if __name__ == '__main__':
    main()
