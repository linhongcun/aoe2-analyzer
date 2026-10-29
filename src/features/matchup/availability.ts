import type { Core } from '../../data';
import { EARLY_UNIT_AGES } from '../../domain/availabilityAge';
import type { BuildOrder } from '../../domain/buildOrder';
import { fmtSide } from '../../domain/duelState';
import { COUNTER_EXTRA } from '../../domain/ratings';
import type { CivType, Trees } from '../../domain/types';

export interface MatchupData {
  core: Pick<Core, 'unitById' | 'techById'>;
  trees: Trees;
}

function treeAge(data: MatchupData, civ: string, kind: 'u' | 't', id: number): number {
  const cells = (data.trees.t[civ] ?? []).flatMap((block) => block[3]).filter((cell) => cell[2] === kind && cell[3] === id && cell[4] === 1);
  return cells.length ? Math.min(...cells.map((cell) => Math.floor(cell[0] / 2) + 1)) : Infinity;
}

export function unitAvailable(data: MatchupData, civ: string, id: number, age: number): boolean {
  const unit = data.core.unitById[id];
  const rowAge = treeAge(data, civ, 'u', id);
  if (!unit?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  // Existing early-unit exceptions override a stale catalogue/tree row. Otherwise use
  // both sources: ordinary spearmen are Feudal; Armenians' actual row is Dark Age.
  return (EARLY_UNIT_AGES[civ]?.[id] ?? Math.max(unit.age, rowAge)) <= age;
}

export function techAvailable(data: MatchupData, civ: string, id: number, age: number): boolean {
  const tech = data.core.techById[id];
  return !!tech?.civs.includes(civ) && [1, 2, 3, 4].includes(age) && Math.max(tech.age, treeAge(data, civ, 't', id)) <= age;
}

export function unavailableBuildUnits(data: MatchupData, civ: string, order: BuildOrder): number[] {
  const targets = order.steps.flatMap((step) => step.actions.flatMap((action) => (action.type === 'train' || action.type === 'upgrade' ? [action.unit] : [])));
  return [...new Set(targets)].filter((id) => !unitAvailable(data, civ, id, order.target.age));
}

export interface RushGuide {
  id: string;
  a: number;
  b: number;
  na: number;
  nb: number;
}

export function rushDrill(data: MatchupData, own: string, enemy: string, guide: RushGuide) {
  const unavailable: { side: 'own' | 'enemy'; id: number; kind: 'u' | 't' }[] = [];
  for (const [side, civ, id] of [
    ['own', own, guide.a],
    ['enemy', enemy, guide.b],
  ] as const) {
    if (!unitAvailable(data, civ, id, 2)) unavailable.push({ side, id, kind: 'u' });
    if (guide.id === 'towers' && !techAvailable(data, civ, 22, 2)) unavailable.push({ side, id: 22, kind: 't' });
  }
  const techs = guide.id === 'towers' ? [22] : [];
  const side = (uid: number, civ: string) => fmtSide({ uid, civ, age: 2, techs, team: [] });
  return {
    url: unavailable.length ? null : `/duel?a=${side(guide.a, own)}&b=${side(guide.b, enemy)}&m=n&na=${guide.na}&nb=${guide.nb}`,
    unavailable,
  };
}

/** Supplemental clauses have the same Imperial context as the existing counter list.
 * Keep neutral advice; only retain unit clauses supported by the selected civ's tree.
 */
export function counterExtra(data: MatchupData, civ: string, type: CivType): string {
  const any = (...ids: number[]) => ids.some((id) => unitAvailable(data, civ, id, 4));
  const cavalry = any(448, 38),
    light = any(546, 441, 1707),
    horseArcher = any(39, 474);
  if (type === 'cav') return [any(93) ? '用城墙/长矛阵限制机动' : '用城墙限制机动', any(125) && '僧侣转化也有效'].filter(Boolean).join('；');
  if (type === 'arch') {
    const siege = [any(1258, 422, 548) && '冲车', any(280, 550, 588) && '投石'].filter(Boolean).join('/');
    const mounted = [cavalry && '骑兵快速贴脸', light && '轻骑绕后'].filter(Boolean).join('或');
    return [siege && `${siege}压阵地`, mounted].filter(Boolean).join('；') || '当前文明暂无可核对的补充反制建议';
  }
  if (type === 'inf') {
    const mounted = [cavalry && '骑兵', horseArcher && '骑射'].filter(Boolean).join('或');
    return (
      [any(4, 24, 492, 5) && '远程放风筝', mounted && `${mounted}拉扯`, unitAvailable(data, civ, 279, 3) && '城堡期蝎子克制密集步兵']
        .filter(Boolean)
        .join('；') || '当前文明暂无可核对的补充反制建议'
    );
  }
  if (type === 'siege') return [cavalry && '骑兵直切攻城武器', any(1258, 422, 548) ? '保持冲车阵型分散' : '保持阵型分散'].filter(Boolean).join('；');
  return COUNTER_EXTRA[type];
}
