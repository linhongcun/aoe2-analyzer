#!/usr/bin/env python3
"""#238: reproducible relic parameters from pinned .dat, separate engine semantics.
No game client is executed. .dat/cache are never published. Run with --check in CI.
"""
import argparse
import hashlib
import json
import math
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat
from effects_build import CIV_DAT

OUT = ROOT / 'src/data/relic_income.json'
RESOURCE_IDS = {'Gold': 191, 'Food': 225, 'Wood': 264, 'Stone': 265}
SEMANTICS = {
    'resources': 'https://github.com/Divy1211/AoE2DE_UGC_Guide/blob/3dab81b6e8d4e416b8b44eb0b7cb928ef561ae0d/docs/general/resources/resources.md',
    'effectTypes': 'https://github.com/Tapsa/AGE/blob/0bd1b417ca6d77aa0b8a2e84a37f2d5f178944de/AGE_Frame/Lists.cpp',
}
DUMP = r'''
import dataclasses,json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]);rec=dataclasses.asdict
resources=(7,191,225,264,265)
def command(c):return {'Type':c.type,'A':c.a,'B':c.b,'C':c.c,'D':c.d}
def unit(cid,uid):
 u=d.civs[cid].units[uid]
 return None if not u else {'id':uid,'name':u.name,'class':u.class_,'workRate':u.bird.work_rate if u.bird else None,'tasks':[rec(t) for t in (u.bird.tasks if u.bird else [])],'buildingTech':u.building.tech_id if u.building else None}
refs=[];taskCount=0;generateCount=0
for cid,c in enumerate(d.civs):
 for uid,u in enumerate(c.units):
  for ix,t in enumerate(u.bird.tasks if u and u.bird else []):
   taskCount+=1;generateCount+=t.action_type==151
   if any(getattr(t,k) in resources[1:] for k in ('resource_in','resource_out','resource_multiplier')):refs.append([cid,uid,ix,rec(t)])
headerRefs=[];headerCount=0
for uid,h in enumerate(d.unit_headers):
 for ix,t in enumerate(h.task_list or []):
  headerCount+=1
  if any(getattr(t,k) in resources[1:] for k in ('resource_in','resource_out','resource_multiplier')):headerRefs.append([uid,ix,rec(t)])
resourceCommands=[{'effectId':eid,'index':ix,'command':command(c)} for eid,e in enumerate(d.effects) for ix,c in enumerate(e.effect_commands) if c.type<50 and c.type%10 in (1,6) and c.a in resources]
eids=(464,488,562,783,736,737,738,739,941,951,952)
tids=(21,506,699,700,701,702,930,941,949,957)
out={'civs':[{'id':cid,'name':c.name,'teamBonusId':c.team_bonus_id,'resources':{str(i):c.resources[i] for i in resources}} for cid,c in enumerate(d.civs)],
 'effects':{str(i):{'id':i,'name':d.effects[i].name,'commands':[command(c) for c in d.effects[i].effect_commands]} for i in eids},
 'techs':{str(i):{'id':i,'name':d.techs[i].name,'civ':d.techs[i].civ,'effectId':d.techs[i].effect_id,'requires':[j for j in d.techs[i].required_techs if j>=0],'requiredCount':d.techs[i].required_tech_count,'costs':[rec(c) for c in d.techs[i].resource_costs if c.type>=0],'researchLocations':[rec(r) for r in d.techs[i].research_locations],'repeatable':d.techs[i].repeatable} for i in tids},
 'audit':{'civCount':len(d.civs),'techCount':len(d.techs),'effectCount':len(d.effects),'unitTaskCount':taskCount,'headerTaskCount':headerCount,'generateResourceTaskCount':generateCount,'resourceTaskReferences':refs,'headerResourceTaskReferences':headerRefs,'resourceCommands':resourceCommands,'gaiaRelics':{str(i):unit(0,i) for i,u in enumerate(d.civs[0].units) if u and u.class_==42},'monasteries':{str(i):unit(1,i) for i in (30,31,32,104,1806)},'armenianHelper':unit(44,1118)}}
json.dump(out,open(sys.argv[2],'w'),sort_keys=True)
'''


def raw_data():
    dat = fetch_dat()
    key = hashlib.sha256((DAT['sha256'] + DUMP).encode()).hexdigest()[:16]
    cache = CACHE / ('relic-income.' + key + '.json')
    if not cache.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(dat), str(cache)])
    return json.loads(cache.read_text())


