"""从固定 .dat 原始效果命令推导弹丸引导/剧毒/直线穿透/追踪与弹速科技的作用单位集合（#1328 / #1403 / #1446 / #1509）。

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


def guidance_projectile_scopes(commands, dat_units):
    """从原始 EffectCommands 提取投射物追踪（C=19 bit 0）与弹速提升（Type==60 投射物 C=5 净正增量）弹丸 ID 集合（#1509）。

    显式契约（严格 fail-closed）：
    - commands 必须是原始 .dat EffectCommands 字典列表（遇非字典抛 TypeError）；
    - 每条命令先校验 Type 与 C 为严格 int（否则抛 ValueError），仅处理属性修改命令 Type in (0, 4, 5, 10, 14, 15)；
    - C=19（ProjectileSmartMode）：仅接受 Type in (0, 4)、严格 int 且 A >= 0（拒收按类 A < 0）及有限整数值 D；
      按命令顺序跟踪位掩码（Type=0 置位、Type=4 累加），仅保留 val > 0 且 (val & 1) == 1 的弹丸 ID
      （精确排除仅置 bit 1 +2 的直线穿透科技 902/1379，并防御负值补码误匹配）；
    - C=5（Speed）：先校验 A 为严格 int；A < 0 时校验 B 为严格 int，若 B == 11（投射物类）则无条件 fail-closed 抛 ValueError，
      其余常规单位类别跳过；A >= 0 时校验目标在 dat_units 有效且非 None（否则抛 ValueError），读取 dat_units[A]['Type']
      （缺键抛 KeyError），非 Type == 60 常规单位跳过；对具体投射物（Type == 60）仅接受 Type in (0, 4, 5) 与有限非 bool D，
      校验基速 dat_units[A]['Speed'] 后按命令顺序跟踪相对基速的净正向增量（> 1e-6）。
    返回 (tracking_pids, speed_pids)。
    """
    smart_mode = {}
    proj_speed = {}
    for c in commands:
        if not isinstance(c, dict):
            raise TypeError(f'guidance_projectile_scopes expects raw EffectCommands dict items, got {type(c).__name__}')
        t = c['Type']
        if type(t) is not int:
            raise ValueError(f'guidance_projectile_scopes encountered non-int command type {t!r}: {c!r}')
        attr = c['C']
        if type(attr) is not int:
            raise ValueError(f'guidance_projectile_scopes encountered non-int command attribute {attr!r}: {c!r}')
        if attr not in (19, 5):
            continue
        if t not in (0, 4, 5, 10, 14, 15):
            continue
        if attr == 19:
            if t not in (0, 4):
                raise ValueError(f'guidance_projectile_scopes encountered unsupported C=19 command type {t!r}: {c!r}')
            a = c['A']
            if type(a) is not int or a < 0:
                raise ValueError(f'guidance_projectile_scopes encountered invalid/class-scoped C=19 target: {c!r}')
            d = c['D']
            if isinstance(d, bool) or not isinstance(d, (int, float)) or not math.isfinite(d) or abs(d - round(d)) >= 1e-6:
                raise ValueError(f'guidance_projectile_scopes encountered invalid C=19 value: {c!r}')
            iv = int(round(d))
            if t == 0:
                smart_mode[a] = iv
            else:
                smart_mode[a] = smart_mode.get(a, 0) + iv
        else:
            a = c['A']
            if type(a) is not int:
                raise ValueError(f'guidance_projectile_scopes encountered non-int C=5 target A={a!r}: {c!r}')
            if a < 0:
                b = c['B']
                if type(b) is not int:
                    raise ValueError(f'guidance_projectile_scopes encountered non-int C=5 class B={b!r}: {c!r}')
                if b == 11:
                    raise ValueError(f'guidance_projectile_scopes encountered class-scoped projectile C=5 command: {c!r}')
                continue
            if a >= len(dat_units) or dat_units[a] is None:
                raise ValueError(f'guidance_projectile_scopes encountered missing unit {a} in C=5 command: {c!r}')
            du = dat_units[a]
            if du['Type'] != 60:
                continue
            if t not in (0, 4, 5):
                raise ValueError(f'guidance_projectile_scopes encountered unsupported projectile C=5 command type {t!r}: {c!r}')
            d = c['D']
            if isinstance(d, bool) or not isinstance(d, (int, float)) or not math.isfinite(d):
                raise ValueError(f'guidance_projectile_scopes encountered non-finite projectile C=5 value: {c!r}')
            base_spd = du['Speed']
            if isinstance(base_spd, bool) or not isinstance(base_spd, (int, float)) or not math.isfinite(base_spd):
                raise ValueError(f'guidance_projectile_scopes encountered invalid projectile base Speed for unit {a}: {base_spd!r}')
            cur = proj_speed.get(a, float(base_spd))
            if t == 0:
                proj_speed[a] = float(d)
            elif t == 4:
                proj_speed[a] = cur + float(d)
            else:
                proj_speed[a] = cur * float(d)
    tracking_pids = {pid for pid, val in smart_mode.items() if val > 0 and (val & 1) == 1}
    speed_pids = {pid for pid, spd in proj_speed.items() if spd > float(dat_units[pid]['Speed']) + 1e-6}
    return tracking_pids, speed_pids


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
