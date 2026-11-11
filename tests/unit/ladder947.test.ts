import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISPLAY_BRACKETS, isDrawableTrend, omittedMonthlyTrend, trendFootnote, type LadderSnapshot } from '../../src/domain/ladder';
import { canonicalLadderSearch, eloFilterOptions, renderedEloOptions, resolveLadderLocation, sliceFacts } from '../../src/domain/ladderQuery';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const legalGaps = [...DISPLAY_BRACKETS.map((band) => band.key).filter((key) => key !== 'all'), '1200-1400'];

describe('天梯首屏与合法缺档 #947', () => {
  it('阿拉伯名单内每个无数据合法键都留址，不再回退到全部', () => {
    for (const key of legalGaps) {
      const located = resolveLadderLocation(`?mode=arabia1v1&elo=${encodeURIComponent(key)}`, arabia, team);
      expect(located, key).toMatchObject({ mode: 'arabia1v1', elo: key, missing: true, toast: null });
      expect(canonicalLadderSearch(located), key).toBe(`?mode=arabia1v1&elo=${encodeURIComponent(key).replaceAll('%2B', '%2B')}`);
      const search = new URLSearchParams();
      search.set('mode', 'arabia1v1');
      search.set('elo', key);
      expect(canonicalLadderSearch(located)).toBe(`?${search.toString()}`);
    }
  });

  it('4v4 的 all 与 1200-1400 仍是默认别名，其它合法空档留址', () => {
    expect(resolveLadderLocation('?mode=4v4&elo=all', arabia, team)).toMatchObject({ mode: '4v4', elo: 'all', missing: false, toast: null });
    expect(resolveLadderLocation('?mode=4v4&elo=1200-1400', arabia, team)).toMatchObject({ mode: '4v4', elo: 'all', missing: false, toast: null });
    expect(canonicalLadderSearch(resolveLadderLocation('?mode=4v4&elo=all', arabia, team))).toBe('');
    expect(canonicalLadderSearch(resolveLadderLocation('', arabia, team))).toBe('');
    for (const key of legalGaps.filter((item) => item !== '1200-1400')) {
      const located = resolveLadderLocation(`?mode=4v4&elo=${encodeURIComponent(key)}`, arabia, team);
      expect(located, key).toMatchObject({ mode: '4v4', elo: key, missing: true, toast: null });
      const search = new URLSearchParams();
      search.set('mode', '4v4');
      search.set('elo', key);
      expect(canonicalLadderSearch(located)).toBe(`?${search.toString()}`);
    }
  });

  it('无法识别的 Elo 仍沿用旧 toast，不当成合法缺档', () => {
    const arabiaUnknown = resolveLadderLocation('?mode=arabia1v1&elo=not-a-bracket', arabia, team);
    expect(arabiaUnknown).toMatchObject({ mode: 'arabia1v1', elo: 'all', missing: false });
    expect(arabiaUnknown.toast).toBe('未识别的分段「not-a-bracket」，已显示「全部」。');
    expect(canonicalLadderSearch(arabiaUnknown)).toBe('?mode=arabia1v1');
    const teamUnknown = resolveLadderLocation('?mode=4v4&elo=not-a-bracket', arabia, team);
    expect(teamUnknown).toMatchObject({ mode: '4v4', elo: 'not-a-bracket', missing: true, toast: null });
    expect(canonicalLadderSearch(teamUnknown)).toBe('?mode=4v4&elo=not-a-bracket');
  });

  it('非法模式、视图和固定范围仍走原来的提示', () => {
    expect(resolveLadderLocation('?mode=2v2', arabia, team).toast).toContain('未识别的模式');
    expect(resolveLadderLocation('?view=nope', arabia, team).toast).toContain('未识别的视图');
    expect(resolveLadderLocation('?period=7d', arabia, team).toast).toContain('近 90 天');
    expect(resolveLadderLocation('?mode=arabia1v1&map=islands', arabia, team).toast).toContain('阿拉伯');
  });

  it('切模式的规范地址落在该模式默认快照，不带走上一档 Elo', () => {
    expect(canonicalLadderSearch({ mode: '4v4', elo: 'all', pendingView: null })).toBe('');
    expect(canonicalLadderSearch({ mode: 'arabia1v1', elo: 'all', pendingView: null })).toBe('?mode=arabia1v1');
    expect(canonicalLadderSearch({ mode: 'arabia1v1', elo: '1200-1400', pendingView: null, missing: true })).toBe('?mode=arabia1v1&elo=1200-1400');
  });

  it('芯片保留有数据档和当前缺档，其余空档不画', () => {
    const onTeam = eloFilterOptions('4v4', 'lt850', arabia, team);
    const teamVisible = renderedEloOptions(onTeam);
    expect(teamVisible.map((option) => option.key)).toEqual(['lt850', '1200-1400']);
    expect(teamVisible.find((option) => option.key === 'lt850')).toMatchObject({ enabled: false, current: true, label: '<850' });
    expect(teamVisible.find((option) => option.key === '1200-1400')).toMatchObject({ enabled: true, current: false });
    const onArabia = eloFilterOptions('arabia1v1', '1900+', arabia, team);
    const arabiaVisible = renderedEloOptions(onArabia);
    expect(arabiaVisible.map((option) => option.key)).toEqual(['all', '1900+']);
    expect(arabiaVisible.find((option) => option.key === '1900+')).toMatchObject({ enabled: false, current: true });
    expect(arabiaVisible.find((option) => option.key === 'all')).toMatchObject({ enabled: true, current: false });
    expect(sliceFacts('arabia1v1', '1200-1400', arabia, team)).toMatchObject({
      modeLabel: '阿拉伯 1v1',
      eloLabel: '1200–1400',
      mapLabel: '阿拉伯',
    });
    expect(sliceFacts('4v4', 'lt850', arabia, team)).toMatchObject({
      modeLabel: '4v4 随机地图',
      eloLabel: '<850',
      mapLabel: '全图',
    });
  });

  it('同模式若以后补上真实分段，这一档变为可选，不再算缺档', () => {
    const extra = { key: 'lt850', label: '<850', games: 3, civs: [{ en: 'Franks', winRate: 41, playRate: 1, games: 400 }] };
    const filled = { ...arabia, brackets: [...arabia.brackets.filter((band) => band.key !== extra.key), extra] } satisfies LadderSnapshot;
    const located = resolveLadderLocation('?mode=arabia1v1&elo=lt850', filled, team);
    expect(located).toMatchObject({ mode: 'arabia1v1', elo: 'lt850', missing: false, toast: null });
    expect(canonicalLadderSearch(located)).toBe('?mode=arabia1v1&elo=lt850');
    expect(renderedEloOptions(eloFilterOptions('arabia1v1', 'lt850', filled, team)).find((option) => option.key === 'lt850')).toMatchObject({
      enabled: true,
      current: true,
    });
  });

  it('没有可画序列时不需要走势列；低样本或单个点都不能单独把列画出来', () => {
    const point = { period: 'm', winRate: 51 };
    expect(isDrawableTrend(400, [point, { period: 'n', winRate: 52 }], 300)).toBe(true);
    expect(isDrawableTrend(299, [point, { period: 'n', winRate: 52 }], 300)).toBe(false);
    expect(isDrawableTrend(400, [point], 300)).toBe(false);
    expect(isDrawableTrend(400, [{ period: 'm', winRate: Number.NaN }, point], 300)).toBe(false);
    expect(team.brackets.some((band) => band.civs.some((civ) => isDrawableTrend(civ.games, civ.trend, team.lowSampleGames ?? 300)))).toBe(false);
    expect(arabia.brackets.some((band) => band.civs.some((civ) => isDrawableTrend(civ.games, civ.trend, 300)))).toBe(false);
    expect(omittedMonthlyTrend(team.patchNote)).toBe(true);
    expect(omittedMonthlyTrend(arabia.patchNote)).toBe(false);
    expect(trendFootnote(false, team.patchNote)).toBe('走势：本快照未收录。来源的月度走势不在近 90 天窗口内，已省略，不估算。');
    expect(trendFootnote(false, arabia.patchNote)).toBe('走势：本快照未收录。');
    expect(trendFootnote(true, team.patchNote)).toBe('走势：这份静态快照里的胜率序列，不是实时。');
  });
});
