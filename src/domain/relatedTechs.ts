/** 单位详情的反向科技索引：只列模拟器已建模的数值作用，不从说明文字推断。 */
import { techAffects } from './affects';
import { CIV_TECH_EXTRAS } from './effects';
import { civStatus, simTechs, type SimContext } from './simulator';
import type { Tech, Unit } from './types';

export interface UnitRelatedTech {
  t: Tech;
  /** 通用视角下的文明限制；空数组表示通用作用，仍须以该文明科技树为准。 */
  civs: string[];
}

export function unitRelatedTechs(ctx: SimContext, u: Unit, civ?: string): UnitRelatedTech[] {
  if (civ) {
    if (!u.civs.includes(civ) && civStatus(ctx.trees, civ)['u' + u.id] !== 1) return [];
    return simTechs(ctx, u, civ)
      .filter((x) => x.ef?.length)
      .map(({ t }) => ({ t, civs: [] }));
  }
  const owners = Object.keys(ctx.trees.t)
    .map((c) => ({ c, status: civStatus(ctx.trees, c) }))
    .filter(({ c, status }) => u.civs.includes(c) || status['u' + u.id] === 1);
  return ctx.techs.flatMap((t) => {
    // techAffects 还列出有额外条件的组合效果，不能把它们当成单项科技直接生效。
    const direct = techAffects(t, [u], []).some((g) => !g.group.startsWith('组合触发') && g.rows.some((r) => r.units.length));
    // .dat 的目标类别包括所属文明无法训练的单位；科技与当前形态必须确实能在同一文明出现。
    const available = owners.filter(({ c, status }) => status['t' + t.id] === 1 && (t.type !== 'UniqueTech' || t.civs.includes(c)));
    if (direct && available.length) return [{ t, civs: t.type === 'UniqueTech' ? available.map(({ c }) => c) : [] }];
    // 例如印加村民吃铁匠铺升级：只使用模拟器的结构化文明附加效果，并明确文明限制。
    const civs = available.filter(({ c }) => CIV_TECH_EXTRAS[c]?.[t.en]?.some((x) => !x.b && x.pred(u) && x.fx.length)).map(({ c }) => c);
    return civs.length ? [{ t, civs }] : [];
  });
}
