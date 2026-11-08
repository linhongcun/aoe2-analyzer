import { LOW_SAMPLE_THRESHOLD, type InsightsMapKey, type InsightsSnapshot } from '../../domain/ladderInsights';

/** 合成测试数据。不是正式快照，也不能当成 2026-05 至 2026-10 的采集结果。 */
export type LadderFixtureId = '570-data' | '570-low';

function row(civilization: string, sample: number, win: number) {
  return {
    civilization,
    aggWinRate: win,
    aggPlayRate: 0.5,
    aggNMatches: sample,
    nRows: sample,
    aggNWon: Math.round(sample * win),
  };
}

export function fixtureSnapshot(id: LadderFixtureId, map: InsightsMapKey): InsightsSnapshot {
  const arena = map === 'arena';
  const rows =
    id === '570-low'
      ? [row('Franks', 299, 0.5), row('Goths', 10, 0.2)]
      : arena
        ? [row('Franks', 480, 0.25), row('Goths', 300, 0.4)]
        : [row('Franks', 300, 0.5), row('Goths', 299, 0.8), row('Celts', 0, 0)];
  return {
    kind: 'aoe2insights-match-ups',
    source: 'AoE2 Insights',
    sourceUrl: 'https://www.aoe2insights.com/stats/',
    queryUrl: `https://www.aoe2insights.com/stats/api/match-ups/?fixture=${id}&map=${map}`,
    fetchedAt: arena ? '2026-11-08T00:00:02Z' : '2026-11-08T00:00:01Z',
    fetchedAtOrigin: 'local-receipt',
    rawSha256: arena ? 'b'.repeat(64) : 'a'.repeat(64),
    rawFile: 'fixture',
    ladder: { id: 3, label: 'RM 1v1' },
    map: { id: arena ? 29 : 9, key: map, en: arena ? 'Arena' : 'Arabia', zh: arena ? '竞技场' : '阿拉伯' },
    elo: { filtered: false, note: '夹具未分 Elo。' },
    patch: { filtered: false, id: null, dateStatus: 'absent', note: '夹具没有补丁号。' },
    period: { filtered: false, note: '夹具不代表 2026-05 至 2026-10 的已采集窗口。' },
    sample: { field: 'agg_n_matches', unit: 'unconfirmed', unitStatus: 'unconfirmed', note: '样本单位待确认。' },
    lowSample: { threshold: LOW_SAMPLE_THRESHOLD, field: 'agg_n_matches', status: 'product', note: '原始 agg_n_matches < 300 不显示胜率。' },
    rows,
  };
}
