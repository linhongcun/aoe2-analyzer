/** Issue197: only the reviewed Bengali age family, never a general Type7 interpreter. */
import validateSpawn from '../content/schema/compiled/wei-spawn.mjs';
import type { WeiSpawnContext } from './weiEconomy';

/** The existing structural schema is shared; Bengali and Wei semantics stay separate. */
export type BengaliSpawnContext = WeiSpawnContext;
interface Row {
  source?: string;
  age?: number;
  tech?: number;
  requires?: number[];
  ageSpawn?: BengaliSpawnContext;
  effects?: { kind: string; res?: number; op?: string; v?: number }[];
}
export interface BengaliReward {
  row: Row;
  tech: number;
  trigger: number;
  age: number;
  count: number;
}
const IDS = [847, 848, 849, 873];
const TRIGGERS = [101, 102, 103, 298];
const AGES = [2, 3, 4, 1];
export const BENGALI_CONTEXT_REASON = '孟加拉时代赠村民缺少完整已核前置和生成命令，未计入';
export const BENGALI_SPAWN_NOTE =
  '到达新时代时，每座已完成城镇中心赠送2个村民，直接加入开局任务分配；满住房仍计入赠送，普通训练继续受住房限制。住房政策未经当前版本客户端实测；具体出生位置、集结与驻扎未模拟。';
export const BENGALI_SPAWN_ASSUMPTION = `${BENGALI_SPAWN_NOTE}奖励按本站0.1秒步长计入；当前方案不包含特殊起始时代。`;
export const BENGALI_KNIGHT_TEMPLATE_NOTE = '孟加拉没有骑士；骑士方案仅供通用模板经济估算';
export const isBengaliRewardRow = (row: Row) => row.ageSpawn !== undefined || (row.tech !== undefined && IDS.includes(row.tech));

export function bengaliRewardFamily(rows: readonly Row[] | undefined): BengaliReward[] | null {
  const candidates = (rows ?? []).filter((row) => isBengaliRewardRow(row) || row.effects?.some((effect) => effect.kind === 'res' && effect.res === 234));
  if (candidates.length !== IDS.length) return null;
  const rules: BengaliReward[] = [];
  for (let i = 0; i < IDS.length; i++) {
    const tech = IDS[i]!,
      trigger = TRIGGERS[i]!,
      age = AGES[i]!;
    const found = candidates.filter((row) => row.tech === tech);
    if (found.length !== 1) return null;
    const row = found[0]!,
      s = row.ageSpawn;
    if (row.source !== 'bonus' || row.age !== age || row.requires?.length !== 2 || row.requires[0] !== trigger || row.requires[1] !== 639 || !validateSpawn(s))
      return null;
    if (
      s.effectId !== 866 ||
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
      cap.D !== 0 ||
      !spawn ||
      spawn.Type !== 7 ||
      spawn.A !== 83 ||
      spawn.B !== 109 ||
      spawn.C !== 2 ||
      spawn.D !== 0
    )
      return null;
    const effects = row.effects;
    if (effects?.length !== 1 || effects[0]?.kind !== 'res' || effects[0].res !== cap.A || effects[0].op !== 'set' || effects[0].v !== cap.D) return null;
    rules.push({ row, tech, trigger, age, count: spawn.C });
  }
  return rules;
}

/** Cap0 visits all completed logicalTCs at this actual age arrival; GS298 is outside normal starts. */
export function bengaliRewardsForReachedAge(
  family: readonly BengaliReward[] | null,
  age: number,
  completedTCs: number,
  rewarded: ReadonlySet<number>,
): BengaliReward[] {
  if (!family || ![2, 3, 4].includes(age) || !Number.isSafeInteger(completedTCs) || completedTCs < 1) return [];
  const rule = family.find((candidate) => candidate.age === age && candidate.trigger === 99 + age && !rewarded.has(candidate.tech));
  if (!rule || !Number.isSafeInteger(rule.count * completedTCs)) return [];
  return [{ ...rule, count: rule.count * completedTCs }];
}
