"""从固定 .dat 原始效果命令推导弹丸引导/剧毒/直线穿透科技的作用单位集合（#1328 / #1403 / #1446）。

供 scripts/army_research_build.py 与 scripts/effects_build.py 共享，保证三处入口
（科技模拟器、单位/混编 PK、阵容新增费用）使用完全同一套无硬编码推导逻辑。
"""
import math


def transform_closure(dat_units, catalog_ids=None):
    """基于双向 Transform 链接构造形态闭包；返回 {uid: set(形态 ID)}。"""
    transforms = {}
    for uid, unit in enumerate(dat_units):
        if unit is not None and unit['Transform'] >= 0:
            other = unit['Transform']
            transforms.setdefault(uid, set()).add(other)
            transforms.setdefault(other, set()).add(uid)

    def forms(uid):
        seen, todo = set(), [uid]
        while todo:
            current = todo.pop()
            if current in seen:
                continue
            seen.add(current)
            todo.extend(transforms.get(current, set()) - seen)
        return seen

    target_ids = (uid for uid, unit in enumerate(dat_units) if unit is not None) if catalog_ids is None else catalog_ids
    return {uid: forms(uid) for uid in target_ids}


def is_regular_cooldown_charge(dat_unit):
    """常规周期冷却蓄力谓词（与 src/features/units/components/UnitCharge.tsx:31-32 同源，零单位 ID 硬编码）。

    直接下标读取 ChargeEvent 与 RechargeRate，若解析缓存陈旧缺字段则 fail-closed 抛出 KeyError。
    """
    return dat_unit['ChargeEvent'] >= 0 and dat_unit['RechargeRate'] < 1000


def guided_projectile_ids(commands, attrs=(19,)):
    """从原始 EffectCommands 字典列表提取命中指定弹丸属性的弹丸单位 ID 集合。

    显式契约：commands 必须是原始 .dat EffectCommands 字典列表（如 d['Effects'][eid]['EffectCommands']），
    不得传入 effects_build.py 的 a_cmds() 五元组；若遇到非字典项或按类生效命令（A < 0），立即 fail-closed 报错。
    """
    attr_set = set(attrs)
    out = set()
    for c in commands:
        if not isinstance(c, dict):
            raise TypeError(f'guided_projectile_ids expects raw EffectCommands dict items, got {type(c).__name__}')
        if c['Type'] in (0, 4, 5) and c['C'] in attr_set:
            if c['A'] < 0:
                raise ValueError(f'guided_projectile_ids encountered class-scoped projectile command: {c!r}')
            out.add(c['A'])
    return out


def pass_through_projectile_ids(commands):
    """从原始 EffectCommands 字典列表提取同时满足 C=67 (HitMode=1) 且 C=119 > 0 (PassThroughDamage) 的具体弹丸 ID 集合（#1446）。

    显式契约：commands 必须是原始 .dat EffectCommands 字典列表（遇非字典立即抛 TypeError）；
    先校验所有命令的 Type 与 C 均为严格整数（否则 fail-closed 抛 ValueError）；
    对 C in (67, 119) 且 Type in (0, 4, 5, 10, 14, 15) 仅接受具体弹丸（A >= 0）的 Type=0（set）与有限数值 D，
    遇按类（A < 0）、非 Type=0、bool 或非有限 D 立即 fail-closed 抛 ValueError；
    同弹丸按命令顺序覆盖（后续 set 0 可清除前序正值）。
    """
    hit_mode = {}
    pass_dmg = {}
    for c in commands:
        if not isinstance(c, dict):
            raise TypeError(f'pass_through_projectile_ids expects raw EffectCommands dict items, got {type(c).__name__}')
        t = c['Type']
        if type(t) is not int:
            raise ValueError(f'pass_through_projectile_ids encountered non-int command type {t!r}: {c!r}')
        attr = c['C']
        if type(attr) is not int:
            raise ValueError(f'pass_through_projectile_ids encountered non-int command attribute {attr!r}: {c!r}')
        if attr not in (67, 119):
            continue
        if t not in (0, 4, 5, 10, 14, 15):
            continue
        if t != 0:
            raise ValueError(f'pass_through_projectile_ids encountered unsupported command type {t!r}: {c!r}')
        a = c['A']
        if type(a) is not int or a < 0:
            raise ValueError(f'pass_through_projectile_ids encountered invalid/class-scoped projectile target: {c!r}')
        d = c['D']
        if isinstance(d, bool) or not isinstance(d, (int, float)) or not math.isfinite(d):
            raise ValueError(f'pass_through_projectile_ids encountered non-finite command value: {c!r}')
        if attr == 67:
            hit_mode[a] = float(d)
        else:
            pass_dmg[a] = float(d)
    return {pid for pid, hm in hit_mode.items() if abs(hm - 1.0) < 1e-6 and pass_dmg.get(pid, 0.0) > 1e-9}


def split_projectile_units(dat_units, forms_by_uid, catalog_units, guided_pids):
    """划分弹丸命中的全部目录单位与「仅常规冷却蓄力弹丸命中」子集。

    直接下标读取 Projectiles 与 ChargeProjectile，缺字段 fail-closed。
    返回升序去重后的 (all_ids, charge_only_ids)，且恒满足 charge_only_ids ⊆ all_ids。
    """
    all_ids = set()
    charge_only_ids = set()
    for item in catalog_units:
        uid = item['id'] if isinstance(item, dict) else item
        fs = forms_by_uid[uid]
        normal_hit = any(p in guided_pids for f in fs for p in dat_units[f]['Projectiles'] if p >= 0)
        hit_charge_forms = [
            f
            for f in fs
            if dat_units[f]['ChargeProjectile'] >= 0 and dat_units[f]['ChargeProjectile'] in guided_pids
        ]
        charge_hit = bool(hit_charge_forms)
        if normal_hit or charge_hit:
            all_ids.add(uid)
            if charge_hit and not normal_hit and all(is_regular_cooldown_charge(dat_units[f]) for f in hit_charge_forms):
                charge_only_ids.add(uid)
    return sorted(all_ids), sorted(charge_only_ids)
