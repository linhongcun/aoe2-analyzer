import glob
import io
import json
import math
import os
import re
import sys
import urllib.request
from collections import Counter

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from attack_classes import ATTACK_CLASS_NAMES as CL  # noqa: E402
from catalog_description import clean_description  # noqa: E402
from unit_types import unit_type  # noqa: E402


def attack_pairs(records):
    """保留显式 0 攻击类别并按类别保序去重：非零优先，双非零抛 ValueError。"""
    out = []
    index_by_name = {}
    for record in records:
        name = CL.get(record['Class'], '类别%d' % record['Class'])
        amount = record['Amount']
        if name not in index_by_name:
            index_by_name[name] = len(out)
            out.append([name, amount])
            continue
        idx = index_by_name[name]
        prev = out[idx][1]
        if prev != 0 and amount != 0:
            raise ValueError(f'Duplicate non-zero attack class {name!r}: {prev}, {amount}')
        if prev == 0 and amount != 0:
            out[idx][1] = amount
    return out


def combat_stats(row):
    def pairs(records, accept):
        return [[CL.get(a['Class'], '类别%d' % a['Class']), a['Amount']] for a in records if accept(a)]

    stats = dict(
        hp=row['HP'],
        atk=row['Attack'],
        ma=row['MeleeArmor'],
        pa=row['PierceArmor'],
        rng=row['Range'],
        minr=row['MinRange'],
        spd=row['Speed'],
        los=row['LineOfSight'],
        rof=row['ReloadTime'],
        acc=row['AccuracyPercent'],
        blast=row['BlastWidth'],
        atks=attack_pairs(row['Attacks']),
        arms=pairs(row['Armours'], lambda a: a['Amount'] or a['Class'] in (3, 4)),
        armc=pairs(row['Armours'], lambda a: a['Class'] not in (3, 4)),
        cls=sorted(a['Class'] for a in row['Armours']),
    )
    for key, field, types in [
        ('attackDelaySeconds', 'AttackDelaySeconds', (int, float)),
        ('frameDelay', 'FrameDelay', (int,)),
        ('garrisonCapacity', 'GarrisonCapacity', (int,)),
    ]:
        value = row.get(field)
        if type(value) in types and 0 <= value < math.inf:
            stats[key] = value
    return stats


def derive_unmodeled_dat_fields(source_unit, dat_units):
    """#1367：从固定 DAT 派生主投射物穿透、命中特效枚举与特殊战斗任务标记（fail-closed 直接键访问）。"""
    out = {}
    projectiles = source_unit['Projectiles']
    p1 = projectiles[0] if projectiles else -1
    if type(p1) is int and 0 <= p1 < len(dat_units) and dat_units[p1] is not None:
        hit_mode = dat_units[p1]['ProjectileHitMode']
        if type(hit_mode) is not int:
            raise ValueError(f'Invalid ProjectileHitMode for projectile {p1}: {hit_mode!r}')
        if hit_mode == 1:
            out['projectilePassThrough'] = True

    tasks = source_unit['CombatTasks']
    if not isinstance(tasks, list):
        raise ValueError(f'Invalid CombatTasks: {tasks!r}')

    hit_kinds = set()
    for task in tasks:
        action = task['action']
        attr = task['attr']
        v1 = task['v1']
        v2 = task['v2']
        if action == 157:
            attr_int = round(attr)
            if abs(attr - attr_int) < 1e-6 and v2 > 0 and v1 < 0:
                if attr_int == 109:
                    hit_kinds.add('dot')
                elif attr_int == 5:
                    hit_kinds.add('slow')
                elif attr_int == 10:
                    hit_kinds.add('attack-speed')
                else:
                    hit_kinds.add('unknown')
            else:
                hit_kinds.add('unknown')
        elif action == 160:
            if abs(attr - 9) < 1e-6 and v1 > 0 and v2 > 0:
                out['damagedTargetBonus'] = True
        elif action == 158:
            if v1 > 0 and v2 < 0:
                out['lowHpTransform'] = True

    if len(hit_kinds) == 1:
        only = next(iter(hit_kinds))
        if only != 'unknown':
            out['onHitEffect'] = only
    return out


