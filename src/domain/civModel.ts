import type { EcoData, EffectRow } from './buildSim';
import type { BuildOrder } from './buildOrder';
import type { SimNote } from './mechanismNotes';

/** 文明机制的公共上下文；失败即关闭，reasons 非空表示不完整。 */
export interface CivContext {
  reasons: string[];
  complete?: boolean;
}

/** 统一契约：新增文明按这个形状提供 context/row/notes/assumptions（issue 799）。 */
export interface CivModel {
  civ: string;
  context(eco: EcoData): CivContext;
  rowClass?(row: EffectRow, ctx: CivContext): null | { kind: 'handled' | 'irrelevant' | 'unhandled'; reason?: string };
  rowAllowed?(row: EffectRow, civ: string, ctx: CivContext): boolean;
  notes?(ctx: CivContext, boId?: string): SimNote[];
  assumptions?(input: { eco: EcoData; bo: BuildOrder; ctx: CivContext }): string[];
}
