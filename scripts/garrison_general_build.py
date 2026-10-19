#!/usr/bin/env python3
"""#224: derive general building-garrison inputs from the pinned DE .dat.

The older #218 export is deliberately independent. No game client is run here.
python3 scripts/garrison_general_build.py [--check]
"""
import argparse
import hashlib
import json
import re
import subprocess
import urllib.request
from pathlib import Path

from dat_source import CACHE, DAT, ROOT, _venv_python, fetch_dat, load, pins
from effects_build import CIV_DAT

OUT = ROOT / 'src/data/garrison_general.json'
HOSTS = ROOT / 'src/data/garrison_hosts.json'
ATTRS = {2: 'capacity', 9: 'attack', 10: 'reload', 16: 'projectile', 30: 'garrisonType',
         54: 'trait', 63: 'combatAbility', 65: 'secondaryProjectile', 102: 'total',
         107: 'max', 130: 'firepower', 163: 'sizeClass'}

DUMP = r'''
import json,sys
from genieutils.datfile import DatFile
d=DatFile.parse(sys.argv[1]); manifest=json.load(open(sys.argv[2]))
def base(i):return d.civs[1].units[i] or d.civs[0].units[i]
ids=set(manifest['ids'])
ids.update(i for i,u in enumerate(d.civs[1].units) if u and u.class_==58)
building_ids=set(manifest['buildings']); aliases={i:{i} for i in building_ids}
forms={i:[i,i,i,i] for i in building_ids}
for age,eid in ((2,101),(3,102),(4,103)):
    for original in building_ids:
        forms[original][age-1]=forms[original][age-2]
        for command in d.effects[eid].effect_commands:
            if command.type==3 and command.a in aliases[original]:
                target=command.b
                if target>=0 and d.civs[1].units[target] and d.civs[1].units[target].building:
                    aliases[original].add(target);forms[original][age-1]=target;ids.add(target)
while True:
    extra={p for i in ids for u in [base(i)] if u
           for p in [u.type_50.projectile_unit_id if u.type_50 else -1,
                     u.creatable.secondary_projectile_unit if u.creatable else -1,
                     u.creatable.charge_projectile_unit if u.creatable else -1]
           if 0<=p<len(d.civs[1].units) and base(p)}
    if extra<=ids:break
    ids.update(extra)
def rec(u):
    if not u:return None
    t=u.type_50;c=u.creatable;b=u.building
    attack=lambda cls:next((a.amount for a in t.attacks if a.class_==cls),0) if t else 0
    return {'id':u.id,'type':u.type,'class':u.class_,'name':u.name,'languageId':u.language_dll_name,
            'attack':attack(3),'meleeAttack':attack(4),'reload':t.reload_time if t else 0,
            'capacity':u.garrison_capacity,'firepower':t.garrison_firepower if t else 0,
            'total':c.total_projectiles if c else 0,'max':c.max_total_projectiles if c else 0,
            'projectile':t.projectile_unit_id if t else -1,
            'secondaryProjectile':c.secondary_projectile_unit if c else -1,
            'garrisonType':b.garrison_type if b else 0,
            'sizeClass':u.dead_fish.old_size_class if u.dead_fish else 0,
            'trait':u.trait,'combatAbility':t.break_off_combat if t else 0,
            'chargeType':c.charge_type if c else 0,'chargeEvent':c.charge_event if c else 0,
            'chargeProjectile':c.charge_projectile_unit if c else -1,
            'maxCharge':c.max_charge if c else 0,'rechargeRate':c.recharge_rate if c else 0,
            'specialAbility':c.special_ability if c else 0,'minRange':t.min_range if t else 0,
            'resourceCapacity':u.resource_capacity,
            'food':next((s.amount for s in u.resource_storages if s.type==0 and s.amount>0),0),
            'garrisonTasks':[{'classId':x.class_id,'unitId':x.unit_id} for x in (u.bird.tasks if u.bird else []) if x.action_type==3],
            'specialTasks':[{'action':x.action_type,'classId':x.class_id,'unitId':x.unit_id,'value':x.work_value_1} for x in (u.bird.tasks if u.bird else []) if x.action_type in (132,136)],
            'trainLocations':[{'unitId':x.unit_id,'time':x.train_time} for x in (c.train_locations if c else []) if x.unit_id>=0]}
json.dump({'units':{str(i):rec(base(i)) for i in sorted(ids)},
           'civs':{c.name:{str(i):rec(c.units[i] or base(i)) for i in sorted(ids)} for c in d.civs[1:]},
           'forms':forms,'aliases':{str(k):sorted(v) for k,v in aliases.items()}},open(sys.argv[3],'w'))
'''


