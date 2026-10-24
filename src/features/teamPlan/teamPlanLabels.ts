import type { ProductionContext } from '../../domain/production';
import type { PlanAge, PlanPlayer } from '../../domain/teamPlan';

export const AGE_NAMES: Record<PlanAge, string> = { 2: '封建', 3: '城堡', 4: '帝王' };
export const OPEN_NAMES = { unspecified: '未指定', open: '开放陆地', closed: '封闭陆地', 'mixed-land': '混合陆地条件' } as const;
export const unique = (values: number[]) => [...new Set(values)];
export const playerLabel = (player: PlanPlayer) => player.name || player.id.toUpperCase();
export const labelFor = (ctx: ProductionContext, kind: 'unit' | 'tech' | 'building', id: number) =>
  (kind === 'unit' ? ctx.core.unitById[id] : kind === 'tech' ? ctx.core.techById[id] : ctx.core.buildingById[id])?.zh ?? `未知 ID ${id}`;
/** issue 271：同名但生产建筑和英文名都相同、规则区分不了的单位，在这里写玩家能看懂的专门标签（Steve 2026-10-22：不显示编号） */
const SPECIAL_UNIT_LABELS: Record<number, string> = {
  // 库曼雇佣兵送给队友的免费精锐钦察；另一个 1233 是库曼自己在城堡训练的，显示「精锐钦察」
  1260: '精锐钦察（库曼雇佣兵）',
};
/** issue 271：同一下拉分组内同名单位要能区分。先套专门标签；剩下的同名项优先标生产建筑（近卫军兵营/城堡），建筑也相同时用英文名。不显示编号。 */
export function unitOptionLabel(
  ctx: ProductionContext,
  unit: { id: number; zh: string; en: string; b: number },
  siblings: { id: number; zh: string; en: string; b: number }[],
): string {
  const special = SPECIAL_UNIT_LABELS[unit.id];
  if (special) return special;
  const same = siblings.filter((s) => s.zh === unit.zh && !SPECIAL_UNIT_LABELS[s.id]);
  if (same.length <= 1) return unit.zh;
  const withBuilding = same.map((s) => {
    const building = ctx.core.buildingById[s.b];
    return { id: s.id, label: building ? `${s.zh}（${building.zh}）` : '' };
  });
  const mine = withBuilding.find((row) => row.id === unit.id)!;
  if (mine.label && withBuilding.filter((row) => row.label === mine.label).length === 1) return mine.label;
  if (same.filter((s) => s.en === unit.en).length === 1) return `${unit.zh}（${unit.en}）`;
  return unit.zh;
}
