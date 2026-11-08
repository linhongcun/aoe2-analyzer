/**
 * issue 730：只读展示 eco.json villager.tasks / villager.female 的基准 workRate 与携带量。
 * 不计算往返，不改持续生产的收入口径，缺数字标待确认。
 */
import ecoRaw from '../../data/raw/eco';

export { VILLAGER_UNIT_ID } from '../../domain/gameIds';

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

/** 主要采集任务在前；其余仍按数据出现，不丢行。 */
const TASK_ORDER = ['wood', 'farm', 'gold', 'stone', 'berries', 'hunt', 'sheep', 'fish', 'build'];

export interface VillagerTaskStat {
  workRate?: unknown;
  carry?: unknown;
}

export interface VillagerEcoSlice {
  meta?: { patch?: unknown; tasks?: unknown };
  villager?: {
    tasks?: Record<string, VillagerTaskStat | null | undefined>;
    female?: Record<string, VillagerTaskStat | null | undefined>;
  };
}

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

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

const asStat = (value: unknown): VillagerTaskStat | undefined => (value !== null && typeof value === 'object' ? (value as VillagerTaskStat) : undefined);

export function formatGatherNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

export function villagerGatherBaseline(source: VillagerEcoSlice = ecoRaw as unknown as VillagerEcoSlice): VillagerGatherBaseline {
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
      label: TASK_LABEL[key] ?? '待确认',
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
