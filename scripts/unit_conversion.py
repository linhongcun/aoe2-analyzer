"""Export target resistance separately from civilization bonuses and caster actions."""


def add_conversion_data(units, dat):
    tech = dat['Techs'][846]
    if tech['EffectID'] != 865 or dat['Civs'][tech['Civ']]['Name'] != 'Bengalis':
        raise ValueError('Bengali elephant bonus source changed')
    changes = {}
    for command in dat['Effects'][tech['EffectID']]['EffectCommands']:
        target, attr = command['A'], command['C']
        if command['B'] != -1 or (command['Type'], attr) not in ((4, 111), (4, 112), (0, 24)):
            continue
        mods = changes.setdefault(target, {})
        if attr in mods:
            raise ValueError(f'Ambiguous elephant bonus for {target}, attribute {attr}')
        mods[attr] = command['D']
    source_units = dat['Civs'][1]['Units']
    for uid, unit in units.items():
        target = source_units[uid] if 0 <= uid < len(source_units) else None
        if target and 'ConversionResistance' in target:
            unit['conversionResistance'] = target['ConversionResistance']
        if 'Bengalis' in unit['civs'] and uid in changes:
            mods = changes[uid]
            unit['bengaliConversion'] = {
                'minTimeMod': mods[111], 'maxTimeMod': mods[112], 'bonusDamageReduction': mods[24]
            }
        if uid in (125, 775):
            tasks = dat['CasterTasks'].get(str(uid), [])
            actions = [t['action'] for t in tasks]
            if len(actions) != len(set(actions)):
                raise ValueError(f'Ambiguous generic caster tasks for {uid}')
            unit['casterTasks'] = tasks
