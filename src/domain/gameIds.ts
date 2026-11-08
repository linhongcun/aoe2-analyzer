/** 游戏 id 常量的唯一来源（issue 797）；不要在其它模块重复写数值。 */
export const AGE_TECH_IDS = [101, 102, 103] as const;
export const AGE_BY_TECH: Readonly<Record<number, number>> = { 104: 1, 101: 2, 102: 3, 103: 4 };
export const HOUSE_ID = 70;
export const TC_BY_AGE: readonly number[] = [109, 71, 141, 142];
export const VILLAGER_UNIT_ID = 83;
export const FEMALE_VILLAGER_ID = 293;
export const VILLAGER_CLASS = 4;
export const FISH_TRAP_BUILDING_ID = 199;

export const isAgeTech = (id: number): boolean => (AGE_TECH_IDS as readonly number[]).includes(id);