def raw_data():
    buildings = json.loads((ROOT / 'src/data/buildings.json').read_text())
    units = json.loads((ROOT / 'src/data/units.json').read_text())
    manifest = {'ids': sorted({u['id'] for u in units + buildings} | {285, 286, 293, 434}),
                'buildings': [b['id'] for b in buildings]}
    path = fetch_dat()
    key = hashlib.sha256((DUMP + json.dumps(manifest, sort_keys=True)).encode()).hexdigest()[:12]
    stem = 'garrison-general.%s.%s' % (hashlib.sha256(path.read_bytes()).hexdigest()[:12], key)
    cache = CACHE / (stem + '.json')
    if not cache.exists():
        source = CACHE / (stem + '.ids.json')
        source.write_text(json.dumps(manifest))
        subprocess.check_call([str(_venv_python()), '-c', DUMP, str(path), str(source), str(cache)])
    return json.loads(cache.read_text())


def strings(locale):
    pin = pins()['sources']['aoe2techtree']
    path = CACHE / ('garrison-labels.%s.%s.json' % (pin['commit'][:7], locale))
    if not path.exists():
        url = 'https://raw.githubusercontent.com/%s/%s/%slocales/%s/strings.json' % (
            pin['repo'], pin['commit'], pin['path'], locale)
        path.write_bytes(urllib.request.urlopen(url).read())
    return json.loads(path.read_text())


def decode(commands, units, canonical=None):
    """Expand raw unit/class targets and keep encoded attack classes separate."""
    canonical = canonical or {}
    result = []
    for command in commands:
        typ, attr = command['Type'], command['C']
        if typ not in (0, 4, 5) or attr not in ATTRS:
            continue
        value = command['D']
        if attr == 9:
            if int(abs(value)) // 256 != 3:
                continue
            value = (-1 if value < 0 else 1) * (abs(value) % 256)
            if typ == 5:
                value /= 100
        targets = [int(key) for key, unit in units.items() if unit and
                   (command['A'] == int(key) or (command['A'] == -1 and command['B'] == unit['class']))]
        seen = set()
        for target in targets:
            actual = canonical.get(target, target)
            signature = (actual, ATTRS[attr], typ, value)
            if signature in seen:
                continue
            seen.add(signature)
            result.append({'unit': actual, 'stat': ATTRS[attr],
                           'op': {0: 'set', 4: 'add', 5: 'mul'}[typ], 'value': value})
    return result


def training_changes(commands, units):
    """Attribute 158 selects the train-location slot changed by attribute 42."""
    slots, result = {}, []
    for command in commands:
        if command['Type'] != 0 or command['C'] not in (42, 158):
            continue
        targets = [int(key) for key, unit in units.items() if unit and
                   (command['A'] == int(key) or (command['A'] == -1 and command['B'] == unit['class']))]
        for target in targets:
            if command['C'] == 158:
                slots[target] = int(command['D'])
            else:
                result.append({'unit': target, 'slot': slots.get(target, 0), 'location': int(command['D'])})
    return result