def derive_death_heal_aura(source_unit, dat_units):
    """#1403：从固定 DAT 派生阵亡回血光环标记（BloodUnitID 指向 CombatAbility & 32 实体，fail-closed）。"""
    blood_id = source_unit['BloodUnitID']
    if type(blood_id) is not int:
        raise ValueError(f'Invalid BloodUnitID: {blood_id!r}')
    if blood_id < 0:
        return False
    if blood_id >= len(dat_units) or dat_units[blood_id] is None:
        raise ValueError(f'Missing BloodUnitID target {blood_id} in dat_units')
    target_ca = dat_units[blood_id]['CombatAbility']
    if type(target_ca) is not int or target_ca < 0:
        raise ValueError(f'Invalid CombatAbility for BloodUnitID target {blood_id}: {target_ca!r}')
    return bool(target_ca & 32)


def derive_inherent_regen(source_unit):
    """#1446：从固定 DAT 派生单位固有每分钟生命回复速率（RegenRate，fail-closed；按 6 位小数规范化后再判正）。"""
    val = source_unit['RegenRate']
    if isinstance(val, bool) or not isinstance(val, (int, float)) or not math.isfinite(val) or val < 0:
        raise ValueError(f'Invalid RegenRate: {val!r}')
    rounded = round(float(val), 6)
    norm = int(rounded) if rounded.is_integer() else rounded
    return norm if norm > 0 else None


def resolve_building_train_time(source_unit, building_id, fallback_tt=None):
    """#1403：按目录主训练建筑匹配 .dat TrainAt 槽位时间；未命中槽位时回退 .dat TrainTime，仅当 .dat 缺有效值时回退 fallback_tt。"""
    train_at = source_unit.get('TrainAt') or []
    for slot in train_at:
        if isinstance(slot, list) and len(slot) >= 2 and slot[0] == building_id:
            t = slot[1]
            if type(t) in (int, float) and math.isfinite(t) and t > 0:
                return t
    dat_tt = source_unit.get('TrainTime')
    if type(dat_tt) in (int, float) and math.isfinite(dat_tt) and dat_tt > 0:
        return dat_tt
    return fallback_tt


