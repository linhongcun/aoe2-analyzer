/**
 * 搜索别名（玩家俗称）：单位与开局共用这一份数据，搜索只从这里读别名。
 * 别名排在「名称完全匹配 / 名称前缀」之后、「名称包含」之前（见 domain/search.ts）。
 * 开局别名为产品审定名单（#3 / Reid 整理、Steve 审），新增请走 issue，不要在别处另加机制。
 */

/** 单位别名：单位 id → 别名（#44 补充） */
export const UNIT_ALIASES: Record<number, string[]> = {};

/** 别名 → 开局 id（同一别名可指向多个开局） */
const BUILD_ALIAS_TABLE: [string[], string[]][] = [
  [['斥候', '斥候快攻', '19p斥候'], ['scouts-18']],
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
