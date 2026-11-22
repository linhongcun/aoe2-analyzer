import type { DuelResult, GroupResult, OneVOneResult } from '../../../domain/duel';
import { formatHp } from '../../../domain/hpFormat';
import { r1, type Resolved } from './duelSide';

export const GROUP_STOP_LABELS = {
  timeout: '达到模拟时限，暂无胜者',
  limit: '达到计算上限，暂无胜者',
} as const;

export interface DuelSummaryMetric {
  prefix: string;
  value: string;
}

export interface DuelSummary {
  winner: 'a' | 'b' | 'draw';
  icon: 'trophy' | 'info';
  headline: string;
  metrics: DuelSummaryMetric[];
}

/** issue 1279 / 1294 / 1322：1v1 胜负结论与简明指标单一真源，供结果卡与窄屏定位条共用。 */
export function summarizeOneVOne(a: Resolved, b: Resolved, r: DuelResult | OneVOneResult): DuelSummary {
  if (('outcome' in r && r.outcome === 'both-no-attack') || (!r.ab.canAttack && !r.ba.canAttack)) {
    return {
      winner: 'draw',
      icon: 'info',
      headline: '双方均无普通攻击',
      metrics: [{ prefix: '无法通过普通攻击分出胜负', value: '' }],
    };
  }
  if ('outcome' in r && r.outcome === 'no-kill') {
    return {
      winner: 'draw',
      icon: 'info',
      headline: '暂无法分出胜负',
      metrics: [],
    };
  }
  if ('mode' in r && r.mode === 'contact') {
    if (r.status === 'timeout' || r.status === 'limit') {
      return {
        winner: 'draw',
        icon: 'info',
        headline: GROUP_STOP_LABELS[r.status],
        metrics: [{ prefix: '用时 ', value: `${r1(r.duration)} 秒` }],
      };
    }
    if (r.status === 'draw' || r.winner === 'draw' || r.winner === null) {
      return {
        winner: 'draw',
        icon: 'trophy',
        headline: '平局（同时击杀）',
        metrics: [{ prefix: '用时 ', value: `${r1(r.duration)} 秒` }],
      };
    }
    const winnerSide = r.winner === 'a' ? a : b;
    return {
      winner: r.winner,
      icon: 'trophy',
      headline: `${r.winner === 'a' ? 'A' : 'B'} · ${winnerSide.u.zh} 获胜`,
      metrics: [
        { prefix: '用时 ', value: `${r1(r.duration)} 秒` },
        { prefix: '剩余生命 ', value: `${formatHp(r.remaining)} / ${formatHp(winnerSide.F.hp)}` },
      ],
    };
  }
  const winnerSide = r.winner === 'a' ? a : b;
  const headline = r.winner === 'draw' ? '平局（同时击杀）' : `${r.winner === 'a' ? 'A' : 'B'} · ${winnerSide.u.zh} 获胜`;
  const metrics: DuelSummaryMetric[] =
    r.winner === 'draw'
      ? [{ prefix: '用时 ', value: `${r1(r.duration)}s` }]
      : [
          { prefix: '用时 ', value: `${r1(r.duration)}s` },
          { prefix: '剩余生命 ', value: `${formatHp(r.remaining)} / ${formatHp(winnerSide.F.hp)}` },
        ];
  return { winner: r.winner, icon: 'trophy', headline, metrics };
}

/** issue 1279：群战/等资源胜负结论与简明指标单一真源，供结果卡与窄屏定位条共用。 */
export function summarizeGroup(a: Resolved, b: Resolved, g: GroupResult): DuelSummary | null {
  if (g.status === 'error') return null;
  const winnerSide = g.winner === 'a' ? a : b;
  const headline =
    g.status === 'timeout' || g.status === 'limit'
      ? GROUP_STOP_LABELS[g.status]
      : g.winner === 'draw'
        ? '平局 / 同归于尽'
        : `${g.winner === 'a' ? 'A' : 'B'} · ${winnerSide.u.zh} 获胜`;
  const metrics: DuelSummaryMetric[] = [{ prefix: '用时 ', value: `${r1(g.duration)} 秒` }];
  if (g.status === 'win') {
    metrics.push({ prefix: '剩余 ', value: `${g.winner === 'b' ? g.bAlive : g.aAlive} 个单位` });
    metrics.push({ prefix: '总生命 ', value: formatHp(g.hpLeft) });
  }
  return { winner: g.winner ?? 'draw', icon: g.status === 'win' ? 'trophy' : 'info', headline, metrics };
}
