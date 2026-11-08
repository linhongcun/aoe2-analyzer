import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectedLabel,
  formatRatioPercent,
  isLowSampleCount,
  isRequiredWindow,
  patchLabel,
  queryAgrees,
  readInsightsSnapshot,
  sampleHeading,
  visibleWin,
  type InsightsSnapshot,
} from '../../src/domain/ladderInsights';
import { canonicalLadderSearch, insightsMapOptions, resolveLadderLocation } from '../../src/domain/ladderQuery';
import type { LadderSnapshot } from '../../src/domain/ladder';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const rmArabia = JSON.parse(readFileSync('src/data/ladder-insights-rm1v1-arabia.json', 'utf8')) as InsightsSnapshot;
const arena = JSON.parse(readFileSync('src/data/ladder-insights-rm1v1-arena.json', 'utf8')) as InsightsSnapshot;

function rawRows(file: string) {
  const payload = JSON.parse(readFileSync(file, 'utf8')) as {
    rows: {
      civilization: string[];
      agg_n_matches: number[];
      n_rows: number[];
      agg_win_rate: number[];
      agg_play_rate: number[];
      agg_n_won: string[];
    };
  };
  return payload.rows.civilization.map((civilization, index) => ({
    civilization,
    aggNMatches: payload.rows.agg_n_matches[index],
    nRows: payload.rows.n_rows[index],
    aggWinRate: payload.rows.agg_win_rate[index],
    aggPlayRate: payload.rows.agg_play_rate[index],
    aggNWon: Number(payload.rows.agg_n_won[index]),
  }));
}

