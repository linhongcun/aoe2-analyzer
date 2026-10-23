"""资源编号 → 中文名（effects_build 与 eco_build 共用这一张表）。

来源：UGC Guide 资源表 https://ugc.aoe2.rocks/general/resources/resources/
47/79/92/93/190/216 按该表改正；91–94 是起始资源，不再标「推断」。
0–4、32 沿用效果页已经在用的叫法，两份脚本不再各写各的。
"""

# https://ugc.aoe2.rocks/general/resources/resources/
RES_ZH = {
    0: '起始食物',
    1: '起始木材',
    2: '起始石料',
    3: '起始黄金',
    4: '人口上限',
    32: '额外人口',
    36: '农田食物量（马轭 +75 印证）',
    47: '采金产量倍率',  # Gold Mining Productivity
    77: '征服',
    79: '采石产量倍率',  # Stone Mining Productivity
    91: '起始食物',  # Starting Food
    92: '起始木材',  # Starting Wood
    93: '起始石料',  # Starting Stone
    94: '起始黄金',  # Starting Gold
    190: '食物采集产量倍率',  # Food Gathering Productivity
    194: '农田食物量',
    214: '牧场',
    216: '牧羊产量倍率',  # Shepherd Productivity
}