def main():
    cache_dir = os.environ['AOE_CACHE'] + '/'
    with open(cache_dir + 'data.json', encoding='utf-8') as f:
        d = json.load(f)
    with open(cache_dir + 'en.json', encoding='utf-8') as f:
        e = json.load(f)
    with open(cache_dir + 'zh.json', encoding='utf-8') as f:
        z = json.load(f)
    U = d['data']['Unit']
    civn = {v['internal_name'].upper(): k for k, v in d['civs'].items()}
    civn['HINDUSTANIS'] = 'Hindustanis'

    BN = {}
    units = {}
    monk_buildings = {}
    for tree_path in sorted(glob.glob(cache_dir + 'trees/*.json')):
        civ = civn[os.path.basename(tree_path)[:-5]]
        with open(tree_path, encoding='utf-8') as f:
            t = json.load(f)
        for b in t['buildings']:
            BN[b['building_id']] = (z.get(str(b['name_string_id']), b['name']).replace('<br>', ''), b['name'])
        for x in t['units_techs']:
            if x['use_type'] != 'Unit':
                continue
            i = x['node_id']
            u = U.get(str(i))
            if not u:
                continue
            if i not in units:
                hz = clean_description(z.get(str(u['LanguageNameId'] + 21000)), ('生产', '建造', '创建'))
                units[i] = dict(
                    id=i,
                    en=x['name'],
                    zh=re.sub(r'<br>\s*', '', z.get(str(x['name_string_id']), x['name'])),
                    type=unit_type(i, x['node_type']),
                    age=x['age_id'],
                    b=x['building_id'],
                    pic=x['picture_index'],
                    from_=x['link_id'] if x['link_node_type'] in ('Unit', 'UniqueUnit', 'RegionalUnit', 'UnitUpgrade') else None,
                    cost=u['Cost'],
                    tt=u['TrainTime'],
                    **combat_stats(u),
                    desc=hz,
                    civs=[],
                )
                # Keep catalog charge data separate from the non-trainable alternate form records.
                for field in ('ChargeType', 'ChargeEvent', 'MaxCharge', 'RechargeRate', 'RechargeDuration'):
                    if field in u:
                        units[i][field[0].lower() + field[1:]] = u[field]
            if civ == 'Bengalis' and i in (1759, 1761):
                key = str(x['help_string_id'] - 79000)
                if not e[key].strip() or not z[key].strip():
                    raise ValueError(f'Missing bilingual Ratha help for {i}: {key}')
                units[i]['desc'] = clean_description(z[key], ('生产', '建造', '创建'))
            if x['node_status'] != 'NotAvailable':
                if civ not in units[i]['civs']:
                    units[i]['civs'].append(civ)
                if i == 125:
                    monk_buildings[civ] = x['building_id']
    if monk_buildings:
        # #1230: pick the widest available same-ID training location. The DAT
        # first slot omits the Fortified Church substitution in two civs.
        counts = Counter(monk_buildings.values())
        units[125]['b'] = min(counts, key=lambda building: (-counts[building], building))
    UU = d['data']['unit_upgrades']
    # #38 双射程：aoe2techtree 只给对单位射程；对建筑射程差值取自固定 .dat（蓄力远程 ChargeType，Range − DisplayedRange）
    from dat_source import derive_train_count as _derive_train_count, load as _dat_load

    _DAT = _dat_load()
    _DU = _DAT['Civs'][1]['Units']
    # #11 时代校正：aoe2techtree 的 age_id 对升级单位不可靠（长剑士/长戟兵/冠军剑士等低一个时代）。
    # 取 .dat 中该单位升级科技（unit_upgrades[id].ID）前置链里的最高时代科技：101 封建=2，102 城堡=3，103 帝王=4。
    _AGE_TECH = {101: 2, 102: 3, 103: 4}
    _DT = _DAT['Techs']

    def techAge(t, seen=()):
        if t in _AGE_TECH:
            return _AGE_TECH[t]
        if t < 0 or t >= len(_DT) or t in seen:
            return 1
        return max([techAge(r, seen + (t,)) for r in _DT[t]['RequiredTechs'] if r >= 0] + [1])

    def rngBd(i):
        x = _DU[i] if i < len(_DU) else None
        if not x or not x.get('ChargeType') or not x.get('DisplayedRange'):
            return 0
        v = round(x['Range'] - x['DisplayedRange'], 2)
        return int(v) if float(v).is_integer() else v

    for u in units.values():
        dat_unit = _DU[u['id']] if u['id'] < len(_DU) else None
        displayed = dat_unit.get('DisplayedReloadTime') if dat_unit else None
        interval = u['rof']
        if (
            type(displayed) in (int, float)
            and math.isfinite(displayed)
            and type(interval) in (int, float)
            and math.isfinite(interval)
            and abs(interval - displayed) > 1e-5
        ):
            u['displayedReloadTime'] = displayed
        dispersion = dat_unit.get('AccuracyDispersion') if dat_unit else None
        if type(dispersion) in (int, float) and 0 <= dispersion < math.inf:
            u['accuracyDispersion'] = dispersion
        if dat_unit:
            radii = (dat_unit.get('CollisionSizeX'), dat_unit.get('CollisionSizeY'))
            if all(type(radius) in (int, float) and 0 < radius < math.inf for radius in radii):
                u['collisionRadiusX'], u['collisionRadiusY'] = radii
        g = UU.get(str(u['id']))
        u['up'] = [g['Cost'], g['ResearchTime']] if g else None
        if g:
            a = techAge(g['ID'])
            if a > u['age']:
                print('age fix', u['id'], u['en'], u['age'], '->', a)
                u['age'] = a
            assert u['age'] >= a, (u['id'], u['en'], u['age'], a)  # 升级单位时代不得低于升级科技时代
        u['bz'] = BN.get(u['b'], ('?', '?'))[0]
        u['ben'] = BN.get(u['b'], ('?', '?'))[1]
        if u['from_'] not in units:
            u['from_'] = None
        source_unit = _DU[u['id']] if u['id'] < len(_DU) else None
        combat_ability = source_unit.get('CombatAbility') if source_unit else None
        if type(combat_ability) is not int or combat_ability < 0:
            raise ValueError(f"Missing or invalid CombatAbility for unit {u['id']}: {combat_ability!r}")
        u['combatAbility'] = combat_ability
        if source_unit:
            for field in ('BlastDamage', 'BlastAttackLevel', 'FriendlyFireDamage'):
                if field in source_unit:
                    u[field[0].lower() + field[1:]] = source_unit[field]
            tp = source_unit.get('TotalProjectiles', 0)
            mtp = source_unit.get('MaxTotalProjectiles', 0)
            sec = (source_unit.get('Projectiles') or [-1, -1])[1]
            if type(tp) in (int, float) and math.isfinite(tp) and tp > 1:
                sec_unit = _DU[sec] if 0 <= sec < len(_DU) else None
                has_damage = sec < 0 or (sec_unit is not None and any(a[1] > 0 for a in (sec_unit.get('Attacks') or [])))
                if has_damage:
                    u['totalProjectiles'] = int(round(tp))
            if (
                u.get('chargeType') in (6, 7)
                and type(mtp) in (int, float)
                and mtp > 1
                and not (type(tp) in (int, float) and tp > 1)
            ):
                u['chargeMultiProjectiles'] = True
            u.update(derive_unmodeled_dat_fields(source_unit, _DU))
            if derive_death_heal_aura(source_unit, _DU):
                u['deathHealAura'] = True
            regen_rate = derive_inherent_regen(source_unit)
            if regen_rate is not None:
                u['regenRate'] = regen_rate
            u['tt'] = resolve_building_train_time(source_unit, u['b'], u['tt'])
            train_count = _derive_train_count(source_unit, u['id'])
            if train_count > 1:
                u['trainCount'] = train_count
        dd = rngBd(u['id'])
        if dd:  # 插在 rng 之后，保持字段顺序
            it = list(u.items())
            it.insert([k for k, _ in it].index('rng') + 1, ('rngBd', dd))
            u.clear()
            u.update(it)
    # Seven verified non-trainable forms have detail pages (including Castle and Krepost Konniks).
    for owner, target, kind, zh_suffix, en_suffix in [
        (1759, 1738, 'weapon', '近战', 'Melee'),
        (1761, 1740, 'weapon', '近战', 'Melee'),
        (1962, 1980, 'barrage', '掩护', 'Barrage'),
        (1225, 1252, 'dismount', '下马', 'Dismounted'),
        (1227, 1253, 'dismount', '下马', 'Dismounted'),
        (1254, 1252, 'dismount', '下马', 'Dismounted'),
        (1255, 1253, 'dismount', '下马', 'Dismounted'),
    ]:
        source, alternate = U[str(owner)], U[str(target)]
        if target in units:
            raise ValueError(f'Form {target} unexpectedly has a training node')
        if kind == 'dismount':
            valid = _DU[owner]['BloodUnitID'] == target
        else:
            valid = (
                source['Trait'] & 8
                and alternate['Trait'] & 8
                and source['TraitPiece'] == target
                and alternate['TraitPiece'] == owner
            )
        if not valid:
            raise ValueError(f'Form relation changed: {owner} to {target}')
        form_dat = _DU[target] if target < len(_DU) else None
        form_ca = form_dat.get('CombatAbility') if form_dat else None
        if type(form_ca) is not int or form_ca < 0:
            raise ValueError(f'Missing or invalid CombatAbility for form {target}: {form_ca!r}')
        entry = units[owner]
        entry['form'] = dict(
            id=target,
            kind=kind,
            en=f"{entry['en']} ({en_suffix})",
            zh=f"{entry['zh']}（{zh_suffix}）",
            **combat_stats(alternate),
            combatAbility=form_ca,
        )

    # Only the Bengali elephant bonus (technology 846, effect 865) is in scope.
    from unit_conversion import add_conversion_data

    add_conversion_data(units, _DAT)

    # images
    os.makedirs('public/img/units', exist_ok=True)
    miss = []
    for u in units.values():
        p = f"public/img/units/{u['pic']}.webp"
        if os.path.exists(p):
            continue
        from PIL import Image

        try:
            raw = urllib.request.urlopen(
                f"https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/{os.environ.get('AOE_TT_REF', 'master')}/img/Unit/{u['pic']}.png"
            ).read()
            im = Image.open(io.BytesIO(raw)).convert('RGBA')
            im.thumbnail((64, 64))
            im.save(p, 'WEBP', quality=85)
        except Exception:
            miss.append(u['en'])
    L = sorted(units.values(), key=lambda u: (u['type'] != 'UniqueUnit', u['b'], u['age'], u['id']))
    with open('data/game/units.json', 'w', encoding='utf-8') as f:
        json.dump(L, f, ensure_ascii=False)
    print(len(L), 'unique', sum(u['type'] == 'UniqueUnit' for u in L), 'missing img', miss)


if __name__ == '__main__':
    main()
