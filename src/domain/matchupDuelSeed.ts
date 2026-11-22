/** 对局助手带参跳转单位 PK / 文明对比的纯领域逻辑（Issue 1284）。
 *  起始单位仅由单侧文明与时代按确定性规则决定，不读对手文明、类型或主观评分（严守 Issue 888 红线）。
 */
import { civByEn } from '../data';
import { fmtSide } from './duelState';
import type { Trees, Unit } from './types';
import { unitAvailable } from './unitAvailability';

export interface DuelSeedData {
  core: {
    units: readonly Unit[];
    unitById: Record<number, Unit>;
  };
  trees: Trees;
}

/**
 * 确定性通用/地域候选优先序列（不含文明专属独特兵，覆盖全部 56 文明及 1–4 时代）：
 * 1) 骑士系 → 2) 步弓帝王终态 → 3) 帝王地域主力 → 4) 步弓城堡态 → 5) 城堡地域主力 → 6) 兵营通用线 → 7) 封建/黑暗基础兜底。
 */
export const DUEL_SEED_CANDIDATES: readonly number[] = [
  569, 283, 38, 492, 752, 2554, 1946, 1372, 330, 24, 753, 2552, 1944, 1370, 329, 567, 473, 77, 359, 358, 93, 4, 75, 74, 2550, 7, 83,
];

/**
 * 为单个文明在指定时代（默认帝王 4）选择科技树真实可用的起始单位 ID。
 * 仅作可算初始占位，绝非系统推荐或克制结论。
 */
export function pickDefaultDuelUnit(data: DuelSeedData, civ: string, age = 4): number | null {
  if (!civ || !civByEn(civ) || ![1, 2, 3, 4].includes(age)) return null;
  for (const id of DUEL_SEED_CANDIDATES) {
    if (unitAvailable(data, civ, id, age)) return id;
  }
  const combat = data.core.units.find((u) => unitAvailable(data, civ, u.id, age) && u.hp > 0 && u.atk > 0 && u.rof > 0);
  if (combat) return combat.id;
  const attacking = data.core.units.find((u) => unitAvailable(data, civ, u.id, age) && u.hp > 0 && u.atk > 0);
  if (attacking) return attacking.id;
  const anyUnit = data.core.units.find((u) => unitAvailable(data, civ, u.id, age));
  return anyUnit?.id ?? null;
}

/** 构造带双方文明、合法起始单位及对局上下文的单位 PK 站内路径；资料未就绪或任一方缺失时返回 null。 */
export function matchupDuelPath(data: DuelSeedData | null, me?: string | null, opp?: string | null): string | null {
  if (!data || !me || !opp || !civByEn(me) || !civByEn(opp)) return null;
  const uidA = pickDefaultDuelUnit(data, me, 4);
  const uidB = pickDefaultDuelUnit(data, opp, 4);
  if (uidA === null || uidB === null) return null;
  const a = fmtSide({ uid: uidA, civ: me, age: 4, techs: 'f', team: [] });
  const b = fmtSide({ uid: uidB, civ: opp, age: 4, techs: 'f', team: [] });
  return `/duel?${new URLSearchParams({ a, b, m: '1', me, opp })}`;
}

/** 构造文明对比站内路径；任一方缺失或双方相同时返回 null。 */
export function matchupComparePath(me?: string | null, opp?: string | null): string | null {
  if (!me || !opp || me === opp || !civByEn(me) || !civByEn(opp)) return null;
  return `/compare?${new URLSearchParams({ a: me, b: opp })}`;
}
