/**
 * issue 730：只读展示 eco.json villager.tasks / villager.female 的基准 workRate 与携带量。
 * 数值事实在 domain/villagerGatherFacts.ts；本文件只保留玩家称呼和视图映射。
 */
import { villagerGatherFacts, type VillagerEcoSlice } from '../../domain/villagerGatherFacts';

export { VILLAGER_UNIT_ID } from '../../domain/gameIds';
export type { VillagerEcoSlice, VillagerTaskStat } from '../../domain/villagerGatherFacts';

/** 已有任务键的玩家称呼。未知键不自拟名称。 */
const TASK_LABEL: Record<string, string> = {
  wood: '伐木',
  farm: '农田',
  gold: '采金',
  stone: '采石',
  berries: '浆果',
  hunt: '狩猎',
  sheep: '牧羊',
  fish: '捕鱼',
  build: '建造',
};

export interface VillagerGatherRow {
  key: string;
  label: string;
  workRate: number | null;
  carry: number | null;
  femaleWorkRate: number | null;
  femaleCarry: number | null;
}

export interface VillagerGatherBaseline {
  rows: VillagerGatherRow[];
  /** 女村民任务形态与男村民逐项相同；缺任一项则为 false。 */
  femaleSame: boolean;
  patch: string | null;
  tasksNote: string | null;
}

export function formatGatherNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

export function villagerGatherBaseline(source?: VillagerEcoSlice): VillagerGatherBaseline {
  const facts = villagerGatherFacts(source);
  return {
    ...facts,
    rows: facts.rows.map((row) => ({ ...row, label: TASK_LABEL[row.key] ?? '待确认' })),
  };
}
