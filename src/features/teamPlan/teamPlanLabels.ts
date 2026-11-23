import { civByEn } from '../../data';
import { AGE_SHORT_ZH } from '../../domain/ratings';
import type { ProductionContext } from '../../domain/production';
import type { PlanAge, PlanPlayer } from '../../domain/teamPlan';

export const AGE_NAMES: Record<PlanAge, string> = { 2: AGE_SHORT_ZH[2]!, 3: AGE_SHORT_ZH[3]!, 4: AGE_SHORT_ZH[4]! };
export const OPEN_NAMES = { unspecified: '未指定', open: '开放陆地', closed: '封闭陆地', 'mixed-land': '混合陆地条件' } as const;
export const unique = (values: number[]) => [...new Set(values)];
export const playerLabel = (player: PlanPlayer) => player.name || player.id.toUpperCase();
export const knownCiv = (civ: string) => civByEn(civ) !== undefined;
/** 空文明代表玩家还没选；界面与打印稿都显示「未选择」，不能回落到某个默认文明（issue 769）。 */
export const civLabel = (civ: string) => (civ ? (civByEn(civ)?.zh ?? civ) : '未选择');
export const labelFor = (ctx: ProductionContext, kind: 'unit' | 'tech' | 'building', id: number) =>
  (kind === 'unit' ? ctx.core.unitById[id] : kind === 'tech' ? ctx.core.techById[id] : ctx.core.buildingById[id])?.zh ?? `未知 ID ${id}`;
export { unitOptionLabel } from '../../domain/unitOptionLabel';
