/**
 * 搜索别名（玩家俗称）：单位与开局共用这一份数据，搜索只从这里读别名。
 * 别名排在「名称完全匹配 / 名称前缀」之后、「名称包含」之前（见 domain/search.ts）。
 * 开局别名为产品审定名单（#3 / Reid 整理、Steve 审），新增请走 issue，不要在别处另加机制。
 */

/**
 * 单位别名（#44）：单位 id → 别名。
 * 名单以 Reid 在 #44 的最后一版别名表为准（issuecomment-6106741314，注明替代此前两版），
 * 再按日期规则过滤：只收有 2020 年以后社区出处的叫法。每条注明出处与发布日期（均已打开核对）。
 * 不作别名：散兵、投石机、游侠骑兵、战象（→象兵）；「战象」「游侠」是官方名，搜索列出全部匹配。
 */
const UNIT_ALIAS_TABLE: readonly (readonly [number, string, string])[] = [
  // 逗游网《帝国时代2决定版蒙古文明分析》2020-07-10 https://m.doyo.cn/article/398303?p=2
  [39, '骑射', 'doyo 398303 · 2020-07-10'], // 骑射手
  [448, '斥候', 'doyo 398303 · 2020-07-10'], // 斥候骑兵
  [280, '投石车', 'doyo 398303 · 2020-07-10'], // 轻型投石车
  [239, '波斯象', 'doyo 398303 · 2020-07-10'], // 战象
  // 233乐园「兵种相克」，发布 2026-05-07（转载；原文提及亚美尼亚文明，不早于 2023-10）https://www.233leyuan.com/post-detail/2052219558532636672
  [125, '和尚', '233leyuan · 发布 2026-05-07（转载；原文不早于 2023-10）'], // 僧侣：「肉马克制射手和和尚」
  [329, '骆驼', '233leyuan · 发布 2026-05-07（转载；原文不早于 2023-10）'], // 骆驼兵：「骑兵是万金油但惧枪兵和骆驼」
  [1258, '冲车', '233leyuan · 发布 2026-05-07（转载；原文不早于 2023-10）'], // 攻城锤：「冲车实际上克制纯远程」
];

/**
 * 在 Reid 最后一版表里、但目前没有 2020 年以后出处的别名：暂不上线，待 Reid 补出处 / Steve 定。
 * 农民、弓箭手：出处 m.pkvs.com/guide/16328.html 页面上找不到发布日期（未核实）；
 * 劲弩：3g.ali213.net 384975 发布于 2019-11-19；圣骑士：3dmgame 3796971 发布于 2019-12-16。
 */
export const PENDING_UNIT_ALIASES: readonly (readonly [number, string])[] = [
  [83, '农民'],
  [4, '弓箭手'],
  [492, '劲弩'],
  [569, '圣骑士'],
];

export const UNIT_ALIASES: Record<number, string[]> = {};
for (const [id, a] of UNIT_ALIAS_TABLE) (UNIT_ALIASES[id] ??= []).push(a);

/** 单位别名表原样导出（测试用）：[unit id, 别名] */
export const UNIT_ALIAS_ROWS: readonly (readonly [number, string])[] = UNIT_ALIAS_TABLE.map(([id, a]) => [id, a] as const);

/** 别名 → 开局 id（同一别名可指向多个开局） */
const BUILD_ALIAS_TABLE: [string[], string[]][] = [
  [['斥候', '斥候快攻'], ['scouts-18']],
  [['弓兵'], ['archers-19']],
  [['直城骑士'], ['fast-castle-boom']],
  [
    ['直城', '速生城堡', '速升城堡', 'fast castle'],
    ['fast-castle-boom', 'drush-fc'],
  ],
  [['黑快直城'], ['drush-fc']],
  [['黑快弓兵'], ['maa-archers-18']],
  [
    ['黑快', '民兵快攻', 'drush'],
    ['drush-fc', 'feudal-drush-18', 'maa-archers-18'],
  ],
];

/** 开局 id → 别名 */
export const BUILD_ALIASES: Record<string, string[]> = {};
for (const [names, ids] of BUILD_ALIAS_TABLE) for (const id of ids) (BUILD_ALIASES[id] ??= []).push(...names);

/** 别名表原样导出（测试与文档用） */
export const BUILD_ALIAS_ROWS: readonly (readonly [string, readonly string[]])[] = BUILD_ALIAS_TABLE.flatMap(([names, ids]) =>
  names.map((n) => [n, ids] as const),
);
