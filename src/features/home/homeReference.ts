/**
 * 资料区的非交互例示。
 * 三枚文明徽记是已批准的视觉例示（拜占庭、日本、维京），不是热门或推荐。
 * 单位 / 时代 / 建筑 pic 对照当前数据锁定，见 tests/unit/home876.test.ts。
 */
export const HOME_EMBLEM_CIVS = ['Byzantines', 'Japanese', 'Vikings'] as const;

/** 民兵、步弓手、弩手、骑士、村民 */
export const HOME_UNIT_PICS = [8, 17, 18, 1, 15] as const;

/** 封建、城堡、帝王 */
export const HOME_AGE_PICS = [30, 31, 32] as const;

/** 城堡 */
export const HOME_BUILDING_PIC = 7;

/** 帝王时代，科技入口的视觉例示 */
export const HOME_TECH_PIC = 32;

export const HOME_REFERENCE_COPY = {
  civs: '加成、特色单位与科技、完整科技树。',
  units: '属性、费用、克制与升级路线。',
  tree: '每个文明可研究的单位与科技。',
  buildings: '属性、可生产单位与科技。',
  techs: '效果、费用与前置。',
} as const;
