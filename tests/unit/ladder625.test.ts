import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LadderSnapshot } from '../../src/domain/ladder';
import { canonicalLadderSearch, eloFilterOptions, resolveLadderLocation } from '../../src/domain/ladderQuery';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const keys = ['all', 'lt850', '850-1000', '1000-1200', '1200-1400', '1200+', '1900+'];

describe('Elo 只筛选当前模式 #625', () => {
  it.each(['4v4', 'arabia1v1'] as const)('%s 按自身快照判定可用性，所有选项留在同模式且顺序一致', (mode) => {
    const options = eloFilterOptions(mode, 'all', arabia, team);
    expect(options.map((option) => option.key)).toEqual(keys);
    expect(options.every((option) => option.mode === mode)).toBe(true);
    const owned = mode === '4v4' ? team : arabia;
    expect(options.filter((option) => option.enabled).map((option) => option.key)).toEqual(
      owned.brackets.filter((band) => band.civs.length).map((band) => band.key),
    );
    const other = options.find((option) => option.key === (mode === '4v4' ? 'all' : '1200-1400'))!;
    expect(other).toMatchObject({ enabled: false, current: false, mode });
  });

  it('未来同模式新增真实分段才启用；另一模式不会借用这些数据', () => {
    const extra = { key: 'lt850', label: '<850', games: 3, civs: [{ en: 'Franks', winRate: 41, playRate: 1, games: 3 }] };
    const filled = { ...arabia, brackets: [...arabia.brackets.filter((band) => band.key !== extra.key), extra] } satisfies LadderSnapshot;
    expect(eloFilterOptions('arabia1v1', 'lt850', filled, team).find((option) => option.key === 'lt850')).toMatchObject({
      enabled: true,
      current: true,
      mode: 'arabia1v1',
    });
    expect(eloFilterOptions('4v4', 'all', filled, team).find((option) => option.key === 'lt850')).toMatchObject({
      enabled: false,
      current: false,
      mode: '4v4',
    });
  });

  it('默认别名与旧深链不因解耦改变含义，无数据组合仍保留', () => {
    expect(canonicalLadderSearch(resolveLadderLocation('', arabia))).toBe('');
    expect(resolveLadderLocation('?elo=all', arabia)).toMatchObject({ mode: 'arabia1v1', elo: 'all', missing: false });
    expect(resolveLadderLocation('?mode=4v4&elo=1200-1400', arabia)).toMatchObject({ mode: '4v4', missing: false });
    const missing = resolveLadderLocation('?mode=arabia1v1&elo=1200-1400&view=meta', arabia);
    expect(missing.missing).toBe(true);
    expect(canonicalLadderSearch(missing)).toBe('?mode=arabia1v1&elo=1200-1400&view=meta');
  });
});
