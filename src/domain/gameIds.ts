/** 游戏 id 常量的唯一来源（issue 797）；不要在其它模块重复写数值。 */
export const AGE_TECH_IDS = [101, 102, 103] as const;
export const AGE_BY_TECH: Readonly<Record<number, number>> = { 104: 1, 101: 2, 102: 3, 103: 4 };
export const HOUSE_ID = 70;
export const TC_BY_AGE: readonly number[] = [109, 71, 141, 142];
export const TOWN_CENTER_ID = TC_BY_AGE[0]!;
export const VILLAGER_UNIT_ID = 83;
export const FEMALE_VILLAGER_ID = 293;
export const VILLAGER_CLASS = 4;
export const FISH_TRAP_BUILDING_ID = 199;

/**
 * 经固定 .dat（empires2_x2_p1.dat, DE Update 188329）与 UGC Guide 核实的非计价/非生产玩家资源白名单：
 * 203 Map Reveal（0 正常 / 1 已探索 / 2 全可见；葡萄牙环游世界设 -1）。
 */
export const NON_PRICING_RESOURCE_IDS = [203] as const;
export const NON_PRICING_RESOURCE_SET: ReadonlySet<number> = new Set(NON_PRICING_RESOURCE_IDS);

export const isAgeTech = (id: number): boolean => (AGE_TECH_IDS as readonly number[]).includes(id);
