/**
 * DE 188329 训练解锁科技与条件训练地点的单一纯领域真源（Issue 1525）。
 *
 * 集中维护固定 .dat（army_research.json + garrison_general.json + trees.json）中
 * 由可研究科技解锁的单位训练门槛：
 * - 16 无政府（哥特：城堡 41/555，兵营 12 次要节点 759/761）
 * - 47 化学（火枪手 5、手推炮 36、炮舰 420、精锐炮舰 691）
 * - 483 掠夺者（匈奴：城堡 755/757，马厩 101 次要节点 886/887）
 */

export interface ConditionalTrainingFamily {
  readonly civ: string;
  readonly building: number;
  readonly tech: number;
  /** [主城堡单位 ID, 条件建筑次要单位 ID] */
  readonly pairs: readonly (readonly [primary: number, alternate: number])[];
}

/**
 * DE 188329 文明树把哥特兵营近卫军与匈奴马厩答刺罕骑兵标为 ResearchRequired 次要节点；
 * 普通、精锐及各建筑节点仍保留独立单位 ID。
 */
export const CONDITIONAL_TRAINING_FAMILIES: readonly ConditionalTrainingFamily[] = [
  {
    civ: 'Goths',
    building: 12,
    tech: 16,
    pairs: [
      [41, 759],
      [555, 761],
    ],
  },
  {
    civ: 'Huns',
    building: 101,
    tech: 483,
    pairs: [
      [755, 886],
      [757, 887],
    ],
  },
] as const;

export interface TrainingUnlockGate {
  readonly techId: number;
  /** 受该科技门控的训练单位 ID；若设置了 buildingId 则仅限在该建筑训练时生效，否则在所有训练建筑生效。 */
  readonly unitIds: readonly number[];
  readonly buildingId?: number;
  /**
   * 驻军回血（garrisonHealing）在「生产后留驻」场景纳入该解锁科技的建筑 ID。
   * 化学（47）仅列陆地火药建筑（87 靶场、49 攻城武器厂）；船坞（45）与巨港（1189）零治疗率，
   * 按等价重构原则维持既有 availableHealingTechs 口径不变。
   */
  readonly healingBuildingIds: readonly number[];
}

function familyByTech(tech: number): ConditionalTrainingFamily {
  const family = CONDITIONAL_TRAINING_FAMILIES.find((item) => item.tech === tech);
  if (!family) throw new Error(`Missing conditional training family for tech ${tech}`);
  return family;
}

const anarchyFamily = familyByTech(16);
const maraudersFamily = familyByTech(483);

/** 全站训练解锁门控表（按 techId 升序，与 PRODUCTION_UNLOCK_TECH_IDS 一致）。 */
export const TRAINING_UNLOCK_GATES: readonly TrainingUnlockGate[] = [
  {
    techId: anarchyFamily.tech,
    unitIds: anarchyFamily.pairs.map(([, alternate]) => alternate),
    buildingId: anarchyFamily.building,
    healingBuildingIds: [anarchyFamily.building],
  },
  {
    techId: 47,
    unitIds: [5, 36, 420, 691],
    healingBuildingIds: [87, 49],
  },
  {
    techId: maraudersFamily.tech,
    unitIds: maraudersFamily.pairs.map(([, alternate]) => alternate),
    buildingId: maraudersFamily.building,
    healingBuildingIds: [maraudersFamily.building],
  },
];

/** 所有只决定能否训练单位的解锁科技 ID（升序）。 */
export const TRAINING_UNLOCK_TECH_IDS: readonly number[] = TRAINING_UNLOCK_GATES.map((gate) => gate.techId);

/** 训练解锁科技 ID 集合。 */
export const TRAINING_UNLOCK_TECH_ID_SET: ReadonlySet<number> = new Set(TRAINING_UNLOCK_TECH_IDS);

/**
 * 返回单位在指定建筑训练所需的解锁科技 ID；无科技门槛时返回 undefined。
 * 若省略 buildingId，仅匹配无建筑限定的全局解锁门控（如化学 47）。
 */
export function requiredTrainingUnlockTech(unitId: number, buildingId?: number): number | undefined {
  for (const gate of TRAINING_UNLOCK_GATES) {
    if (gate.buildingId !== undefined && gate.buildingId !== buildingId) continue;
    if (gate.unitIds.includes(unitId)) return gate.techId;
  }
  return undefined;
}

/** 判断科技是否为某建筑在「生产后留驻」回血场景下应展示的训练解锁科技。 */
export function isHealingUnlockTechForBuilding(techId: number, buildingId: number): boolean {
  return TRAINING_UNLOCK_GATES.some((gate) => gate.techId === techId && gate.healingBuildingIds.includes(buildingId));
}
