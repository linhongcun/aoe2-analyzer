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
  isPlayerSample,
  resolveElo,
  snapshotCutoff,
  snapshotPatchBuild,
  sortLadder,
  TIER_LABEL,
  viewBracket,
  visibleBrackets,
  type LadderSnapshot,
  type SortableCiv,
} from '../../src/domain/ladder';
import { PAGES } from '../../src/shared/nav/pageRegistry';

const snapshot = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;

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
      // 两位小数半入最多差 0.005。第三位恰好是 5 时，toBeCloseTo(2) 的开区间会把正确舍入判失败。
      expect(Math.abs(Number(win.slice(0, -1)) - civ.winRate)).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(Math.abs(Number(play.slice(0, -1)) - civ.playRate)).toBeLessThanOrEqual(0.005 + 1e-9);
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
    expect(viewBracket(snapshot, 'all').games).toBe(114500);
    expect(viewBracket(snapshot, 'all').civs).toHaveLength(56);
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
    expect(ladder?.desc).toBe('默认 4v4 随机地图胜率、出场率与走势');
    expect(ladder?.metaDescription).toBe('查看默认切片（4v4 随机地图、Elo 1200–1400、近 90 天、全图）的文明胜率与走势，并可切回阿拉伯 1v1。');
    expect(ladder?.label).toBe('天梯数据');
    expect(ladder?.metaTitle).toBe('天梯数据');
    expect(`${ladder?.desc} ${ladder?.metaDescription}`).not.toContain('分段胜率');
    const page = ['Ladder.tsx', 'LadderArabia.tsx', 'LadderTeam.tsx'].map((name) => readFileSync(`src/features/ladder/${name}`, 'utf8')).join('\n');
    expect(page).toContain('这个分段暂无数据');
    expect(page).toContain('不推算，不补数');
    expect(page).toContain('data-testid="ladder-empty"');
    expect(page).toContain('可切回阿拉伯');
    expect(page).toContain('data-testid="ladder-cutoff"');
    expect(page).toContain('非当前平衡');
    expect(page).toContain('统计截止');
    expect(page).toContain('静态快照');
    expect(page).toContain('胜率可能未反映最新平衡改动。');
    expect(page).not.toContain('分段胜率');
  });

  it('阿拉伯快照日期和补丁号都新于 p162286，截止用 period.to，样本按人次', () => {
    expect(snapshot.fetchedAt > '2026-07-12').toBe(true);
    expect(snapshot.fetchedAt).toBe('2026-11-01');
    expect(snapshot.period?.from).toBe('2026-09-22');
    expect(snapshot.period?.to).toBe('2026-11-01');
    expect(snapshotCutoff(snapshot)).toBe(snapshot.period?.to);
    expect(Number(snapshotPatchBuild(snapshot.patchNote))).toBe(185872);
    expect(snapshot.sourceUrl).toBe('https://ageofnotes.com/stats/maps/arabia/');
    expect(`${snapshot.source} ${snapshot.sourceUrl}`.toLowerCase()).not.toContain('aoe2scout');
    expect(isPlayerSample(snapshot.sample?.unit)).toBe(true);
    const all = snapshot.brackets.find((bracket) => bracket.key === 'all');
    expect(all?.civs.reduce((sum, civ) => sum + civ.games, 0)).toBe(all?.games);
    expect(all?.civs.find((civ) => civ.en === 'Romans')).toMatchObject({ winRate: 55.09, playRate: 1.689, games: 1955 });
    expect(all?.civs.find((civ) => civ.en === 'Franks')).toMatchObject({ winRate: 50.667, playRate: 5.279, games: 5769 });
    expect(all?.civs.find((civ) => civ.en === 'Muisca')).toMatchObject({ winRate: 44.792, playRate: 0.502, games: 576 });
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
