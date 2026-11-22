import { fmtSide } from '../../../domain/duelState';
import type { DuelParams } from '../../../domain/duelParams';
import type { MixedDuelInput } from '../../../domain/mixedDuelParams';
import type { SideState } from './duelSide';

/**
 * issue 1279：单兵 PK 一键互换 A / B 双方。
 * 对调 a/b（含不可用方保留所选文明）与数量 na/nb；保留模式、预算、来源上下文与 be（沿用 BreakEven stale 契约）。
 */
export function swapSingleDuelParams(sp: URLSearchParams, a: SideState, b: SideState, params: DuelParams): URLSearchParams {
  const next = new URLSearchParams(sp);
  next.set('a', fmtSide({ ...b.spec, civ: b.civ }));
  next.set('b', fmtSide({ ...a.spec, civ: a.civ }));
  if (params.mode === 'n') {
    next.set('na', String(params.nb));
    next.set('nb', String(params.na));
  } else {
    const rawNa = sp.get('na');
    const rawNb = sp.get('nb');
    if (rawNb !== null) next.set('na', rawNb);
    else next.delete('na');
    if (rawNa !== null) next.set('nb', rawNa);
    else next.delete('nb');
  }
  return next;
}

/** issue 1279：混编对战一键互换 A / B 双方（文明、时代、科技、团队与全部兵种行）。 */
export function swapMixedDuelInput(input: MixedDuelInput): MixedDuelInput {
  return { ...input, a: input.b, b: input.a };
}
