#!/usr/bin/env python3
"""#710: bounded pinned-DAT charge parameters; no runtime damage model."""
import argparse
import hashlib
import json
import math
import subprocess

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat

OUT = ROOT / 'src/data/charge_attack.json'
FIELDS = {59: 'max_charge', 60: 'recharge_rate', 61: 'charge_event', 62: 'charge_type'}
AUDITED_TARGETS = {38, 74, 75, 77, 283, 473, 567, 569, 1790, 1792, 1793, 1813}
EXAMPLES = (283, 1792, 1793)
SEMANTICS = {
    'attributes': 'https://github.com/Tapsa/AGE/blob/eb1202b70bf3a45d4264212b53b70bbad4369e98/AGE_Frame/Lists.cpp#L325',
    'mode': 'https://github.com/Tapsa/AGE/blob/eb1202b70bf3a45d4264212b53b70bbad4369e98/AGE_Frame/Units.cpp#L1404',
    'duration': 'https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/scripts/generateDataFiles.py#L416',
    'seconds': 'https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/js/main.js#L389',
}
DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]);t=d.techs[884]
assert 0<=t.civ<len(d.civs) and 0<=t.effect_id<len(d.effects)
civ=d.civs[t.civ];effect=d.effects[t.effect_id]
commands=[{'index':i,'Type':c.type,'A':c.a,'B':c.b,'C':c.c,'D':c.d} for i,c in enumerate(effect.effect_commands)]
targets=sorted({c['A'] for c in commands if c['C'] in (59,60,61,62)})
def base(uid):
 if not isinstance(uid,int) or uid<0 or uid>=len(civ.units):return None
 u=civ.units[uid]
 if not u or not u.creatable:return None
 q=u.creatable
 return {'max_charge':q.max_charge,'recharge_rate':q.recharge_rate,'charge_event':q.charge_event,'charge_type':q.charge_type}
out={'tech':{'id':884,'name':t.name,'civ':t.civ,'effectId':t.effect_id,'requires':[i for i in t.required_techs if i>=0],'requiredCount':t.required_tech_count,'researchLocations':[r.location_id for r in t.research_locations],'repeatable':t.repeatable},
 'civ':{'id':t.civ,'name':civ.name},'effectId':t.effect_id,'commands':commands,'bases':{str(uid):base(uid) for uid in targets}}
