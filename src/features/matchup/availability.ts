import type { Core } from '../../data';
import { unitAvailable, techAvailable } from '../../domain/unitAvailability';
import type { BuildOrder } from '../../domain/buildOrder';
import { fmtSide } from '../../domain/duelState';
import { COUNTER_EXTRA, COUNTER_EXTRA_GROUPS } from '../../domain/ratings';
import type { CivType, Trees } from '../../domain/types';

export interface MatchupData {
  core: Pick<Core, 'unitById' | 'techById'>;
  trees: Trees;
}
export { unitAvailable, techAvailable };

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
  const any = (...ids: readonly number[]) => ids.some((id) => unitAvailable(data, civ, id, 4));
  const cavalry = any(...COUNTER_EXTRA_GROUPS.cavalry),
    light = any(...COUNTER_EXTRA_GROUPS.lightCavalry),
    horseArcher = any(...COUNTER_EXTRA_GROUPS.horseArcher);
  if (type === 'cav')
    return [any(...COUNTER_EXTRA_GROUPS.spearman) ? '用城墙/长矛阵限制机动' : '用城墙限制机动', any(...COUNTER_EXTRA_GROUPS.monk) && '僧侣转化也有效']
      .filter(Boolean)
      .join('；');
  if (type === 'arch') {
    const siege = [any(...COUNTER_EXTRA_GROUPS.ram) && '冲车', any(...COUNTER_EXTRA_GROUPS.onager) && '投石'].filter(Boolean).join('/');
    const mounted = [cavalry && '骑兵快速贴脸', light && '轻骑绕后'].filter(Boolean).join('或');
    return [siege && `${siege}压阵地`, mounted].filter(Boolean).join('；') || '当前文明暂无可核对的补充反制建议';
  }
  if (type === 'inf') {
    const mounted = [cavalry && '骑兵', horseArcher && '骑射'].filter(Boolean).join('或');
    return (
      [
        any(...COUNTER_EXTRA_GROUPS.rangedInfantry) && '远程放风筝',
        mounted && `${mounted}拉扯`,
        unitAvailable(data, civ, COUNTER_EXTRA_GROUPS.scorpion[0], 3) && '城堡期蝎子克制密集步兵',
      ]
        .filter(Boolean)
        .join('；') || '当前文明暂无可核对的补充反制建议'
    );
  }
  if (type === 'siege')
    return [cavalry && '骑兵直切攻城武器', any(...COUNTER_EXTRA_GROUPS.ram) ? '保持冲车阵型分散' : '保持阵型分散'].filter(Boolean).join('；');
  return COUNTER_EXTRA[type];
}
