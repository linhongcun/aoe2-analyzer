import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalSearch,
  firstSortDir,
  formatGames,
  formatPercent,
  friendliness,
  isLowSample,
  isPatchMismatch,
  resolveElo,
  sortLadder,
  TIER_LABEL,
  viewBracket,
  type LadderSnapshot,
  type SortableCiv,
} from '../../src/domain/ladder';

const snapshot = JSON.parse(readFileSync('src/data/ladder-arabia-p162286.json', 'utf8')) as LadderSnapshot;

function row(stat: LadderSnapshot['brackets'][number]['civs'][number], nameKey = stat.en): SortableCiv {
  return { ...stat, nameKey, tierRank: 3 };
}

describe('天梯快照展示 #33', () => {
  const all = snapshot.brackets.find((bracket) => bracket.key === 'all');

  it('百分数按快照原值显示，不乘 100', () => {
    expect(all).toBeTruthy();
    for (const civ of all?.civs ?? []) {
      const win = formatPercent(civ.winRate);
      const play = formatPercent(civ.playRate);
      expect(win).toMatch(/^\d+\.\d{2}%$/);
      expect(play).toMatch(/^\d+\.\d{2}%$/);
      expect(Number(win.slice(0, -1))).toBeCloseTo(civ.winRate, 2);
      expect(Number(play.slice(0, -1))).toBeCloseTo(civ.playRate, 2);
    }
    expect(formatPercent(51.4)).toBe('51.40%');
    expect(formatPercent(54.04)).toBe('54.04%');
    expect(formatPercent(5.15)).toBe('5.15%');
    expect(formatPercent(1.67)).toBe('1.67%');
    expect(formatGames(504189)).toBe('504,189');
    expect(formatGames(51920)).toBe('51,920');
  });

  it('默认按胜率降序，罗马在最前', () => {
    const rows = sortLadder(
      (all?.civs ?? []).map((civ) => row(civ)),
      'win',
      firstSortDir('win'),
    );
    expect(rows[0]?.en).toBe('Romans');
    expect(rows[0]?.winRate).toBeGreaterThan(rows[1]?.winRate ?? 0);
  });

  it('文明名升序再降序正好相反', () => {
    const rows = (all?.civs ?? []).map((civ) => row(civ, civ.en));
    const ascending = sortLadder(rows, 'name', 'asc').map((civ) => civ.en);
    const descending = sortLadder(rows, 'name', 'desc').map((civ) => civ.en);
    expect(descending).toEqual([...ascending].reverse());
  });

  it('非法分段回到全部，分享链接不带 sort/dir/civ', () => {
    expect(resolveElo(null)).toEqual({ elo: 'all', illegal: null });
    expect(resolveElo('all')).toEqual({ elo: 'all', illegal: null });
    expect(resolveElo('lt850')).toEqual({ elo: 'lt850', illegal: null });
    expect(resolveElo('not-a-bracket')).toEqual({ elo: 'all', illegal: 'not-a-bracket' });
    expect(canonicalSearch('all')).toBe('');
    expect(canonicalSearch('lt850')).toBe('?elo=lt850');
    expect(viewBracket(snapshot, 'lt850').empty).toBe(true);
    expect(viewBracket(snapshot, 'all').games).toBe(504189);
    expect(viewBracket(snapshot, 'all').civs).toHaveLength(48);
  });

  it('没有编辑条目时友好度是待补，样本少只看 300 局以下', () => {
    expect(friendliness('Franks', []).tier).toBe('pending');
    expect(TIER_LABEL.pending).toBe('待补');
    expect(isLowSample(299)).toBe(true);
    expect(isLowSample(300)).toBe(false);
    expect(isPatchMismatch('aoestats patch 162286 (via Wayback 2026-07-12)', 188329)).toBe(true);
    expect(isPatchMismatch('aoestats patch 188329', 188329)).toBe(false);
  });
});