json.dump(out,open(sys.argv[2],'w'),sort_keys=True,allow_nan=False)
'''


def raw_data():
    dat = fetch_dat()
    key = hashlib.sha256((DAT['sha256'] + DUMP).encode()).hexdigest()[:16]
    cache = CACHE / ('charge-attack.' + key + '.json')
    if not cache.exists():
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(dat), str(cache)])
    return json.loads(cache.read_text())


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def state(value):
    assert isinstance(value, dict) and set(value) == set(FIELDS.values()), 'Missing charge base field'
    assert all(number(v) for v in value.values()), 'Non-finite or nonnumeric charge field'
    assert value['max_charge'] >= 0 and value['recharge_rate'] >= 0, 'Negative capacity/rate'
    assert all(value[k] in (0, 1) and int(value[k]) == value[k] for k in ('charge_event', 'charge_type')), 'Unreviewed charge mode'
    return {k: int(v) if k in ('charge_event', 'charge_type') else v for k, v in value.items()}


def tree_status(trees):
    blocks = trees['t']['Romans']
    result = {}
    for block in blocks:
        assert isinstance(block, list) and len(block) == 4 and isinstance(block[3], list), 'Malformed Romans tree'
        for cell in block[3]:
            assert isinstance(cell, list) and len(cell) == 6 and cell[2] in ('u', 't', 'b') and type(cell[3]) is int and type(cell[4]) is int and cell[4] in (0, 1), 'Malformed Romans tree cell'
            key = cell[2] + str(cell[3])
            assert key not in result or result[key] == cell[4], 'Conflicting Romans tree cells'
            result[key] = cell[4]
    return result


def build(raw, units, trees, techs):
    t, civ = raw['tech'], raw['civ']
    assert t['id'] == 884 and t['civ'] == civ['id'] and civ['name'] == 'Romans', 'Wrong charge tech/civilization'
    assert t['effectId'] == raw['effectId'] and type(t['effectId']) is int and t['effectId'] >= 0, 'Wrong charge effect'
    assert type(t['repeatable']) is int and t['repeatable'] in (0, 1) and type(t['requiredCount']) is int and t['requiredCount'] == len(t['requires']), 'Unreviewed charge prerequisites'
    assert all(type(i) is int and i >= 0 for i in t['requires']), 'Malformed prerequisites'
    catalog = {u['id']: u for u in units}
    tech_catalog = {x['id']: x for x in techs}
    tech = tech_catalog[884]
    statuses = tree_status(trees)
    assert tech['en'] == t['name'] and 'Romans' in tech['civs'] and statuses.get('t884') == 1, 'Charge tech unavailable'
    assert tech['b'] in t['researchLocations'] and type(tech['age']) is int and 1 <= tech['age'] <= 4, 'Charge research identity changed'
    commands = raw['commands']
    assert isinstance(commands, list) and commands and [c['index'] for c in commands] == list(range(len(commands))), 'Missing/duplicate command index'
    groups = {attribute: {} for attribute in (*FIELDS, 101)}
    for command in commands:
        assert set(command) == {'index', 'Type', 'A', 'B', 'C', 'D'}, 'Unexpected command shape'
        assert all(type(command[k]) is int for k in ('index', 'Type', 'A', 'B', 'C')), 'Nonnumeric command identity'
        attribute, uid = command['C'], command['A']
        assert attribute in groups and command['B'] == -1 and uid >= 0 and number(command['D']), 'Unknown charge/companion command'
        assert command['Type'] in (0, 4, 5), 'Unsupported attribute operation'
        assert uid not in groups[attribute], 'Duplicate charge target/field'
        if attribute == 101:
            assert command['Type'] == 5 and command['D'] > 0, 'Unreviewed training companion'
        groups[attribute][uid] = command
    targets = set(groups[59])
    assert targets == AUDITED_TARGETS and all(set(group) == targets for group in groups.values()), 'Charge target coverage changed'
    assert set(raw['bases']) == {str(uid) for uid in targets}, 'Missing charge base target'
    bases = {uid: state(raw['bases'][str(uid)]) for uid in targets}
    legal = sorted(uid for uid in targets if uid in catalog and 'Romans' in catalog[uid]['civs'] and statuses.get('u' + str(uid)) == 1)
    examples = []
    for uid in EXAMPLES:
        assert uid in legal and catalog[uid]['age'] <= tech['age'], 'Illegal charge example'
        before = bases[uid]
        after = dict(before)
        selected = [c for c in commands if c['A'] == uid and c['C'] in FIELDS]
        for command in selected:
            field, value = FIELDS[command['C']], command['D']
            if command['Type'] == 0:
                after[field] = value
            elif command['Type'] == 4:
                after[field] += value
            else:
                after[field] *= value
        examples.append({'unitId': uid, 'before': before, 'after': state(after), 'commandIndices': [c['index'] for c in selected]})
    return {
        'meta': {'generatedBy': 'scripts/charge_attack_build.py', 'patch': DAT['patch'], 'datSource': {k: DAT[k] for k in ('repo', 'commit', 'path')},
                 'datSha256': DAT['sha256'], 'engineVerifiedInPinnedBuild': False, 'fieldSemantics': dict(SEMANTICS),
                 'durationFormula': 'max_charge/recharge_rate', 'durationUnit': 'seconds'},
        'tech': {'id': t['id'], 'name': t['name'], 'civId': civ['id'], 'civName': civ['name'], 'effectId': t['effectId'], 'age': tech['age'],
                 'repeatable': t['repeatable'], 'requires': list(t['requires']), 'requiredCount': t['requiredCount'], 'researchLocations': list(t['researchLocations'])},
        'commands': [dict(c) for c in commands], 'rawTargets': sorted(targets), 'legalTargets': legal, 'examples': examples,
    }


def render(data):
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build(raw_data(), json.loads((ROOT / 'src/data/units.json').read_text()), json.loads((ROOT / 'src/data/trees.json').read_text()), json.loads((ROOT / 'src/data/techs.json').read_text()))
    rendered = render(data)
    if args.check:
        if not OUT.exists() or OUT.read_text() != rendered:
            raise SystemExit('charge_attack.json differs from pinned .dat; rerun scripts/charge_attack_build.py')
    else:
        OUT.write_text(rendered)
    print('charge attack: %d raw / %d legal / %d examples; static only, no game client run' % (len(data['rawTargets']), len(data['legalTargets']), len(data['examples'])))


if __name__ == '__main__':
    main()