def extra_label(unit):
    """Translate raw names omitted by the technology-tree locale subset."""
    name = unit['name']
    labels = {'RELIC': ('Relic', '圣物'), 'RMONK': ('Monk carrying relic', '持圣物的僧侣'),
              'KINGX': ('King', '国王'), 'SHEEP': ('Sheep', '绵羊'),
              'TURKY': ('Turkey', '火鸡'), 'GOAT': ('Goat', '山羊'),
              'BUFFALO': ('Water Buffalo', '水牛'), 'GOOSE': ('Goose', '鹅'),
              'PIG': ('Pig', '猪'), 'CAPYBARA': ('Capybara', '水豚')}
    if name in labels:
        return labels[name]
    if unit['class'] == 58:
        if name.startswith('LLAMA'):
            return ('Llama', '羊驼')
        if name.startswith('Cow'):
            return ('Cow', '牛')
        if name.startswith('CHICKEN'):
            return ('Chicken', '鸡')
    return (name, name)


def generate(d, raw):
    buildings = json.loads((ROOT / 'src/data/buildings.json').read_text())
    roster = json.loads((ROOT / 'src/data/units.json').read_text())
    civs = json.loads((ROOT / 'src/data/civs.json').read_text())
    catalog = json.loads((ROOT / 'src/data/techs.json').read_text())
    by_id = {x['id']: x for x in roster + buildings}
    units = raw['units']
    names = {CIV_DAT.get(c['Name'], c['Name']): (i, c) for i, c in enumerate(d['Civs'])}
    canonical = {alias: int(key) for key, values in raw['aliases'].items() for alias in values}
    techs = d['Techs']

    def effects(eid):
        return decode(d['Effects'][eid]['EffectCommands'], units, canonical) if eid >= 0 else []

    def rule(tid):
        tech = techs[tid]
        commands = d['Effects'][tech['EffectID']]['EffectCommands'] if tech['EffectID'] >= 0 else []
        return {'id': tid, 'requires': [i for i in tech['RequiredTechs'] if i >= 0],
                'count': tech['RequiredTechCount'], 'effects': effects(tech['EffectID']),
                'trainingLocations': training_changes(commands, units)}

    research = {str(t['id']): rule(t['id']) for t in catalog}
    en, zh = strings('en'), strings('zh')
    for key, unit in units.items():
        if not unit:
            raise ValueError('Missing catalog or projectile unit: ' + key)
        source = by_id.get(canonical.get(int(key), int(key)), by_id.get(83) if int(key) == 293 else None)
        clean = lambda s: re.sub(r'<[^>]*>', '', s).strip()
        extra_en, extra_zh = extra_label(unit)
        unit['en'] = source['en'] if source else clean(en.get(str(unit['languageId']), extra_en))
        unit['zh'] = source['zh'] if source else clean(zh.get(str(unit['languageId']), extra_zh))
        unit['secondaryAttack'] = units.get(str(unit['secondaryProjectile']), {}).get('attack', 0)
        unit['catalog'] = {'en': unit['en'], 'zh': unit['zh'],
                           'age': source['age'] if source else 1,
                           'pic': source.get('pic') if source else None,
                           'civs': source.get('civs', []) if source else []}

    upgrade_techs, unlock_techs = {}, {}
    for tid, tech in enumerate(techs):
        if tech['ResearchLocation'] < 1 or tech['EffectID'] < 0:
            continue
        for command in d['Effects'][tech['EffectID']]['EffectCommands']:
            target = command['B'] if command['Type'] == 3 else command['A'] if command['Type'] == 2 and command['B'] == 1 else -1
            if str(target) not in units:
                continue
            collection = upgrade_techs if command['Type'] == 3 else unlock_techs
            collection.setdefault(str(target), []).append(tid)

    result = {'meta': {'generatedBy': 'scripts/garrison_general_build.py', 'patch': DAT['patch'],
                       'repo': DAT['repo'], 'commit': DAT['commit'], 'sha256': DAT['sha256'],
                       'labelsCommit': pins()['sources']['aoe2techtree']['commit'],
                       'engineVerifiedInPinnedBuild': False},
              'units': units, 'rosterIds': sorted({u['id'] for u in roster} | {293}),
              'herdableIds': sorted(int(k) for k, u in units.items() if u['class'] == 58),
              'specialOccupantIds': [286, 434, 1808], 'relicIds': [285],
              'unitUpgradeTechs': {key: sorted(set(value)) for key, value in upgrade_techs.items()},
              'unitUnlockTechs': {key: sorted(set(value)) for key, value in unlock_techs.items()},
              'buildings': {}, 'techs': research,
              'ageRules': {str(i): rule(i) for i in (101, 102, 103)},
              # Empty marker effects still satisfy later n-of prerequisites.
              'conditional': [rule(i) for i, t in enumerate(techs) if t['Civ'] == -1 and t['ResearchLocation'] < 1],
              'civs': {}}
    for building in buildings:
        bid = building['id']
        if units[str(bid)]['type'] != 80:
            continue
        predecessors = set(raw['aliases'][str(bid)])
        changed = True
        while changed:
            previous = len(predecessors)
            for effect in d['Effects']:
                for command in effect['EffectCommands']:
                    if command['Type'] == 3 and command['B'] in predecessors and str(command['A']) in units and units[str(command['A'])]['type'] == 80:
                        predecessors.add(command['A'])
            changed = len(predecessors) != previous
        result['buildings'][str(bid)] = {'eraForms': raw['forms'][str(bid)],
                                         'aliases': raw['aliases'][str(bid)],
                                         'predecessors': sorted(predecessors),
                                         'produces': building['units'], 'civs': building['civs']}
    stats = set(ATTRS.values()) | {'meleeAttack', 'secondaryAttack', 'chargeType', 'chargeEvent',
                                 'chargeProjectile', 'maxCharge', 'rechargeRate', 'specialAbility',
                                 'garrisonTasks', 'trainLocations', 'resourceCapacity', 'food'}
    for civ in civs:
        index, dat_civ = names[civ['en']]
        automatic = [{'id': -1, 'requires': [], 'count': 0, 'effects': effects(dat_civ['TechTreeID'])}]
        automatic += [rule(i) for i, t in enumerate(techs) if t['Civ'] == index and t['ResearchLocation'] < 1]
        automatic.append({'id': -2, 'requires': [], 'count': 0, 'effects': effects(dat_civ['TeamBonusID'])})
        commands = d['Effects'][dat_civ['TechTreeID']]['EffectCommands']
        relevant = {int(k) for k in research}
        free = [tid for tid in relevant if any(c['Type'] == 103 and c['A'] == tid and c['C'] == 0 and c['D'] == 0 for c in commands)
                and all(any(c['Type'] == 101 and c['A'] == tid and c['B'] in (resource[0], -1) and c['C'] == 0 and c['D'] == 0 for c in commands)
                        for resource in techs[tid]['Cost'] if resource[1] > 0)]
        override = {}
        for key, value in raw['civs'][dat_civ['Name']].items():
            if not value:
                raise ValueError('Missing civilization base: %s unit %s' % (civ['en'], key))
            changes = {stat: value[stat] for stat in stats if stat in value and value[stat] != units[key][stat]}
            if changes:
                override[key] = changes
        result['civs'][civ['en']] = {'automatic': automatic, 'free': sorted(free),
                                    'disabled': sorted(int(c['D']) for c in commands if c['Type'] == 102),
                                    'baseOverrides': override}

    # Include potential hosts enabled by civilization rules, not only base
    # capacity. Training leave-ins are a separate channel from natural entry.
    hosts = set()
    for key, building in result['buildings'].items():
        unit = units[key]
        if unit['capacity'] > 0 or building['produces']:
            hosts.add(int(key))
        if any(effect['unit'] == int(key) and effect['stat'] == 'capacity' and effect['value'] > 0
               for civ in result['civs'].values() for auto in civ['automatic'] for effect in auto['effects']):
            hosts.add(int(key))
    return result, sorted(hosts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, hosts = generate(load(), raw_data())
    for path, value in ((OUT, data), (HOSTS, hosts)):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n'
        if args.check:
            if not path.exists() or path.read_text() != text:
                raise SystemExit('%s differs from pinned .dat; rerun scripts/garrison_general_build.py' % path.name)
        else:
            path.write_text(text)
    print('garrison general data %s from pinned .dat: %d units, %d hosts' % (
        'reproducible' if args.check else 'generated', len(data['units']), len(hosts)))


if __name__ == '__main__':
    main()
