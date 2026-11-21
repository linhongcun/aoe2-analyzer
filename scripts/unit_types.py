"""站内单位类别的精确校正；游戏数值和文明可用性仍原样读取固定来源。"""


_TYPE_OVERRIDES = {
    # #460：维护者明确将波兰/立陶宛共享的波兰翼骑兵归为区域单位。
    # 固定 aoe2techtree@3bb43b1 的两棵树仍标 UniqueUnit，保留此来源差异记录。
    # https://github.com/SiegeEngineers/aoe2techtree/blob/3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f/data/trees/POLES.json
    1707: 'RegionalUnit',
    # #1226：固定 aoe2techtree@e56728e 的 56 棵树均指向炮舰 420，
    # 类别却为 51 个空值、4 个 Unit、1 个 UnitUpgrade。按本站口径归为升级单位。
    # https://github.com/SiegeEngineers/aoe2techtree/tree/e56728e76b7d08301fba7b18d5f16bc8554c109a/data/trees
    691: 'UnitUpgrade',
}


def unit_type(unit_id, source_type):
    return _TYPE_OVERRIDES.get(unit_id, source_type)
