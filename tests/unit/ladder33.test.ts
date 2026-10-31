import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalSearch,
  DISPLAY_BRACKETS,
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
  visibleBrackets,
  type LadderSnapshot,
  type SortableCiv,
} from '../../src/domain/ladder';
import { PAGES } from '../../src/shared/nav/pageRegistry';

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

  it('非法分段与空分段都回到全部，有数据的档才保留深链', () => {
    expect(resolveElo(null, snapshot)).toEqual({ elo: 'all', toast: null });
    expect(resolveElo('', snapshot)).toEqual({ elo: 'all', toast: null });
    expect(resolveElo('all', snapshot)).toEqual({ elo: 'all', toast: null });
    expect(resolveElo('not-a-bracket', snapshot)).toEqual({
      elo: 'all',
      toast: '未识别的分段「not-a-bracket」，已显示「全部」。',
    });
    for (const bracket of DISPLAY_BRACKETS) {
      if (bracket.key === 'all') continue;
      expect(viewBracket(snapshot, bracket.key).empty).toBe(true);
      expect(resolveElo(bracket.key, snapshot)).toEqual({
        elo: 'all',
        toast: `「${bracket.label}」暂无数据，已显示「全部」。`,
      });
    }
    expect(canonicalSearch('all')).toBe('');
    expect(canonicalSearch('lt850')).toBe('?elo=lt850');
    expect(viewBracket(snapshot, 'all').games).toBe(504189);
    expect(viewBracket(snapshot, 'all').civs).toHaveLength(48);
    expect(visibleBrackets(snapshot).map((bracket) => bracket.key)).toEqual(['all']);
  });

  it('写入非空 civs 后该档回到可见名单，顺序仍按固定分段', () => {
    const civ = { en: 'Franks', winRate: 51.4, playRate: 5.15, games: 10 };
    const withLow = {
      ...snapshot,
      brackets: [...snapshot.brackets, { key: '1200+', label: '1200+', games: 10, civs: [civ] }],
    };
    expect(visibleBrackets(withLow).map((bracket) => bracket.key)).toEqual(['all', '1200+']);
    expect(resolveElo('1200+', withLow)).toEqual({ elo: '1200+', toast: null });
    expect(resolveElo('lt850', withLow).toast).toBe('「<850」暂无数据，已显示「全部」。');
    const onlyHigh = {
      ...snapshot,
      brackets: [{ key: '1900+', label: '1900+', games: 3, civs: [civ] }],
    };
    expect(visibleBrackets(onlyHigh).map((bracket) => bracket.key)).toEqual(['1900+']);
    expect(resolveElo('1900+', onlyHigh)).toEqual({ elo: '1900+', toast: null });
    expect(resolveElo('all', onlyHigh)).toEqual({ elo: 'all', toast: null });
  });

  it('入口文案不再暗示已有多段胜率，空态文案仍留在页面里', () => {
    const ladder = PAGES.find((page) => page.key === 'ladder');
    expect(ladder?.desc).toBe('阿拉伯 1v1 胜率、出场率与新手友好度');
    expect(ladder?.metaDescription).toBe('查看阿拉伯 1v1 随机地图各文明的胜率、出场率与样本局数。');
    expect(ladder?.label).toBe('天梯数据');
    expect(ladder?.metaTitle).toBe('天梯数据');
    expect(`${ladder?.desc} ${ladder?.metaDescription}`).not.toContain('分段胜率');
    const page = readFileSync('src/features/ladder/Ladder.tsx', 'utf8');
    expect(page).toContain('这个分段暂无数据');
    expect(page).toContain('不推算，不补数');
    expect(page).toContain('data-testid="ladder-empty"');
    expect(page).toContain('阿拉伯 1v1 胜率、出场率与新手友好度。');
    expect(page).not.toContain('分段胜率');
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
