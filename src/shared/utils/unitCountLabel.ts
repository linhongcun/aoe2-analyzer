/** 单位总数口径（#14，Steve 定）：只数玩家能选的单位系列，精锐版并入对应单位计，按英文名去重。首页与列表页共用 */
export const UNIT_COUNT_NOTE = '精锐版并入对应单位计';
export const unitCountLabel = (n: number): string => `${n} 个单位（${UNIT_COUNT_NOTE}）`;
