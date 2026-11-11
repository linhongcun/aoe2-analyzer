/** issue 730：eco.json villager.tasks / villager.female 的数值事实（D11）。 */
import { ECO } from '../data/eco';

export interface VillagerTaskStat {
  workRate?: unknown;
  carry?: unknown;
}

/** UI 视图切片：防御式解析 eco.json，只声明本页读取的字段；不是 EcoData 的整表副本。 */
export interface VillagerEcoSlice {
  meta?: { patch?: unknown; tasks?: unknown };
  villager?: {
    tasks?: Record<string, VillagerTaskStat | null | undefined>;
    female?: Record<string, VillagerTaskStat | null | undefined>;
  };
}

export interface VillagerGatherFactRow {
  key: string;
  workRate: number | null;
  carry: number | null;
  femaleWorkRate: number | null;
  femaleCarry: number | null;
}

export interface VillagerGatherFacts {
  rows: VillagerGatherFactRow[];
  femaleSame: boolean;
  patch: string | null;
  tasksNote: string | null;
}

/** 主要采集任务在前；其余仍按数据出现，不丢行。 */
const TASK_ORDER = ['wood', 'farm', 'gold', 'stone', 'berries', 'hunt', 'sheep', 'fish', 'build'];
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const asStat = (value: unknown): VillagerTaskStat | undefined => (value !== null && typeof value === 'object' ? (value as VillagerTaskStat) : undefined);

export function villagerGatherFacts(source: VillagerEcoSlice = ECO): VillagerGatherFacts {
  const tasks = source.villager?.tasks ?? {};
  const female = source.villager?.female ?? {};
  const seen = new Set<string>();
  const keys: string[] = [];
  const push = (key: string) => {
    if (seen.has(key) || (!(key in tasks) && !(key in female))) return;
    seen.add(key);
    keys.push(key);
  };
  for (const key of TASK_ORDER) push(key);
  for (const key of Object.keys(tasks)) push(key);
  for (const key of Object.keys(female)) push(key);
  const rows = keys.map((key) => {
    const male = asStat(tasks[key]);
    const fem = asStat(female[key]);
    return {
      key,
      workRate: male ? finite(male.workRate) : null,
      carry: male ? finite(male.carry) : null,
      femaleWorkRate: fem ? finite(fem.workRate) : null,
      femaleCarry: fem ? finite(fem.carry) : null,
    };
  });
  return {
    rows,
    femaleSame: rows.every((row) => row.workRate === row.femaleWorkRate && row.carry === row.femaleCarry),
    patch: text(source.meta?.patch),
    tasksNote: text(source.meta?.tasks),
  };
}
