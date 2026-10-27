/** Issue197: the reviewed Wei automatic research family only; never a general Type7 interpreter. */
import validateSpawn from '../content/schema/compiled/wei-spawn.mjs';

export interface WeiSpawnContext {
  effectId: number;
  requiredCount: number;
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: { Type: number; A: number; B: number; C: number; D: number }[];
}
interface Row {
  source?: string;
  age?: number;
  tech?: number;
  requires?: number[];
  spawn?: WeiSpawnContext;
  effects?: { kind: string; res?: number; op?: string; v?: number }[];
}
export interface WeiReward {
  row: Row;
  tech: number;
  trigger: number;
  age: number;
  count: number;
}
const TRIGGERS = [202, 203, 221, 14, 13, 12, 55, 182, 278, 279, 213, 249, 65, 48, 15, 906];
const AGES = [2, 3, 4, 2, 3, 4, 2, 3, 2, 3, 2, 3, 3, 3, 4, 2];
export const WEI_CONTEXT_REASON = '魏研究赠村民缺少完整已核前置和生成命令，未计入';
export const WEI_SPAWN_NOTE =
  '经济研究完成时赠送村民，直接加入开局任务分配；满住房仍计入赠送，普通训练继续受住房限制。住房政策未经当前版本客户端实测；具体出生位置、集结与驻扎未模拟。';
export const WEI_SPAWN_ASSUMPTION = `${WEI_SPAWN_NOTE}奖励按本站0.1秒步长计入。`;
export const WEI_KNIGHT_TEMPLATE_NOTE = '魏没有骑士；骑士方案仅供通用模板经济估算';
/** Also catches displaced source/ID rows; resource234 remains closed outside this family. */
export const isWeiRewardRow = (row: Row) => row.spawn !== undefined || (row.tech !== undefined && row.tech >= 1039 && row.tech <= 1054);

export function weiRewardFamily(rows: readonly Row[] | undefined): WeiReward[] | null {
  const candidates = (rows ?? []).filter((row) => isWeiRewardRow(row) || row.effects?.some((e) => e.kind === 'res' && e.res === 234));
  if (candidates.length !== TRIGGERS.length) return null;
  const rules: WeiReward[] = [];
  for (let i = 0; i < TRIGGERS.length; i++) {
    const tech = 1039 + i,
      trigger = TRIGGERS[i]!,
      age = AGES[i]!;
    const found = candidates.filter((row) => row.tech === tech);
    if (found.length !== 1) return null;
    const row = found[0]!,
      s = row.spawn;
    if (row.source !== 'bonus' || row.age !== age || row.requires?.length !== 2 || row.requires[0] !== trigger || row.requires[1] !== 639 || !validateSpawn(s))
      return null;
    if (
      s.effectId !== 1039 ||
      s.requiredCount !== 2 ||
      s.researchLocation !== -1 ||
      s.researchAt.length ||
      s.researchTime !== 0 ||
      s.cost.length ||
      s.commands.length !== 2
    )
      return null;
    const [cap, spawn] = s.commands;
    if (
      !cap ||
      cap.Type !== 1 ||
      cap.A !== 234 ||
      cap.B !== 0 ||
      cap.C !== -1 ||
      cap.D !== 1 ||
      !spawn ||
      spawn.Type !== 7 ||
      spawn.A !== 83 ||
      spawn.B !== 109 ||
      spawn.D !== 0 ||
      !Number.isSafeInteger(spawn.C) ||
      spawn.C < 1 ||
      spawn.C > 200
    )
      return null;
    const effects = row.effects;
    if (effects?.length !== 1 || effects[0]?.kind !== 'res' || effects[0].res !== cap.A || effects[0].op !== 'set' || effects[0].v !== cap.D) return null;
    rules.push({ row, tech, trigger, age, count: spawn.C });
  }
  return rules;
}

/** Normal start satisfies639 only while at least one logical completedTC exists. Cap1 never multiplies by TC count. */
export function weiRewardsForCompletedResearch(
  family: readonly WeiReward[] | null,
  completed: ReadonlySet<number>,
  age: number,
  completedTCs: number,
  rewarded: ReadonlySet<number>,
): WeiReward[] {
  if (!family || !Number.isSafeInteger(completedTCs) || completedTCs < 1) return [];
  return family.filter((rule) => age >= rule.age && completed.has(rule.trigger) && !rewarded.has(rule.tech));
}