def build(raw):
    """Validate the audited execution paths; fail rather than silently omit a new modifier."""
    audit = raw['audit']
    assert not audit['resourceTaskReferences'] and not audit['headerResourceTaskReferences'], 'New relic resource task requires audit'
    paths = {(r['effectId'], r['index']) for r in audit['resourceCommands']}
    assert paths == {(464, 3), (464, 4), (464, 7), (464, 8), (488, 0), (562, 5), (783, 0)}, 'Relic effect paths changed; audit before publishing'
    base = raw['civs'][1]['resources']
    assert all(c['resources'] == base for c in raw['civs']), 'Civilization-specific base rate requires audit'
    assert set(base) == {'7', '191', '225', '264', '265'}
    assert all(isinstance(v, (int, float)) and math.isfinite(v) and v >= 0 for v in base.values())
    civs = json.loads((ROOT / 'src/data/civs.json').read_text())
    catalog = {u['id']: u for u in json.loads((ROOT / 'src/data/units.json').read_text())}
    by_name = {CIV_DAT.get(c['name'], c['name']): c for c in raw['civs']}
    assert all(c['en'] in by_name for c in civs)
    fx, techs = raw['effects'], raw['techs']

    def modifier(eid, indices, typ, res, op, civ, scope, tid=None):
        commands = [fx[str(eid)]['commands'][i] for i in indices]
        assert all(c['Type'] == typ and c['A'] in res and c['C'] == -1 and math.isfinite(c['D']) and c['D'] >= 0 for c in commands)
        assert op != 'set' or all(c['B'] != 1 for c in commands), 'Additive resource operation requires audit'
        assert len({c['D'] for c in commands}) == 1
        return {'effectId': eid, 'commandIndices': indices, 'commands': commands, 'resources': res,
                'operation': op, 'value': commands[0]['D'], 'displayValue': round(commands[0]['D'], 6), 'civ': civ, 'scope': scope, 'techId': tid}

    modifiers = {
        'aztecs': modifier(488, [0], 6, [191], 'mul', 'Aztecs', 'team'),
        'burgundians': modifier(783, [0], 1, [225], 'set', 'Burgundians', 'team'),
        'grandTrunkRoad': modifier(562, [5], 6, [191], 'mul', 'Hindustanis', 'self', 506),
        # Enemy and neutral branches are alternatives, not two multipliers for one recipient.
        'atheism': modifier(464, [3, 4], 26, [191, 225], 'mul', 'Huns', 'enemy-or-neutral', 21),
    }
    neutral = [fx['464']['commands'][i] for i in (7, 8)]
    assert all(c['Type'] == 36 for c in neutral)
    assert [(c['A'], c['D']) for c in neutral] == [(c['A'], c['D']) for c in modifiers['atheism']['commands']]
    modifiers['atheism']['neutralCommands'] = neutral
    assert by_name['Aztecs']['teamBonusId'] == 488 and by_name['Burgundians']['teamBonusId'] == 783
    assert techs['506']['civ'] == by_name['Hindustanis']['id'] and techs['506']['effectId'] == 562
    assert techs['21']['civ'] == by_name['Huns']['id'] and techs['21']['effectId'] == 464
    thresholds = []
    targets = None
    for tid in (699, 700, 701, 702):
        t = techs[str(tid)]
        commands = fx[str(t['effectId'])]['commands']
        assert t['civ'] == by_name['Lithuanians']['id'] and t['requiredCount'] == len(t['requires'])
        assert all(c['Type'] == 4 and c['C'] == 9 and c['B'] == -1 for c in commands)
        assert len({c['D'] for c in commands}) == 1
        current = [c['A'] for c in commands]
        if targets is None:
            targets = current
        assert current == targets
        gate = [c for c in t['costs'] if c['type'] == 7]
        assert len(gate) == 1
        assert gate[0]['flag'] == 1 and gate[0]['amount'] == len(thresholds) + 1
        assert t['requires'] == ([104, 107] if tid == 699 else [104, tid - 1])
        thresholds.append({'count': gate[0]['amount'], 'tech': t, 'effect': fx[str(t['effectId'])]})
    assert [t['count'] for t in thresholds] == sorted({t['count'] for t in thresholds})
    encoded = thresholds[0]['effect']['commands'][0]['D']
    assert all(c['D'] == encoded for t in thresholds for c in t['effect']['commands'])
    assert int(encoded) // 256 == 4, 'Attack class changed; audit before publishing'
    available = [i for i in targets if 'Lithuanians' in catalog[i]['civs']]
    named = lambda i: {'id': i, 'zh': catalog[i]['zh'], 'en': catalog[i]['en']}
    return {
        'meta': {'generatedBy': 'scripts/relic_income_build.py', 'datSha256': DAT['sha256'], 'patch': DAT['patch'],
                 'datSource': {k: DAT[k] for k in ('repo', 'commit', 'path')}, 'engineVerifiedInPinnedBuild': False,
                 'fieldSemantics': SEMANTICS, 'semanticsChecked': '2026-10-20',
                 'semanticsEvidence': '字段时间单位及引擎操作语义；文档示例数值不用于游戏参数。',
                 'numberEvidence': '全部游戏参数来自固定.dat；数值计算直接使用EffectCommands原始float；另存displayValue仅用于文案。',
                 'rateUnit': 'resource per game minute'},
        'resourceIds': RESOURCE_IDS.copy(),
        'baseRates': {r: base[str(i)] for r, i in RESOURCE_IDS.items()},
        'civs': {c['en']: {'datCiv': by_name[c['en']]['id'], 'baseResources': by_name[c['en']]['resources']} for c in civs},
        'modifiers': modifiers,
        'lithuanians': {'countResource': 7, 'thresholds': thresholds, 'cap': max(t['count'] for t in thresholds),
                       'attackIncrement': encoded % 256, 'attackClass': int(encoded) // 256,
                       'units': [named(i) for i in available], 'extraRawTargets': [named(i) for i in targets if i not in available]},
        'armenianChain': {'techs': [techs[str(i)] for i in (949, 957, 941, 930)],
                          'effects': [fx[str(i)] for i in (951, 952, 941)], 'helper': audit['armenianHelper']},
        'audit': audit,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build(raw_data())
    rendered = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.check:
        if not OUT.exists() or OUT.read_text() != rendered:
            raise SystemExit('relic_income.json differs from pinned .dat; rerun scripts/relic_income_build.py')
    else:
        OUT.write_text(rendered)
    print('relic income: %d civilizations, 7 audited resource commands; no game client run' % len(data['civs']))


if __name__ == '__main__':
    main()
