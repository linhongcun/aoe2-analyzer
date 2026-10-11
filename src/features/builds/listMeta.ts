/** #3 收尾：#/builds 列表页的到达时间（模拟器实时算，不读开局 JSON 里手写的 target.time）与推荐文明支持情况。
 *  按需加载（含 eco/units 数据），列表首屏不变重。 */
import eco from '../../data/eco.json';
import units from '../../data/units.json';
import { simulateBuild, type EcoData, type UpgradeData } from '../../domain/buildSim';
import type { BuildOrder } from '../../domain/buildOrder';
import { simSupport } from '../../domain/simSupport';
import { AGE_ZH, mmss } from './timelineModel';

const UPS = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const AGE_KEY = ['', '', 'feudal', 'castle', 'imperial'] as const;

export interface ListMeta {
  /** 如「约 9:14 到达封建」；按通用、默认参数 */
  time: string;
  /** 推荐文明里加成尚未计入模拟的（英文 id） */
  unsupported: string[];
}

/** 纯函数：模拟结果 → 列表文案。到封建：「约 9:14 到达封建」；多个时代：「约 10:30 封建、14:00 城堡」 */
export function timeText(ageUps: { age: keyof typeof AGE_ZH; reachAt: number }[], targetAge: number): string {
  const hit = ageUps.filter((a) => AGE_KEY.indexOf(a.age) <= targetAge && AGE_KEY.indexOf(a.age) >= 2);
  if (!hit.length) return '';
  if (hit.length === 1) return `约 ${mmss(hit[0]!.reachAt)} 到达${AGE_ZH[hit[0]!.age]}`;
  return `约 ${hit.map((a) => `${mmss(a.reachAt)} ${AGE_ZH[a.age]}`).join('、')}`;
}

export function listMeta(bo: BuildOrder): ListMeta {
  const tl = simulateBuild(bo, 'Generic', eco as unknown as EcoData, UPS);
  return { time: timeText(tl.ageUps, bo.target.age), unsupported: bo.civs.filter((c) => !simSupport(c)) };
}