describe('Insights 地图快照 #570', () => {
  it('提交的原始响应字节、sha256 和规范化行一致', () => {
    const sums = readFileSync('docs/data/insights-match-ups/SHA256SUMS', 'utf8');
    for (const [file, snapshot] of [
      ['docs/data/insights-match-ups/rm1v1-map-9.json', rmArabia],
      ['docs/data/insights-match-ups/rm1v1-map-29.json', arena],
    ] as const) {
      const bytes = readFileSync(file);
      const digest = createHash('sha256').update(bytes).digest('hex');
      expect(digest).toBe(snapshot.rawSha256);
      expect(sums).toContain(`${digest}  ${file.split('/').pop()}`);
      const derived = rawRows(file);
      expect(derived.every((row) => row.aggNMatches === row.nRows)).toBe(true);
      expect(snapshot.rows.map((row) => row.civilization)).toEqual(derived.map((row) => row.civilization));
      expect(snapshot.rows.map((row) => row.aggNMatches)).toEqual(derived.map((row) => row?.aggNMatches));
      expect(snapshot.rows.map((row) => row.aggWinRate)).toEqual(derived.map((row) => row?.aggWinRate));
      const flipped = Buffer.from(bytes);
      flipped[0] = flipped[0]! ^ 1;
      expect(createHash('sha256').update(flipped).digest('hex')).not.toBe(digest);
    }
    expect(rmArabia.rows.reduce((sum, row) => sum + row.aggNMatches, 0)).not.toBe(arena.rows.reduce((sum, row) => sum + row.aggNMatches, 0));
    expect(readInsightsSnapshot(rmArabia).ok).toBe(true);
    expect(readInsightsSnapshot(arena).ok).toBe(true);
  });

  it('缺行、空行、缺胜率都拒绝，不把缺失写成 0', () => {
    expect(readInsightsSnapshot({ ...rmArabia, rows: [] }).ok).toBe(false);
    const broken = structuredClone(rmArabia);
    delete (broken.rows[0] as { aggWinRate?: number }).aggWinRate;
    expect(readInsightsSnapshot(broken).ok).toBe(false);
    expect(visibleWin(0, 300)).toMatchObject({ text: '0.00%', showRate: true, low: false });
    expect(visibleWin(0.5, null)).toMatchObject({ text: '未收录', showRate: false });
    expect(visibleWin(0.5, 0)).toMatchObject({ showRate: false, low: true, text: '' });
  });

  it('低样本按原始 agg_n_matches 的 299/300 边界，不足则不给胜率', () => {
    expect(isLowSampleCount(299, 300)).toBe(true);
    expect(isLowSampleCount(300, 300)).toBe(false);
    expect(isLowSampleCount(301, 300)).toBe(false);
    expect(visibleWin(0.8, 299).showRate).toBe(false);
    expect(visibleWin(0.8, 300).showRate).toBe(true);
    expect(visibleWin(0.8, 300).text).toBe('80.00%');
    expect(rmArabia.lowSample).toMatchObject({ threshold: 300, field: 'agg_n_matches', status: 'product' });
    expect(isRequiredWindow(rmArabia)).toBe(false);
    expect(isRequiredWindow(arena)).toBe(false);
  });

  it('单位一律待确认；补丁没有官方对应时只留号；全时段不写日期', () => {
    expect(sampleHeading()).toBe('样本单位待确认');
    expect(sampleHeading()).not.toContain('局');
    expect(sampleHeading()).not.toContain('玩家行');
    const numbered = patchLabel({ filtered: true, id: 185872, dateStatus: 'unconfirmed', date: '2026-09-22' });
    expect(numbered).toBe('185872');
    expect(numbered).not.toContain('2026');
    expect(patchLabel(rmArabia.patch)).toBe('未按补丁筛选');
    expect(patchLabel({ filtered: true, id: 185872, dateStatus: 'official', date: '2026-09-22' })).toBe('185872 · 2026-09-22');
    expect(collectedLabel(rmArabia.fetchedAt)).not.toBe('统计截止');
  });

  it('查询 filter 必须就是声明的模式和地图', () => {
    expect(queryAgrees(rmArabia)).toBe(true);
    expect(queryAgrees({ ...arena, map: { ...arena.map, id: 9 } })).toBe(false);
    const extra = rmArabia.queryUrl + '&filter=' + encodeURIComponent('{"field":"patch","operator":"equals","value":185872}');
    expect(queryAgrees({ ...rmArabia, queryUrl: extra })).toBe(false);
  });

  it('没有竞技场快照时不回退阿拉伯行；两图来源各自独立', () => {
    const onlyArabia = resolveLadderLocation('?mode=arabia1v1&map=arena', arabia, { insightsMaps: ['rm-arabia'] });
    expect(onlyArabia).toMatchObject({ missing: true, insightsMap: 'arena', mode: 'arabia1v1' });
    expect(canonicalLadderSearch(onlyArabia)).toBe('?mode=arabia1v1&map=arena');
    const both = resolveLadderLocation('?mode=arabia1v1&map=arena', arabia);
    expect(both).toMatchObject({ missing: false, insightsMap: 'arena', elo: 'all' });
    expect(canonicalLadderSearch(both)).toBe('?mode=arabia1v1&map=arena');
    const back = resolveLadderLocation('?mode=arabia1v1&map=rm-arabia', arabia);
    expect(back.insightsMap).toBe('rm-arabia');
    expect(rmArabia.queryUrl).not.toBe(arena.queryUrl);
    expect(rmArabia.fetchedAt).not.toBe(arena.fetchedAt);
    expect(rmArabia.map.zh).toBe('阿拉伯');
    expect(arena.map.zh).toBe('竞技场');
    const onTeam = resolveLadderLocation('?map=arena', arabia);
    expect(onTeam).toMatchObject({ mode: '4v4', missing: true, insightsMap: 'arena' });
    expect(canonicalLadderSearch(onTeam)).toBe('?mode=4v4&map=arena');
    expect(insightsMapOptions('4v4', null, ['rm-arabia', 'arena']).every((option) => option.enabled === false)).toBe(true);
    expect(insightsMapOptions('arabia1v1', 'arena', ['rm-arabia']).find((option) => option.key === 'arena')).toMatchObject({
      enabled: false,
      current: true,
    });
  });

  it('比率按来源的 0–1 显示，0 胜率不是缺字段', () => {
    expect(formatRatioPercent(0.5336)).toBe('53.36%');
    expect(formatRatioPercent(0)).toBe('0.00%');
    expect(formatRatioPercent(1)).toBe('100.00%');
    expect(formatRatioPercent(1.579805036260475e-6)).not.toBe('0.00%');
  });
});
