"""站内单位类别的精确校正；游戏数值和文明可用性仍原样读取固定来源。"""


def unit_type(unit_id, source_type):
    # #460：维护者明确将波兰/立陶宛共享的波兰翼骑兵归为区域单位。
    # 固定 aoe2techtree@3bb43b1 的两棵树仍标 UniqueUnit，保留此来源差异记录。
    # https://github.com/SiegeEngineers/aoe2techtree/blob/3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f/data/trees/POLES.json
    return 'RegionalUnit' if unit_id == 1707 else source_type
